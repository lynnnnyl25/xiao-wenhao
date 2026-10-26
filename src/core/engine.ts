/**
 * G-Loop 教学状态机
 * ---------------------------------------------------------------
 * 提问 → 诊断 → 更新缺口图谱 → 决策下一层 →（疑似掌握）→ 费曼 → 闭合/回环
 *
 * 这个状态机是纯函数式的：输入状态 + 学生话语，输出新状态 + AI 要说的话。
 * 好处是它既能接真实 DeepSeek，也能接离线回放脚本（体验模式）。
 */

import { GAP_TYPE_MAP, type GapTypeId } from './prompts.ts'
import { auditAiTurn, type GuardVerdict } from './guardrail.ts'
import { findPack, type ConceptPack } from './concepts.ts'
import type { AnswerKind, QuestionMove } from './socratic.ts'
import type { FeynmanResult } from './feynman.ts'

export type GapRecord = {
  id: string
  type: GapTypeId | string
  evidence: string
  round: number
  resolved: boolean
  resolvedRound?: number
  confidence: number
  /** 这条缺口是被什么提问动作暴露的（便于复盘教学策略） */
  byMove?: QuestionMove
}

export type Turn = {
  round: number
  role: 'ai' | 'student'
  text: string
  phase: Phase
  level?: number
  audit?: GuardVerdict
  /** 学生这轮的回答分类 */
  kind?: AnswerKind
  /** AI 这轮用的提问动作 */
  move?: QuestionMove
  /** 费曼评分（仅费曼环节的 AI 轮） */
  feynman?: FeynmanResult
}

export type Phase = 'socratic' | 'feynman' | 'done'

export type SessionState = {
  concept: string
  /** 绑定的概念底稿 id（没有则为通用模式） */
  packId?: string
  phase: Phase
  level: number
  round: number
  consecutiveStuck: number
  gaps: GapRecord[]
  history: Turn[]
  understoodLevel: number
  feynmanRound: number
  audits: GuardVerdict[]
  /** 已用过的提问动作，防止反复用同一招 */
  usedMoves: QuestionMove[]
  /** 费曼各轮得分，用来展示"越讲越好" */
  feynmanScores: number[]
  startedAt: number
}

export function createSession(concept: string): SessionState {
  const pack = findPack(concept)
  return {
    concept,
    packId: pack?.id,
    phase: 'socratic',
    level: 1,
    round: 0,
    consecutiveStuck: 0,
    gaps: [],
    history: [],
    understoodLevel: 0,
    feynmanRound: 0,
    audits: [],
    usedMoves: [],
    feynmanScores: [],
    startedAt: Date.now(),
  }
}

/** 把诊断结果并入缺口图谱：同一类型 + 相似证据视为同一缺口，避免重复记账 */
export function mergeGaps(
  state: SessionState,
  incoming: { type: string; evidence: string; confidence: number }[],
): GapRecord[] {
  const next = [...state.gaps]
  // 最近一次提问动作，用来标注"这个缺口是被哪招逼出来的"
  const lastMove = state.usedMoves[state.usedMoves.length - 1]

  for (const g of incoming) {
    const dup = next.find(
      (x) =>
        x.type === g.type &&
        (x.evidence === g.evidence || x.evidence.includes(g.evidence.slice(0, 8))),
    )
    if (dup) {
      dup.confidence = Math.max(dup.confidence, g.confidence)
      continue
    }
    next.push({
      id: `g${next.length + 1}`,
      type: g.type,
      evidence: g.evidence,
      round: state.round,
      resolved: false,
      confidence: g.confidence,
      byMove: lastMove,
    })
  }
  return next
}

/** 学生把某个缺口讲清楚了 → 闭合它 */
export function closeGaps(state: SessionState, types: string[]): GapRecord[] {
  return state.gaps.map((g) =>
    !g.resolved && types.includes(g.type)
      ? { ...g, resolved: true, resolvedRound: state.round }
      : g,
  )
}

/** 下一层台阶的决策：卡住就降层，答对就登层 */
export function nextLevel(state: SessionState, understood: number, stuck: boolean): number {
  if (stuck) return Math.max(1, state.level - 1)
  if (understood >= 0.75) return Math.min(6, state.level + 1)
  if (understood >= 0.5) return state.level
  return Math.max(1, state.level - 1)
}

/** 是否该进入费曼环节：懂到一定程度且没有未闭合缺口，或者已经问够 6 轮 */
export function shouldEnterFeynman(state: SessionState): boolean {
  const openGaps = state.gaps.filter((g) => !g.resolved).length
  return (state.understoodLevel >= 0.7 && openGaps === 0) || state.round >= 6
}

