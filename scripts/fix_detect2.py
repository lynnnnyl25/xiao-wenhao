# -*- coding: utf-8 -*-
"""
修正诱导检测的核心逻辑。

问题：拿"要点关键词"去匹配问句太粗糙。
  要点「熟人知道的信息会让密码变弱」的关键词是"生日/同学知道"，
  但"你的生日，你同桌知道吗？"只是在**引出**这个话题，并没有说出"所以变弱"这个结论。

正确做法：检查问句是否说出了**要点本身所表达的判断**，而不是它的名词。
所以给每个要点补一个"结论模式"（answerShape）：
  只有问句里出现了"把 A 和 B 连起来"的判断句，才算泄露。

简化实现：命中名词不算，必须命中"关系词"才算。
"""
import pathlib

p = pathlib.Path("src/core/socratic.ts")
t = p.read_text(encoding="utf-8")

old = """      // ① 问句里出现了学生还没说到的必答理解点 → 把答案说出来了
      for (const cp of pack.checkpoints) {
        if (!cp.required) continue
        if (studentHits.has(cp.id)) continue
        if (cp.keywords.some((k) => keywordHits(qn, k))) {
          leakedCheckpoints.push(cp.id)
          leadingEvidence.push(`问句含未说出的要点「${cp.label}」`)
        }
      }"""

new = """      // ① 问句里是否**说出了**学生还没说到的那个判断
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
      }"""

assert old in t, "block not found"
t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("patched: 诱导检测改为要求命中判断关系")
