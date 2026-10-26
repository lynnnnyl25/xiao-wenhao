/**
 * 冒烟测试：驱动真实浏览器跑一遍体验模式，验证
 *   1. 页面能加载、React 能挂载
 *   2. 点「播放完整过程」后对话气泡与缺口图谱真的长出来
 *   3. 护栏三指标真的被统计出来
 *   4. 学习护照能打开
 * 不依赖 API Key（走体验模式），不依赖视觉。
 */
import puppeteer from 'puppeteer'

const URL = process.argv[2] ?? 'http://127.0.0.1:4173/'
const out = []
const ok = (m) => out.push(`  ✓ ${m}`)
const bad = (m) => out.push(`  ✗ ${m}`)
let failures = 0

const browser = await puppeteer.launch({
  headless: 'new',
  // 使用本机已安装的 Chrome，避免下载 Chromium
  executablePath:
    process.env.CHROME_PATH ??
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

console.log(`▸ 打开 ${URL}`)
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })

// ---- 1. 挂载
const title = await page.$eval('header', (el) => el.innerText)
if (title.includes('小问号')) ok(`页面挂载：${title.split('\n')[1] ?? ''}`.trim())
else { bad('页面未挂载'); failures++ }

// ---- 2. 默认进入体验模式
const demoBtn = await page.$$eval('button', (bs) =>
  bs.filter((b) => b.innerText.includes('播放完整过程')).length,
)
if (demoBtn > 0) ok('默认进入体验模式（有播放按钮）')
else { bad('未进入体验模式'); failures++ }

// ---- 3. 播放整段
console.log('▸ 播放完整过程…')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.innerText.includes('播放完整过程'),
  )
  b?.click()
})

// 每段 2.6s，变量脚本 9 段 ≈ 24s；留足时间
await new Promise((r) => setTimeout(r, 27000))

const bubbles = await page.$$eval('.bubble', (bs) => bs.length)
if (bubbles >= 14) ok(`对话气泡生成：${bubbles} 条`)
else { bad(`气泡过少：${bubbles}`); failures++ }

const hasStudent = await page.$$eval('.bubble', (bs) =>
  bs.some((b) => b.innerText.includes('🧒')),
)
const hasAi = await page.$$eval('.bubble', (bs) => bs.some((b) => b.innerText.includes('小问号')))
if (hasStudent && hasAi) ok('师生双方发言齐全')
else { bad('缺少某一方发言'); failures++ }

// ---- 4. 缺口图谱
const gapItems = await page.$$eval('li', (ls) =>
  ls.filter((l) => l.innerText.includes('他说：')).length,
)
if (gapItems >= 3) ok(`缺口证据链生成：${gapItems} 条`)
else { bad(`证据链过少：${gapItems}`); failures++ }

const radar = await page.$$eval('svg polygon', (p) => p.length)
if (radar >= 2) ok(`雷达图渲染：${radar} 个多边形`)
else { bad('雷达图未渲染'); failures++ }

const metrics = await page.evaluate(() => document.body.innerText)
for (const [name, okRe] of [
  ['答问比', /答问比/],
  ['泄露率', /泄露率/],
  ['闭合率', /闭合率/],
  ['护栏自检', /拒答护栏自检/],
]) {
  if (okRe.test(metrics)) ok(`${name} 面板存在`)
  else { bad(`${name} 缺失`); failures++ }
}

// ---- 5. 护照
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.innerText.includes('生成学习护照'),
  )
  b?.click()
})
await new Promise((r) => setTimeout(r, 1200))
const passport = await page.evaluate(() => document.body.innerText)
if (passport.includes('学习护照')) ok('学习护照可打开')
else { bad('护照未打开'); failures++ }
if (/今天我讲清楚了/.test(passport)) ok('护照含"讲清楚了"段落')
else { bad('护照缺闭合段落'); failures++ }

await page.keyboard.press('Escape')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '关闭')
  b?.click()
})

// ---- 6. 切到真模型模式
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '真模型')
  b?.click()
})
await new Promise((r) => setTimeout(r, 600))
const live = await page.evaluate(() => document.body.innerText)
if (live.includes('先选一个今天要搞懂的东西')) ok('真模型模式可切换（概念选择页）')
else { bad('真模型模式切换异常'); failures++ }

console.log('\n冒烟结果：')
console.log(out.join('\n'))
if (errors.length) {
  console.log('\n浏览器错误：')
  console.log([...new Set(errors)].slice(0, 10).join('\n'))
}
console.log(`\n失败项：${failures}，控制台错误：${errors.length}`)

await browser.close()
process.exit(failures === 0 && errors.length === 0 ? 0 : 1)
