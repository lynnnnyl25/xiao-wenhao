# -*- coding: utf-8 -*-
"""
修费曼评分的两个判定缺陷：

1) 术语审计误伤
   "变量就是……"里的"变量"是概念名本身，给同桌讲解时提到它是正常的。
   应该只在**用术语解释术语**时才算 jargon（如"变量就是存储单元"）。
   做法：如果术语只出现在句首的"概念名 is ..."位置，不算。

2) 关键词匹配过严
   "旧的就没了" 与关键词 "旧的没" 对不上（多了个"就"）。
   做法：去掉停用字（的/就/会/了/是/也/都/很）后再匹配。
"""
import pathlib

# ---------- 1. concepts.ts：关键词匹配去停用字 ----------
pc = pathlib.Path("src/core/concepts.ts")
tc = pc.read_text(encoding="utf-8")

old_norm = """function norm(s: string): string {
  return s.replace(/\\s+/g, '').toLowerCase()
}"""

new_norm = """function norm(s: string): string {
  return s.replace(/\\s+/g, '').toLowerCase()
}

/**
 * 宽松归一化：去掉中文虚词，避免"旧的就没了"匹配不上"旧的没"。
 * 只用于关键词比对，不影响语义判断。
 */
function loose(s: string): string {
  return norm(s).replace(/[的了就是会也都还很太呢吗吧啊呀嘛]/g, '')
}"""

assert old_norm in tc
tc = tc.replace(old_norm, new_norm)

# 所有关键词匹配改用 loose
tc = tc.replace(
    """export function matchCheckpoints(text: string, pack: ConceptPack): string[] {
  const t = norm(text)
  return pack.checkpoints
    .filter((c) => c.keywords.some((k) => t.includes(norm(k))))
    .map((c) => c.id)
}""",
    """export function matchCheckpoints(text: string, pack: ConceptPack): string[] {
  const t = loose(text)
  return pack.checkpoints
    .filter((c) => c.keywords.some((k) => t.includes(loose(k))))
    .map((c) => c.id)
}""",
)

tc = tc.replace(
    """export function detectMisconception(text: string, pack: ConceptPack): Misconception | null {
  const t = norm(text)
  return pack.misconceptions.find((m) => m.detect.some((d) => t.includes(norm(d)))) ?? null
}""",
    """export function detectMisconception(text: string, pack: ConceptPack): Misconception | null {
  const t = loose(text)
  return pack.misconceptions.find((m) => m.detect.some((d) => t.includes(loose(d)))) ?? null
}""",
)

tc = tc.replace(
    """export function auditJargon(text: string, pack: ConceptPack): string[] {
  const t = norm(text)
  return pack.jargon.filter((j) => t.includes(norm(j)))
}""",
    """export function auditJargon(text: string, pack: ConceptPack): string[] {
  const t = norm(text)
  return pack.jargon.filter((j) => {
    const k = norm(j)
    if (!t.includes(k)) return false

    // 概念名出现在"这个概念本身作为主语/引子"的位置，是正常的，
    // 例如"变量就是……""我说的变量是……"。只有用它去解释**别的东西**时才是术语依赖。
    const idx = t.indexOf(k)
    const after = t.slice(idx + k.length, idx + k.length + 12)
    const isSubject = /^(就是|是一个|是一种|指的是|的意思|这个词|这个东西)/.test(after)
    if (isSubject) return false

    return true
  })
}""",
)

pc.write_text(tc, encoding="utf-8")
print("patched concepts.ts")

# ---------- 2. feynman.ts：概念名不计入 jargon ----------
pf = pathlib.Path("src/core/feynman.ts")
tf = pf.read_text(encoding="utf-8")

# 已有 auditJargon，逻辑已在 concepts 里改过，这里无需再动
print("feynman.ts unchanged (jargon rule lives in concepts.ts)")

# ---------- 3. demo.ts：修掉一问多题 ----------
pd = pathlib.Path("src/core/demo.ts")
td = pd.read_text(encoding="utf-8")

Q_FIXES = [
    (
        "你玩过那种带格子的收纳盒吗？如果我把一个苹果放进去，下次要吃的时候怎么办？",
        "你玩过那种带格子的收纳盒吗？",
    ),
    (
        "你说到\"内存\"这个词。这个词是什么意思呀？",
        "你说到\"内存\"。这个词是什么意思呀？",
    ),
    (
        "那我再问一个：如果两个盒子上写一样的名字，会出什么问题？",
        "如果两个盒子上写一样的名字，会出什么问题？",
    ),
    (
        "好，那我们先试试：如果有两个盒子，一个叫 a、一个叫 b，我把 5 放进 a 里。你怎么知道 a 里放的是 5？",
        "我把 5 放进叫 a 的盒子里。你怎么知道 a 里放的是 5？",
    ),
    (
        "有意思。那我们再试一次：盒子里先放着 5，我现在把 3 放进去。你觉得盒子里会变成什么样？",
        "盒子里先放着 5，我现在把 3 放进去。你觉得盒子里会变成什么样？",
    ),
    (
        "对！那如果电脑里有好多好多这样的小开关，你怎么用它们来记数字？",
        "那如果电脑里有好多好多这样的小开关，你怎么用它们来记数字？",
    ),
    (
        "那 AI 看了几万张猫的照片之后，它到底在做什么？",
        "AI 看了几万张猫的照片之后，它在做什么？",
    ),
    (
        "那如果本子堆成一大摞，发着发着，你怎么知道自己发到哪了？",
        "本子堆成一大摞，发着发着，你怎么知道自己发到哪了？",
    ),
    (
        "你说到\"内存\"。这个词是什么意思呀？",
        "你说的\"内存\"，是什么意思呀？",
    ),
    (
        "那你的生日，你同桌知道吗？",
        "你的生日，你同桌知道吗？",
    ),
]

n = 0
for old, new in Q_FIXES:
    if old in td:
        td = td.replace(old, new)
        n += 1
pd.write_text(td, encoding="utf-8")
print(f"demo.ts: fixed {n} multi-question lines")
