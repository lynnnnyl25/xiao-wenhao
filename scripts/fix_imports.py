# -*- coding: utf-8 -*-
"""给相对 import 补 .ts 扩展名（纯字符串替换，不用正则替换回调）"""
import pathlib

FIXES = {
    "socratic.ts": [("} from './concepts'", "} from './concepts.ts'")],
    "feynman.ts": [("} from './concepts'", "} from './concepts.ts'")],
    "guardrail.ts": [
        ("import type { ConceptPack } from './concepts'",
         "import type { ConceptPack } from './concepts.ts'"),
    ],
}

for name, pairs in FIXES.items():
    p = pathlib.Path("src/core") / name
    t = p.read_text(encoding="utf-8")
    changed = 0
    for old, new in pairs:
        if old in t:
            t = t.replace(old, new)
            changed += 1
    p.write_text(t, encoding="utf-8")
    print(f"{name}: {changed} import(s) fixed")

print("\n--- all relative imports now ---")
import re
for p in sorted(pathlib.Path("src/core").glob("*.ts")):
    for m in re.finditer(r"from\s+'(\./[^']*)'", p.read_text(encoding="utf-8")):
        print(f"  {p.name}: {m.group(1)}")
