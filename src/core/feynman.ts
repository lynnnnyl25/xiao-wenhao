/**
 * 费曼学习法引擎
 * ---------------------------------------------------------------
 * 费曼技巧真正的四步是：
 *   ① 选定概念 → ② 讲给外行听 → ③ **发现讲不清就回到材料** → ④ 简化重讲，直到通顺
 *
 * 多数 AI 实现只做了 ②：听学生讲一遍，说"很棒"，结束。
 * 这等于把费曼法最关键的 ③④ 丢掉了 —— 而那里才是学习真正发生的地方。
 *
 * 这个模块做三件事：
 *   1. 给讲解打**可解释的分**（四条维度，各自有依据，不是模型感觉）
 *   2. 精确指出**卡在哪一句、为什么卡**（术语？缺因果？没有例子？）
 *   3. 不通过就**带着具体缺口退回追问**，逼他重讲 —— 这才是 ③④
 */

import type { ConceptPack } from './concepts.ts'
import {
  auditJargon,
  hasAnalogy,
  hasMechanism,
  matchCheckpoints,
  requiredCoverage,
} from './concepts.ts'

// ---------------------------------------------------------------- 评分维度

export type FeynmanDimension = {
  id: 'audience' | 'complete' | 'analogy' | 'mechanism'
  name: string
  /** 0-1 */
  score: number
  /** 这一维得过/没过的依据 */
  evidence: string
  passed: boolean
}

export type FeynmanResult = {
  dimensions: FeynmanDimension[]
  /** 加权总分 0-100 */
  total: number
  passed: boolean
  /** 卡住的原句（照抄） */
  stuckAt: string
  /** 还缺什么（人话） */
  missing: string[]
  /** 下一句该问什么（退回追问用） */
  nextProbe: string
  /** 给同桌说的话（模型可改写，但内容以这里为准） */
  say: string
}

/** 四条评分维度与权重 */
const WEIGHTS: Record<FeynmanDimension['id'], number> = {
  audience: 0.3, // 外行能听懂：不用没解释的词
  complete: 0.35, // 关键点说全
  analogy: 0.15, // 有生活类比
  mechanism: 0.2, // 讲清了为什么/怎么发生
}

/**
 * 评估一次费曼讲解。
 *
 * @param explanation 学生这次讲的内容
 * @param pack        概念底稿（没有就走弱判定）
 * @param round       第几次讲（第 1 次标准可以略低）
 */
export function evaluateFeynman(
  explanation: string,
  pack: ConceptPack | undefined,
  round = 1,
): FeynmanResult {
  const text = explanation.trim()
  const dimensions: FeynmanDimension[] = []

  if (!pack) {
    // 无底稿：只能看长度、类比、因果三个弱信号
    const long = text.length >= 40
    const ana = hasAnalogy(text, pack)
    const mech = hasMechanism(text)
    dimensions.push(
      dim('audience', long ? 0.6 : 0.3, long ? '讲得比较完整' : '讲得太短，像在敷衍', long),
      dim('complete', long ? 0.6 : 0.3, long ? '内容量够' : '内容太少', long),
      dim('analogy', ana ? 0.8 : 0.3, ana ? '打了比方' : '没有比方', ana),
      dim('mechanism', mech ? 0.8 : 0.3, mech ? '有因果说明' : '没说为什么', mech),
    )
    return finalize(dimensions, '', text, pack)
  }

  // ① 外行能听懂：不许出现没解释的术语
  const jargon = auditJargon(text, pack)
  const audienceScore = jargon.length === 0 ? 1 : Math.max(0, 1 - jargon.length * 0.5)
  dimensions.push(
    dim(
      'audience',
      audienceScore,
      jargon.length === 0
        ? '全程没用那些没解释的词'
        : `还在用同桌听不懂的词：${jargon.join('、')}`,
      jargon.length === 0,
    ),
  )

  // ② 关键点说全
  const coverage = requiredCoverage(text, pack)
  const hits = matchCheckpoints(text, pack)
  const required = pack.checkpoints.filter((c) => c.required)
  const missingCp = required.filter((c) => !hits.includes(c.id))
  dimensions.push(
    dim(
      'complete',
      coverage,
      missingCp.length === 0
        ? '关键点都说到了'
        : `还没讲到：${missingCp.map((c) => c.label).join('、')}`,
      coverage >= 0.99,
    ),
  )

  // ③ 有生活类比
  const ana = hasAnalogy(text, pack)
  dimensions.push(
    dim(
      'analogy',
      ana ? 1 : 0,
      ana ? '用了生活里的东西打比方' : '没有打比方，还是在讲抽象的话',
      ana,
    ),
  )

  // ④ 讲清机制
  const mech = hasMechanism(text)
  dimensions.push(
    dim(
      'mechanism',
      mech ? 1 : 0.2,
      mech ? '说清了"为什么会这样"' : '只说了"是什么"，没说"为什么"',
      mech,
    ),
  )

  // 卡住的原句：优先找含术语的句子，其次找最短的那句
  const stuckAt = pickStuckSentence(text, jargon)

  return finalize(dimensions, stuckAt, text, pack, round)
}

