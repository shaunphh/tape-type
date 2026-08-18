import { writeFile } from 'node:fs/promises'

const targets = await fetch('http://127.0.0.1:9271/json').then((response) => response.json())
const target = targets.find((entry) => entry.type === 'page')
if (!target) throw new Error('No page target')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let id = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
})
const send = (method, params = {}) => new Promise((resolve) => {
  id += 1
  pending.set(id, resolve)
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return response.result.result.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false })
await new Promise((resolve) => setTimeout(resolve, 600))

const examples = []
for (let index = 0; index < 16; index += 1) {
  if (index) {
    await evaluate(`document.querySelector('.randomise-button').click()`)
    await new Promise((resolve) => setTimeout(resolve, 70))
  }
  examples.push(await evaluate(`(() => ({
    svg: document.querySelector('.artwork svg').outerHTML,
    seed: document.querySelector('.seed-control input').value,
    label: document.querySelector('.stage-coordinate.bottom-right').textContent
  }))()`))
}

await evaluate(`(() => {
  const examples = ${JSON.stringify(examples)}
  document.body.innerHTML = '<main class="sheet"><header><b>TEXT-DRIVEN CUTS</b><span>16 STRUCTURAL SEEDS</span></header><section>' + examples.map((item, index) => '<article><div>' + item.svg + '</div><footer><b>' + String(index + 1).padStart(2, '0') + '</b><span>' + item.label + '</span><i>' + item.seed + '</i></footer></article>').join('') + '</section></main>'
  const style = document.createElement('style')
  style.textContent = 'body{margin:0;background:#e9e7e1;color:#202020;font-family:Barlow,Arial}.sheet{padding:28px}.sheet>header{display:flex;justify-content:space-between;margin-bottom:18px;font:700 14px Barlow;letter-spacing:.12em}.sheet>section{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}article{background:#222;border:1px solid #444}article>div{display:grid;height:205px;padding:18px;place-items:center}svg{width:100%;max-height:175px;overflow:visible}footer{display:grid;grid-template-columns:28px 1fr auto;gap:8px;padding:9px 10px;color:#aaa;background:#181818;font-size:8px;letter-spacing:.08em;text-transform:uppercase}footer b{color:#fff}footer i{font-style:normal;color:#666}'
  document.head.appendChild(style)
})()`)
await new Promise((resolve) => setTimeout(resolve, 200))
const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
await writeFile('/private/tmp/tape-variation-sheet.png', screenshot.result.data, 'base64')
console.log(JSON.stringify(examples.map(({ seed, label }) => ({ seed, label })), null, 2))
socket.close()
