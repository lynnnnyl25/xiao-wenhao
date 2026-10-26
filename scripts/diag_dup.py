# -*- coding: utf-8 -*-
"""诊断 core 文件的重复结构"""
import pathlib

for name in ["concepts", "socratic", "demo", "guardrail", "feynman"]:
    p = pathlib.Path("src/core") / f"{name}.ts"
    text = p.read_text(encoding="utf-8")
    lines = text.splitlines()
    print(f"\n===== {name}.ts : {len(lines)} lines =====")

    # 找所有顶层声明的位置，判断是否重复
    marks = []
    for i, l in enumerate(lines, 1):
        s = l.strip()
        if s.startswith("export type ") or s.startswith("export const ") or s.startswith("export function "):
            marks.append((i, s[:60]))

    prev = None
    dup = 0
    for i, s in marks:
        if prev and s == prev[1]:
            dup += 1
            print(f"  DUP at line {i}: {s}")
        prev = (i, s)
    if dup == 0:
        print(f"  no duplicate top-level declarations ({len(marks)} decls)")
