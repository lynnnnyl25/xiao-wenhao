/**
 * 概念知识库 Concept Packs
 * ---------------------------------------------------------------
 * 为什么需要这个文件？
 *
 * 只靠 Prompt 让大模型"问得好"是不够的 —— 它不知道"变量"这个具体概念
 * 在小学生身上到底有哪几种典型错法，也不知道什么样的回答算真懂。
 * 结果就是：问得很流畅，但问不到点上；判定很自信，但判错。
 *
 * 所以这里给每个概念一份"教学底稿"：
 *   - checkpoints  真懂必须说到的那几句话（用来判掌握，不靠模型感觉）
 *   - jargon       小学生不该随口用、用了就说明没懂的词（术语审计）
 *   - misconceptions 已知的典型错法（用来精准下反问，而不是瞎猜）
 *   - ladder       每一层台阶上，这个概念可以问什么
 *
 * 有了它，大模型的工作从"自由发挥"变成"在这份底稿上选择与追问"，
 * 引导的准确性和稳定性都会明显提高。
 */

import type { GapTypeId } from './prompts.ts'
export type Checkpoint = {
  id: string
  /** 这条理解点的人话描述 */
  label: string
  /** 命中任一关键词即算说到 */
  keywords: string[]
  /** 必答项（缺了就不算真懂）；false 表示加分项 */
  required?: boolean
}

export type Misconception = {
  id: string
  /** 这种错法的人话描述 */
  label: string
  /** 命中这些词，说明很可能踩了这个坑 */
  detect: string[]
  /** 归到哪类缺口 */
  gapType: GapTypeId
  /** 用来戳破它的反问（必须是问句，不能含答案） */
  probe: string
}

export type LadderQuestion = {
  level: 1 | 2 | 3 | 4 | 5 | 6
  /** 这一步想逼出什么 */
  intent: string
  /** 可用问法（给模型参考，不是必须照念） */
  ask: string
  /** 学生答不上来时，退到更浅的说法 */
  easier?: string
}

export type ConceptPack = {
  id: string
  name: string
  /** 学生可能怎么称呼它 */
  aliases: string[]
  grade: string
  emoji: string
  /** 一句话：真懂的标准（写给老师/评委看） */
  coreIdea: string
  /** 真懂必须包含的理解点 */
  checkpoints: Checkpoint[]
  /** 术语审计词表：小学生用了这些词，就要请他翻译成自己的话 */
  jargon: string[]
  /** 已知典型错法 */
  misconceptions: Misconception[]
  /** 好用的生活类比（给模型弹药） */
  analogies: string[]
  /** 分层提问银行 */
  ladder: LadderQuestion[]
  /** 费曼环节的邀请语 */
  feynmanInvite: string
  /** 费曼环节"同桌"可以追问的变式（验证可迁移） */
  feynmanProbes: string[]
}

// ---------------------------------------------------------------- 变量

