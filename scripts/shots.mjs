import puppeteer from 'puppeteer'

const URL = process.argv[2] ?? 'http://127.0.0.1:4173/'
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1.5 })
await page.goto(URL, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 800))

// 播放到中段，让对话与图谱都长出来
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.innerText.includes('播放完整过程'),
  )
  b?.click()
})
await new Promise((r) => setTimeout(r, 13000))
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.innerText.includes('播放中'),
  )
  if (b) b.click() // 暂停播放，避免截图时内容继续变化
})
await new Promise((r) => setTimeout(r, 400))
await page.screenshot({ path: 'docs/screenshot-main.png' })

// 护照
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.innerText.includes('生成学习护照'),
  )
  b?.click()
})
await new Promise((r) => setTimeout(r, 900))
await page.screenshot({ path: 'docs/screenshot-passport.png' })

console.log('screenshots saved')
await browser.close()