/** 记录一轮 AI 输出并跑护栏审计 */
export function recordAiTurn(
  state: SessionState,
  text: string,
  level: number,
  phase: Phase = state.phase,
  extra: { move?: QuestionMove; feynman?: FeynmanResult } = {},
): SessionState {
  const pack = getPack(state)
  const lastQuestion = [...state.history].reverse().find((h) => h.role === 'ai')?.text
  const lastStudent = [...state.history].reverse().find((h) => h.role === 'student')

  const audit = auditAiTurn(text, phase, {
    pack,
    lastQuestion,
    studentHits: lastStudent ? undefined : undefined,
  })

  return {
    ...state,
    phase,
    round: state.round + 1,
    level,
    usedMoves: extra.move ? [...state.usedMoves, extra.move] : state.usedMoves,
    feynmanScores: extra.feynman
      ? [...state.feynmanScores, extra.feynman.total]
      : state.feynmanScores,
    history: [
      ...state.history,
      {
        round: state.round + 1,
        role: 'ai',
        text,
        phase,
        level,
        audit,
        move: extra.move,
        feynman: extra.feynman,
      },
    ],
    audits: [...state.audits, audit],
  }
}

export function recordStudentTurn(
  state: SessionState,
  text: string,
  kind?: AnswerKind,
): SessionState {
  return {
    ...state,
    history: [
      ...state.history,
      { round: state.round, role: 'student', text, phase: state.phase, kind },
    ],
  }
}

/** 取当前会话绑定的概念底稿 */
export function getPack(state: SessionState): ConceptPack | undefined {
  if (state.packId) return findPack(state.packId)
  return findPack(state.concept)
}

/** 学生说"不知道"的检测（离线兜底用） */
export const STUCK_PHRASES =
  /(不知道|不会|不清楚|不晓得|没听懂|不懂|想不出|说不上|忘了|不会做|no idea)/i

export function isStuck(text: string): boolean {
  return STUCK_PHRASES.test(text.trim()) || text.trim().length < 4
}

// ---------------------------------------------------------------- 画像统计

export type Profile = {
  totalGaps: number
  closedGaps: number
  closureRate: number
  byType: { type: string; name: string; color: string; total: number; closed: number }[]
  understoodLevel: number
  rounds: number
  qaRatio: number
  leakRate: number
  leadingRate: number
  singleQuestionRate: number
  passRate: number
  verdict: string
  /** 费曼各轮得分 */
  feynmanScores: number[]
}

export function buildProfile(state: SessionState): Profile {
  const total = state.gaps.length
  const closed = state.gaps.filter((g) => g.resolved).length

  const byType = Object.keys(GAP_TYPE_MAP)
    .map((t) => {
      const g = GAP_TYPE_MAP[t]
      const items = state.gaps.filter((x) => x.type === t)
      return {
        type: t,
        name: g.name,
        color: g.color,
        total: items.length,
        closed: items.filter((x) => x.resolved).length,
      }
    })
    .filter((x) => x.total > 0)

  const audits = state.audits
  const n = audits.length || 1
  const totalQ = audits.reduce((s, a) => s + a.questions, 0)
  const totalD = audits.reduce((s, a) => s + a.declarations, 0)
  const leakCount = audits.filter((a) => a.leak).length
  const leadingCount = audits.filter((a) => a.leading).length
  const singleQ = audits.filter((a) => !a.multiQuestion).length

  const parts: string[] = []
  parts.push(leakCount === 0 ? '没有直接给答案' : `${leakCount} 轮泄露`)
  parts.push(leadingCount === 0 ? '没有诱导式提问' : `${leadingCount} 轮诱导`)

  return {
    totalGaps: total,
    closedGaps: closed,
    closureRate: total === 0 ? 0 : Math.round((closed / total) * 100),
    byType,
    understoodLevel: Math.round(state.understoodLevel * 100),
    rounds: state.round,
    qaRatio: Number((totalD === 0 ? totalQ * 10 : totalQ / totalD).toFixed(2)),
    leakRate: Number(((leakCount / n) * 100).toFixed(1)),
    leadingRate: Number(((leadingCount / n) * 100).toFixed(1)),
    singleQuestionRate: Number(((singleQ / n) * 100).toFixed(1)),
    passRate: Number(((audits.filter((a) => a.passed).length / n) * 100).toFixed(1)),
    verdict: `本场 AI ${parts.join('，')}`,
    feynmanScores: state.feynmanScores,
  }
}
