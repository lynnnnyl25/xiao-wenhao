import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GapMap from './components/GapMap'
import Passport from './components/Passport'
import Settings from './components/Settings'
import Review from './components/Review'
import {
  buildDiagnoserMessages,
  buildFeynmanMessages,
  buildSocraticMessages,
} from './core/prompts'
import {
  callJson,
  callStream,
  extractPartialSay,
  makeSayStreamer,
  parseDiagnosis,
  parseFeynman,
  parseSocratic,
  DeepSeekError,
} from './core/deepseek'
import {
  buildProfile,
  closeGaps,
  createSession,
  getPack,
  mergeGaps,
  nextLevel,
  recordAiTurn,
  recordStudentTurn,
  shouldEnterFeynman,
  type SessionState,
  type Turn,
} from './core/engine'
import {
  classifyAnswer,
  decideMove,
  pickScaffold,
  type Classification,
} from './core/socratic'
import { evaluateFeynman, nextLoopStep, type FeynmanResult } from './core/feynman'
import { pickLadder } from './core/concepts'
import { DEMO_SCRIPTS, flattenScript } from './core/demo'

type Mode = 'live' | 'demo'

const CONCEPT_PRESETS = [
  { name: '变量', emoji: '📦' },
  { name: '循环', emoji: '🔁' },
  { name: '算法', emoji: '🧩' },
  { name: '二进制', emoji: '💡' },
  { name: '密码安全', emoji: '🔐' },
  { name: '人工智能是怎么学的', emoji: '🤖' },
]

