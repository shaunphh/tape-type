import { writeFile } from 'node:fs/promises'

const endpoint = process.argv[2] ?? 'http://127.0.0.1:9270/json'
const mobile = process.argv.includes('--mobile')
const exportsCheck = process.argv.includes('--exports')
const targets = await fetch(endpoint).then((response) => response.json())
const target = targets.find((entry) => entry.type === 'page')
if (!target) throw new Error('No browser page target found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let id = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  pending.get(message.id)(message)
  pending.delete(message.id)
})
const send = (method, params = {}) => new Promise((resolve) => {
  id += 1
  pending.set(id, resolve)
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.result.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails))
  return response.result.result.value
}
const wait = (duration = 120) => new Promise((resolve) => setTimeout(resolve, duration))

await send('Runtime.enable')
await send('Page.enable')
if (mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
} else {
  await send('Emulation.clearDeviceMetricsOverride')
}
await send('Page.reload', { ignoreCache: true })
await wait(800)
await evaluate(`localStorage.removeItem('tape-type-settings-v6')`)
await send('Page.reload', { ignoreCache: true })
await wait(500)

const metrics = await evaluate(`(() => {
  const selectors = ['.workspace','.preview-column','.preview-stage','.variation-bar','.export-bar','.artwork']
  return {
    viewport: innerWidth,
    bodyScroll: document.body.scrollWidth,
    htmlScroll: document.documentElement.scrollWidth,
    elements: Object.fromEntries(selectors.map(selector => {
      const node = document.querySelector(selector)
      const rect = node.getBoundingClientRect()
      return [selector, { left: rect.left, right: rect.right, width: rect.width, height: rect.height, scrollWidth: node.scrollWidth }]
    }))
  }
})()`)

const brandChecks = await evaluate(`(async () => {
  const wait = () => new Promise(resolve => setTimeout(resolve, 130))
  const textarea = document.querySelector('textarea')
  const setHeadline = async value => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
    await wait()
  }
  const svg = () => document.querySelector('.artwork svg')
  const fontSize = () => Number(svg().querySelector('text')?.getAttribute('font-size'))
  const lineCount = () => svg().querySelectorAll('text').length
  const status = () => document.querySelector('.fit-status')
  const setRange = async (label, value) => {
    const field = [...document.querySelectorAll('.range-field')].find(node => node.querySelector('.field-heading span')?.textContent === label)
    const input = field.querySelector('input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await wait()
  }
  const stripPadding = () => {
    const groups = [...svg().querySelectorAll('g[transform^="translate"] > g[transform^="rotate"]')]
    const paths = groups.slice(0, lineCount())
    const texts = groups.slice(lineCount())
    return paths.map((group, index) => group.querySelector('path').getBBox().width - texts[index].querySelector('text').getBBox().width)
  }

  const initial = {
    viewBox: svg().getAttribute('viewBox'),
    safeGuide: Boolean(svg().querySelector('.safe-guide')),
    fontFamily: svg().querySelector('text')?.getAttribute('font-family'),
    computedFontFamily: getComputedStyle(svg().querySelector('text')).fontFamily,
    fontLoaded: document.fonts.check('700 ' + fontSize() + 'px "Barlow"'),
    matchingFaces: [...document.fonts].filter(face => face.family.includes('Barlow') && face.weight === '700').map(face => ({ family: face.family, weight: face.weight, status: face.status })),
    fontResources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('barlow')).map(entry => ({ name: entry.name, bytes: entry.transferSize })),
    fontWeight: svg().querySelector('text')?.getAttribute('font-weight'),
    fontSize: fontSize(),
    lineCount: lineCount(),
    fitError: status().classList.contains('error'),
    cling: document.querySelector('.composition-ranges .range-field output')?.textContent,
    padding: stripPadding(),
  }

  await setHeadline('A short Dublin headline')
  const shortSize = fontSize()
  await setHeadline('A deliberately longer Dublin headline that moves through the approved flexible cover headline zone')
  const longSize = fontSize()
  await setHeadline('This is an intentionally excessive cover headline that keeps adding words until the four line limit cannot possibly contain the complete message within the approved minimum type size and therefore has to ask an editor to shorten it')
  const overflow = { size: fontSize(), lineCount: lineCount(), flagged: status().classList.contains('error') }

  await setHeadline('How to Make the Most of a Weekend Visit to Dublin')
  const formatButtons = [...document.querySelectorAll('.brand-format-section .piece-toggle button')]
  formatButtons[1].click()
  await wait()
  const series = { size: fontSize(), maxLinesLabel: status().textContent, fontWeight: svg().querySelector('text')?.getAttribute('font-weight') }
  formatButtons[0].click()
  await wait()

  const autoToggle = document.querySelector('.auto-size-toggle input')
  autoToggle.click()
  await wait()
  await setRange('Cover size', 80)
  const manualSize = fontSize()
  autoToggle.click()
  await wait()
  await setRange('Tape cling', 1.16)
  const overCling = { value: document.querySelector('.composition-ranges .range-field output')?.textContent, padding: stripPadding() }
  await setRange('Tape cling', 1.08)

  return { initial, shortSize, longSize, overflow, series, manualSize, overCling }
})()`)

const beforeSeed = await evaluate(`Number(document.querySelector('.seed-control input').value)`)
await evaluate(`document.querySelector('.randomise-button').click()`)
await wait()
const afterSeed = await evaluate(`Number(document.querySelector('.seed-control input').value)`)

let exportDetails = null
if (exportsCheck) {
  await evaluate(`(() => {
    window.__tapeClipboard = ''
    window.__tapeDownloads = []
    navigator.clipboard.writeText = async value => { window.__tapeClipboard = value }
    HTMLAnchorElement.prototype.click = function () {
      const filename = this.download
      fetch(this.href).then(response => response.blob()).then(async blob => {
        const result = { filename, bytes: blob.size, type: blob.type }
        if (blob.type === 'image/png') {
          const bytes = new Uint8Array(await blob.arrayBuffer())
          const view = new DataView(bytes.buffer)
          result.width = view.getUint32(16)
          result.height = view.getUint32(20)
        }
        window.__tapeDownloads.push(result)
      })
    }
  })()`)
  const clickButton = async (label, pause = 500) => {
    await evaluate(`[...document.querySelectorAll('.export-actions button')].find(button => button.textContent.includes('${label}')).click()`)
    await wait(pause)
  }
  await clickButton('Copy SVG', 180)
  const clipboard = await evaluate(`window.__tapeClipboard`)
  await clickButton('Cutout SVG')
  await clickButton('PNG 1×', 900)
  await clickButton('PNG 2×', 1200)
  await clickButton('PNG 3×', 1800)
  await clickButton('Full SVG')
  const files = await evaluate(`window.__tapeDownloads`)
  exportDetails = {
    clipboardIsFullArtboardSvg: clipboard.startsWith('<svg') && clipboard.includes('viewBox="0 0 1080 1350"') && clipboard.includes('<path') && clipboard.includes('<text'),
    files,
  }
}

const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !mobile })
await writeFile(mobile ? '/private/tmp/tape-brand-mobile.png' : '/private/tmp/tape-brand-desktop.png', screenshot.result.data, 'base64')
console.log(JSON.stringify({
  metrics,
  noHorizontalOverflow: metrics.bodyScroll <= metrics.viewport && metrics.htmlScroll <= metrics.viewport,
  brandChecks,
  interaction: { beforeSeed, afterSeed, changed: beforeSeed !== afterSeed },
  exportDetails,
}, null, 2))
socket.close()
