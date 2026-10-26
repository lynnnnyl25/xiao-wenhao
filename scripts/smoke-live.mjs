/**
 * 线上冒烟：直接验证已部署的公网链接（评委看到的就是这个）
 */
import puppeteer from 'puppeteer'

const URL = process.argv[2]
if (!URL) {
  console.error('用法: node scripts/smoke-live.mjs <url>')
  process.exit(2)
}

const out = []
const ok = (m) => out.push(`  ✓ ${m}`)
const bad = (m) => out.push(`  ✗ ${m}`)
let failures = 0
const errors = []

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 2 })
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

console.log(`▸ 线上地址 ${URL}`)
const resp = await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
if (resp && resp.status() === 200) ok(`HTTP ${resp.status()}`)
else { bad(`HTTP ${resp?.status()}`); failures++ }

// 页面真的挂载了吗
await page.waitForSelector('header', { timeout: 20000 })
const title = await page.$eval('header', (el) => el.innerText.replace(/\n/g, ' | '))
if (title.includes('小问号')) ok(`React 挂载：${title}`)
else { bad('未挂载'); failures++ }

// 播放
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.innerText.includes('播放完整过程'),
  )
  b?.click()
})
await new Promise((r) => setTimeout(r, 27000))

const bubbles = await page.$$eval('.bubble', (b) => b.length)
if (bubbles >= 14) ok(`对话气泡 ${bubbles} 条`)
else { bad(`气泡 ${bubbles} 条`); failures++ }

const gaps = await page.$$eval('li', (ls) => ls.filter((l) => l.innerText.includes('他说：')).length)
if (gaps >= 3) ok(`缺口证据链 ${gaps} 条`)
else { bad(`证据链 ${gaps} 条`); failures++ }

const polys = await page.$$eval('svg polygon', (p) => p.length)
if (polys >= 2) ok(`雷达图 ${polys} 个多边形`)
else { bad('雷达图缺失'); failures++ }

// 五段脚本都在
const scriptBtns = await page.$$eval('button', (bs) =>
  bs.filter((b) => /📦|🔐|💡|🔁|🤖/.test(b.innerText)).length,
)
if (scriptBtns >= 5) ok(`回放脚本 ${scriptBtns} 段可选`)
else { bad(`脚本仅 ${scriptBtns} 段`); failures++ }

// 护照
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.innerText.includes('生成学习护照'),
  )
  b?.click()
})
await new Promise((r) => setTimeout(r, 1200))
const txt = await page.evaluate(() => document.body.innerText)
if (/学习护照/.test(txt) && /今天我讲清楚了/.test(txt)) ok('学习护照可打开且含闭合记录')
else { bad('护照异常'); failures++ }

await page.screenshot({ path: 'docs/screenshot-live.png' })

console.log('\n线上验证结果：')
console.log(out.join('\n'))
if (errors.length) {
  console.log('\n控制台错误：')
  console.log([...new Set(errors)].slice(0, 8).join('\n'))
}
console.log(`\n失败项: ${failures} | 控制台错误: ${errors.length}`)

await browser.close()
process.exit(failures === 0 && errors.length === 0 ? 0 : 1)
