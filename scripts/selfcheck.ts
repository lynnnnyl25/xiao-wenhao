/**
 * 护栏自检：在离线回放脚本上跑三项指标
 * ---------------------------------------------------------------
 * 这是申报书里的硬证据来源 —— 可以直接贴进 README。
 * 运行： node --experimental-strip-types scripts/selfcheck.ts
 *      （或用 vite-node / tsx）
 */

import { DEMO_SCRIPTS } from '../src/core/demo.ts'
import { auditAiTurn, summarize } from '../src/core/guardrail.ts'
import { createSession, mergeGaps, closeGaps } from '../src/core/engine.ts'

let pass = 0
let fail = 0

console.log('='.repeat(64))
console.log('小问号 · 拒答护栏自检报告')
console.log('='.repeat(64))

for (const script of DEMO_SCRIPTS) {
  console.log(`\n▸ ${script.emoji} ${script.concept}（${script.grade}）`)

  let state = createSession(script.concept)
  const audits = []

  for (const step of script.steps) {
    // AI 说的每一句都过一遍护栏
    const audit = auditAiTurn(step.ai, step.phase)
    audits.push(audit)

    const flag = audit.passed ? '✓' : '✗'
    if (!audit.passed) {
      fail++
      console.log(`  ${flag} L${step.level ?? '-'} ${step.ai.slice(0, 26)}…`)
      console.log(`     判定：${audit.label}`)
      if (audit.leakHits.length) console.log(`     命中：${audit.leakHits.join(' | ')}`)
    } else {
      pass++
    }

    // 同步推进状态，统计缺口
    if (step.student) {
      state = {
        ...state,
        round: state.round + 1,
        gaps: mergeGaps(state, step.gaps ?? []),
        understoodLevel: step.understood ?? state.understoodLevel,
      }
      if (step.closes?.length) state = { ...state, gaps: closeGaps(state, step.closes) }
    }
  }

  const total = state.gaps.length
  const closed = state.gaps.filter((g) => g.resolved).length
  const s = summarize(audits, total, closed)

  console.log(
    `  轮次 ${s.turns} · 答问比 ${s.qaRatio} · 泄露率 ${s.leakRate}% · ` +
      `闭合率 ${s.closureRate}% · 护栏通过率 ${s.passRate}%`,
  )
  console.log(`  ${s.verdict}`)
}

console.log('\n' + '='.repeat(64))
console.log(`合计：${pass} 轮通过护栏，${fail} 轮被判违规`)
console.log('标准：泄露率 ≤ 5%，答问比 ≥ 3，闭合率 ≥ 60%')
console.log('='.repeat(64))
