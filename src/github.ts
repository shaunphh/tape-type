/**
 * Saving templates from the published tool, which is a static site and can't write files of its
 * own: they go straight into the repository on GitHub, as one commit on main each time, and the
 * Pages workflow then publishes them. It takes a GitHub key: a fine-grained token for this
 * repository only, with Contents set to read and write. The key is kept in this browser alone and
 * only ever sent to GitHub.
 */
export const REPOSITORY = 'shaunphh/tape-type'
const BRANCH = 'main'
const API = 'https://api.github.com'
export const KEY_STORAGE = 'tape-type-github-key-v1'
/** Where a key is made: fine-grained tokens, in GitHub's settings. */
export const NEW_KEY_URL = 'https://github.com/settings/personal-access-tokens/new'

export function loadKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function storeKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    // Blocked storage: the key lasts as long as the page.
  }
}

/** A change to one file: its text, its bytes (base64), or its removal. */
export type FileChange =
  | { path: string; text: string }
  | { path: string; base64: string }
  | { path: string; remove: true }

export class GitHubError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** What went wrong, said for the person saving. */
function explain(status: number) {
  if (status === 401) return 'GitHub didn’t take the key. It may be mistyped, or have run out: make a new one'
  if (status === 403) return 'the key can’t write to the tool. It needs Contents set to “Read and write” for shaunphh/tape-type'
  if (status === 404) return 'GitHub can’t see the tool’s repository with this key. Give the key access to shaunphh/tape-type'
  if (status === 409 || status === 422) return 'GitHub turned the change down. Try again in a moment'
  return `GitHub answered ${status}`
}

/**
 * Commits the changes to main in one go, and answers with the new commit. If main moves on while
 * the commit is made (another save, say), it starts again from where main then is.
 */
export async function commitFiles(key: string, message: string, changes: FileChange[], fetcher: typeof fetch = fetch): Promise<string> {
  const call = async <T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> => {
    let response: Response
    try {
      response = await fetcher(`${API}/repos/${REPOSITORY}/${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${key}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new GitHubError(0, 'GitHub couldn’t be reached. Check the connection and try again')
    }
    if (!response.ok) throw new GitHubError(response.status, explain(response.status))
    return response.json() as Promise<T>
  }

  for (let attempt = 1; ; attempt += 1) {
    const head = (await call<{ object: { sha: string } }>(`git/ref/heads/${BRANCH}`)).object.sha
    const base = (await call<{ tree: { sha: string } }>(`git/commits/${head}`)).tree.sha
    // Pictures go up as blobs of their own; words go in the tree as text; a removal is a path with nothing in it.
    const tree = await Promise.all(changes.map(async (change) => {
      const entry = { path: change.path, mode: '100644', type: 'blob' }
      if ('remove' in change) return { ...entry, sha: null }
      if ('text' in change) return { ...entry, content: change.text }
      return { ...entry, sha: (await call<{ sha: string }>('git/blobs', { content: change.base64, encoding: 'base64' })).sha }
    }))
    const made = (await call<{ sha: string }>('git/trees', { base_tree: base, tree })).sha
    const commit = (await call<{ sha: string }>('git/commits', { message, tree: made, parents: [head] })).sha
    try {
      await call(`git/refs/heads/${BRANCH}`, { sha: commit }, 'PATCH')
      return commit
    } catch (error) {
      // Main moved on: this commit no longer follows it, so make it again on top of where it is now.
      if (error instanceof GitHubError && error.status === 422 && attempt < 3) continue
      throw error
    }
  }
}