function dim(
  id: FeynmanDimension['id'],
  score: number,
  evidence: string,
  passed: boolean,
): FeynmanDimension {
  const names: Record<FeynmanDimension['id'], string> = {
    audience: '外行能听懂',
    complete: '关键点说全',
    analogy: '有生活类比',
    mechanism: '说清了为什么',
  }
  return { id, name: names[id], score: Number(score.toFixed(2)), evidence, passed }
}

function finalize(
  dimensions: FeynmanDimension[],
  stuckAt: string,
  text: string,
  pack: ConceptPack | undefined,
  round = 1,
): FeynmanResult {
  const total = Math.round(
    dimensions.reduce((s, d) => s + d.score * WEIGHTS[d.id], 0) * 100,
  )

  // 门槛：第一次讲 70 分，第二次起 80 分（要求逐次更严，但不至于卡死）
  const threshold = round === 1 ? 70 : 80
  const passed = total >= threshold

  const missing = dimensions.filter((d) => !d.passed).map((d) => d.evidence)

  // 下一句追问：针对最弱的一维
  const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0]
  const nextProbe = buildProbe(weakest.id, pack)

  const say = passed
    ? buildPassLine(dimensions)
    : buildStuckLine(weakest, stuckAt)

  return { dimensions, total, passed, stuckAt, missing, nextProbe, say }
}

function buildProbe(id: FeynmanDimension['id'], pack?: ConceptPack): string {
  switch (id) {
    case 'audience':
      return pack?.jargon.length
        ? `等等，你说的"${pack.jargon[0]}"是什么？我没学过这个词。`
        : '等等，你刚才那句话我没听懂，能换成我听得懂的话吗？'
    case 'complete':
      return '那……它到底是怎么起作用的？我还是没听明白。'
    case 'analogy':
      return '你能打个比方吗？比如生活里的什么东西。'
    case 'mechanism':
      return '为什么它会这样？我想知道原因。'
  }
}

function buildStuckLine(weakest: FeynmanDimension, stuckAt: string): string {
  if (stuckAt) {
    return `等一下，你说「${stuckAt}」这里我没听懂。${weakest.score < 0.9 ? weakest.evidence : ''}`
  }
  return `等一下，${weakest.evidence}。你再讲一遍好不好？`
}

function buildPassLine(dimensions: FeynmanDimension[]): string {
  const best = [...dimensions].sort((a, b) => b.score - a.score)[0]
  if (best.id === 'analogy') return '哦——我懂了！你打的这个比方，我一下就明白了。'
  if (best.id === 'mechanism') return '哦——我懂了！原来是因为这个。'
  return '哦——我懂了！你这么一说我就明白了。'
}

/** 挑出最可能卡住的那一句 */
function pickStuckSentence(text: string, jargon: string[]): string {
  const sentences = text
    .split(/[。！？!?；;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (sentences.length === 0) return ''

  if (jargon.length > 0) {
    const hit = sentences.find((s) => jargon.some((j) => s.includes(j)))
    if (hit) return hit.slice(0, 30)
  }
  // 没有术语问题：找最短的一句（通常是跳步的地方）
  const shortest = [...sentences].sort((a, b) => a.length - b.length)[0]
  return shortest.length < 8 ? shortest.slice(0, 30) : ''
}

// ---------------------------------------------------------------- 迭代控制

export type FeynmanLoop = {
  round: number
  /** 历史分数，用来展示"越讲越好" */
  history: number[]
  /** 是否通过 */
  passed: boolean
  /** 是否应该停止（通过，或讲了 3 次仍不通） */
  done: boolean
  /** 给学生的下一步指令 */
  action: 'retry' | 'pass' | 'fallback'
}

/**
 * 费曼回环控制：不通过就退回去重讲，最多 3 轮。
 * 第 3 轮仍不通，不硬逼 —— 退回苏格拉底追问补最弱的那个点，别再挫败他。
 */
export function nextLoopStep(
  round: number,
  total: number,
  passedNow: boolean,
): FeynmanLoop {
  if (passedNow) {
    return { round, history: [], passed: true, done: true, action: 'pass' }
  }
  if (round >= 3) {
    return { round, history: [], passed: false, done: true, action: 'fallback' }
  }
  return { round, history: [], passed: false, done: false, action: 'retry' }
}

/** 把费曼结果压成一句给 UI 的短评 */
export function feynmanSummary(r: FeynmanResult): string {
  const weak = r.dimensions.filter((d) => !d.passed).map((d) => d.name)
  if (r.passed) return `讲清楚了（${r.total} 分）`
  return `还差一点（${r.total} 分）：${weak.join('、') || '表达不完整'}`
}
