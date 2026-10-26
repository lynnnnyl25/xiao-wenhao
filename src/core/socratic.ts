/**
 * 苏格拉底提问引擎（规则层）
 * ---------------------------------------------------------------
 * 大模型很会"像苏格拉底一样说话"，但常常犯三个错：
 *   1. 诱导式提问 —— 把答案藏进问句里（"是不是因为……所以……？"）
 *   2. 一问多题 —— 一句话里问了三件事，学生不知道答哪个
 *   3. 原地打转 —— 反复问同一个问题，学生失去耐心
 *
 * 所以把"怎么问"从模型手里收回一部分，做成规则：
 *   先给学生的回答分类 → 再按矩阵决定"该用哪种提问动作" → 模型只负责把动作说成孩子能懂的话。
 *
 * 这样引导的准确性和一致性就不再依赖模型的临场发挥。
 */

import type { ConceptPack } from './concepts.ts'
import {
  auditJargon,
  detectMisconception,
  matchCheckpoints,
  requiredCoverage,
} from './concepts.ts'

// ---------------------------------------------------------------- 回答分类

export type AnswerKind =
  /** 直接说不会 */
  | 'unknown'
  /** 背规则/套话，说不出所以然 */
  | 'recite'
  /** 用了没解释的术语 */
  | 'jargon'
  /** 踩了已知典型错法 */
  | 'misconception'
  /** 说对了一部分，还差关键点 */
  | 'partial'
  /** 关键点都说到了 */
  | 'complete'
  /** 答非所问 */
  | 'offtopic'
  /** 太短、看不出内容 */
  | 'vague'

export type Classification = {
  kind: AnswerKind
  /** 命中的理解点 id */
  hits: string[]
  /** 还缺的必答项 id */
  missing: string[]
  /** 必答项覆盖度 */
  coverage: number
  /** 命中的术语 */
  jargon: string[]
  /** 命中的典型错法 id */
  misconception: string | null
  /** 给人看的判断理由（评审/调试用） */
  reason: string
}

const UNKNOWN_RE =
  /(不知道|不会|不清楚|不晓得|没听懂|不懂|想不出|说不上|忘了|不会做|no idea|答不上)/i

const OFFTOPIC_RE =
  /(今天吃什么|玩游戏|不想学|好无聊|几点了|你叫什么|你是机器人)/

/** 只说套话的信号：把规则/结论复述一遍，但没有理由 */
const RECITE_RE = /(老师说的|规定|必须|反正|就是这样|书上说|我记得是|好像是)/

export function classifyAnswer(
  text: string,
  pack: ConceptPack | undefined,
): Classification {
  const raw = text.trim()
  const t = raw.replace(/\s+/g, '')

  const base: Classification = {
    kind: 'vague',
    hits: [],
    missing: [],
    coverage: 0,
    jargon: [],
    misconception: null,
    reason: '',
  }

  if (UNKNOWN_RE.test(raw)) {
    return { ...base, kind: 'unknown', reason: '学生明确表示不会' }
  }
  if (OFFTOPIC_RE.test(raw)) {
    return { ...base, kind: 'offtopic', reason: '答非所问' }
  }
  if (t.length < 3) {
    return { ...base, kind: 'vague', reason: '回答过短，看不出内容' }
  }

  // 没有概念底稿时，只能做粗判断
  if (!pack) {
    const mis = detectMisconception(raw, {
      misconceptions: [],
    } as unknown as ConceptPack)
    return {
      ...base,
      kind: mis ? 'misconception' : t.length > 25 ? 'partial' : 'vague',
      reason: '无概念底稿，按长度粗判',
    }
  }

  const hits = matchCheckpoints(raw, pack)
  const coverage = requiredCoverage(raw, pack)
  const jargon = auditJargon(raw, pack)
  const mis = detectMisconception(raw, pack)

  const requiredIds = pack.checkpoints.filter((c) => c.required).map((c) => c.id)
  const missing = requiredIds.filter((id) => !hits.includes(id))

  // 判定优先级：错法 > 术语 > 套话 > 部分 > 完整
  if (mis) {
    return {
      ...base,
      kind: 'misconception',
      hits,
      missing,
      coverage,
      jargon,
      misconception: mis.id,
      reason: `踩中典型错法：${mis.label}`,
    }
  }
  if (jargon.length > 0 && coverage < 0.6) {
    return {
      ...base,
      kind: 'jargon',
      hits,
      missing,
      coverage,
      jargon,
      reason: `用了未解释的术语：${jargon.join('、')}`,
    }
  }
  if (RECITE_RE.test(raw) && coverage < 0.5) {
    return {
      ...base,
      kind: 'recite',
      hits,
      missing,
      coverage,
      jargon,
      reason: '复述规则但没有理由',
    }
  }
  if (coverage >= 0.75 && missing.length === 0) {
    return {
      ...base,
      kind: 'complete',
      hits,
      missing,
      coverage,
      jargon,
      reason: '必答理解点已覆盖',
    }
  }
  if (coverage > 0) {
    return {
      ...base,
      kind: 'partial',
      hits,
      missing,
      coverage,
      jargon,
      reason: `覆盖 ${Math.round(coverage * 100)}%，还缺 ${missing.length} 个要点`,
    }
  }
  return { ...base, kind: 'vague', hits, missing, coverage, jargon, reason: '未命中任何理解点' }
}

