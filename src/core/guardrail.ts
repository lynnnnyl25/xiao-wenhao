/**
 * 拒答护栏 Answer-Withholding Guardrail
 * ---------------------------------------------------------------
 * 小问号最核心的承诺：AI 不给答案，只问问题。
 * 这个模块把这句话变成**可以测量的数字**，评委可以自己验证。
 *
 * 五类指标：
 *   答问比     = 疑问句数 ÷ 结论陈述句数     目标 ≥ 3
 *   泄露率     = 判定为泄露答案的轮次 ÷ 总轮次  目标 ≤ 5%
 *   诱导率     = 诱导式提问轮次 ÷ 总轮次       目标 ≤ 10%   ← 最容易犯的隐蔽错误
 *   一问一率   = 只含一个问号的轮次 ÷ 总轮次     目标 ≥ 95%
 *   缺口闭合率 = 已闭合缺口 ÷ 诊断出的缺口总数  目标 ≥ 60%
 *
 * 为什么"诱导率"必须单独算？
 * 把答案藏进问句（"是不是因为……所以……？"）在字面上完全合法：
 * 没有结论句、以问号结尾、答问比很高。但它比直接给答案更糟 ——
 * 学生以为自己在思考，其实只是在点头。
 */

import { auditQuestion } from './socratic.ts'
import type { ConceptPack } from './concepts.ts'

/** 一句话切分成短句 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, ' ')
    .split(/([。！？!?；;]|\.{1,3}(?=\s|$))/g)
    .reduce<string[]>((acc, cur, i, arr) => {
      if (i % 2 === 0) {
        const s = (cur + (arr[i + 1] ?? '')).trim()
        if (s) acc.push(s)
      }
      return acc
    }, [])
    .filter((s) => s.length > 0)
}

const Q_MARKS = /[？?]/
const Q_WORDS =
  /(吗|呢|吧|什么|为什么|怎么|怎样|如何|谁|哪|多少|几个|是不是|会不会|能不能|要不要|有没有|对不对)/

const DECL_PATTERNS = [
  /^(所以|因此|总之|也就是说|这说明|答案是|结果是|因为.{2,}所以)/,
  /(就是(指|是)?|指的是|意思是|叫做|称为|定义为)[^？?]*[。.!！]/,
  /(它的?原理是|它的?作用是|原因是|由于)/,
  /第[一二三四五六七八九十][步，、]/,
  /(首先|然后|接着|最后).{0,20}(再|就|就能)/,
]

const LEAK_PATTERNS = [
  /(答案是|正确答案|结果就是|结果等于|结果是)\s*[^\s？?。]{1,40}/,
  /(就是|等于|等于说)\s*\d+\s*[。!！]/,
  /(它(的)?(定义|概念)是|所谓)/,
  /(变量|循环|算法|二进制|密码|人工智能|AI)\s*是(指|一种|一个)?[^？?]{0,30}[。!！]/,
  /(应该|需要|可以)(这样|这么做|这样做|如此)/,
]

export type SentenceKind = 'question' | 'declaration' | 'neutral'

export function classifySentence(s: string): SentenceKind {
  if (Q_MARKS.test(s) || Q_WORDS.test(s)) return 'question'
  if (DECL_PATTERNS.some((r) => r.test(s))) return 'declaration'
  return 'neutral'
}

export type GuardVerdict = {
  questions: number
  declarations: number
  neutrals: number
  qaRatio: number
  /** 是否判定为"泄露答案" */
  leak: boolean
  leakHits: string[]
  /** 是否以问号结尾 */
  endsWithQuestion: boolean
  /** 是否诱导式提问（答案藏在问句里） */
  leading: boolean
  /** 是否一问多题 */
  multiQuestion: boolean
  /** 通过（综合） */
  passed: boolean
  label: string
}