const VARIABLE: ConceptPack = {
  id: 'variable',
  name: '变量',
  aliases: ['变量', '赋值', '盒子', '存储'],
  grade: '5 年级 · 算法与程序',
  emoji: '📦',
  coreIdea:
    '变量是一个有名字的存放位置：用名字指代它，往里放新值会覆盖旧值，用名字能取回当前的值。',
  checkpoints: [
    {
      id: 'name',
      label: '用名字指代某个存放位置',
      keywords: ['名字', '起名', '贴标签', '叫做', '叫它', '标签', '代号'],
      required: true,
    },
    {
      id: 'overwrite',
      label: '放新值会覆盖旧值（不是相加）',
      keywords: ['覆盖', '替换', '挤掉', '旧的没', '换掉', '变新', '变成新的', '冲掉'],
      required: true,
    },
    {
      id: 'retrieve',
      label: '用名字能取回当前的值',
      keywords: ['取出来', '拿出来', '读出来', '找到', '取出', '看到里面'],
      required: true,
    },
    {
      id: 'mutable',
      label: '里面装的东西可以改',
      keywords: ['可以改', '能改', '会变', '随时换', '换一个'],
    },
  ],
  jargon: ['变量', '内存', '赋值', '声明', '作用域', '数据类型', '存储单元', '地址', '实例化'],
  misconceptions: [
    {
      id: 'add',
      label: '把"放进去"当成"加上去"',
      detect: ['加起来', '加上', '相加', '等于8', '等于 8', '5加3', '5 加 3', '一共'],
      gapType: 'mech',
      probe: '注意，是"放进去"，不是"倒进去"。你觉得盒子里的旧东西会怎么样？',
    },
    {
      id: 'samename',
      label: '以为两个盒子能叫同一个名字',
      detect: ['可以同名', '一样的名字也行', '都叫a', '都叫 a', '叫一样'],
      gapType: 'edge',
      probe: '如果两个盒子都叫 a，你喊一声 a，哪一个会答应？',
    },
    {
      id: 'readonly',
      label: '以为盒子里的东西定了就不能改',
      detect: ['不能改', '固定的', '写了就不能变'],
      gapType: 'edge',
      probe: '那如果我想把里面的 5 换成 7，还能换吗？',
    },
  ],
  analogies: ['贴了名字的盒子', '写着名字的储物柜', '抽屉上贴标签'],
  ladder: [
    {
      level: 1,
      intent: '唤起"给东西起名字好找"的经验',
      ask: '你玩过那种带格子的收纳盒吗？如果我把一个苹果放进去，我怎么才能一眼找到它？',
      easier: '如果盒子上什么都不写，你还找得到吗？',
    },
    {
      level: 2,
      intent: '让他把"内存"这类词翻译成自己的话',
      ask: '你说到"内存"。你能不能用你自己的话说说，它到底是个什么东西？',
      easier: '那你说说，东西放在电脑的什么地方了？',
    },
    {
      level: 3,
      intent: '用具体数值逼出"覆盖 vs 相加"',
      ask: '盒子里先放着 5，我现在"放进去"一个 3。你觉得盒子现在是什么样？',
      easier: '是变成 3，还是变成 8，还是别的？',
    },
    {
      level: 4,
      intent: '建立"名字↔位置"的类比',
      ask: '它像你生活里的什么东西？为什么像？',
      easier: '像不像你书包上写名字的格子？',
    },
    {
      level: 5,
      intent: '追问"为什么要名字"',
      ask: '为什么一定要给它起个名字？不起名字行不行？',
      easier: '如果没有名字，你怎么跟电脑说"我要那个"？',
    },
    {
      level: 6,
      intent: '归纳成一句话',
      ask: '用一句话说说，变量到底是什么？',
      easier: '就说它像什么、能干什么。',
    },
  ],
  feynmanInvite:
    '现在换你当小老师：我是个从没听过"变量"的同桌，你讲给我听，要让我也能算出盒子里最后是几。',
  feynmanProbes: [
    '等等，那如果我又往里放一个 9，盒子里是几？',
    '你说的"名字"是给谁起的？给盒子还是给里面的东西？',
  ],
}

// ---------------------------------------------------------------- 循环