// ---------------------------------------------------------------- 提问动作

/**
 * 六种提问动作。这是苏格拉底法的"刀法"，
 * 每种动作对应一种学生状态，不能乱用。
 */
export type QuestionMove =
  /** 澄清：请他把术语/模糊处说清楚 */
  | 'clarify'
  /** 举例：要一个具体例子 */
  | 'example'
  /** 反例：给一个不成立的情况，戳破过度概括 */
  | 'counterexample'
  /** 追问理由：问他凭什么这么想 */
  | 'why'
  /** 追问后果：如果……会怎么样 */
  | 'consequence'
  /** 换情境：验证能不能迁移 */
  | 'transfer'
  /** 归纳：让他用一句话收口 */
  | 'summarize'
  /** 降阶：换成更好懂的说法，重问同一件事 */
  | 'simplify'

export type MovePlan = {
  move: QuestionMove
  /** 这一步要打掉的缺口 */
  targetGap: string
  /** 给模型的指令：问什么，不许问什么 */
  instruction: string
  /** 是否应该降一层 */
  lower: boolean
  /** 是否已经到了可以进费曼的程度 */
  readyForFeynman: boolean
}

/**
 * 核心决策矩阵：学生的回答类型 → 该用哪种提问动作
 *
 * 这是"引导准确"的关键。模型不再自由决定问什么，
 * 而是在这个矩阵给出的动作里，选一种孩子能听懂的说法。
 */
export function decideMove(
  cls: Classification,
  pack: ConceptPack | undefined,
  ctx: { level: number; consecutiveUnknown: number; askedMoves: QuestionMove[] },
): MovePlan {
  const mis = pack && cls.misconception
    ? pack.misconceptions.find((m) => m.id === cls.misconception)
    : undefined

  switch (cls.kind) {
    case 'unknown': {
      // 连续不会 → 降阶；第一次不会 → 换个说法重问同一件事
      const lower = ctx.consecutiveUnknown >= 1
      return {
        move: 'simplify',
        targetGap: cls.missing[0] ?? 'def',
        instruction: lower
          ? '学生已经答不上来了。把同一个问题换成更贴近生活的说法，不要换目标，也不要给答案。'
          : '学生说不会。先接住他的情绪，再用一个更具体的生活场景把同一个问题再问一次。',
        lower,
        readyForFeynman: false,
      }
    }

    case 'misconception':
      return {
        move: 'counterexample',
        targetGap: mis?.gapType ?? 'mech',
        instruction: mis
          ? `他踩了一个典型错法：${mis.label}。用这个反问去戳破它，但不要说出正确答案：${mis.probe}`
          : '他有一个明显的错误理解。构造一个反例，让他自己发现矛盾，不要直接纠正。',
        lower: false,
        readyForFeynman: false,
      }

    case 'jargon':
      return {
        move: 'clarify',
        targetGap: 'jargon',
        instruction: `他用了这些自己没解释的词：${cls.jargon.join('、')}。请他挑一个，用自己平时说话的方式讲清楚，不许用那个词本身。`,
        lower: false,
        readyForFeynman: false,
      }

    case 'recite':
      return {
        move: 'why',
        targetGap: 'mech',
        instruction: '他把规则背出来了，但说不出为什么。追问他这个规则背后的道理，不要给解释。',
        lower: false,
        readyForFeynman: false,
      }

    case 'partial': {
      const missingCp = pack?.checkpoints.find((c) => c.id === cls.missing[0])
      return {
        move: 'consequence',
        targetGap: missingCp ? gapGuessFor(missingCp.id) : 'mech',
        instruction: missingCp
          ? `他已经说到一部分了。现在专攻他还没说到的这一点：「${missingCp.label}」。用一个"如果……会怎么样"的问法引出来，不要直接点破。`
          : '他说对了一部分。针对还没说到的部分，用一个具体情境追问。',
        lower: false,
        readyForFeynman: false,
      }
    }

    case 'complete': {
      // 说全了 → 先换情境验证迁移，再进费曼
      const doneTransfer = ctx.askedMoves.includes('transfer')
      return {
        move: doneTransfer ? 'summarize' : 'transfer',
        targetGap: 'transfer',
        instruction: doneTransfer
          ? '他已经能迁移到新情境了。请他用一句话把这个概念总结出来，准备进入费曼环节。'
          : '他看起来说对了。先别急着夸，换一个他没见过的新情境，验证是不是真的会了。',
        lower: false,
        readyForFeynman: doneTransfer,
      }
    }

    case 'offtopic':
      return {
        move: 'simplify',
        targetGap: 'def',
        instruction: '他跑题了。轻轻拉回来，用一个更好玩的说法把原来的问题再问一次。',
        lower: true,
        readyForFeynman: false,
      }

    case 'vague':
    default:
      return {
        move: 'example',
        targetGap: 'def',
        instruction: '他的回答太笼统。请他要一个具体例子，越具体越好。',
        lower: false,
        readyForFeynman: false,
      }
  }
}

