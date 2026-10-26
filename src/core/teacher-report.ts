/**
 * 教师报告
 * ---------------------------------------------------------------
 * 一次对话结束后，教师最想知道的不是"聊了什么"，而是三件事：
 *   1. 这个孩子卡在哪（缺口，按类型归并）
 *   2. 他是怎么被问出来的（哪种提问动作最有效）
 *   3. 我下一节课该从哪里切入（教学建议）
 *
 * 这三件事都能从会话状态里算出来 —— 不需要模型再总结一遍，
 * 所以结论是**可复核**的：每个判断都能点回原话。
 */

import type { SessionState, GapRecord } from './engine.ts'
import { GAP_TYPE_MAP } from './prompts.ts'
import type { QuestionMove } from './socratic.ts'
import type { ConceptPack } from './concepts.ts'

export type TeacherReport = {
  concept: string
  rounds: number
  /** 按类型归并的缺口 */
  gapsByType: {
    type: string
    name: string
    color: string
    count: number
    closed: number
    examples: string[]
    /** 常用哪些提问动作逼出这类缺口 */
    moves: string[]
  }[]
  /** 哪种提问动作最有效（暴露缺口数 / 使用次数） */
  moveEffect: { move: QuestionMove; used: number; exposed: number; rate: number }[]
  /** 下一步教学建议 */
  suggestions: string[]
  /** 一句话结论 */
  headline: string
}

const MOVE_CN: Record<string, string> = {
  clarify: '请他澄清用词',
  example: '要他举例',
  counterexample: '给反例',
  why: '追问理由',
  consequence: '追问后果',
  transfer: '换情境',
  simplify: '降阶重问',
  summarize: '请他归纳',
}

export function buildTeacherReport(
  state: SessionState,
  pack?: ConceptPack,
): TeacherReport {
  const total = state.gaps.length
  const closed = state.gaps.filter((g) => g.resolved).length

  // ① 按类型归并
  const byType = Object.keys(GAP_TYPE_MAP)
    .map((t) => {
      const meta = GAP_TYPE_MAP[t]
      const items = state.gaps.filter((g) => g.type === t)
      return {
        type: t,
        name: meta.name,
        color: meta.color,
        count: items.length,
        closed: items.filter((g) => g.resolved).length,
        examples: items.map((g) => g.evidence).slice(0, 3),
        moves: [...new Set(items.map((g) => g.byMove).filter(Boolean))] as string[],
      }
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)

  // ② 提问动作有效性
  const usedCount = new Map<string, number>()
  for (const m of state.usedMoves) usedCount.set(m, (usedCount.get(m) ?? 0) + 1)

  const exposedCount = new Map<string, number>()
  for (const g of state.gaps) {
    if (!g.byMove) continue
    exposedCount.set(g.byMove, (exposedCount.get(g.byMove) ?? 0) + 1)
  }

  const moveEffect = [...usedCount.entries()]
    .map(([move, used]) => ({
      move: move as QuestionMove,
      used,
      exposed: exposedCount.get(move) ?? 0,
      rate: used === 0 ? 0 : Number(((exposedCount.get(move) ?? 0) / used).toFixed(2)),
    }))
    .sort((a, b) => b.rate - a.rate)

  // ③ 教学建议
  const suggestions: string[] = []
  const open = byType.filter((x) => x.closed < x.count)

  if (open.length === 0 && total > 0) {
    suggestions.push('本次对话中暴露的缺口全部闭合，可以进入下一个概念。')
  }

  for (const g of open) {
    const hint = pack?.misconceptions.find((m) => m.gapType === g.type)
    const tail = hint ? `可用的切入点：${hint.probe}` : GAP_TYPE_MAP[g.type]?.tip ?? ''
    suggestions.push(
      `「${g.name}」还有 ${g.count - g.closed} 处没通${tail ? ` —— ${tail}` : '。'}`,
    )
  }

  if (state.feynmanScores.length > 1) {
    const first = state.feynmanScores[0]
    const last = state.feynmanScores[state.feynmanScores.length - 1]
    suggestions.push(
      `费曼讲解从 ${first} 分提升到 ${last} 分，说明重讲有效；建议下次继续用"讲给别人听"收尾。`,
    )
  }

  const bestMove = moveEffect.find((m) => m.exposed > 0)
  if (bestMove) {
    suggestions.push(
      `本次最有效的提问动作是「${MOVE_CN[bestMove.move] ?? bestMove.move}」` +
        `（用 ${bestMove.used} 次，逼出 ${bestMove.exposed} 处缺口）。`,
    )
  }

  // ④ 一句话结论
  const headline =
    total === 0
      ? '本次没有暴露出明显缺口 —— 可能还需要更深的问题。'
      : closed === total
        ? `暴露出 ${total} 处缺口，已全部想通。`
        : `暴露出 ${total} 处缺口，还想通了 ${closed} 处。`

  return {
    concept: state.concept,
    rounds: state.round,
    gapsByType: byType,
    moveEffect,
    suggestions,
    headline,
  }
}

/** 导出为 Markdown（教师可直接存档或打印） */
export function reportToMarkdown(r: TeacherReport): string {
  const lines: string[] = []
  lines.push(`# 学习报告 · ${r.concept}`)
  lines.push('')
  lines.push(`> ${r.headline}`)
  lines.push('')
  lines.push(`共 ${r.rounds} 轮对话。`)
  lines.push('')

  lines.push('## 卡在哪里')
  lines.push('')
  if (r.gapsByType.length === 0) {
    lines.push('本次没有记录到缺口。')
  } else {
    lines.push('| 缺口类型 | 出现 | 已闭合 | 学生原话 |')
    lines.push('| --- | --- | --- | --- |')
    for (const g of r.gapsByType) {
      const ex = g.examples[0]?.replace(/\|/g, '\\|') ?? ''
      lines.push(`| ${g.name} | ${g.count} | ${g.closed} | 「${ex}」 |`)
    }
  }
  lines.push('')

  lines.push('## 哪种问法最有效')
  lines.push('')
  if (r.moveEffect.length === 0) {
    lines.push('暂无数据。')
  } else {
    lines.push('| 提问动作 | 使用次数 | 逼出缺口 | 命中率 |')
    lines.push('| --- | --- | --- | --- |')
    for (const m of r.moveEffect) {
      lines.push(
        `| ${MOVE_CN[m.move] ?? m.move} | ${m.used} | ${m.exposed} | ${Math.round(m.rate * 100)}% |`,
      )
    }
  }
  lines.push('')

  lines.push('## 下一步建议')
  lines.push('')
  for (const s of r.suggestions) lines.push(`- ${s}`)
  lines.push('')

  return lines.join('\n')
}