const LOOP: ConceptPack = {
  id: 'loop',
  name: '循环',
  aliases: ['循环', '重复', 'for', 'while'],
  grade: '5 年级 · 算法与程序',
  emoji: '🔁',
  coreIdea:
    '循环是让同一组动作重复执行，而且必须有一个明确的停止条件；改规模只需改条件，不用改动作。',
  checkpoints: [
    { id: 'repeat', label: '同一组动作重复做', keywords: ['重复', '很多遍', '一直做', '反复', '每一份'], required: true },
    { id: 'stop', label: '有停止条件', keywords: ['停', '为止', '结束', '发完', '数到', '条件'], required: true },
    { id: 'count', label: '有计数/进度', keywords: ['数', '第几', '计数', '记一下', '加起来数'], required: true },
    { id: 'scale', label: '换规模只改条件', keywords: ['不用改', '改数就行', '只改', '一样做'], required: true },
  ],
  jargon: ['循环', '迭代', '遍历', '终止条件', '循环体', '计数器', '死循环'],
  misconceptions: [
    {
      id: 'repeatEqualsLoop',
      label: '以为"做很多遍"就是循环（漏掉停止条件）',
      detect: ['就是做很多遍', '一直做', '重复做就行', '不停地做'],
      gapType: 'mech',
      probe: '如果一直做下去、没人喊停，会发生什么？',
    },
    {
      id: 'noCount',
      label: '说不出怎么知道自己做到第几遍',
      detect: ['不知道第几', '不用数', '记不住'],
      gapType: 'mech',
      probe: '那你怎么知道该在什么时候停下来？',
    },
  ],
  analogies: ['发作业本', '跳绳数个数', '操场跑圈'],
  ladder: [
    {
      level: 1,
      intent: '从真实任务切入',
      ask: '老师让你把 100 份作业本发下去。你会怎么做？',
      easier: '你会一份一份发，还是有别的办法？',
    },
    {
      level: 2,
      intent: '逼出"重复"与"计数"',
      ask: '那如果本子堆成一大摞，你怎么知道自己发到第几份了？',
      easier: '发着发着，你怎么知道快发完了？',
    },
    {
      level: 3,
      intent: '逼出"停止条件"',
      ask: '如果老师没说发多少份，只说"发完为止"，你还能照着刚才的办法做吗？',
      easier: '什么时候你会停下来？',
    },
    {
      level: 4,
      intent: '类比迁移',
      ask: '这件事像你生活里的什么？跳绳？跑圈？',
      easier: '跳绳的时候，你怎么知道跳了几个？',
    },
    {
      level: 5,
      intent: '追问为什么需要停止条件',
      ask: '为什么一定要有个"什么时候停"？不要行不行？',
      easier: '如果永远不停，会怎么样？',
    },
    {
      level: 6,
      intent: '归纳',
      ask: '用一句话说说，循环到底是什么？',
      easier: '就说它做几件事、什么时候停。',
    },
  ],
  feynmanInvite:
    '现在你当小老师：我是没学过"循环"的同桌，你讲给我听，让我也会发本子。',
  feynmanProbes: ['那如果本子变成 1000 份，我要改做法吗？', '我怎么知道该停了？'],
}

// ---------------------------------------------------------------- 二进制

