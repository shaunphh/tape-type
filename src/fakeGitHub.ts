import { REPOSITORY } from './github'

/** For the tests: a stand-in for GitHub's API, so saving can be tried without touching the repository. */
type Answer = { status?: number; json?: unknown } | 'offline'
interface Call { method: string; path: string; body: Record<string, unknown> | undefined; headers: Record<string, string> }

/** A stand-in for GitHub: each call is answered by name ("POST git/trees"), and every call is kept. */
export function fakeGitHub(answers: Record<string, (body: Record<string, unknown> | undefined, time: number) => Answer>) {
  const calls: Call[] = []
  const times: Record<string, number> = {}
  const fetcher = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const path = String(url).replace(`https://api.github.com/repos/${REPOSITORY}/`, '')
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    calls.push({ method, path, body, headers: init.headers as Record<string, string> })
    // A commit is asked for by its sha: all of them answer to the one name.
    const name = `${method} ${path.replace(/^git\/commits\/[0-9a-z]+$/, 'git/commits/:sha')}`
    times[name] = (times[name] ?? 0) + 1
    const answer = answers[name]?.(body, times[name]) ?? { status: 404 }
    if (answer === 'offline') throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(answer.json ?? {}), { status: answer.status ?? 200 })
  }) as typeof fetch
  return { fetcher, calls }
}

/** GitHub as it answers when all goes well, with main at `head`. */
export const happyGitHub = (head = 'head1') => ({
  'GET git/ref/heads/main': () => ({ json: { object: { sha: head } } }),
  'GET git/commits/:sha': () => ({ json: { tree: { sha: 'tree1' } } }),
  'POST git/blobs': () => ({ json: { sha: 'blob1' } }),
  'POST git/trees': () => ({ json: { sha: 'tree2' } }),
  'POST git/commits': () => ({ json: { sha: 'commit2' } }),
  'PATCH git/refs/heads/main': () => ({ json: {} }),
})
