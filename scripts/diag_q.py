# -*- coding: utf-8 -*-
"""定位 AI 脚本里仍多问句的步骤，以及费曼术语误判原因"""
import pathlib, re, importlib.util, sys

# 直接读 demo.ts 文本，找含多个问号的行
p = pathlib.Path("src/core/demo.ts")
t = p.read_text(encoding="utf-8")

print("=== 含多个问号的行 ===")
for i, line in enumerate(t.splitlines(), 1):
    if line.strip().startswith("ai:"):
        q = line.count("？") + line.count("?")
        if q > 1:
            print(f"  L{i} ({q}个问号): {line.strip()[:110]}")
