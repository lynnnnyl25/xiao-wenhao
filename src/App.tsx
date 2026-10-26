import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GapMap from './components/GapMap'
import Passport from './components/Passport'
import Settings from './components/Settings'
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
  isStuck,
  mergeGaps,
  nextLevel,
  recordAiTurn,
  recordStudentTurn,
  shouldEnterFeynman,
  type SessionState,
  type Turn,
} from './core/engine'
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

    let s = recordStudentTurn(session, text)
    const stuck = isStuck(text)

    // 1) 诊断这一轮学生的话
    let understood = s.understoodLevel
    let incoming: { type: string; evidence: string; confidence: number }[] = []
    if (!stuck) {
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
        incoming = d.gaps
        understood = d.understood_level
      } catch (e) {
        // 诊断失败不阻断流程，按"没诊断出缺口"处理
        if (e instanceof DeepSeekError && e.kind !== 'abort') console.warn('诊断失败', e.message)
      }
    } else {
      understood = Math.max(0, s.understoodLevel - 0.1)
    }

    s = {
      ...s,
      gaps: mergeGaps(s, incoming),
      understoodLevel: understood,
      consecutiveStuck: stuck ? s.consecutiveStuck + 1 : 0,
    }

    // 2) 费曼阶段的判定交给费曼评审，苏格拉底阶段继续追问
    setSession(s)
    await speak(s, stuck)
  }, [apiKey, busy, input, model, session])

  /** 让 AI 说下一句 */
  const speak = useCallback(
    async (s: SessionState, stuck: boolean) => {
      const enteringFeynman = s.phase === 'socratic' && shouldEnterFeynman(s)
      const phase = enteringFeynman ? 'feynman' : s.phase

      let next: SessionState = { ...s, phase }
      if (enteringFeynman) next = { ...next, feynmanRound: 0 }

      // 费曼阶段：学生对 AI 的讲解由独立评审处理；这里 AI 先开口邀请
      const level = nextLevel(next, next.understoodLevel, stuck)

      setBusy(true)
      setStreaming('')
      const ctrl = new AbortController()
      abortRef.current = ctrl

      const messages =
        phase === 'feynman' && next.feynmanRound > 0
          ? buildFeynmanMessages({
              concept: next.concept,
              explanation: lastStudentText(next) ?? '',
              round: next.feynmanRound,
            })
          : buildSocraticMessages({
              concept: next.concept,
              history: next.history.map((h) => ({
                role: h.role,
                text: h.text,
                level: h.level,
              })),
              activeGaps: next.gaps.filter((g) => !g.resolved),
              consecutiveStuck: next.consecutiveStuck,
              currentLevel: next.level,
            })

      // 流式：把 say 字段增量推给 UI
      const streamer = makeSayStreamer((delta) => setStreaming((p) => p + delta))

      try {
        const raw = await callStream({ apiKey, model, messages, signal: ctrl.signal }, (c) =>
          streamer.push(c),
        )
        const parsed = parseSocratic(raw)
        const say = phase === 'feynman' ? parseFeynman(raw).say : parsed.say

        next = recordAiTurn(next, say, level)
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
      await speak(s, false)
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
      s = recordStudentTurn(s, step.student)
      s = {
        ...s,
        gaps: mergeGaps(s, step.gaps),
        understoodLevel: step.understood,
      }
      if (step.closes.length) s = { ...s, gaps: closeGaps(s, step.closes) }
    }

    s = recordAiTurn(s, step.ai, step.level ?? 1, step.phase)
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
      s = recordStudentTurn(s, step.student)
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
                onClick={() => setMode('demo')}
              >
                体验模式
              </button>
              <button
                className={`px-3 py-1.5 rounded-[14px] text-xs font-bold ${
                  mode === 'live' ? 'bg-kid-primary text-white' : 'text-kid-mute'
                }`}
                onClick={() => setMode('live')}
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

          <button
            className="btn-ghost w-full text-sm"
            onClick={() => setShowPassport(true)}
            disabled={session.history.length === 0}
          >
            🎓 生成学习护照
          </button>
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
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[11px] opacity-70">{isAi ? '❓ 小问号' : '🧒 我'}</span>
          {isAi && turn.level && turn.phase === 'socratic' && (
            <span className="text-[10px] px-1.5 rounded-full bg-white/70 text-kid-primary">L{turn.level}</span>
          )}
          {isAi && turn.audit && !turn.audit.passed && (
            <span className="text-[10px] px-1.5 rounded-full bg-[#FFEAEF] text-[#C2185B]">
              {turn.audit.label}
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