function gapGuessFor(checkpointId: string): string {
  const map: Record<string, string> = {
    name: 'def',
    overwrite: 'mech',
    retrieve: 'def',
    mutable: 'edge',
    repeat: 'def',
    stop: 'mech',
    count: 'mech',
    scale: 'transfer',
    twostate: 'def',
    whytwo: 'causal',
    combine: 'mech',
    combos: 'mech',
    length: 'mech',
    knowninfo: 'edge',
    steps: 'def',
    ordered: 'mech',
    clear: 'mech',
    general: 'transfer',
    data: 'def',
    pattern: 'mech',
    notUnderstand: 'def',
    limit: 'edge',
  }
  return map[checkpointId] ?? 'mech'
}

// ---------------------------------------------------------------- 违规检测

export type QuestionAudit = {
  /** 问句数量 */
  questionCount: number
  /** 是否一问多题 */
  multiQuestion: boolean
  /** 是否是诱导式提问（答案藏在问句里） */
  leading: boolean
  /** 诱导证据 */
  leadingEvidence: string[]
  /** 是否泄露了还没被学生说出的理解点 */
  leakedCheckpoints: string[]
  /** 与上一轮是否重复 */
  repeated: boolean
  /** 综合是否合格 */
  passed: boolean
  /** 短评 */
  label: string
}

/** 问句切分：按问号切，同时保留原文片段 */
function questionsOf(text: string): string[] {
  const parts = text.split(/(?<=[？?])/).map((s) => s.trim()).filter(Boolean)
  return parts.filter((s) => /[？?]$/.test(s))
}

/** 判断式问句：是/不是型，最容易变成诱导 */
const YESNO_RE = /(是不是|对不对|会不会|能不能|要不要|有没有|可不可以|行不行|是这样吗|对吧)/
/** 把答案直接说出来的信号 */
const REVEAL_RE = /(也就是|意思是|就是说|换句话说|等于说|之所以.{2,}是因为)/


/**
 * 关键词命中判定。
 * 直接用 includes 会误伤：要点词"找到"会被"一眼找到"这种泛指命中，
 * 但那并不是在说"用名字取回值"。所以对短词要求它出现在更具体的语境里。
 */
function keywordHits(questionNorm: string, keyword: string): boolean {
  const k = keyword.replace(/\s+/g, '')
  if (!k) return false
  if (!questionNorm.includes(k)) return false
  // 疑问句里出现"找到/取出/拿到"这类泛动词，若前面紧邻"一眼/自己/怎么/帮你"，
  // 多半是日常问法，不构成把答案说出来
  if (k.length <= 2) return true
  const idx = questionNorm.indexOf(k)
  const before = questionNorm.slice(Math.max(0, idx - 3), idx)
  if (/(一眼|自己|怎么|帮你|才能|很难|容易)/.test(before)) return false
  return true
}

/**
 * 审计一轮 AI 提问是否合格。
 *
 * 最关键的一条是 leading：如果问句里出现了"学生还没说到"的理解点关键词，
 * 说明答案已经藏在问题里了 —— 学生只需点头，不会真的思考。
 */