const BINARY: ConceptPack = {
  id: 'binary',
  name: '二进制',
  aliases: ['二进制', '0和1', '0 和 1', '编码'],
  grade: '5-6 年级 · 数据与编码',
  emoji: '💡',
  coreIdea:
    '电脑用只有两种状态的元件存储信息，所以只能记 0 和 1；多个 0/1 按位组合，就能表示更大的数。',
  checkpoints: [
    { id: 'twostate', label: '元件只有两种状态', keywords: ['两种', '开和关', '亮和不亮', '通和断', '两个状态'], required: true },
    { id: 'whytwo', label: '因为只有两态，所以只能记两个数', keywords: ['只能记两个', '只能表示两个', '所以是0和1', '所以是 0 和 1'], required: true },
    { id: 'combine', label: '多个位组合表示更大的数', keywords: ['好多', '多个', '组合', '拼', '搭', '几位', '一起'], required: true },
  ],
  jargon: ['二进制', '位权', '比特', '字节', '编码', '进制'],
  misconceptions: [
    {
      id: 'inventOrder',
      label: '把"先发明 0 和 1"当成原因（时间当因果）',
      detect: ['先发明', '后来才', '以前就有', '先有0和1'],
      gapType: 'causal',
      probe: '如果电脑里全是只有两种状态的小开关，它还能记 0、1、2 三个数吗？',
    },
    {
      id: 'onlyTwo',
      label: '以为只有 0 和 1 就表示不了大数',
      detect: ['只能表示小数', '表示不了', '最多到1'],
      gapType: 'mech',
      probe: '一个开关记不了 5，那两个开关呢？三个呢？',
    },
  ],
  analogies: ['电灯开关', '搭积木', '一排开关'],
  ladder: [
    {
      level: 1,
      intent: '唤起已有印象',
      ask: '你听说过电脑里面是用 0 和 1 表示东西的吗？',
      easier: '你有没有见过一串 0101 这样的东西？',
    },
    {
      level: 2,
      intent: '澄清"0和1"到底指什么',
      ask: '那 0 和 1 代表的是什么？是数字，还是别的什么？',
      easier: '它是"数量"，还是"状态"？',
    },
    {
      level: 3,
      intent: '用开关反例逼出"两态"',
      ask: '你房间的电灯开关，它有几种状态？',
      easier: '灯有"半亮"这种状态吗？',
    },
    {
      level: 4,
      intent: '迁移到"多个开关组合"',
      ask: '如果电脑里有好多这样的开关，怎么表示 5 这么大的数？',
      easier: '一个开关不够，能不能多用几个？',
    },
    {
      level: 5,
      intent: '追问因果，破除"先后即因果"',
      ask: '为什么偏偏是 0 和 1，不是 0、1、2？',
      easier: '是因为开关只有两种，还是因为别的原因？',
    },
    {
      level: 6,
      intent: '归纳',
      ask: '用一句话说说，电脑为什么只认 0 和 1？',
      easier: '就说开关有几种状态、所以能记几个数。',
    },
  ],
  feynmanInvite:
    '现在我是没学过这些的同桌，你讲给我听：为什么电脑不直接记 5，非要记一堆 0 和 1？',
  feynmanProbes: ['那我要记 7，要几个开关？', '开关和 0、1 是怎么对上的？'],
}

// ---------------------------------------------------------------- 密码

const PASSWORD: ConceptPack = {
  id: 'password',
  name: '密码安全',
  aliases: ['密码', '密码安全', '账号安全', '个人信息'],
  grade: '3-4 年级 · 网络与安全',
  emoji: '🔐',
  coreIdea:
    '密码的安全性取决于"别人猜中它有多难"：可选的组合越多越难猜，而别人知道的信息（生日、姓名）会让它变弱。',
  checkpoints: [
    { id: 'combos', label: '可选的组合越多越难猜', keywords: ['组合', '选择变多', '能选的多', '可能性多', '猜的次数多'], required: true },
    { id: 'length', label: '长度增加会显著增加组合', keywords: ['长', '位数', '多几位'], required: true },
    { id: 'knowninfo', label: '熟人知道的信息会让密码变弱', keywords: ['生日', '同学知道', '认识我的人', '都知道', '猜得到'], required: true },
    { id: 'reuse', label: '同一个密码到处用有风险', keywords: ['都一样', '到处用', '一个密码走天下'] },
  ],
  jargon: ['加密', '哈希', '暴力破解', '字典攻击', '组合空间'],
  misconceptions: [
    {
      id: 'longerAlwaysSafer',
      label: '以为只要更长就一定更安全',
      detect: ['更长就更安全', '长就安全', '越长越安全'],
      gapType: 'edge',
      probe: '如果这个更长的密码是你生日，谁会更容易猜出来？',
    },
    {
      id: 'complexOnly',
      label: '只会背规则，说不出为什么',
      detect: ['老师说的', '规定要', '必须加数字'],
      gapType: 'mech',
      probe: '那为什么要加数字呢？不加会怎么样？',
    },
  ],
  analogies: ['密码锁', '猜数字游戏', '钥匙齿数'],
  ladder: [
    {
      level: 1,
      intent: '唤起经验',
      ask: '你的游戏账号要设密码。妈妈让你设"难一点"的，你觉得什么样的算难？',
      easier: '你现在的密码大概是什么样的？',
    },
    {
      level: 5,
      intent: '追问规则背后的道理',
      ask: '这是老师教的规则。可是你想过没有：为什么要加数字呢？',
      easier: '如果全是字母，会怎么样？',
    },
    {
      level: 3,
      intent: '用可算的具体问题替代抽象解释',
      ask: '如果你的密码是 6 位、每位只能是数字，那我瞎猜，最多要猜多少次？',
      easier: '一位有 10 种可能，两位呢？',
    },
    {
      level: 5,
      intent: '逼出"选择变多"这个机制',
      ask: '如果每位可以是数字也可以是字母，猜的次数会变多还是变少？为什么？',
      easier: '每一位能选的东西变多了，还是变少了？',
    },
    {
      level: 3,
      intent: '用反例逼出边界',
      ask: '那密码里加上你的生日，会更安全还是更不安全？',
      easier: '你的生日，同学知道吗？',
    },
    {
      level: 6,
      intent: '归纳',
      ask: '用一句话说说，什么样的密码才算安全？',
      easier: '就说两点：别人猜不到、别人不知道。',
    },
  ],
  feynmanInvite:
    '轮到你当小老师了。我是你同桌，我密码设的是 abc123，你讲给我听为什么不行。',
  feynmanProbes: ['那我改成我生日 20150101，长了吧？行不行？', '为什么不能用一句话当密码？'],
}

