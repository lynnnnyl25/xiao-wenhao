# -*- coding: utf-8 -*-
"""修掉剩余的"一问多题"，并修正费曼术语误判"""
import pathlib

# ---------- 1. demo.ts 剩余多问句 ----------
p = pathlib.Path("src/core/demo.ts")
t = p.read_text(encoding="utf-8")

FIXES = [
    ("如果一次一份，一共要发多少遍？这样做累不累？",
     "如果一次一份，一共要发多少遍？"),
    ('你见过手机拍照能认出"这是猫"吗？你觉得它是怎么认出来的？',
     '你见过手机拍照能认出"这是猫"吗？'),
    ('你说"看到"。那手机有眼睛吗？如果没有眼睛，它拿到的是什么？',
     '你说"看到"。那手机有眼睛吗？'),
    ("那我再考考你：如果一只猫躲在黑屋子里，照片很暗，AI 还能认出来吗？为什么？",
     "如果一只猫躲在黑屋子里、照片很暗，AI 还能认出来吗？"),
]

n = 0
for old, new in FIXES:
    if old in t:
        t = t.replace(old, new)
        n += 1
    else:
        print(f"  MISS: {old[:40]}")
p.write_text(t, encoding="utf-8")
print(f"demo.ts: fixed {n}/{len(FIXES)}")

# ---------- 2. concepts.ts 术语判定：更稳的"主语位"判断 ----------
pc = pathlib.Path("src/core/concepts.ts")
tc = pc.read_text(encoding="utf-8")

old = """    // 概念名出现在"这个概念本身作为主语/引子"的位置，是正常的，
    // 例如"变量就是……""我说的变量是……"。只有用它去解释**别的东西**时才是术语依赖。
    const idx = t.indexOf(k)
    const after = t.slice(idx + k.length, idx + k.length + 12)
    const isSubject = /^(就是|是一个|是一种|指的是|的意思|这个词|这个东西)/.test(after)
    if (isSubject) return false

    return true"""

new = """    // 概念名作为"被解释的对象"出现时是正常的：
    //   「变量就是……」「变量像一个盒子」「我说的变量是……」
    // 只有拿它去解释**别的东西**（如「用内存来存」）才是术语依赖。
    const idx = t.indexOf(k)
    const after = t.slice(idx + k.length, idx + k.length + 14)
    const before = t.slice(Math.max(0, idx - 6), idx)

    // 出现在句首、或紧跟在判断词前 → 它是主语，不是术语依赖
    const atStart = idx <= 2
    const followedByJudge = /^(就是|是一个|是一种|指的是|的意思|这个词|这个东西|像|好比|可以|能|会|=|：|:)/.test(after)
    const introduced = /(说的|所谓的|叫做|称为)$/.test(before)

    if (atStart || followedByJudge || introduced) return false

    return true"""

assert old in tc, "jargon block not found"
tc = tc.replace(old, new)
pc.write_text(tc, encoding="utf-8")
print("concepts.ts: jargon 主语位判定已放宽")
