# -*- coding: utf-8 -*-
"""生成《小问号》答辩 PPT"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

INK = RGBColor(0x2E, 0x2A, 0x27)
PRIMARY = RGBColor(0xFF, 0x8A, 0x5B)
BLUE = RGBColor(0x4E, 0xA8, 0xDE)
GREEN = RGBColor(0x57, 0xCC, 0x99)
PURPLE = RGBColor(0x9B, 0x72, 0xCF)
MUTE = RGBColor(0x8A, 0x81, 0x7C)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BG = RGBColor(0xFF, 0xF9, 0xF0)
LINE = RGBColor(0xEF, 0xE6, 0xDC)

FONT = '微软雅黑'

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
W = 13.333
H = 7.5

BLANK = prs.slide_layouts[6]


def rect(slide, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(1)
    s.shadow.inherit = False
    return s


def text(slide, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=None):
    """runs: list of (text, size, bold, color) 或 (text, size, bold, color, space_before)"""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    first = True
    for r in runs:
        txt, size, bold, color = r[0], r[1], r[2], r[3]
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = align
        if spacing:
            p.space_after = Pt(spacing)
        if len(r) > 4 and r[4]:
            p.space_before = Pt(r[4])
        run = p.add_run()
        run.text = txt
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        run.font.name = FONT
        # 中文字体需要显式写 a:ea，仅设 latin 在部分环境下中文会回退
        rPr = run._r.get_or_add_rPr()
        ea = rPr.find(qn('a:ea'))
        if ea is None:
            ea = rPr.makeelement(qn('a:ea'), {})
            rPr.append(ea)
        ea.set('typeface', FONT)
    return tb


def slide_bg(slide, color=BG):
    rect(slide, 0, 0, W, H, fill=color)


# ============================================================ 1 封面
s = prs.slides.add_slide(BLANK)
slide_bg(s, PRIMARY)

text(s, 1.0, 1.5, 11, 1.2, [('❓  小问号', 54, True, WHITE)], align=PP_ALIGN.LEFT)
text(s, 1.0, 2.75, 11, 1.0,
     [('苏格拉底 × 费曼 主动学习智能体', 30, True, WHITE)])
text(s, 1.0, 3.75, 11, 0.8,
     [('让 AI 从「替学生回答」转向「引导学生学会思考」', 18, False, RGBColor(0xFF, 0xE3, 0xD3))])

rect(s, 1.0, 4.7, 3.6, 0.06, fill=WHITE)

text(s, 1.0, 5.1, 11, 1.6, [
    ('小学 3-6 年级 · 信息科技', 15, False, RGBColor(0xFF, 0xE3, 0xD3)),
    ('技术底座：DeepSeek', 15, False, RGBColor(0xFF, 0xE3, 0xD3)),
    ('在线体验：lynnnnyl25.github.io/xiao-wenhao', 15, True, WHITE),
], spacing=6)

# ============================================================ 2 问题
s = prs.slides.add_slide(BLANK)
slide_bg(s)
text(s, 0.8, 0.55, 12, 0.8, [('一、AI 越会答，学生越学不到', 32, True, INK)])
rect(s, 0.8, 1.5, 11.7, 0.05, fill=LINE)

text(s, 0.8, 1.85, 5.6, 0.6, [('传统 AI 助教', 20, True, MUTE)])
for i, t in enumerate([
    '学生问 → AI 答',
    '输出一段完美解释',
    '学生被动接收',
    '看不出哪里没懂',
]):
    y = 2.55 + i * 0.95
    rect(s, 0.8, y, 5.6, 0.8, fill=WHITE, line=LINE)
    text(s, 1.1, y + 0.22, 5.0, 0.6, [(t, 17, False, MUTE)])

text(s, 6.9, 1.85, 5.6, 0.6, [('小问号', 20, True, PRIMARY)])
for i, t in enumerate([
    '学生答 → AI 问',
    '一次只问一个问题',
    '学生主动建构',
    '每一次"说不清"都被记下来',
]):
    y = 2.55 + i * 0.95
    rect(s, 6.9, y, 5.6, 0.8, fill=WHITE, line=PRIMARY)
    text(s, 7.2, y + 0.22, 5.0, 0.6, [(t, 17, False, INK)])

text(s, 0.8, 6.4, 11.7, 0.8,
     [('学生读完点头，觉得自己懂了 —— 换一道题还是不会。这叫「假性掌握」。', 17, True, PRIMARY)])

# ============================================================ 3 G-Loop
s = prs.slides.add_slide(BLANK)
slide_bg(s)
text(s, 0.8, 0.55, 12, 0.8, [('二、G-Loop 引导闭环', 32, True, INK)])
rect(s, 0.8, 1.5, 11.7, 0.05, fill=LINE)

text(s, 0.8, 1.75, 11.7, 0.6,
     [('它不管理「对话」，而是管理「缺口」—— 每一轮的目标不是把话接下去，而是把下一个缺口逼出来。', 16, False, MUTE)])

# 流程环
nodes = [
    (1.0, 2.9, '① 苏格拉底追问', '按 6 层阶梯，一次一问', PRIMARY),
    (4.6, 2.9, '② 学生回答', '说出他的理解', BLUE),
    (8.2, 2.9, '③ 诊断缺口', '归入 7 类 + 引用原话', PURPLE),
    (4.6, 4.5, '④ 更新图谱', '闭合 / 新增，实时可视化', GREEN),
]
for x, y, title, sub, c in nodes:
    r = rect(s, x, y, 3.0, 1.15, fill=WHITE, line=c)
    text(s, x + 0.22, y + 0.16, 2.6, 0.5, [(title, 17, True, c)])
    text(s, x + 0.22, y + 0.62, 2.6, 0.45, [(sub, 12, False, MUTE)])

# 箭头（用细矩形近似）
for x, y, w, rot in [(4.0, 3.35, 0.6, 0), (7.6, 3.35, 0.6, 0)]:
    rect(s, x, y, w, 0.08, fill=LINE)

text(s, 0.8, 6.05, 11.7, 1.0, [
    ('讲不清 → 回到追问 ｜ 疑似懂了 → 进入费曼环节（学生讲给 AI 听）', 16, True, INK),
], spacing=4)

# ============================================================ 4 追问阶梯
s = prs.slides.add_slide(BLANK)
slide_bg(s)
text(s, 0.8, 0.55, 12, 0.8, [('三、苏格拉底六层追问阶梯', 32, True, INK)])
rect(s, 0.8, 1.5, 11.7, 0.05, fill=LINE)

steps = [
    ('L1', '唤起经验', '「你平时……的时候，会怎么样？」'),
    ('L2', '概念澄清', '「你说的 XX，具体是指什么？」'),
    ('L3', '举例反例', '「有没有一个时候，它就不灵了？」'),
    ('L4', '类比迁移', '「它像你生活里的什么东西？」'),
    ('L5', '追问原因', '「你为什么会这么想？」'),
    ('L6', '归纳表达', '「用一句话说说，它到底是什么？」'),
]
for i, (lv, name, say) in enumerate(steps):
    x = 0.8 + (i % 3) * 3.95
    y = 1.9 + (i // 3) * 1.9
    rect(s, x, y, 3.7, 1.6, fill=WHITE, line=LINE)
    rect(s, x, y, 0.75, 1.6, fill=PRIMARY)
    text(s, x + 0.02, y + 0.5, 0.72, 0.6, [(lv, 20, True, WHITE)], align=PP_ALIGN.CENTER)
    text(s, x + 0.95, y + 0.28, 2.6, 0.5, [(name, 17, True, INK)])
    text(s, x + 0.95, y + 0.82, 2.6, 0.7, [(say, 12, False, MUTE)])

text(s, 0.8, 5.9, 11.7, 1.2, [
    ('不跳级：学生在哪一层卡住，就在那一层反复，通了才往上登。', 17, True, INK),
    ('学生说「不知道」→ 降一层，换更好懂的说法重问同一件事（换说法，不换目标）。', 14, False, MUTE),
], spacing=8)

# ============================================================ 5 七类缺口
s = prs.slides.add_slide(BLANK)
slide_bg(s)
text(s, 0.8, 0.5, 12, 0.8, [('四、认知缺口图谱：把「没懂」结构化', 32, True, INK)])
rect(s, 0.8, 1.4, 11.7, 0.05, fill=LINE)

gaps = [
    ('定义缺失', '说不出"是什么"', '「就是……电脑里面放东西的地方吧」', PRIMARY),
    ('机制不清', '说不出"怎么工作"', '「因为……加了就更难猜？」', BLUE),
    ('类比失效', '打比方打错地方', '把"放进去"当成"加上去"，算出 5+3=8', PURPLE),
    ('术语依赖', '用没懂的词解释词', '「电脑有内存，就记住了」', RGBColor(0xFF, 0xC9, 0x47)),
    ('因果想当然', '把先后当因果', '「因为电脑是先发明 0 和 1 的」', RGBColor(0xF7, 0x6E, 0x8E)),
    ('边界模糊', '不知何时不适用', '「密码加生日更安全，因为更长了」', GREEN),
    ('迁移失败', '换个情境就不会', '会做这道，换个说法就不会', RGBColor(0x6C, 0x8E, 0xBF)),
]
for i, (name, mean, example, c) in enumerate(gaps):
    y = 1.65 + i * 0.72
    rect(s, 0.8, y, 2.4, 0.62, fill=c)
    text(s, 0.95, y + 0.13, 2.1, 0.5, [(name, 14, True, WHITE)])
    text(s, 3.35, y + 0.13, 3.0, 0.5, [(mean, 13, False, INK)])
    text(s, 6.4, y + 0.13, 6.1, 0.5, [(example, 12, False, MUTE)])

text(s, 0.8, 6.85, 11.7, 0.5,
     [('每条都带学生原话引用、发现轮次、闭合轮次 —— 形成可追溯的证据链。', 14, True, MUTE)])

# ============================================================ 6 费曼
s = prs.slides.add_slide(BLANK)
slide_bg(s)
text(s, 0.8, 0.55, 12, 0.8, [('五、费曼环节：让学生教 AI', 32, True, INK)])
rect(s, 0.8, 1.5, 11.7, 0.05, fill=LINE)

rect(s, 0.8, 1.9, 5.7, 2.6, fill=WHITE, line=PRIMARY)
text(s, 1.05, 2.1, 5.2, 0.6, [('AI 的角色切换', 18, True, PRIMARY)])
text(s, 1.05, 2.75, 5.2, 1.6, [
    ('从「追问的老师」变成', 14, False, INK),
    ('「从没学过的四年级同桌」', 16, True, INK),
    ('', 8, False, INK),
    ('请学生讲给它听，它只在', 13, False, MUTE),
    ('含糊 / 术语 / 断链处打断。', 13, False, MUTE),
], spacing=3)

rect(s, 6.8, 1.9, 5.7, 2.6, fill=WHITE, line=GREEN)
text(s, 7.05, 2.1, 5.2, 0.6, [('三条通过标准', 18, True, GREEN)])
text(s, 7.05, 2.75, 5.2, 1.6, [
    ('① 没用同桌听不懂的词', 14, False, INK),
    ('② 打了一个生活里的比方', 14, False, INK),
    ('③ 能回答同桌的一个追问', 14, False, INK),
], spacing=9)

text(s, 0.8, 4.85, 11.7, 0.6, [('绝对禁止（这是最容易犯的错）', 18, True, INK)])
for i, t in enumerate([
    '不许替学生把话补完 —— 一旦补完，费曼闭环就失效',
    '不许使用学生没用过的术语（同桌根本不知道这些词）',
    '不许夸「你说得很好」，要夸就夸具体的',
]):
    y = 5.5 + i * 0.53
    rect(s, 0.8, y + 0.13, 0.16, 0.16, fill=RGBColor(0xF7, 0x6E, 0x8E), shape=MSO_SHAPE.OVAL)
    text(s, 1.2, y, 11.2, 0.45, [(t, 13, False, INK)])

# ============================================================ 7 护栏
s = prs.slides.add_slide(BLANK)
slide_bg(s)
text(s, 0.8, 0.55, 12, 0.8, [('六、拒答护栏：「不给答案」是可以测量的', 32, True, INK)])
rect(s, 0.8, 1.5, 11.7, 0.05, fill=LINE)

text(s, 0.8, 1.76, 11.7, 0.42,
     [('"不给答案"很容易承诺，很难证明。小问号把它变成五个可当场验证的数字。', 14, False, MUTE)])
text(s, 0.8, 2.14, 11.7, 0.35,
     [('诱导率隐蔽性最高：答案藏进问句，字面合法，学生却只在点头。', 10.5, False,
       RGBColor(0xF7, 0x6E, 0x8E))])

metrics = [
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
    text(s, x + 1.95, y + 1.02, 1.55, 0.32, [(f'目标 {target}', 10, False, MUTE)])

rect(s, 0.8, 6.35, 11.7, 0.72, fill=RGBColor(0xDE, 0xF7, 0xEC), line=GREEN)
text(s, 1.05, 6.5, 11.2, 0.42, [
    ('护栏通过率 39 / 39 = 100%（5 段脚本 · 共 39 轮）', 14, True, RGBColor(0x2F, 0x9E, 0x75)),
], )
text(s, 0.8, 7.08, 11.7, 0.3,
     [('数据来源 pnpm selfcheck，结果可复现', 9, False, MUTE)])



# ============================================================ 8 儿童适配
s = prs.slides.add_slide(BLANK)
slide_bg(s)
text(s, 0.8, 0.55, 12, 0.8, [('七、面向小学的儿童认知适配', 32, True, INK)])
rect(s, 0.8, 1.5, 11.7, 0.05, fill=LINE)

items = [
    ('儿童语言公约', '一句话 ≤ 25 字；术语必须翻译成动作：「变量」→「贴了名字的盒子」', PRIMARY),
    ('三个状态按钮', '我不知道 / 给点提示 / 我讲完了 —— 绕开小学生打字慢的门槛', BLUE),
    ('挫败防护', '连续答不上来自动降层重问；只给「最小提示」，绝不给完整答案', GREEN),
    ('内容对标课标', '《义务教育信息科技课程标准（2022年版）》四大板块', PURPLE),
    ('隐私与合规', 'API Key 只存本地浏览器，对话数据不经任何中间服务器', MUTE),
]
for i, (title, sub, c) in enumerate(items):
    y = 1.85 + i * 1.05
    rect(s, 0.8, y, 0.12, 0.85, fill=c)
    text(s, 1.15, y + 0.05, 3.2, 0.5, [(title, 17, True, INK)])
    text(s, 1.15, y + 0.5, 11.2, 0.5, [(sub, 13, False, MUTE)])

# ============================================================ 9 技术
s = prs.slides.add_slide(BLANK)
slide_bg(s)
text(s, 0.8, 0.55, 12, 0.8, [('八、技术实现', 32, True, INK)])
rect(s, 0.8, 1.5, 11.7, 0.05, fill=LINE)

text(s, 0.8, 1.8, 11.7, 0.5,
     [('Vite + React 18 + TypeScript + Tailwind 静态前端，浏览器直连 DeepSeek API。', 15, False, MUTE)])

roles = [
    ('Socratic Engine', '生成单个追问，按阶梯升降层', '{say, level, target_gap, give_up_hint}', PRIMARY),
    ('Gap Diagnoser', '从学生原话识别 7 类缺口', '{gaps[{type,evidence}], understood_level}', PURPLE),
    ('Feynman Reviewer', '扮演不懂的同桌，只在断链处打断', '{say, passed, stuck_at, missing}', GREEN),
]
text(s, 0.8, 2.45, 11.7, 0.5, [('三角色协同（同一模型，靠 Prompt 与结构化输出切换）', 17, True, INK)])
for i, (name, duty, out, c) in enumerate(roles):
    y = 3.05 + i * 1.15
    rect(s, 0.8, y, 11.7, 1.0, fill=WHITE, line=LINE)
    rect(s, 0.8, y, 0.1, 1.0, fill=c)
    text(s, 1.1, y + 0.13, 3.0, 0.5, [(name, 15, True, c)])
    text(s, 1.1, y + 0.55, 5.0, 0.4, [(duty, 12, False, INK)])
    text(s, 6.3, y + 0.32, 6.0, 0.5, [(out, 11, False, MUTE)])

# ============================================================ 10 体验模式
s = prs.slides.add_slide(BLANK)
slide_bg(s)
text(s, 0.8, 0.55, 12, 0.8, [('九、体验模式：评委零门槛审核', 32, True, INK)])
rect(s, 0.8, 1.5, 11.7, 0.05, fill=LINE)

text(s, 0.8, 1.85, 11.7, 0.6,
     [('内置 5 段完整回放脚本（变量 / 密码安全 / 二进制 / 循环 / AI 初步），不需要 API Key、不依赖网络模型。', 16, False, MUTE)])

# 截图：按可用空间等比缩放，避免高度溢出
try:
    from PIL import Image
    iw, ih = Image.open('docs/screenshot-main.png').size
    max_w, max_h = 11.7, 4.35
    box_ratio = max_w / max_h
    img_ratio = iw / ih
    if img_ratio >= box_ratio:
        w_in, h_in = max_w, max_w / img_ratio
    else:
        h_in, w_in = max_h, max_h * img_ratio
    left = (W - w_in) / 2
    s.shapes.add_picture('docs/screenshot-main.png', Inches(left), Inches(2.55),
                         width=Inches(w_in), height=Inches(h_in))
    print(f'picture: {w_in:.2f}x{h_in:.2f} inch')
except Exception as e:
    rect(s, 0.8, 2.55, 11.7, 4.2, fill=WHITE, line=LINE)
    text(s, 3.0, 4.2, 7.5, 0.8, [('（界面截图）', 18, False, MUTE)], align=PP_ALIGN.CENTER)
    print('picture skipped:', e)

# ============================================================ 11 差异
s = prs.slides.add_slide(BLANK)
slide_bg(s)
text(s, 0.8, 0.55, 12, 0.8, [('十、与已有开源项目的差异', 32, True, INK)])
rect(s, 0.8, 1.5, 11.7, 0.05, fill=LINE)

text(s, 0.8, 1.8, 11.7, 0.6,
     [('开源界已有苏格拉底提问与费曼技巧的「单引擎」实现，但：', 15, False, MUTE)])

diffs = [
    ('① 缺口结构化', '把"没懂"落成 7 类可追踪、可量化、可闭合的缺口事件，而非一次性提示', PRIMARY),
    ('② 护栏可审计', '用三项指标自证"真的不给答案"，评委可当场验证', GREEN),
    ('③ 场景落地', '面向小学信息科技，含儿童语言公约与挫败防护，对标 2022 义教新课标', BLUE),
]
for i, (title, sub, c) in enumerate(diffs):
    y = 2.6 + i * 1.35
    rect(s, 0.8, y, 11.7, 1.2, fill=WHITE, line=LINE)
    rect(s, 0.8, y, 0.1, 1.2, fill=c)
    text(s, 1.15, y + 0.2, 3.4, 0.6, [(title, 19, True, c)])
    text(s, 4.8, y + 0.32, 7.5, 0.7, [(sub, 14, False, INK)])

text(s, 0.8, 6.6, 11.7, 0.6,
     [('参考：socratic-workshop、m4vic/socratic、feynman-tutor、Museion 等', 12, False, MUTE)])

# ============================================================ 12 结尾
s = prs.slides.add_slide(BLANK)
slide_bg(s, PRIMARY)

text(s, 1.0, 2.3, 11.3, 1.0, [('不给答案，只问问题。', 42, True, WHITE)])
text(s, 1.0, 3.5, 11.3, 0.8,
     [('让学生自己想明白的那一步，才是真正的学会。', 22, False, RGBColor(0xFF, 0xE3, 0xD3))])

rect(s, 1.0, 4.5, 3.6, 0.06, fill=WHITE)

text(s, 1.0, 4.9, 11.3, 1.2, [
    ('小问号 · 苏格拉底 × 费曼 主动学习智能体', 16, True, WHITE),
    ('小学 3-6 年级 信息科技 ｜ DeepSeek ｜ MIT License', 13, False, RGBColor(0xFF, 0xE3, 0xD3)),
], spacing=10)

out = '小问号-答辩PPT.pptx'
prs.save(out)
print('saved:', out, '| slides:', len(prs.slides._sldIdLst))