// ---------------------------------------------------------------- 算法

const ALGORITHM: ConceptPack = {
  id: 'algorithm',
  name: '算法',
  aliases: ['算法', '步骤', '方法'],
  grade: '5 年级 · 算法与程序',
  emoji: '🧩',
  coreIdea:
    '算法是解决一类问题的、有先后顺序的、每一步都明确的步骤；同一件事可以有不同的算法，好坏不同。',
  checkpoints: [
    { id: 'steps', label: '是一系列步骤', keywords: ['步骤', '一步一步', '分几步', '顺序'], required: true },
    { id: 'ordered', label: '步骤有先后顺序，换了会出错', keywords: ['顺序', '先后', '不能换', '换了就'], required: true },
    { id: 'clear', label: '每一步都很明确、不能含糊', keywords: ['明确', '说清楚', '不能含糊', '具体'], required: true },
    { id: 'general', label: '解决一类问题，不只一次', keywords: ['一类', '换个也能', '都能用', '不只这一'], required: true },
  ],
  jargon: ['算法', '时间复杂度', '迭代', '抽象', '范式'],
  misconceptions: [
    {
      id: 'stepsOnly',
      label: '以为"有步骤"就是算法（漏掉顺序与明确性）',
      detect: ['就是步骤', '分成几步就行', '写下来就是'],
      gapType: 'mech',
      probe: '那如果我把这两步的顺序换一下，还能成功吗？',
    },
    {
      id: 'oneTask',
      label: '以为只解决这一道题',
      detect: ['只能做这个', '只解决这个', '就这一道'],
      gapType: 'transfer',
      probe: '换成给 30 个人分糖，这套步骤还能用吗？',
    },
  ],
  analogies: ['泡面说明书', '上学路线', '洗手七步'],
  ladder: [
    {
      level: 1,
      intent: '唤起"按步骤做事"的经验',
      ask: '你泡过方便面吗？你是怎么一步一步做的？',
      easier: '先做什么，再做什么？',
    },
    {
      level: 3,
      intent: '用反例逼出"顺序不能乱"',
      ask: '如果先把面吃了再倒热水，会怎么样？',
      easier: '顺序换了还行吗？',
    },
    {
      level: 2,
      intent: '逼出"每步要明确"',
      ask: '"放适量的水"—— 适量是多少？电脑能听懂"适量"吗？',
      easier: '电脑知道"适量"是几毫升吗？',
    },
    {
      level: 4,
      intent: '类比迁移',
      ask: '还有什么事情也是"按顺序一步一步做"的？',
      easier: '上学路上，你是怎么走的？',
    },
    {
      level: 5,
      intent: '追问"为什么要这样排"',
      ask: '为什么步骤的顺序这么重要？换个顺序就不行吗？',
      easier: '想想刚才泡面的例子。',
    },
    {
      level: 6,
      intent: '归纳',
      ask: '用一句话说说，算法到底是什么？',
      easier: '就说它由什么组成、有什么要求。',
    },
  ],
  feynmanInvite:
    '现在你当小老师：我是没学过"算法"的同桌，你讲给我听，让我也能照着做出一碗面。',
  feynmanProbes: ['那"放一点盐"我也能照着做吗？', '顺序反过来行不行？'],
}