/**
 * 判定一轮 AI 输出是否守住了"只问不给"的承诺。
 *
 * phase 决定"是否必须以问句收尾"：
 *   socratic 追问阶段必须以问号收尾
 *   feynman  AI 扮演同桌，允许说"我懂了"；done 是退场语
 */
export function auditAiTurn(
  text: string,
  phase: 'socratic' | 'feynman' | 'done' = 'socratic',
  opts: { pack?: ConceptPack; studentHits?: string[]; lastQuestion?: string } = {},
): GuardVerdict {
  const sentences = splitSentences(text)
  const kinds = sentences.map(classifySentence)

  const questions = kinds.filter((k) => k === 'question').length
  const declarations = kinds.filter((k) => k === 'declaration').length
  const neutrals = kinds.filter((k) => k === 'neutral').length

  const leakHits: string[] = []
  for (const [i, s] of sentences.entries()) {
    for (const p of LEAK_PATTERNS) {
      if (p.test(s)) {
        leakHits.push(`第${i + 1}句：${s.slice(0, 28)}`)
        break
      }
    }
  }

  const trimmed = text.trim()
  const endsWithQuestion = /[？?]$/.test(trimmed) || /[？?][」"'）)]?$/.test(trimmed)

  // 诱导 / 多问检测（只在苏格拉底阶段有意义）
  const qa =
    phase === 'socratic'
      ? auditQuestion(text, opts.pack, {
          lastQuestion: opts.lastQuestion,
          hits: opts.studentHits,
        })
      : { leading: false, multiQuestion: false, questionCount: questions }

  const tooManyDeclarations = declarations > 0 && declarations >= questions
  const leak = leakHits.length > 0 || tooManyDeclarations

  const qaRatio = declarations === 0 ? Math.max(questions, 1) * 10 : questions / declarations

  const mustEndWithQuestion = phase === 'socratic'
  const passed =
    !leak && !qa.leading && (mustEndWithQuestion ? endsWithQuestion : true)

  let label = '只问问题 ✓'
  if (leak) label = '疑似直接给了答案 ✗'
  else if (qa.leading) label = '诱导式提问：答案在问句里 ✗'
  else if (mustEndWithQuestion && !endsWithQuestion) label = '没有以问题收尾 ✗'
  else if (phase === 'feynman') label = '同桌回应 ✓'
  else if (phase === 'done') label = '完成 ✓'

  return {
    questions,
    declarations,
    neutrals,
    qaRatio: Number(qaRatio.toFixed(2)),
    leak,
    leakHits,
    endsWithQuestion,
    leading: qa.leading,
    multiQuestion: qa.multiQuestion,
    passed,
    label,
  }
}

/** 汇总多轮，输出申报书要用的数字 */
export function summarize(turns: GuardVerdict[], gapTotal: number, gapClosed: number) {
  const n = turns.length || 1
  const leakCount = turns.filter((t) => t.leak).length
  const leadingCount = turns.filter((t) => t.leading).length
  const singleQ = turns.filter((t) => !t.multiQuestion).length
  const totalQ = turns.reduce((s, t) => s + t.questions, 0)
  const totalD = turns.reduce((s, t) => s + t.declarations, 0)

  return {
    turns: turns.length,
    qaRatio: Number((totalD === 0 ? totalQ * 10 : totalQ / totalD).toFixed(2)),
    leakRate: Number(((leakCount / n) * 100).toFixed(1)),
    leadingRate: Number(((leadingCount / n) * 100).toFixed(1)),
    singleQuestionRate: Number(((singleQ / n) * 100).toFixed(1)),
    closureRate: Number(((gapTotal === 0 ? 0 : gapClosed / gapTotal) * 100).toFixed(1)),
    passRate: Number(((turns.filter((t) => t.passed).length / n) * 100).toFixed(1)),
    verdict:
      leakCount === 0 && leadingCount === 0
        ? '本场没有泄露答案，也没有诱导式提问'
        : `本场 ${leakCount} 轮泄露、${leadingCount} 轮诱导`,
  }
}
