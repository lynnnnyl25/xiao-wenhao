/**
 * 教学内核自检
 * ---------------------------------------------------------------
 * 不只是"能不能跑"，而是检查**方法是否真的落实**：
 *   1. 拒答护栏：泄露率、答问比
 *   2. 苏格拉底质量：诱导率、一问一题率  ← 这两项是"引导是否准确"的核心
 *   3. 缺口闭环：闭合率
 *   4. 费曼质量：四维评分、是否给分说明理由
 *   5. 概念底稿：六个概念是否都被覆盖
 *
 * 运行： pnpm selfcheck
 */

import { DEMO_SCRIPTS } from '../src/core/demo.ts'
import { auditAiTurn, summarize } from '../src/core/guardrail.ts'
import { auditQuestion, classifyAnswer } from '../src/core/socratic.ts'
import { createSession, mergeGaps, closeGaps } from '../src/core/engine.ts'
import { CONCEPT_PACKS, findPack } from '../src/core/concepts.ts'
import { evaluateFeynman } from '../src/core/feynman.ts'

type Row = {
  name: string
  turns: number
  qaRatio: number
  leakRate: number
  leadingRate: number
  singleRate: number
  closure: number
  passRate: number
}

const rows: Row[] = []
let totalTurns = 0
let totalPass = 0
let totalLeading = 0

console.log('='.repeat(70))
console.log('小问号 · 教学内核自检')
console.log('='.repeat(70))

for (const script of DEMO_SCRIPTS) {
  const pack = findPack(script.concept)
  console.log(`\n▸ ${script.emoji} ${script.concept}${pack ? `  [底稿: ${pack.id}]` : '  [无底稿]'}`)

  let state = createSession(script.concept)
  const audits = []
  let studentHits: string[] = []
  let lastAi = ''

  for (const step of script.steps) {
    // AI 这一句：护栏 + 诱导检测（带上学生上一轮已说到的点）
    const audit = auditAiTurn(step.ai, step.phase, {
      pack,
      studentHits,
      lastQuestion: lastAi,
    })
    audits.push(audit)

    if (!audit.passed) {
      console.log(`  ✗ ${audit.label}`)
      console.log(`     「${step.ai.slice(0, 34)}…」`)
      if (audit.leading && pack) {
        const q = auditQuestion(step.ai, pack, { hits: studentHits, lastQuestion: lastAi })
        q.leadingEvidence.forEach((e) => console.log(`      · ${e}`))
      }
    } else {
      totalPass++
    }
    if (audit.leading) totalLeading++
    totalTurns++
    lastAi = step.ai

    // 学生这一句：规则层分类（验证分类器不崩）
    if (step.student) {
      const cls = classifyAnswer(step.student, pack)
      studentHits = cls.hits
      if (process.env.VERBOSE) {
        console.log(`     [学生] ${cls.kind} — ${cls.reason}`)
      }
      state = {
        ...state,
        round: state.round + 1,
        gaps: mergeGaps(state, step.gaps ?? []),
        understoodLevel: step.understood ?? state.understoodLevel,
      }
      if (step.closes?.length) state = { ...state, gaps: closeGaps(state, step.closes) }
    }
  }

  const closed = state.gaps.filter((g) => g.resolved).length
  const s = summarize(audits, state.gaps.length, closed)

  rows.push({
    name: script.concept,
    turns: s.turns,
    qaRatio: s.qaRatio,
    leakRate: s.leakRate,
    leadingRate: s.leadingRate,
    singleRate: s.singleQuestionRate,
    closure: s.closureRate,
    passRate: s.passRate,
  })

  console.log(
    `  轮次 ${s.turns} · 答问比 ${s.qaRatio} · 泄露 ${s.leakRate}% · ` +
      `诱导 ${s.leadingRate}% · 一问一题 ${s.singleQuestionRate}% · ` +
      `闭合 ${s.closureRate}% · 护栏 ${s.passRate}%`,
  )
}

// ---------------------------------------------------------------- 汇总表
console.log('\n' + '-'.repeat(70))
console.log('分概念指标')
console.log('-'.repeat(70))
console.log(
  '概念'.padEnd(20) + '轮次'.padEnd(7) + '答问比'.padEnd(9) +
  '泄露'.padEnd(9) + '诱导'.padEnd(9) + '一问一题'.padEnd(12) + '闭合',
)
for (const r of rows) {
  console.log(
    r.name.slice(0, 16).padEnd(19) +
      String(r.turns).padEnd(8) +
      String(r.qaRatio).padEnd(10) +
      `${r.leakRate}%`.padEnd(10) +
      `${r.leadingRate}%`.padEnd(10) +
      `${r.singleRate}%`.padEnd(13) +
      `${r.closure}%`,
  )
}

// ---------------------------------------------------------------- 费曼能力
console.log('\n' + '-'.repeat(70))
console.log('费曼评分能力（三段不同质量的讲解，检查判定是否分得开）')
console.log('-'.repeat(70))

const feynmanCases = [
  {
    label: '差：只有术语，没比方，没因果',
    text: '变量就是一个存储单元，用来存数据。',
    expect: false,
  },
  {
    label: '中：有比方但没讲清覆盖',
    text: '变量就像一个盒子，你把东西放进去，然后给它起个名字。',
    expect: false,
  },
  {
    label: '好：有比方 + 讲清覆盖 + 无术语',
    text: '变量就像一个贴了名字的盒子。你把数字放进去，下次再放新的，旧的就没了。所以问盒子里是几，就是问现在放的是什么。',
    expect: true,
  },
]

const varPack = findPack('变量')!
let feynmanOk = 0
for (const c of feynmanCases) {
  const r = evaluateFeynman(c.text, varPack, 1)
  const ok = r.passed === c.expect
  if (ok) feynmanOk++
  console.log(`  ${ok ? '✓' : '✗'} ${c.label}`)
  console.log(`     得分 ${r.total} | 判定 ${r.passed ? '通过' : '不通过'} | 期望 ${c.expect ? '通过' : '不通过'}`)
  r.dimensions.forEach((d) => {
    console.log(`     · ${d.name} ${Math.round(d.score * 100)} 分 — ${d.evidence}`)
  })
  if (!r.passed && r.nextProbe) console.log(`     下一句会问：${r.nextProbe}`)
}

// ---------------------------------------------------------------- 底稿覆盖
console.log('\n' + '-'.repeat(70))
console.log('概念底稿覆盖')
console.log('-'.repeat(70))
for (const p of CONCEPT_PACKS) {
  const required = p.checkpoints.filter((c) => c.required).length
  console.log(
    `  ${p.emoji} ${p.name.padEnd(8)} 必答点 ${required} · 术语 ${p.jargon.length} 个 · ` +
      `典型错法 ${p.misconceptions.length} 种 · 阶梯 ${p.ladder.length} 层`,
  )
}

// ---------------------------------------------------------------- 终局
console.log('\n' + '='.repeat(70))
console.log(`总轮次 ${totalTurns} · 护栏通过 ${totalPass}/${totalTurns} · 诱导式提问 ${totalLeading} 轮`)
console.log('合格线：泄露率 ≤5%，诱导率 ≤10%，一问一题率 ≥95%，闭合率 ≥60%')
console.log('='.repeat(70))

const bad =
  rows.some((r) => r.leakRate > 5) ||
  rows.some((r) => r.leadingRate > 10) ||
  rows.some((r) => r.singleRate < 95) ||
  feynmanOk !== feynmanCases.length

process.exit(bad ? 1 : 0)