// ---------------------------------------------------------------- AI

const AI: ConceptPack = {
  id: 'ai',
  name: '人工智能',
  aliases: ['人工智能', 'AI', '机器学习', '识图'],
  grade: '6 年级 · 人工智能初步',
  emoji: '🤖',
  coreIdea:
    'AI 不是像人一样"看懂"，它是从大量数据里找出数字上的规律；数据没覆盖到的情况，它可能出错。',
  checkpoints: [
    { id: 'data', label: 'AI 拿到的是数据/数字，不是"看"', keywords: ['数字', '数据', '像素', '一堆数'], required: true },
    { id: 'pattern', label: '它在找规律/共同点', keywords: ['规律', '共同点', '特征', '像不像', '模式'], required: true },
    { id: 'notUnderstand', label: '它不是真的"懂"，只是在匹配', keywords: ['不是真懂', '不是看懂', '并不是懂', '只是在找'], required: true },
    { id: 'limit', label: '数据没覆盖就会出错', keywords: ['没见过', '出错', '认错', '样本少', '很黑'], required: true },
  ],
  jargon: ['神经网络', '模型', '训练', '参数', '算法模型', '深度学习'],
  misconceptions: [
    {
      id: 'anthropo',
      label: '把 AI 拟人化（它"看到""知道"）',
      detect: ['它有眼睛', '它看到', '它知道', '它像人一样', '它思考'],
      gapType: 'def',
      probe: '手机有眼睛吗？如果没有眼睛，它拿到的到底是什么？',
    },
    {
      id: 'alwaysRight',
      label: '以为 AI 不会出错',
      detect: ['不会错', '一定对', '都很准', '不会认错'],
      gapType: 'edge',
      probe: '如果一只猫躲在黑屋子里，照片很暗，它还能认出来吗？',
    },
  ],
  analogies: ['找共同点', '认脸', '看很多张照片总结'],
  ladder: [
    {
      level: 1,
      intent: '唤起经验',
      ask: '你见过手机拍照能认出"这是猫"吗？你觉得它是怎么认出来的？',
      easier: '你拍照的时候，手机有没有框出人脸？',
    },
    {
      level: 5,
      intent: '逼出"没有眼睛"',
      ask: '你说"看到"。那手机有眼睛吗？如果没有眼睛，它拿到的是什么？',
      easier: '照片在电脑里是什么样子的？',
    },
    {
      level: 4,
      intent: '迁移到"找共同点"',
      ask: '我给你看 10 张猫的照片，你找出它们的共同点。你会找什么？',
      easier: '猫和狗比，多了什么？',
    },
    {
      level: 3,
      intent: '用反例逼出边界',
      ask: '如果一只猫躲在黑屋子里、照片很暗，AI 还能认出来吗？为什么？',
      easier: '它学过很暗的猫的照片吗？',
    },
    {
      level: 6,
      intent: '归纳',
      ask: '用一句话说说，AI 是怎么"学会"认猫的？',
      easier: '就说它看到了什么、在做什么。',
    },
  ],
  feynmanInvite:
    '现在你当小老师，讲给一个没学过的同桌听：AI 是怎么"学会"认猫的？',
  feynmanProbes: ['那它会不会把我的玩偶当成猫？为什么？', '它凭什么说这是猫？'],
}