export default function App() {
  // ---------------------------------------------------------------- 配置
  const [mode, setMode] = useState<Mode>('demo')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('xwh_key') ?? '')
  const [model, setModel] = useState(() => localStorage.getItem('xwh_model') ?? 'deepseek-chat')
  const [showSettings, setShowSettings] = useState(false)

  // ---------------------------------------------------------------- 会话
  const [concept, setConcept] = useState('变量')
  const [session, setSession] = useState<SessionState>(() => createSession('变量'))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState('')
  const [err, setErr] = useState('')
  const [showPassport, setShowPassport] = useState(false)
  const [showReview, setShowReview] = useState(false)

  // ---------------------------------------------------------------- 体验模式
  const [demoId, setDemoId] = useState(DEMO_SCRIPTS[0].id)
  const [demoStep, setDemoStep] = useState(0)
  const [demoPlaying, setDemoPlaying] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const profile = useMemo(() => buildProfile(session), [session])

  const understoodTrail = useMemo(() => {
    const trail: { round: number; understood: number }[] = []
    for (const t of session.history) {
      if (t.role === 'ai' && t.phase === 'socratic') {
        // AI 轮之后紧跟的学生回答的理解度，用当前快照近似
        trail.push({ round: t.round, understood: snapshotUnderstood(session, t.round) })
      }
    }
    return trail
  }, [session])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [session.history, streaming])

  // ---------------------------------------------------------------- 真实会话：学生提交回答
  const submit = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setErr('')
    setInput('')

    const pack = getPack(session)

    // ① 规则层先给回答分类 —— 不依赖模型，稳定可复现
    const cls = classifyAnswer(text, pack)
    let s = recordStudentTurn(session, text, cls.kind)

    let understood = s.understoodLevel
    let incoming: { type: string; evidence: string; confidence: number }[] = []

    if (s.phase === 'socratic') {
      // 规则层已能判定的缺口，先记账（快、稳、不花钱）
      if (cls.kind === 'misconception' && pack) {
        const mis = pack.misconceptions.find((m) => m.id === cls.misconception)
        if (mis) {
          incoming.push({
            type: mis.gapType,
            evidence: text.slice(0, 40),
            confidence: 0.85,
          })
        }
      }
      if (cls.kind === 'jargon') {
        incoming.push({ type: 'jargon', evidence: text.slice(0, 40), confidence: 0.8 })
      }

      // 理解度：以必答项覆盖度为准绳，而不是模型的印象分
      understood = Math.max(cls.coverage, understood * 0.6)

      // 再用模型做一次补充诊断（规则层看不出的细微问题）
      if (cls.kind !== 'unknown' && cls.kind !== 'misconception') {
        try {
          const raw = await callJson({
            apiKey,
            model,
            messages: buildDiagnoserMessages({
              concept: s.concept,
              question: lastAiText(s) ?? '',
              answer: text,
            }),
            json: true,
            temperature: 0.2,
          })
          const d = parseDiagnosis(raw)
          // 模型报的缺口只作为补充，且最多 1 条，避免与规则层重复记账
          incoming = [...incoming, ...d.gaps.slice(0, 1)]
          understood = Math.max(understood, Math.min(d.understood_level, cls.coverage + 0.2))
        } catch (e) {
          if (e instanceof DeepSeekError && e.kind !== 'abort') {
            console.warn('补充诊断失败，仅用规则层判定', e.message)
          }
        }
      }
    }

    s = {
      ...s,
      gaps: mergeGaps(s, incoming),
      understoodLevel: Math.min(1, understood),
      consecutiveStuck:
        cls.kind === 'unknown' ? s.consecutiveStuck + 1 : 0,
    }

    setSession(s)
    await speak(s, cls)
  }, [apiKey, busy, input, model, session])

  /** 让 AI 说下一句 */
  const speak = useCallback(
    async (s: SessionState, cls: Classification) => {
      const pack = getPack(s)
      const enteringFeynman = s.phase === 'socratic' && shouldEnterFeynman(s)
      const phase = enteringFeynman ? 'feynman' : s.phase

      let next: SessionState = { ...s, phase }
      if (enteringFeynman) next = { ...next, feynmanRound: 0 }

      const level = nextLevel(next, next.understoodLevel, cls.kind === 'unknown')

      // ② 规则层决定这一轮该用哪种提问动作
      const plan = decideMove(cls, pack, {
        level: next.level,
        consecutiveUnknown: next.consecutiveStuck,
        askedMoves: next.usedMoves,
      })

      setBusy(true)
      setStreaming('')
      const ctrl = new AbortController()
      abortRef.current = ctrl

      // ③ 费曼环节先用规则层评分，再把结果喂给模型去"说话"
      const feynmanR =
        phase === 'feynman' && next.feynmanRound > 0
          ? evaluateFeynman(lastStudentText(next) ?? '', pack, next.feynmanRound)
          : undefined

      const ladderTip = pack && phase === 'socratic' ? pickLadder(pack, level) : undefined

      const messages =
        phase === 'feynman' && feynmanR
          ? buildFeynmanMessages({
              concept: next.concept,
              explanation: lastStudentText(next) ?? '',
              round: next.feynmanRound,
              weakPoints: feynmanR.missing,
              stuckAt: feynmanR.stuckAt,
              suggestedProbe: feynmanR.nextProbe,
              askedBefore: next.history
                .filter((h) => h.role === 'ai' && h.phase === 'feynman')
                .map((h) => h.text),
            })
          : buildSocraticMessages({
              concept: next.concept,
              conceptBrief: pack?.coreIdea,
              move: plan.move,
              moveInstruction: plan.instruction,
              targetGap: plan.targetGap,
              ladderHint: ladderTip?.ask,
              easierHint: ladderTip?.easier,
              scaffold: pickScaffold(cls.kind),
              history: next.history.map((h) => ({ role: h.role, text: h.text })),
              lastQuestion: lastAiText(next) ?? undefined,
              studentJustSaid: lastStudentText(next) ?? '',
            })

      const streamer = makeSayStreamer((delta) => setStreaming((p) => p + delta))

      try {
        const raw = await callStream({ apiKey, model, messages, signal: ctrl.signal }, (c) =>
          streamer.push(c),
        )

        let say: string
        let feynmanOut: FeynmanResult | undefined

        if (phase === 'feynman' && feynmanR) {
          // 模型只负责措辞；"过没过"由规则层说了算，不让模型自己判
          const f = parseFeynman(raw)
          say = f.say || feynmanR.say
          feynmanOut = feynmanR
        } else {
          say = parseSocratic(raw).say
        }

        // ④ 审计这一轮提问（含诱导式检测），落在 history 上供 UI 展示
        next = recordAiTurn(next, say, level, phase, {
          move: plan.move,
          feynman: feynmanOut,
        })

        if (phase === 'feynman' && feynmanR) {
          next = { ...next, feynmanRound: next.feynmanRound + 1 }

          if (!feynmanR.passed && feynmanR.stuckAt) {
            // 费曼第 3 步：讲不清就退回追问，把卡住处变成新缺口
            next = {
              ...next,
              gaps: mergeGaps(next, [
                { type: 'def', evidence: feynmanR.stuckAt, confidence: 0.8 },
              ]),
            }
          }

          const loop = nextLoopStep(next.feynmanRound, feynmanR.total, feynmanR.passed)

          if (loop.action === 'pass') {
            next = {
              ...next,
              phase: 'done',
              gaps: closeGaps(
                next,
                next.gaps.filter((g) => !g.resolved).map((g) => g.type),
              ),
            }
          } else if (loop.action === 'fallback') {
            // 讲了 3 次还不通：不硬逼，退回追问补最弱的点
            next = { ...next, phase: 'socratic', level: 2, feynmanRound: 0 }
          }
        }
        setSession(next)
      } catch (e) {
        const msg =
          e instanceof DeepSeekError
            ? e.kind === 'no_key'
              ? '还没填 DeepSeek API Key，右上角设置里填上就能用真模型啦'
              : e.message
            : '出了点问题，再试一次'
        setErr(msg)
      } finally {
        setStreaming('')
        setBusy(false)
        abortRef.current = null
      }
    },
    [apiKey, model],
  )

  /** 学生点"我不知道"等按钮 */
  const quickSay = useCallback(
    (t: string) => {
      setInput(t)
      setTimeout(() => {
        const btn = document.getElementById('send-btn')
        btn?.click()
      }, 0)
    },
    [],
  )

  // ---------------------------------------------------------------- 开场
  const start = useCallback(
    async (c: string) => {
      setConcept(c)
      const s = createSession(c)
      setSession(s)
      setErr('')
      // 开场：学生还没有任何回答，用"空白"分类触发第一问（L1 唤起经验）
      const opening: Classification = {
        kind: 'unknown',
        hits: [],
        missing: [],
        coverage: 0,
        jargon: [],
        misconception: null,
        reason: '开场，尚未作答',
      }
      await speak(s, opening)
    },
    [speak],
  )

  // ---------------------------------------------------------------- 体验模式回放
  const demo = useMemo(() => DEMO_SCRIPTS.find((d) => d.id === demoId)!, [demoId])
  const demoSteps = useMemo(() => flattenScript(demo), [demo])

  useEffect(() => {
    if (mode !== 'demo') return
    // 切脚本时重置
    setSession(createSession(demo.concept))
    setDemoStep(0)
    setDemoPlaying(false)
  }, [demoId, mode, demo.concept])

  useEffect(() => {
    if (!demoPlaying) return
    if (demoStep >= demoSteps.length) {
      setDemoPlaying(false)
      return
    }
    const step = demoSteps[demoStep]
    let s = session

    // 学生说的话（第一步没有学生发言）
    if (step.student) {
      // 与真实模式一致：回放也走规则层分类，保证演示与真实行为同构
      const cls = classifyAnswer(step.student, getPack(s))
      s = recordStudentTurn(s, step.student, cls.kind)
      s = {
        ...s,
        gaps: mergeGaps(s, step.gaps),
        understoodLevel: step.understood,
      }
      if (step.closes.length) s = { ...s, gaps: closeGaps(s, step.closes) }
    }

    // 提问动作同样由规则层推导，让复盘统计在演示里也有内容
    const pack = getPack(s)
    const priorStudent = [...s.history].reverse().find((h) => h.role === 'student')
    const demoCls = classifyAnswer(priorStudent?.text ?? '', pack)
    const demoPlan = decideMove(demoCls, pack, {
      level: s.level,
      consecutiveUnknown: s.consecutiveStuck,
      askedMoves: s.usedMoves,
    })

    s = recordAiTurn(s, step.ai, step.level ?? 1, step.phase, {
      move: step.phase === 'socratic' ? demoPlan.move : undefined,
    })
    setSession(s)
    if (step.phase === 'done') {
      setDemoPlaying(false)
      setShowPassport(true)
      return
    }

    const t = setTimeout(() => setDemoStep((i) => i + 1), 2600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoPlaying, demoStep])

  const playDemo = useCallback(() => {
    if (demoStep >= demoSteps.length) {
      setSession(createSession(demo.concept))
      setDemoStep(0)
    }
    setDemoPlaying(true)
  }, [demo.concept, demoStep, demoSteps.length])

  const stepDemo = useCallback(() => {
    const step = demoSteps[demoStep]
    if (!step) return
    let s = session
    if (step.student) {
      const cls = classifyAnswer(step.student, getPack(s))
      s = recordStudentTurn(s, step.student, cls.kind)
      s = { ...s, gaps: mergeGaps(s, step.gaps), understoodLevel: step.understood }
      if (step.closes.length) s = { ...s, gaps: closeGaps(s, step.closes) }
    }
    s = recordAiTurn(s, step.ai, step.level ?? 1, step.phase)
    setSession(s)
    if (step.phase === 'done') setShowPassport(true)
    setDemoStep((i) => Math.min(i + 1, demoSteps.length))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoStep, demoSteps, session])

  // ---------------------------------------------------------------- render

  const phaseLabel =
    session.phase === 'done'
      ? '完成'
      : session.phase === 'feynman'
        ? '费曼环节 · 换你当小老师'
        : `苏格拉底追问 · L${session.level}`

  return (
    <div className="min-h-full">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 bg-kid-bg/85 backdrop-blur border-b border-kid-line">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl animate-float">❓</span>
            <div>
              <div className="font-extrabold leading-none">小问号</div>
              <div className="text-[10px] text-kid-mute leading-tight">
                苏格拉底 × 费曼 · 主动学习智能体
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="bg-white rounded-2xl p-0.5 flex border border-kid-line">
              <button
                className={`px-3 py-1.5 rounded-[14px] text-xs font-bold ${
                  mode === 'demo' ? 'bg-kid-primary text-white' : 'text-kid-mute'
                }`}
                onClick={() => {
                  setMode('demo')
                  setSession(createSession(demo.concept))
                  setDemoStep(0)
                  setDemoPlaying(false)
                }}
              >
                体验模式
              </button>
              <button
                className={`px-3 py-1.5 rounded-[14px] text-xs font-bold ${
                  mode === 'live' ? 'bg-kid-primary text-white' : 'text-kid-mute'
                }`}
                onClick={() => {
                  setMode('live')
                  // 切模式清空上一次会话，避免回放内容串到真模型里
                  setSession(createSession(concept))
                  setStreaming('')
                  setErr('')
                }}
              >
                真模型
              </button>
            </div>
            <button className="btn-ghost text-xs !py-1.5" onClick={() => setShowSettings(true)}>
              ⚙ 设置
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 grid lg:grid-cols-[1.35fr_1fr] gap-4">
        {/* 左：对话 */}
        <section className="card flex flex-col h-[calc(100vh-8.5rem)] min-h-[520px]">
          {/* 状态条 */}
          <div className="px-4 py-2.5 border-b border-kid-line flex items-center gap-2 flex-wrap">
            <span className="chip bg-kid-primarySoft text-kid-primary font-bold">{phaseLabel}</span>
            <span className="text-xs text-kid-mute">
              今天搞懂：<b className="text-kid-ink">{mode === 'demo' ? demo.concept : concept}</b>
            </span>
            <span className="ml-auto text-xs text-kid-mute">{session.round} 轮</span>
          </div>

          {/* 消息 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {session.history.length === 0 && mode === 'live' && (
              <div className="text-center py-10">
                <div className="text-4xl mb-3">🌱</div>
                <div className="font-bold mb-1">先选一个今天要搞懂的东西</div>
                <div className="text-xs text-kid-mute mb-4">
                  小问号不会直接告诉你答案，他会一直问到你自己想明白
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {CONCEPT_PRESETS.map((c) => (
                    <button
                      key={c.name}
                      className="btn-ghost text-xs"
                      onClick={() => start(c.name)}
                    >
                      {c.emoji} {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {session.history.length === 0 && mode === 'demo' && (
              <div className="text-center py-10">
                <div className="text-4xl mb-3">🎬</div>
                <div className="font-bold mb-1">体验模式</div>
                <div className="text-xs text-kid-mute mb-4">
                  不用 API Key，点播放就能看完整的一次学习过程
                </div>
              </div>
            )}

            {session.history.map((t, i) => (
              <Bubble key={i} turn={t} />
            ))}

            {streaming && (
              <div className="flex justify-start">
                <div className="bubble bg-kid-primarySoft text-kid-ink caret">{streaming}</div>
              </div>
            )}

            {busy && !streaming && (
              <div className="flex justify-start">
                <div className="bubble bg-kid-primarySoft text-kid-mute">小问号在想问题…</div>
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div className="border-t border-kid-line p-3">
            {err && (
              <div className="mb-2 text-xs text-[#C2185B] bg-[#FFEAEF] rounded-2xl px-3 py-2">
                {err}
              </div>
            )}

            {mode === 'live' ? (
              <>
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  <button className="btn-ghost text-xs !py-1.5" onClick={() => quickSay('我不知道')}>
                    🙈 我不知道
                  </button>
                  <button className="btn-ghost text-xs !py-1.5" onClick={() => quickSay('给我一点提示')}>
                    💡 给点提示
                  </button>
                  <button
                    className="btn-ghost text-xs !py-1.5"
                    onClick={() => quickSay('我讲完了，你听懂了吗？')}
                  >
                    🎤 我讲完了
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-2xl border border-kid-line px-4 py-2.5 text-[15px]
                      outline-none focus:border-kid-primary bg-white"
                    placeholder="把你的想法说出来…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        submit()
                      }
                    }}
                  />
                  <button id="send-btn" className="btn-primary" onClick={submit} disabled={busy || !input.trim()}>
                    发送
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-1.5 flex-wrap">
                  {DEMO_SCRIPTS.map((d) => (
                    <button
                      key={d.id}
                      className={`btn text-xs !py-1.5 ${
                        demoId === d.id
                          ? 'bg-kid-primary text-white'
                          : 'bg-white text-kid-mute border border-kid-line'
                      }`}
                      onClick={() => setDemoId(d.id)}
                    >
                      {d.emoji} {d.concept}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" onClick={playDemo} disabled={demoPlaying}>
                    {demoPlaying ? `播放中 ${demoStep + 1}/${demoSteps.length}` : '▶ 播放完整过程'}
                  </button>
                  <button className="btn-ghost" onClick={stepDemo} disabled={demoPlaying}>
                    单步
                  </button>
                </div>
                <div className="text-[11px] text-kid-mute">
                  {demo.grade} · {demo.blurb}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 右：图谱 */}
        <section className="space-y-3 overflow-y-auto max-h-[calc(100vh-8.5rem)] pr-1">
          <GapMap profile={profile} gaps={session.gaps} understoodTrail={understoodTrail} />

          <div className="card p-4">
            <div className="text-sm font-bold mb-2">🛡 拒答护栏自检</div>
            <div className="text-xs text-kid-mute leading-relaxed">
              小问号承诺：<b className="text-kid-ink">不给答案，只问问题</b>。
              右边三个数字是一边聊一边自动统计出来的，评委可以随时查看。
            </div>
            <div className="mt-2 text-xs font-mono bg-kid-bg rounded-2xl px-3 py-2 text-kid-ink/80">
              {profile.verdict}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-ghost text-sm"
              onClick={() => setShowPassport(true)}
              disabled={session.history.length === 0}
            >
              🎓 学习护照
            </button>
            <button
              className="btn-ghost text-sm"
              onClick={() => setShowReview(true)}
              disabled={session.history.length === 0}
            >
              🔍 教学复盘
            </button>
          </div>
        </section>
      </main>

      {showPassport && (
        <Passport
          concept={mode === 'demo' ? demo.concept : concept}
          profile={profile}
          gaps={session.gaps}
          onClose={() => setShowPassport(false)}
        />
      )}

      {showReview && (
        <Review session={session} onClose={() => setShowReview(false)} />
      )}

      {showSettings && (
        <Settings
          apiKey={apiKey}
          model={model}
          onSave={(k, m) => {
            setApiKey(k)
            setModel(m)
            localStorage.setItem('xwh_key', k)
            localStorage.setItem('xwh_model', m)
            setShowSettings(false)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- helpers

/** 提问动作 → 中文标签（让评委一眼看出这一步用的是苏格拉底哪种刀法） */
const MOVE_LABEL: Record<string, string> = {
  clarify: '澄清',
  example: '举例',
  counterexample: '反例',
  why: '追问理由',
  consequence: '追问后果',
  transfer: '换情境',
  summarize: '归纳',
  simplify: '降阶重问',
}

/** 学生回答分类 → 中文标签 */
const KIND_LABEL: Record<string, string> = {
  unknown: '说不会',
  recite: '背规则',
  jargon: '用术语',
  misconception: '典型错法',
  partial: '说到一半',
  complete: '说全了',
  offtopic: '跑题',
  vague: '太笼统',
}

function Bubble({ turn }: { turn: Turn }) {
  const isAi = turn.role === 'ai'
  return (
    <div className={`flex ${isAi ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`bubble ${
          isAi
            ? 'bg-kid-primarySoft text-kid-ink rounded-bl-lg'
            : 'bg-kid-blue text-white rounded-br-lg'
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <span className="text-[11px] opacity-70">{isAi ? '❓ 小问号' : '🧒 我'}</span>

          {/* AI 侧：台阶 + 提问动作 */}
          {isAi && turn.level && turn.phase === 'socratic' && (
            <span className="text-[10px] px-1.5 rounded-full bg-white/70 text-kid-primary">L{turn.level}</span>
          )}
          {isAi && turn.move && (
            <span className="text-[10px] px-1.5 rounded-full bg-white/70 text-[#8A5A2B]">
              {MOVE_LABEL[turn.move] ?? turn.move}
            </span>
          )}

          {/* 学生侧：回答类型 */}
          {!isAi && turn.kind && (
            <span className="text-[10px] px-1.5 rounded-full bg-white/25 text-white">
              {KIND_LABEL[turn.kind] ?? turn.kind}
            </span>
          )}

          {/* 护栏告警 */}
          {isAi && turn.audit && !turn.audit.passed && (
            <span className="text-[10px] px-1.5 rounded-full bg-[#FFEAEF] text-[#C2185B]">
              {turn.audit.label}
            </span>
          )}

          {/* 费曼得分 */}
          {isAi && turn.feynman && (
            <span
              className={`text-[10px] px-1.5 rounded-full ${
                turn.feynman.passed ? 'bg-kid-green text-white' : 'bg-[#FFF6DF] text-[#B8860B]'
              }`}
            >
              费曼 {turn.feynman.total} 分
            </span>
          )}
        </div>
        {turn.text}
      </div>
    </div>
  )
}

function lastAiText(s: SessionState): string | null {
  for (let i = s.history.length - 1; i >= 0; i--) {
    if (s.history[i].role === 'ai') return s.history[i].text
  }
  return null
}

function lastStudentText(s: SessionState): string | null {
  for (let i = s.history.length - 1; i >= 0; i--) {
    if (s.history[i].role === 'student') return s.history[i].text
  }
  return null
}

/** 逐轮理解度快照：用当前 session 反推某一轮时的理解度（近似，仅供曲线展示） */
function snapshotUnderstood(s: SessionState, round: number): number {
  const studentTurns = s.history.filter((h) => h.role === 'student')
  const idx = Math.min(round - 1, studentTurns.length)
  if (idx <= 0) return 0.2
  // 用闭合缺口的进度近似理解度
  const total = s.gaps.length || 1
  const closedBefore = s.gaps.filter((g) => g.resolved && (g.resolvedRound ?? 99) <= round).length
  const base = 0.2 + 0.7 * (closedBefore / total)
  return Math.min(1, Math.max(0.15, base + 0.1 * (idx / Math.max(1, studentTurns.length))))
}
