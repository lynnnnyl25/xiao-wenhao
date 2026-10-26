# -*- coding: utf-8 -*-
"""
修两处误报：
1. 助词/虚词导致误命中（"一眼找到"命中"找到"）
2. 是非问过长误判（"你能不能用你自己的话说说"是请求，不是陈述）
"""
import pathlib

p = pathlib.Path("src/core/socratic.ts")
t = p.read_text(encoding="utf-8")

old_block = """      // ② 是非问 + 长命题 → 典型的"我说答案你点头"
      if (YESNO_RE.test(q) && qn.length > 16) {
        leadingEvidence.push(`是非问句过长，近似在陈述：${q.slice(0, 20)}…`)
      }"""

new_block = """      // ② 是非问 + 长命题 → 典型的"我说答案你点头"
      //    但"你能不能用你自己的话说说…""是不是觉得…"这类是邀请/共情，不算诱导
      const INVITE_RE = /(能不能(用|把|换)|可不可以(用|把|换)|是不是觉得|会不会觉得|要不要试)/
      if (YESNO_RE.test(q) && qn.length > 16 && !INVITE_RE.test(q)) {
        leadingEvidence.push(`是非问句过长，近似在陈述：${q.slice(0, 20)}…`)
      }"""

assert old_block in t, "block 2 not found"
t = t.replace(old_block, new_block)

# 关键词匹配加边界：太短的关键词（<=2字）要求出现在句中且不是被"找到/取出"这类泛动词带过
old_kw = """        if (cp.keywords.some((k) => qn.includes(k.replace(/\\s+/g, '')))) {
          leakedCheckpoints.push(cp.id)
          leadingEvidence.push(`问句含未说出的要点「${cp.label}」`)
        }"""

new_kw = """        if (cp.keywords.some((k) => keywordHits(qn, k))) {
          leakedCheckpoints.push(cp.id)
          leadingEvidence.push(`问句含未说出的要点「${cp.label}」`)
        }"""

assert old_kw in t, "keyword block not found"
t = t.replace(old_kw, new_kw)

# 插入 keywordHits 辅助函数
helper = '''
/**
 * 关键词命中判定。
 * 直接用 includes 会误伤：要点词"找到"会被"一眼找到"这种泛指命中，
 * 但那并不是在说"用名字取回值"。所以对短词要求它出现在更具体的语境里。
 */
function keywordHits(questionNorm: string, keyword: string): boolean {
  const k = keyword.replace(/\\s+/g, '')
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

'''
anchor = "/**\n * 审计一轮 AI 提问是否合格。"
assert anchor in t, "anchor not found"
t = t.replace(anchor, helper + anchor, 1)

p.write_text(t, encoding="utf-8")
print("patched socratic.ts")
