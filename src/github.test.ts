import { describe, expect, it } from 'vitest'
import { fakeGitHub, happyGitHub } from './fakeGitHub'
import { GitHubError, commitFiles } from './github'

describe('saving to GitHub', () => {
  it('commits words, a picture and a removal to main in one go, with the key', async () => {
    const { fetcher, calls } = fakeGitHub(happyGitHub())
    const commit = await commitFiles('the-key', 'Add a template', [
      { path: 'src/templates/title/news.jpg', base64: 'AAAA' },
      { path: 'src/templates/title/news.json', text: '{}\n' },
      { path: 'src/templates/title/old.jpg', remove: true },
    ], fetcher)
    expect(commit).toBe('commit2')
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET git/ref/heads/main',
      'GET git/commits/head1',
      'POST git/blobs',
      'POST git/trees',
      'POST git/commits',
      'PATCH git/refs/heads/main',
    ])
    expect(calls.every((call) => call.headers.Authorization === 'Bearer the-key')).toBe(true)
    expect(calls[2].body).toEqual({ content: 'AAAA', encoding: 'base64' })
    expect(calls[3].body).toEqual({
      base_tree: 'tree1',
      tree: [
        { path: 'src/templates/title/news.jpg', mode: '100644', type: 'blob', sha: 'blob1' },
        { path: 'src/templates/title/news.json', mode: '100644', type: 'blob', content: '{}\n' },
        { path: 'src/templates/title/old.jpg', mode: '100644', type: 'blob', sha: null },
      ],
    })
    expect(calls[4].body).toEqual({ message: 'Add a template', tree: 'tree2', parents: ['head1'] })
    expect(calls[5].body).toEqual({ sha: 'commit2' })
  })

  it('starts again on top of main when main moved on meanwhile', async () => {
    const { fetcher, calls } = fakeGitHub({
      ...happyGitHub(),
      'GET git/ref/heads/main': (_, time) => ({ json: { object: { sha: time === 1 ? 'head1' : 'head2' } } }),
      'PATCH git/refs/heads/main': (_, time) => (time === 1 ? { status: 422 } : { json: {} }),
    })
    await commitFiles('the-key', 'Add a template', [{ path: 'a.json', text: '{}' }], fetcher)
    const commits = calls.filter((call) => call.method === 'POST' && call.path === 'git/commits')
    expect(commits.map((call) => call.body?.parents)).toEqual([['head1'], ['head2']])
  })

  it('says what went wrong, for the person saving', async () => {
    const failing = (status: number) => fakeGitHub({ 'GET git/ref/heads/main': () => ({ status }) }).fetcher
    await expect(commitFiles('bad', 'x', [], failing(401))).rejects.toThrow(/didn’t take the key/)
    await expect(commitFiles('bad', 'x', [], failing(403))).rejects.toThrow(/Read and write/)
    await expect(commitFiles('bad', 'x', [], failing(404))).rejects.toThrow(/can’t see the tool’s repository/)
    const offline = fakeGitHub({ 'GET git/ref/heads/main': () => 'offline' }).fetcher
    await expect(commitFiles('key', 'x', [], offline)).rejects.toThrow(/couldn’t be reached/)
    // Main that keeps moving is given up on after three goes.
    const moving = fakeGitHub({ ...happyGitHub(), 'PATCH git/refs/heads/main': () => ({ status: 422 }) })
    await expect(commitFiles('key', 'x', [], moving.fetcher)).rejects.toBeInstanceOf(GitHubError)
    expect(moving.calls.filter((call) => call.method === 'PATCH')).toHaveLength(3)
  })
})
