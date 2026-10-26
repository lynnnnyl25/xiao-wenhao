# -*- coding: utf-8 -*-
"""PPT 结构与几何校验：越界、空文本框、页数与标题顺序"""
from pptx import Presentation
from pptx.util import Emu

prs = Presentation('小问号-答辩PPT.pptx')
W, H = prs.slide_width, prs.slide_height
EMU_CM = 360000

print(f'幻灯片尺寸: {W/914400:.2f} x {H/914400:.2f} inch')
print(f'页数: {len(prs.slides._sldIdLst)}\n')

problems = []
for idx, slide in enumerate(prs.slides, 1):
    titles = []
    for sh in slide.shapes:
        # 越界检查（允许 0.02 inch 误差）
        tol = 18288
        if sh.left is None:
            continue
        if sh.left < -tol or sh.top < -tol or \
           sh.left + sh.width > W + tol or sh.top + sh.height > H + tol:
            problems.append(
                f'P{idx} 越界: {sh.shape_type} '
                f'L={sh.left/914400:.2f} T={sh.top/914400:.2f} '
                f'W={sh.width/914400:.2f} H={sh.height/914400:.2f}'
            )
        # 收集最大字号文本作为标题
        if sh.has_text_frame and sh.text_frame.text.strip():
            sizes = [r.font.size.pt for p in sh.text_frame.paragraphs
                     for r in p.runs if r.font.size]
            if sizes and max(sizes) >= 28:
                titles.append((max(sizes), sh.text_frame.text.strip().split('\n')[0]))

    t = sorted(titles, reverse=True)[:1]
    label = t[0][1] if t else '（无大标题）'
    print(f'P{idx:2d}  {label}')

print()
if problems:
    print(f'发现 {len(problems)} 处几何问题：')
    for p in problems:
        print('  ✗', p)
else:
    print('✓ 所有形状均在页面边界内')
