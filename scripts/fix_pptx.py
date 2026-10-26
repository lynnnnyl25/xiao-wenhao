# -*- coding: utf-8 -*-
# 把 PPT 指标页从 3 项改为 5 项
import pathlib

p = pathlib.Path("scripts/make_pptx.py")
t = p.read_text(encoding="utf-8")

old = """metrics = [
    ('答问比 Q/A', '疑问句 ÷ 结论句', '≥ 3', '60 – 100', BLUE),
    ('泄露率', '给答案的轮次占比', '≤ 5%', '0%', GREEN),
    ('缺口闭合率', '已闭合 ÷ 诊断出', '≥ 60%', '100%', PRIMARY),
]
for i, (name, defi, target, real, c) in enumerate(metrics):
    x = 0.8 + i * 3.95
    rect(s, x, 2.5, 3.7, 2.3, fill=WHITE, line=c)
    text(s, x + 0.25, 2.72, 3.2, 0.5, [(name, 18, True, c)])
    text(s, x + 0.25, 3.28, 3.2, 0.4, [(defi, 12, False, MUTE)])
    text(s, x + 0.25, 3.72, 3.2, 0.7, [('实测', 12, False, MUTE), (real, 30, True, c)], spacing=2)
    text(s, x + 0.25, 4.25, 3.2, 0.4, [(f'目标 {target}', 12, False, MUTE)])"""

new = """metrics = [
    ('答问比', '疑问句 ÷ 结论句', '≥ 3', '60-90', BLUE),
    ('泄露率', '给答案的轮次', '≤ 5%', '0%', GREEN),
    ('诱导率', '答案藏进问句', '≤ 10%', '0%', RGBColor(0xF7, 0x6E, 0x8E)),
    ('一问一题', '只含一个问号', '≥ 95%', '100%', PRIMARY),
    ('闭合率', '已闭合 ÷ 诊断出', '≥ 60%', '100%', PURPLE),
]
for i, (name, defi, target, real, c) in enumerate(metrics):
    x = 0.8 + (i % 3) * 3.95
    y = 2.55 + (i // 3) * 1.85
    rect(s, x, y, 3.7, 1.65, fill=WHITE, line=c)
    text(s, x + 0.22, y + 0.14, 3.2, 0.42, [(name, 16, True, c)])
    text(s, x + 0.22, y + 0.56, 3.2, 0.32, [(defi, 11, False, MUTE)])
    text(s, x + 0.22, y + 0.88, 1.9, 0.5, [(real, 25, True, c)])
    text(s, x + 1.95, y + 1.02, 1.55, 0.32, [(f'目标 {target}', 10, False, MUTE)])"""

assert old in t, "metrics block NOT found"
t = t.replace(old, new)

# 绿色条下移，文字更新
t = t.replace(
    "rect(s, 0.8, 5.15, 11.7, 1.0, fill=RGBColor(0xDE, 0xF7, 0xEC), line=GREEN)",
    "rect(s, 0.8, 6.35, 11.7, 0.72, fill=RGBColor(0xDE, 0xF7, 0xEC), line=GREEN)",
)
t = t.replace(
    "    ('护栏通过率 39 / 39 = 100%（5 段回放脚本 · 共 39 轮）', 17, True, RGBColor(0x2F, 0x9E, 0x75)),",
    "    ('护栏通过率 39 / 39 = 100%（5 段脚本 · 共 39 轮）', 14, True, RGBColor(0x2F, 0x9E, 0x75)),",
)
t = t.replace(
    "text(s, 1.1, 5.35, 11.1, 0.7, [",
    "text(s, 1.05, 6.5, 11.2, 0.42, [",
)
t = t.replace(
    "text(s, 1.1, 5.78, 11.1, 0.4,",
    "text(s, 0.8, 7.08, 11.7, 0.3,",
)
t = t.replace(
    "     [('数据来源：pnpm selfcheck，结果可复现；评委可在使用时随时查看，无需信任开发者自述。', 11, False, MUTE)])",
    "     [('数据来源 pnpm selfcheck，结果可复现', 9, False, MUTE)])",
)
# 删掉底部那行
t = t.replace(
    """text(s, 0.8, 6.45, 11.7, 0.5,
     [('线上链接经浏览器实测：7 项全通过，零控制台错误。', 13, False, MUTE)])""",
    "",
)
# 顶部说明改
t = t.replace(
    """text(s, 0.8, 1.8, 11.7, 0.5,
     [('"AI 不给答案"很容易承诺，很难证明。小问号把它变成三个可当场验证的数字。', 16, False, MUTE)])""",
    """text(s, 0.8, 1.76, 11.7, 0.42,
     [('"不给答案"很容易承诺，很难证明。小问号把它变成五个可当场验证的数字。', 14, False, MUTE)])
text(s, 0.8, 2.14, 11.7, 0.35,
     [('诱导率隐蔽性最高：答案藏进问句，字面合法，学生却只在点头。', 10.5, False,
       RGBColor(0xF7, 0x6E, 0x8E))])""",
)

p.write_text(t, encoding="utf-8")
print("patched OK")
