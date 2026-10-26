/**
 * 体验模式：离线回放脚本
 * ---------------------------------------------------------------
 * 评委/教师打开链接就能看到完整效果，不需要 API Key、不依赖网络模型。
 * 每条脚本都是一次真实的 G-Loop 演示：提问 → 学生答 → 暴露缺口 → 追问 → 费曼 → 闭合。
 *
 * 这些数据同时也是"离线回放基准"的种子集：护栏指标可以直接在它们上面跑。
 */

import type { GapTypeId } from './prompts.ts'
import type { Phase } from './engine.ts'

export type DemoStep = {
  /** AI 说的话 */
  ai: string
  /** 层级（苏格拉底阶段才有） */
  level?: number
  /** 这一步针对的缺口类型 */
  target?: GapTypeId | string
  /** 学生可能的回答（回放时自动播放） */
  student: string
  /** 这一步会诊断出的缺口 */
  gaps?: { type: GapTypeId | string; evidence: string; confidence: number }[]
  /** 这一步闭合的缺口类型 */
  closes?: (GapTypeId | string)[]
  /** 这一步之后学生的理解度 0-1 */
  understood?: number
  phase: Phase
  /** 给评委看的旁白，说明这一步在做什么 */
  note: string
}

export type DemoScript = {
  id: string
  concept: string
  emoji: string
  grade: string
  blurb: string
  steps: DemoStep[]
}

