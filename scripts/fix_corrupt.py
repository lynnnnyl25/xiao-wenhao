# -*- coding: utf-8 -*-
"""
修复：core 文件被完整复制成两份（第二份截断，残留 PowerShell 片段）。
做法：只保留第一份（到垃圾行之前），并丢弃垃圾行及之后的所有内容。
"""
import pathlib
import re

JUNK_PATTERNS = [
    re.compile(r'^\s*\)\s*\{\s*return\s+"\$pre\$path\$post"\s*\}\s*$'),
    re.compile(r'^\s*return\s+"\$pre\$path\.ts\$post"\s*$'),
    re.compile(r'^\s*param\(\$m\)\s*$'),
    re.compile(r'^\s*\$pre=\$m\.Groups'),
    re.compile(r"^\s*if \(\$path -match"),
]

files = ["concepts", "socratic", "feynman", "guardrail", "demo"]

for name in files:
    p = pathlib.Path("src/core") / f"{name}.ts"
    lines = p.read_text(encoding="utf-8").splitlines(keepends=True)

    # 找第一个垃圾行
    cut = None
    for i, l in enumerate(lines):
        if any(pat.match(l) for pat in JUNK_PATTERNS):
            cut = i
            break

    if cut is None:
        print(f"{name}.ts: no junk found")
        continue

    # 垃圾行之前若还有 "(" 或 "{" 未闭合的残句，也一并砍掉
    kept = lines[:cut]
    # 去掉尾部空行
    while kept and kept[-1].strip() == "":
        kept.pop()

    text = "".join(kept)
    # 确保以换行结尾
    if not text.endswith("\n"):
        text += "\n"

    p.write_text(text, encoding="utf-8")
    print(f"{name}.ts: cut at line {cut + 1}, kept {len(kept)} lines")

print("\n--- verify ---")
for name in files:
    p = pathlib.Path("src/core") / f"{name}.ts"
    t = p.read_text(encoding="utf-8")
    dirty = "param($m)" in t or "Groups[1]" in t or "$pre$path" in t
    print(f"  {name}.ts: {len(t.splitlines())} lines, {'DIRTY' if dirty else 'clean'}")
