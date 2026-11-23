import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'
import { launch } from './cdp.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'docs/screenshots')
const plugin = JSON.parse(fs.readFileSync(path.join(root, 'utools/plugin.json'), 'utf8'))
fs.mkdirSync(out, { recursive: true })

const server = await preview({
  root,
  build: { outDir: 'utools/dist' },
  preview: { host: '127.0.0.1', port: 0, open: false },
})

let browser
try {
  browser = await launch({ url: server.resolvedUrls.local[0] })
  const { session } = browser
  const errors = []
  const externalRequests = []

  session.on('Runtime.exceptionThrown', (event) => {
    errors.push(event.exceptionDetails.exception?.description ?? event.exceptionDetails.text)
  })
  session.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error') {
      errors.push(args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
  })
  session.on('Log.entryAdded', ({ entry }) => {
    if (entry.level === 'error') errors.push(entry.text)
  })
  session.on('Network.requestWillBeSent', ({ request }) => {
    if (/^https?:/.test(request.url) && new URL(request.url).hostname !== '127.0.0.1') {
      externalRequests.push(request.url)
    }
  })

  await session.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  })

  async function setViewport(width, height = plugin.pluginSetting.height) {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false,
    })
  }

  async function raf(times = 2) {
    for (let i = 0; i < times; i += 1) {
      await session.evaluate('new Promise(resolve => requestAnimationFrame(resolve))')
    }
  }

  async function click(selector) {
    const ok = await session.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`)
    assert.equal(ok, true, `找不到元素: ${selector}`)
    await raf(2)
  }

  async function capture(name) {
    await session.evaluate('document.fonts.ready')
    await raf(2)
    const overflow = await session.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    assert.equal(overflow, false, `${name}: 出现横向溢出`)
    const { cssContentSize } = await session.send('Page.getLayoutMetrics')
    assert.ok(
      cssContentSize.height <= plugin.pluginSetting.height,
      `${name}: 页面高度超出 ${plugin.pluginSetting.height}px，实际 ${cssContentSize.height}px`,
    )
    const result = await session.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(result.data, 'base64'))
    process.stdout.write(`${name}.png (${cssContentSize.width} × ${cssContentSize.height})\n`)
  }

  await setViewport(800)
  await browser.navigate()
  await session.waitForExpression('document.querySelector("[data-testid=overview-grid]") !== null')
  await session.evaluate('document.fonts.ready')
  await raf(3)

  // 1. Overview 15-tool Studio Card Grid (light)
  await capture('home')

  // 2. 10-Format Converter split workspace (JSON -> YAML)
  await click('[data-testid="tool-card-convert"]')
  await session.waitForExpression('document.querySelector("[data-testid=tool-convert]") !== null')
  await capture('convert')

  // 3. Regex Lab with live highlighted matches & capture groups table
  await click('[data-testid="nav-tool-regex"]')
  await session.waitForExpression('document.querySelector("[data-testid=regex-groups-table]") !== null')
  await capture('regex')

  // 4. Cron Parser showing human explanation & next 10 run timestamps
  await click('[data-testid="nav-tool-cron"]')
  await session.waitForExpression('document.querySelector("[data-testid=cron-runs-table]") !== null')
  await capture('cron')

  // 5. Dark mode Studio view (Hash & HMAC workspace)
  await click('[data-testid="nav-tool-hash"]')
  await session.waitForExpression('document.querySelector("[data-testid=hash-row-sha256]") !== null')
  // Cycle theme: system -> light -> dark
  await click('[data-testid="theme-btn"]')
  await click('[data-testid="theme-btn"]')
  await session.waitForExpression('document.documentElement.dataset.theme === "dark"')
  await capture('dark')

  // Verify narrow mobile viewport (375px) has zero horizontal overflow
  await setViewport(375, 720)
  await raf(2)
  const mobileOverflow = await session.evaluate('document.documentElement.scrollWidth > window.innerWidth')
  assert.equal(mobileOverflow, false, '375px 窄屏出现横向溢出')

  assert.deepEqual(errors, [], '浏览器运行报错')
  assert.deepEqual(externalRequests, [], '不应请求任何外部网络资源')
  process.stdout.write('FunData 浏览器检查与 5 张截图全部通过。\n')
} catch (err) {
  if (browser) {
    try {
      const html = await browser.session.evaluate('document.body.innerHTML.slice(0, 400)')
      console.error('[screenshots] body snippet:', html)
    } catch {
      // ignore
    }
  }
  throw err
} finally {
  await browser?.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
