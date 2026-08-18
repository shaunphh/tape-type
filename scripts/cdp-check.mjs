import { mkdtemp, readdir, stat, writeFile } from 'node:fs/promises'

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
  if (response.result.exceptionDetails) throw new Error(response.result.exceptionDetails.text)
  return response.result.result.value
}

await send('Runtime.enable')
await send('Page.enable')
if (mobile) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await send('Page.reload', { ignoreCache: true })
}
await new Promise((resolve) => setTimeout(resolve, 600))

const metrics = await evaluate(`(() => {
  const selectors = ['.workspace','.preview-column','.preview-stage','.variation-bar','.export-bar','.artwork']
  return {
    viewport: innerWidth,
    bodyScroll: document.body.scrollWidth,
    htmlScroll: document.documentElement.scrollWidth,
    elements: Object.fromEntries(selectors.map(selector => {
      const node = document.querySelector(selector)
      const rect = node.getBoundingClientRect()
      return [selector, { left: rect.left, right: rect.right, width: rect.width, scrollWidth: node.scrollWidth }]
    }))
  }
})()`)

const beforeSeed = await evaluate(`Number(document.querySelector('.seed-control input').value)`)
await evaluate(`document.querySelector('.randomise-button').click()`)
await new Promise((resolve) => setTimeout(resolve, 100))
const afterSeed = await evaluate(`Number(document.querySelector('.seed-control input').value)`)
const svgDetails = await evaluate(`(() => {
  const svg = document.querySelector('.artwork svg')
  const path = svg.querySelector('path')
  return {
    viewBox: svg.getAttribute('viewBox'),
    pathLength: path.getAttribute('d').length,
    textLines: svg.querySelectorAll('text').length,
    shapeOnlyButton: [...document.querySelectorAll('.export-actions button')].some(button => button.textContent.includes('Shape only')),
    pngButton: [...document.querySelectorAll('.export-actions button')].some(button => button.textContent.includes('PNG')),
    persisted: Boolean(localStorage.getItem('tape-type-settings-v4')),
  }
})()`)

const compositionDetails = await evaluate(`(async () => {
  const wait = () => new Promise(resolve => setTimeout(resolve, 90))
  const svg = () => document.querySelector('.artwork svg')
  const setRange = async (label, value) => {
    const field = [...document.querySelectorAll('.range-field')].find(node => node.querySelector('.field-heading span').textContent === label)
    const input = field.querySelector('input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await wait()
  }
  const initialPathCount = svg().querySelectorAll('path').length
  const capsToggle = document.querySelectorAll('.quick-toggles input')[0]
  if (!capsToggle.checked) capsToggle.click()
  await wait()
  const allCapsApplied = [...svg().querySelectorAll('text')].every(node => node.textContent === node.textContent.toLocaleUpperCase())
  await setRange('Rotation variance', 1.2)
  const rotations = [...svg().querySelectorAll('g[transform^="rotate"]')].map(node => node.getAttribute('transform'))
  const restrainedRotationApplied = rotations.some(value => !value.startsWith('rotate(0 ')) && rotations.every(value => Math.abs(Number(value.match(/rotate\\((-?[\\d.]+)/)[1])) <= 1.2)
  await setRange('Line gap', 2)
  const initialHeight = Number(svg().getAttribute('viewBox').split(' ')[3])
  await setRange('Line gap', 12)
  const expandedHeight = Number(svg().getAttribute('viewBox').split(' ')[3])
  await setRange('Tape cling', 1)
  const initialWidth = Number(svg().getAttribute('viewBox').split(' ')[2])
  await setRange('Tape cling', 0.72)
  const looserWidth = Number(svg().getAttribute('viewBox').split(' ')[2])
  document.querySelectorAll('.piece-toggle button')[0].click()
  await wait()
  const connectedPathCount = svg().querySelectorAll('path').length
  document.querySelectorAll('.piece-toggle button')[1].click()
  await wait()
  await setRange('Weight', 400)
  const weight400Applied = [...svg().querySelectorAll('text')].every(node => node.getAttribute('font-weight') === '400')
  await setRange('Weight', 800)
  const weight800Applied = [...svg().querySelectorAll('text')].every(node => node.getAttribute('font-weight') === '800')
  const textColorInput = document.querySelector('.text-color-picker input')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(textColorInput, '#ff00aa')
  textColorInput.dispatchEvent(new Event('input', { bubbles: true }))
  textColorInput.dispatchEvent(new Event('change', { bubbles: true }))
  await wait()
  const customTextColorApplied = [...svg().querySelectorAll('text')].every(node => node.getAttribute('fill') === '#ff00aa')
  return {
    initialPathCount,
    allCapsApplied,
    restrainedRotationApplied,
    expandedGapIncreasesHeight: expandedHeight > initialHeight,
    looserClingIncreasesWidth: looserWidth > initialWidth,
    connectedPathCount,
    separatePathCountAfterToggle: svg().querySelectorAll('path').length,
    weight400Applied,
    weight800Applied,
    customTextColorApplied,
  }
})()`)

const fontDetails = await evaluate(`(async () => {
  const select = document.querySelector('.typography-grid select')
  const families = ['Barlow Condensed', 'Barlow Semi Condensed', 'Barlow']
  const results = []
  for (const family of families) {
    select.value = family
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 80))
    await Promise.all([400, 500, 600, 700, 800].map(weight => document.fonts.load(weight + ' 76px "' + family + '"')))
    const svg = document.querySelector('.artwork svg')
    results.push({
      family,
      loaded: [400, 500, 600, 700, 800].every(weight => document.fonts.check(weight + ' 76px "' + family + '"')),
      loadedWeights: [400, 500, 600, 700, 800].filter(weight => document.fonts.check(weight + ' 76px "' + family + '"')),
      renderedFamily: svg.querySelector('text').getAttribute('font-family'),
      viewBox: svg.getAttribute('viewBox'),
    })
  }
  return results
})()`)

let exportDetails = null
if (exportsCheck) {
  const downloadPath = await mkdtemp('/private/tmp/tape-exports-')
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath, eventsEnabled: true })
  await send('Browser.grantPermissions', { origin: 'http://127.0.0.1:5195', permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] })
  await evaluate(`document.querySelectorAll('.export-actions button')[0].click()`)
  await new Promise((resolve) => setTimeout(resolve, 150))
  const clipboard = await evaluate(`navigator.clipboard.readText()`)
  for (const index of [1, 2, 3]) {
    await evaluate(`document.querySelectorAll('.export-actions button')[${index}].click()`)
    await new Promise((resolve) => setTimeout(resolve, 450))
  }
  const filenames = await readdir(downloadPath)
  const files = await Promise.all(filenames.map(async (filename) => ({
    filename,
    bytes: (await stat(`${downloadPath}/${filename}`)).size,
  })))
  exportDetails = {
    clipboardIsSvg: clipboard.startsWith('<svg') && clipboard.includes('<path') && clipboard.includes('<text'),
    clipboardHasCustomTextColor: clipboard.includes('#ff00aa'),
    clipboardLength: clipboard.length,
    files,
  }
}

console.log(JSON.stringify({ metrics, interaction: { beforeSeed, afterSeed, changed: beforeSeed !== afterSeed }, svgDetails, compositionDetails, fontDetails, exportDetails }, null, 2))
if (mobile) {
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile('/private/tmp/tape-mobile-cdp.png', screenshot.result.data, 'base64')
}
socket.close()
