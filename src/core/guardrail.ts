/**
 * 拒答护栏 Answer-Withholding Guardrail
 * ---------------------------------------------------------------
 * 小问号最核心的承诺：AI 不给答案，只问问题。
 * 这个模块把这句话变成**可以测量的数字**，评委可以自己验证。
 *
 * 三项指标：
 *   Q/A 比     = 疑问句数 ÷ 结论陈述句数     目标 ≥ 3
 *   泄露率     = 判定为泄露答案的轮次 ÷ 总轮次  目标 ≤ 5%
 *   缺口闭合率 = 已闭合缺口 ÷ 诊断出的缺口总数  目标 ≥ 60%
 */

/** 一句话切分成短句（中文按句末标点，英文按 .!?） */
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

/** 疑问信号：问号、疑问词、反问语气 */
const Q_MARKS = /[？?]/
const Q_WORDS =
  /(吗|呢|吧|什么|为什么|怎么|怎样|如何|谁|哪|多少|几个|是不是|会不会|能不能|要不要|有没有|对不对)/

/** 陈述结论信号：给出定义/结果/步骤的句式 */
const DECL_PATTERNS = [
  /^(所以|因此|总之|也就是说|这说明|答案是|结果是|因为.{2,}所以)/,
  /(就是(指|是)?|指的是|意思是|叫做|称为|定义为)[^？?]*[。.!！]/,
  /(它的?原理是|它的?作用是|原因是|由于)/,
  /第[一二三四五六七八九十][步，、]/,
  /(首先|然后|接着|最后).{0,20}(再|就|就能)/,
]

/** 更重的泄露信号：直接把答案端出来 */
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
  /** 问句数 */
  questions: number
  /** 结论陈述句数 */
  declarations: number
  /** 中性句数（鼓励、过渡等） */
  neutrals: number
  /** 答问比；无量纲。没有结论句时记为一个大值（表示极好） */
  qaRatio: number
  /** 是否判定为"泄露答案" */
  leak: boolean
  /** 命中的泄露模式（用于展示与自检） */
  leakHits: string[]
  /** 是否以问号结尾 */
  endsWithQuestion: boolean
  /** 综合判定：这轮 AI 有没有乖乖只问问题 */
  passed: boolean
  /** 给用户的短评 */
  label: string
}

/**
 * 判定一轮 AI 输出是否守住了"只问不给"的承诺。
 * 判定顺序：先看硬泄露 → 再看是否以问句收尾 → 最后看问句占比。
 *
 * phase 决定"是否必须以问句收尾"：
 *   socratic 追问阶段必须以问号收尾（这是核心承诺）
 *   feynman  AI 扮演同桌，允许说"我懂了"；done 是退场语，同理
 */
export function auditAiTurn(
  text: string,
  phase: 'socratic' | 'feynman' | 'done' = 'socratic',
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

  // 结论句太多 = 在讲答案
  const tooManyDeclarations = declarations > 0 && declarations >= questions
  const leak = leakHits.length > 0 || tooManyDeclarations

  const qaRatio = declarations === 0 ? Math.max(questions, 1) * 10 : questions / declarations

  const mustEndWithQuestion = phase === 'socratic'
  const passed = !leak && (mustEndWithQuestion ? endsWithQuestion : true)

  let label = '只问问题 ✓'
  if (leak) label = '疑似直接给了答案 ✗'
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
    passed,
    label,
  }
}

/** 汇总多轮，输出申报书要用的三个数字 */
export function summarize(turns: GuardVerdict[], gapTotal: number, gapClosed: number) {
  const n = turns.length || 1
  const leakCount = turns.filter((t) => t.leak).length
  const totalQ = turns.reduce((s, t) => s + t.questions, 0)
  const totalD = turns.reduce((s, t) => s + t.declarations, 0)

  return {
    turns: turns.length,
    qaRatio: Number((totalD === 0 ? totalQ * 10 : totalQ / totalD).toFixed(2)),
    leakRate: Number(((leakCount / n) * 100).toFixed(1)),
    closureRate: Number(((gapTotal === 0 ? 0 : gapClosed / gapTotal) * 100).toFixed(1)),
    passRate: Number(((turns.filter((t) => t.passed).length / n) * 100).toFixed(1)),
    verdict:
      leakCount === 0 ? '本场未泄露答案' : `本场 ${leakCount} 轮疑似泄露`,
  }
}