export const DEMO_SCRIPTS: DemoScript[] = [
  {
    id: 'variable',
    concept: '变量（贴了名字的盒子）',
    emoji: '📦',
    grade: '5 年级 · 算法与程序',
    blurb: '看起来会做，一问"为什么"就说不清 —— 典型的假性掌握',
    steps: [
      {
        ai: '你玩过那种带格子的收纳盒吗？',
        level: 1,
        student: '在上面贴个标签写"苹果"。',
        understood: 0.25,
        phase: 'socratic',
        note: 'L1 唤起经验：从生活里的"贴标签"切入，不提"变量"两个字',
      },
      {
        ai: '贴标签这个办法真好。那你觉得，电脑是怎么"记住"一个数字的？',
        level: 1,
        student: '电脑里面有内存，就记住了。',
        gaps: [{ type: 'jargon', evidence: '电脑里面有内存，就记住了', confidence: 0.75 }],
        understood: 0.3,
        phase: 'socratic',
        note: '学生用"内存"这个自己也没解释过的词 —— 术语依赖缺口暴露',
      },
      {
        ai: '你说的"内存"，是什么意思呀？',
        level: 2,
        target: 'jargon',
        student: '就是……电脑里面放东西的地方吧。',
        gaps: [{ type: 'def', evidence: '就是……电脑里面放东西的地方吧', confidence: 0.8 }],
        understood: 0.35,
        phase: 'socratic',
        note: 'L2 概念澄清：逼他把术语翻译成自己的话，结果含糊 —— 定义缺失',
      },
      {
        ai: '我把 5 放进叫 a 的盒子里。你怎么知道 a 里放的是 5？',
        level: 4,
        target: 'def',
        student: '是 8！因为 5 加 3 等于 8。',
        gaps: [{ type: 'mech', evidence: '是 8！因为 5 加 3 等于 8', confidence: 0.85 }],
        understood: 0.4,
        phase: 'socratic',
        note: 'L4 类比迁移：经典误区浮出水面 —— 他把"放进去"当成了"加上去"',
      },
      {
        ai: '盒子里先放着 5，我现在把 3 放进去。你觉得盒子里会变成什么样？',
        level: 5,
        target: 'mech',
        student: '哦……那应该是 3 吧？因为新的把旧的挤掉了。',
        understood: 0.7,
        closes: ['mech', 'jargon'],
        phase: 'socratic',
        note: 'L5 追问原因：只给"放进去"这个动作线索，他自己想通了覆盖机制 —— 缺口闭合',
      },
      {
        ai: '如果两个盒子上写一样的名字，会出什么问题？',
        level: 5,
        student: '不能，因为叫同一个名字就分不清哪个是哪个了。',
        understood: 0.82,
        phase: 'socratic',
        note: '登一级台阶再确认，他已经能自己推理了 —— 进入费曼环节',
      },
      {
        ai: '太好了。现在换你当小老师：我是个从没听过"变量"的同桌，你讲给我听，要让我也能算出来。',
        phase: 'feynman',
        student: '变量就是一个盒子，你给它起个名字，比如叫 a。你把数字放进去，下次放新的，旧的就没了。所以你问 a 是多少，就是问现在盒子里是什么。',
        understood: 0.9,
        closes: ['def'],
        note: '费曼第 1 次讲解：有生活类比 + 无术语依赖 + 说清了覆盖机制',
      },
      {
        ai: '哦——我懂了！你用盒子打比方，我一下就想明白了。那要是盒子里放的不是数字，是一句话呢？',
        phase: 'feynman',
        student: '也行啊，盒子里放什么都行，只要是电脑能存的东西。',
        understood: 0.95,
        note: '同桌追问通过 —— 费曼讲解判定通过，学习完成',
      },
      {
        ai: '厉害！你今天自己想明白了"变量"是什么，还教会了我。',
        phase: 'done',
        student: '',
        understood: 1,
        note: '生成学习护照',
      },
    ],
  },
  {
    id: 'password',
    concept: '什么样的密码才安全',
    emoji: '🔐',
    grade: '3-4 年级 · 网络与安全',
    blurb: '学生背下了规则，却说不出规则背后的道理',
    steps: [
      {
        ai: '你的游戏账号要设密码。妈妈让你设"难一点"的，你觉得什么样的密码算难？',
        level: 1,
        student: '要长一点，还要有数字和字母。',
        gaps: [{ type: 'mech', evidence: '要长一点，还要有数字和字母', confidence: 0.7 }],
        understood: 0.4,
        phase: 'socratic',
        note: '背出了规则，但这是记忆不是理解 —— 机制不清',
      },
      {
        ai: '这是老师教的规则。可是你想过没有：为什么要加数字呢？',
        level: 5,
        target: 'mech',
        student: '因为……加了就更难猜？',
        understood: 0.45,
        phase: 'socratic',
        note: 'L5 追问原因：他的"因为"其实只是把问题重复了一遍',
      },
      {
        ai: '我们来玩个游戏。如果你的密码是 6 位，每一位只能是数字（0-9），那我瞎猜，最多要猜多少次？',
        level: 3,
        target: 'mech',
        student: '一百万次！',
        understood: 0.6,
        phase: 'socratic',
        note: 'L3 举例：把"为什么"换成一个能算出来的具体问题',
      },
      {
        ai: '对，正好一百万次。那如果每一位还能填字母呢？',
        level: 5,
        student: '变多！因为每一位能选的东西变多了。',
        understood: 0.78,
        closes: ['mech'],
        phase: 'socratic',
        note: '他自己说出了"选择变多"这个机制 —— 缺口闭合',
      },
      {
        ai: '那我再加一句：如果我把生日也加进密码里，会怎么样？',
        level: 3,
        target: 'edge',
        student: '更安全吧，因为更长了……',
        gaps: [{ type: 'edge', evidence: '更安全吧，因为更长了', confidence: 0.8 }],
        understood: 0.7,
        phase: 'socratic',
        note: '反向追问暴露新缺口：只知道"长就好"，不知道规则什么时候失灵 —— 边界模糊',
      },
      {
        ai: '你的生日，你同桌知道吗？',
        level: 5,
        target: 'edge',
        student: '对认识我的人来说更好猜！因为大家都知我生日。',
        understood: 0.88,
        closes: ['edge'],
        phase: 'socratic',
        note: '把"认识你的人"这个变量引进来，他自己发现了边界 —— 闭合',
      },
      {
        ai: '轮到你当小老师了。我是你同桌，我密码设的是 abc123，你讲给我听为什么不行。',
        phase: 'feynman',
        student: '因为太短了，而且 abc123 是最多人用的，坏人和电脑一下就试出来了。密码要长，还要用别人不知道的东西，不能用生日，因为同学都知道。',
        understood: 0.92,
        note: '费曼讲解：说清了机制 + 指出了边界，通过',
      },
      {
        ai: '哦——我懂了！我这就去把 abc123 换掉。',
        phase: 'done',
        student: '',
        understood: 1,
        note: '学习护照生成',
      },
    ],
  },
  {
    id: 'binary',
    concept: '电脑为什么只认 0 和 1',
    emoji: '💡',
    grade: '5-6 年级 · 数据与编码',
    blurb: '把"先后"当成"因果"，是小学生最常见的推理错误',
    steps: [
      {
        ai: '你知道电脑里面是怎么表示数字的吗？',
        level: 1,
        student: '用 0 和 1。',
        gaps: [{ type: 'def', evidence: '用 0 和 1', confidence: 0.6 }],
        understood: 0.3,
        phase: 'socratic',
        note: '一句话答案，没有解释 —— 定义缺失',
      },
      {
        ai: '对，是 0 和 1。那你想过没有：为什么偏偏是 0 和 1，不是 0、1、2？',
        level: 5,
        target: 'def',
        student: '因为电脑是先发明 0 和 1 的，后来才有的别的。',
        gaps: [{ type: 'causal', evidence: '因为电脑是先发明 0 和 1 的，后来才有的别的', confidence: 0.85 }],
        understood: 0.35,
        phase: 'socratic',
        note: '把时间先后当成原因 —— 因果想当然',
      },
      {
        ai: '我们换个东西想：你房间的电灯开关，它有几种状态？',
        level: 4,
        target: 'causal',
        student: '两种，开和关。',
        understood: 0.5,
        phase: 'socratic',
        note: 'L4 类比迁移：用开关这种"只有两态"的东西做桥',
      },
      {
        ai: '那如果电脑里有好多好多这样的小开关，你怎么用它们来记数字？',
        level: 4,
        target: 'causal',
        student: '因为开关只有两种状态，所以只能记两个数！',
        understood: 0.8,
        closes: ['causal', 'def'],
        phase: 'socratic',
        note: '他自己把"开关只有两态"推到了"只能记两个数" —— 因果缺口闭合',
      },
      {
        ai: '那问题来了：只有两个状态，怎么表示 5 这么大的数？',
        level: 3,
        target: 'mech',
        student: '用好多开关？比如第一个是 4，第二个是 1，加起来就是 5。',
        understood: 0.88,
        closes: ['mech'],
        phase: 'socratic',
        note: '他自己摸到了二进制位权的边 —— 机制理解建立',
      },
      {
        ai: '厉害。现在我是没学过这些的同桌，你讲给我听：为什么电脑不直接记 5，非要记一堆 0 和 1？',
        phase: 'feynman',
        student: '因为电脑里面全是小开关，开关只有开和关两种，就像电灯。所以它只能记两个数，0 和 1。要记大的数，就多用几个开关，像搭积木一样搭出来。',
        understood: 0.93,
        note: '费曼讲解：开关类比 + 积木类比，无术语，通过',
      },
      {
        ai: '哦——我懂了！就像我家的灯，要么亮要么不亮，没有中间。',
        phase: 'done',
        student: '',
        understood: 1,
        note: '学习护照生成',
      },
    ],
  },
  {
    id: 'loop',
    concept: '循环（照着做很多遍）',
    emoji: '🔁',
    grade: '5 年级 · 算法与程序',
    blurb: '会照着做，但说不清"为什么要循环"——把重复当成了循环',
    steps: [
      {
        ai: '老师让你把 100 份作业本发下去。你会怎么做？',
        level: 1,
        student: '一份一份发，发 100 次。',
        understood: 0.3,
        phase: 'socratic',
        note: 'L1 唤起经验：从真实任务切入，不提"循环"',
      },
      {
        ai: '如果一次一份，一共要发多少遍？',
        level: 2,
        target: 'def',
        student: '100 遍，很累。',
        gaps: [{ type: 'mech', evidence: '100 遍，很累', confidence: 0.6 }],
        understood: 0.35,
        phase: 'socratic',
        note: '他知道"要重复"，但把"重复"直接等同于"循环" —— 机制不清',
      },
      {
        ai: '本子堆成一大摞，发着发着，你怎么知道自己发到哪了？',
        level: 4,
        target: 'mech',
        student: '在心里数啊，数到 100 就停。',
        understood: 0.55,
        phase: 'socratic',
        note: 'L4 类比迁移：他自己摸到了"计数器"这个概念',
      },
      {
        ai: '「数到 100 就停」—— 那你是在什么时候停下来的？',
        level: 5,
        target: 'mech',
        student: '数到 100 的时候停。',
        understood: 0.65,
        phase: 'socratic',
        note: 'L5 追问原因：逼近"循环终止条件"',
      },
      {
        ai: '那我们改一下：如果老师没说发多少份，只说「发完为止」，你还能照着刚才的办法做吗？',
        level: 5,
        target: 'edge',
        student: '能啊，发到手上没有本子为止。',
        understood: 0.85,
        closes: ['mech'],
        phase: 'socratic',
        note: '他意识到"停止条件"可以是别的东西 —— 机制缺口闭合',
      },
      {
        ai: '再刁难你一下：如果本子突然变成 1000 份，你刚才的做法要改吗？',
        level: 3,
        target: 'edge',
        student: '不用改，就是数到 1000 而已。',
        understood: 0.9,
        closes: ['edge', 'def'],
        phase: 'socratic',
        note: '他理解到"循环"是可以复用同一套办法处理不同规模 —— 边界澄清',
      },
      {
        ai: '很好。现在你当小老师：我是没学过「循环」的同桌，你讲给我听，让我也会发本子。',
        phase: 'feynman',
        student: '循环就是同一个动作做很多遍。但你不能傻做，得有两个东西：一个是数到几，一个是什么时候停。本子变多也不用改做法，改那个数就行。',
        understood: 0.94,
        note: '费曼讲解：说清"重复 + 计数 + 停止条件"，无术语，通过',
      },
      {
        ai: '哦——我懂了！就是照着做很多遍，但得知道什么时候停。',
        phase: 'done',
        student: '',
        understood: 1,
        note: '学习护照生成',
      },
    ],
  },
  {
    id: 'ai',
    concept: '人工智能是怎么"学"的',
    emoji: '🤖',
    grade: '6 年级 · 人工智能初步',
    blurb: '以为 AI 像人一样"看懂"，其实它只是在找规律',
    steps: [
      {
        ai: '你见过手机拍照能认出"这是猫"吗？',
        level: 1,
        student: '它看到猫的样子，就认出来了。',
        gaps: [{ type: 'def', evidence: '它看到猫的样子，就认出来了', confidence: 0.7 }],
        understood: 0.3,
        phase: 'socratic',
        note: '把 AI 拟人化了 —— 定义缺失',
      },
      {
        ai: '你说"看到"。那手机有眼睛吗？',
        level: 5,
        target: 'def',
        student: '没有眼睛……它拿到的是照片，照片是一堆数字？',
        understood: 0.5,
        phase: 'socratic',
        note: 'L5 追问原因：从"看"逼到"数字"',
      },
      {
        ai: '对，一堆数字。那我们做个实验：我给你看 10 张猫的照片。你会拿它们怎么办？',
        level: 4,
        target: 'mech',
        student: '都有耳朵、胡须、毛。',
        understood: 0.6,
        phase: 'socratic',
        note: 'L4 类比迁移：让他体会"找共同点"这件事',
      },
      {
        ai: 'AI 看了几万张猫的照片之后，它在做什么？',
        level: 5,
        target: 'mech',
        student: '它是在找规律！不是真的看懂。',
        understood: 0.82,
        closes: ['def', 'mech'],
        phase: 'socratic',
        note: '他自己区分了"看懂"与"找规律" —— 核心缺口闭合',
      },
      {
        ai: '如果一只猫躲在黑屋子里、照片很暗，AI 还能认出来吗？',
        level: 3,
        target: 'edge',
        student: '可能认不出来，因为它没见过这么暗的猫。',
        understood: 0.88,
        closes: ['edge'],
        phase: 'socratic',
        note: '他推出了"数据覆盖不到就会失灵" —— 边界缺口闭合，这是很多成年人也说不清的',
      },
      {
        ai: '太厉害了。现在你当小老师，讲给一个没学过的同桌听：AI 是怎么"学会"认猫的？',
        phase: 'feynman',
        student: 'AI 没有眼睛，它看到的是一堆数字。它看好多好多猫的照片，自己找出共同点，比如耳朵胡须这些。下次来一张新照片，它就看像不像。但它没见过的，比如很黑的照片，就可能认错。',
        understood: 0.95,
        note: '费曼讲解：数字化 + 找规律 + 数据局限，三条全中',
      },
      {
        ai: '哦——我懂了！原来它不是看懂，是找规律。',
        phase: 'done',
        student: '',
        understood: 1,
        note: '学习护照生成',
      },
    ],
  },
]

/** 取一条脚本，转成可以直接喂给 UI 的回放序列 */
export function flattenScript(script: DemoScript) {
  return script.steps.map((s, i) => ({
    index: i,
    ai: s.ai,
    student: s.student,
    level: s.level,
    target: s.target,
    gaps: s.gaps ?? [],
    closes: s.closes ?? [],
    understood: s.understood ?? 0.5,
    phase: s.phase,
    note: s.note,
  }))
}