export function auditQuestion(
  aiText: string,
  pack: ConceptPack | undefined,
  opts: { lastQuestion?: string; hits?: string[] } = {},
): QuestionAudit {
  const qs = questionsOf(aiText)
  const questionCount = qs.length
  const multiQuestion = questionCount > 1

  const leadingEvidence: string[] = []
  const leakedCheckpoints: string[] = []

  if (pack && qs.length > 0) {
    const studentHits = new Set(opts.hits ?? [])
    for (const q of qs) {
      const qn = q.replace(/\s+/g, '')

      // ① 问句里是否**说出了**学生还没说到的那个判断
      //
      // 注意：只命中名词不算泄露。
      //   「你的生日，你同桌知道吗？」—— 引入了"生日"，但没说"所以更弱"，不算。
      //   「是不是因为你生日同学都知道，所以更弱？」—— 判断说全了，算。
      // 所以要求同时命中：名词关键词 + 判断关系词。
      for (const cp of pack.checkpoints) {
        if (!cp.required) continue
        if (studentHits.has(cp.id)) continue

        const hitNoun = cp.keywords.some((k) => keywordHits(qn, k))
        if (!hitNoun) continue

        // 判断关系词：只有把这些词也说出来，才构成"给出结论"
        const JUDGE_RE = /(所以|因为.{0,12}就|就会|才|说明|意思是|也就是说|等于|这意味着)/
        const isJudging = JUDGE_RE.test(qn)

        // 或者是非问句直接断言了结论（"是不是...更弱"）
        const asserts = /(更弱|更强|更安全|不安全|更好猜|难猜|覆盖|替换|只能记|只能表示)/.test(qn)

        if (isJudging || asserts) {
          leakedCheckpoints.push(cp.id)
          leadingEvidence.push(`问句说出了未掌握要点「${cp.label}」的结论`)
        }
      }

      // ② 是非问 + 长命题 → 典型的"我说答案你点头"
      //    但"你能不能用你自己的话说说…""是不是觉得…"这类是邀请/共情，不算诱导
      const INVITE_RE = /(能不能(用|把|换)|可不可以(用|把|换)|是不是觉得|会不会觉得|要不要试)/
      if (YESNO_RE.test(q) && qn.length > 16 && !INVITE_RE.test(q)) {
        leadingEvidence.push(`是非问句过长，近似在陈述：${q.slice(0, 20)}…`)
      }

      // ③ 问句里自带解释
      if (REVEAL_RE.test(q)) {
        leadingEvidence.push(`问句中含解释性成分：${q.slice(0, 20)}…`)
      }
    }
  }

  const leading = leadingEvidence.length > 0

  // 重复：与上一轮问句实质相同
  const repeated =
    !!opts.lastQuestion &&
    normalizeQ(aiText) === normalizeQ(opts.lastQuestion) &&
    normalizeQ(aiText).length > 6

  const passed = questionCount === 1 && !leading && !repeated

  let label = '提问合格 ✓'
  if (multiQuestion) label = `一问多题（${questionCount} 个问句）✗`
  else if (leading) label = '诱导式提问：答案藏在问句里 ✗'
  else if (repeated) label = '重复提问 ✗'
  else if (questionCount === 0) label = '没有提问 ✗'

  return {
    questionCount,
    multiQuestion,
    leading,
    leadingEvidence,
    leakedCheckpoints,
    repeated,
    passed,
    label,
  }
}

function normalizeQ(s: string): string {
  return s.replace(/[\s，。！？、,.!?"'「」（）()]/g, '')
}

// ---------------------------------------------------------------- 表达脚手架

/**
 * 小学生说不出来，常常不是不懂，而是不知道怎么组织语言。
 * 给他句式脚手架，比再问一遍有效得多。
 */
export const SCAFFOLDS = {
  explain: '我觉得它是……，因为它会……',
  example: '比如说，如果……，那就会……',
  compare: '它有点像……，因为……',
  because: '我这样想，是因为……',
  unsure: '我有点不确定，但我觉得可能是……',
} as const

/** 根据回答类型挑一个脚手架 */
export function pickScaffold(kind: AnswerKind): string {
  switch (kind) {
    case 'unknown':
      return SCAFFOLDS.unsure
    case 'vague':
      return SCAFFOLDS.example
    case 'partial':
      return SCAFFOLDS.because
    case 'jargon':
      return SCAFFOLDS.explain
    case 'recite':
      return SCAFFOLDS.because
    default:
      return SCAFFOLDS.explain
  }
}
