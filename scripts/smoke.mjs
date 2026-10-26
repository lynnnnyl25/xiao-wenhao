/**
 * 冒烟测试 v2：验证新增的教学内核能力在真实浏览器里生效
 */
import puppeteer from 'puppeteer'

const URL = process.argv[2] ?? 'http://127.0.0.1:4173/'
const out = []
const ok = (m) => out.push(`  ✓ ${m}`)
const bad = (m) => out.push(`  ✗ ${m}`)
let failures = 0

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

console.log(`▸ ${URL}`)
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })

const title = await page.$eval('header', (el) => el.innerText.replace(/\n/g, ' | '))
if (title.includes('小问号')) ok('页面挂载')
else { bad('未挂载'); failures++ }

// 播放
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('播放完整过程'))
  b?.click()
})
await new Promise((r) => setTimeout(r, 27000))

const bubbles = await page.$$eval('.bubble', (b) => b.length)
if (bubbles >= 14) ok(`对话 ${bubbles} 条`)
else { bad(`对话仅 ${bubbles} 条`); failures++ }

// 五项指标都在
const text = await page.evaluate(() => document.body.innerText)
for (const k of ['答问比', '泄露率', '诱导率', '一问一题', '闭合率', '护栏通过']) {
  if (text.includes(k)) ok(`指标「${k}」存在`)
  else { bad(`指标「${k}」缺失`); failures++ }
}

// 提问动作标签（L 层级或动作名）
const hasMove = await page.$$eval('.bubble', (bs) =>
  bs.some((b) => /澄清|举例|反例|追问理由|追问后果|换情境|归纳|降阶重问/.test(b.innerText)),
)
if (hasMove) ok('对话气泡显示提问动作标签')
else { bad('未显示提问动作标签'); failures++ }

// 学生回答分类标签
const hasKind = await page.$$eval('.bubble', (bs) =>
  bs.some((b) => /说不会|背规则|用术语|典型错法|说到一半|说全了|跑题|太笼统/.test(b.innerText)),
)
if (hasKind) ok('学生回答显示分类标签')
else { bad('未显示回答分类'); failures++ }

// 复盘视图
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('教学复盘'))
  b?.click()
})
await new Promise((r) => setTimeout(r, 900))
const rev = await page.evaluate(() => document.body.innerText)
if (rev.includes('提问动作序列')) ok('教学复盘可打开')
else { bad('复盘未打开'); failures++ }
if (/哪种问法最有效/.test(rev)) ok('复盘含"问法有效性"')
else { bad('复盘缺问法有效性'); failures++ }
if (/下一步怎么教/.test(rev)) ok('复盘含"下一步建议"')
else { bad('复盘缺建议'); failures++ }

await page.screenshot({ path: 'docs/screenshot-review.png' })

// 关闭复盘 → 打开护照
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '关闭')
  b?.click()
})
await new Promise((r) => setTimeout(r, 500))
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('学习护照'))
  b?.click()
})
await new Promise((r) => setTimeout(r, 800))
const pp = await page.evaluate(() => document.body.innerText)
if (pp.includes('学习护照')) ok('学习护照可打开')
else { bad('护照未打开'); failures++ }

console.log('\n结果：')
console.log(out.join('\n'))
if (errors.length) {
  console.log('\n控制台错误：')
  console.log([...new Set(errors)].slice(0, 8).join('\n'))
}
console.log(`\n失败 ${failures} · 错误 ${errors.length}`)

await browser.close()
process.exit(failures === 0 && errors.length === 0 ? 0 : 1)