// ---------------------------------------------------------------- 汇总

export const CONCEPT_PACKS: ConceptPack[] = [
  VARIABLE,
  LOOP,
  ALGORITHM,
  BINARY,
  PASSWORD,
  AI,
]

export const PACK_BY_ID: Record<string, ConceptPack> = Object.fromEntries(
  CONCEPT_PACKS.map((p) => [p.id, p]),
)

/** 按概念名（含别名）找底稿；找不到返回 undefined，让上层退回通用模式 */
export function findPack(concept: string): ConceptPack | undefined {
  const t = concept.trim()
  if (!t) return undefined
  const exact = CONCEPT_PACKS.find((p) => p.id === t || p.name === t)
  if (exact) return exact
  return CONCEPT_PACKS.find(
    (p) => t.includes(p.name) || p.aliases.some((a) => t.includes(a) || a.includes(t)),
  )
}

// ---------------------------------------------------------------- 判定工具

function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

/**
 * 宽松归一化：去掉中文虚词，避免"旧的就没了"匹配不上"旧的没"。
 * 只用于关键词比对，不影响语义判断。
 */
function loose(s: string): string {
  return norm(s).replace(/[的了就是会也都还很太呢吗吧啊呀嘛]/g, '')
}

/** 学生这句话命中了哪些理解点 */
export function matchCheckpoints(text: string, pack: ConceptPack): string[] {
  const t = loose(text)
  return pack.checkpoints
    .filter((c) => c.keywords.some((k) => t.includes(loose(k))))
    .map((c) => c.id)
}

/** 必答项覆盖度 0-1 */
export function requiredCoverage(text: string, pack: ConceptPack): number {
  const required = pack.checkpoints.filter((c) => c.required)
  if (required.length === 0) return 1
  const hit = matchCheckpoints(text, pack)
  return required.filter((c) => hit.includes(c.id)).length / required.length
}

/** 命中的典型错法（取第一个，避免多坑齐下） */
export function detectMisconception(text: string, pack: ConceptPack): Misconception | null {
  const t = loose(text)
  return pack.misconceptions.find((m) => m.detect.some((d) => t.includes(loose(d)))) ?? null
}

/** 术语审计：这句话里出现了哪些"小学生不该随口用"的词 */
export function auditJargon(text: string, pack: ConceptPack): string[] {
  const t = norm(text)
  return pack.jargon.filter((j) => {
    const k = norm(j)
    if (!t.includes(k)) return false

    // 概念名作为"被解释的对象"出现时是正常的：
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

    return true
  })
}

/** 是否打了生活比方（费曼评分用） */
export function hasAnalogy(text: string, pack?: ConceptPack): boolean {
  const t = norm(text)
  if (pack && pack.analogies.some((a) => t.includes(norm(a.split('的')[0])))) return true
  // 通用类比信号：像 / 好比 / 就跟……一样
  return /(像|好比|就跟|就像|等于说|打个比方|比方说)/.test(text)
}

/** 是否有因果/机制说明（费曼评分用） */
export function hasMechanism(text: string): boolean {
  return /(因为|所以|于是|就会|才|导致|原因是|这样的话|结果)/.test(text)
}

/** 本层该问什么：取阶梯里最接近的一档 */
export function pickLadder(pack: ConceptPack, level: number): LadderQuestion | undefined {
  const exact = pack.ladder.find((l) => l.level === level)
  if (exact) return exact
  // 退到最近的一档
  return [...pack.ladder].sort(
    (a, b) => Math.abs(a.level - level) - Math.abs(b.level - level),
  )[0]
}
