import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { slugOf, templateDocument, templateText } from '../src/templateFile.mjs'

/**
 * Saves inside-page templates from the tool while it runs on its dev server ("Save as template"),
 * as files in src/templates/<kind>/: <key>.json for the words and switches, <key>.jpg for the
 * picture. The published tool is static and has no way to save: its templates are these files,
 * built in, so a new one reaches everyone with the next push.
 */
const KINDS = ['title', 'label']
const EXAMPLE = 'example'
const LARGEST = 30 * 1024 * 1024
// Only the tool on this machine may write. Any page can send a request to localhost, but not as a localhost page.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9.-]+\.localhost)(:\d+)?$/

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = []
  let size = 0
  request.on('data', (chunk) => {
    size += chunk.length
    if (size > LARGEST) {
      reject(new Error('the template is too big to save'))
      request.destroy()
    } else chunks.push(chunk)
  })
  request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  request.on('error', reject)
})

/** Written whole or not at all, so the tool never reads half a file. */
async function writeWhole(file, content) {
  await writeFile(`${file}.part`, content)
  await rename(`${file}.part`, file)
}

/** When a template was first saved, so saving it again keeps its place in the list. */
async function firstSaved(file) {
  try {
    const { saved } = JSON.parse(await readFile(file, 'utf8'))
    return typeof saved === 'string' ? saved : null
  } catch {
    return null
  }
}

export function templatesServer() {
  return {
    name: 'tape-type-templates',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      const folder = path.join(root, 'src', 'templates')
      server.middlewares.use('/__templates', async (request, response) => {
        const answer = (status, body) => {
          response.statusCode = status
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify(body))
        }
        try {
          if (!LOCAL_ORIGIN.test(request.headers.origin ?? '')) return answer(403, { error: 'templates can only be saved from the tool on this machine' })
          if (request.method === 'POST') {
            if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) return answer(415, { error: 'send the template as JSON' })
            const sent = JSON.parse(await readBody(request))
            const name = typeof sent.name === 'string' ? sent.name.trim().slice(0, 60) : ''
            const key = slugOf(name)
            if (!key) return answer(400, { error: 'give it a name with a letter or a number in it' })
            if (key === EXAMPLE) return answer(400, { error: 'that name is kept for the examples' })
            if (!KINDS.includes(sent.kind)) return answer(400, { error: 'a template is a title page or a label page' })
            if (!sent.words || typeof sent.words !== 'object') return answer(400, { error: 'it has no words' })
            const photo = typeof sent.photo === 'string' ? /^data:image\/jpeg;base64,([A-Za-z0-9+/]+=*)$/.exec(sent.photo)?.[1] : null
            if (sent.photo && !photo) return answer(400, { error: 'its picture has to be a JPEG' })
            const where = path.join(folder, sent.kind)
            const file = path.join(where, `${key}.json`)
            await mkdir(where, { recursive: true })
            const now = new Date().toISOString()
            const saved = await firstSaved(file) ?? now
            // The picture first, so the template never names one that isn't there.
            if (photo) await writeWhole(path.join(where, `${key}.jpg`), Buffer.from(photo, 'base64'))
            await writeWhole(file, templateText(templateDocument({ ...sent, name, photo: photo ? sent.photo : null }, key, saved, now)))
            if (!photo) await rm(path.join(where, `${key}.jpg`), { force: true })
            return answer(200, { key, file: path.relative(root, file) })
          }
          if (request.method === 'DELETE') {
            const [, kind, key] = /^\/([a-z]+)\/([a-z0-9-]+)$/.exec(request.url ?? '') ?? []
            if (!KINDS.includes(kind) || !key || key === EXAMPLE) return answer(400, { error: 'there is no such template' })
            await rm(path.join(folder, kind, `${key}.json`), { force: true })
            await rm(path.join(folder, kind, `${key}.jpg`), { force: true })
            return answer(200, { key })
          }
          return answer(405, { error: 'templates are saved or removed, nothing else' })
        } catch (error) {
          return answer(500, { error: error instanceof Error ? error.message : 'the template could not be saved' })
        }
      })
    },
  }
}
