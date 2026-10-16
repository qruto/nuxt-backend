import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { enrichPage, lastCommitDates } from '../../website/modules/docs-pages'
import { read } from './helpers'

// Nitro's runtime only loads inside a Nitro build; its plugin helper is
// the identity.
vi.mock('nitropack/runtime', () => ({ defineNitroPlugin: (plugin: unknown) => plugin }))

// What the docs build adds to each page (website/modules/docs-pages.ts) and
// to the Markdown agents read (website/server/plugins/agent-page-keys.ts):
// the date of each page's last commit, where the sitemap and the aside find
// it, and the header's keys, only where agents read them.

describe('last-updated dates from git', () => {
  // A git hook (pre-push runs the tests) exports GIT_DIR and GIT_INDEX_FILE
  // for the repository being pushed: left in, every command below would
  // write to it instead of the throwaway one.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, env, encoding: 'utf8' })
  const commit = (repo: string, files: string[], date: string) => {
    for (const file of files) writeFileSync(join(repo, 'content', file), `${file} ${date}\n`)
    git(repo, 'add', '.')
    execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', files.join(' ')], { cwd: repo, env: { ...env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } })
  }
  const repository = (prefix: string) => {
    const repo = mkdtempSync(join(tmpdir(), prefix))
    mkdirSync(join(repo, 'content'))
    git(repo, 'init', '-q')
    return repo
  }

  let origin: string
  beforeAll(() => {
    origin = repository('docs-pages-')
    commit(origin, ['@odd.md', 'ünïcode.md', 'with space.md'], '2026-01-02T03:04:05+00:00')
    commit(origin, ['plain.md'], '2026-02-03T04:05:06+00:00')
    commit(origin, ['@odd.md'], '2026-03-04T05:06:07+00:00')
  })

  afterAll(() => rmSync(origin, { recursive: true, force: true }))

  // Unquoted, NUL-separated: a name with an accent or a space reads back as
  // written, and one that starts with `@` is a file, not a commit.
  it('reads every file name as written', () => {
    const dates = lastCommitDates(join(origin, 'content'))
    expect(Object.fromEntries([...dates].map(([file, date]) => [file.slice(file.lastIndexOf('/') + 1), date]))).toEqual({
      '@odd.md': '2026-03-04T05:06:07Z',
      'plain.md': '2026-02-03T04:05:06Z',
      'ünïcode.md': '2026-01-02T03:04:05Z',
      'with space.md': '2026-01-02T03:04:05Z',
    })
  })

  // A linked worktree keeps its own git dir, but the clone's `shallow` file
  // is the common one: missed, the boundary commit stamped its date on every
  // file it seemed to add.
  it('dates nothing past a shallow clone\'s boundary, from a linked worktree too', () => {
    const plain = repository('docs-pages-plain-')
    const shallow = mkdtempSync(join(tmpdir(), 'docs-pages-shallow-'))
    try {
      commit(plain, ['a.md', 'b.md'], '2026-01-02T03:04:05+00:00')
      commit(plain, ['a.md'], '2026-02-03T04:05:06+00:00')
      git(shallow, 'clone', '-q', '--depth', '1', `file://${plain}`, 'clone')
      git(join(shallow, 'clone'), 'worktree', 'add', '-q', '--detach', join(shallow, 'worktree'))
      expect(lastCommitDates(join(shallow, 'clone/content')).size).toBe(0)
      expect(lastCommitDates(join(shallow, 'worktree/content')).size).toBe(0)
      expect(lastCommitDates(join(plain, 'content')).size).toBe(2)
    }
    finally {
      rmSync(plain, { recursive: true, force: true })
      rmSync(shallow, { recursive: true, force: true })
    }
  })
})

describe('a parsed page', () => {
  const body = () => ({ type: 'minimark', value: [['p', {}, 'Text.'], ['agent-prompt-links', {}]] as unknown[] })
  const keys = { playground: '/playground/platform/email', api: '/docs/reference/api/email', source: 'src/convex/integrations/email.ts' }

  // Docus's sitemap source reads `meta.modifiedAt`; `modifiedAt` is a column
  // of the docs collection, so it never lands in `meta` by itself.
  it('carries its date where the aside and the sitemap read it', () => {
    const page: Record<string, unknown> = { body: body(), meta: { other: 1 } }
    enrichPage(page, '2026-03-04T05:06:07Z')
    expect(page.modifiedAt).toBe('2026-03-04T05:06:07Z')
    expect(page.meta).toEqual({ other: 1, modifiedAt: '2026-03-04T05:06:07Z' })
  })

  it('stays undated without one', () => {
    const page: Record<string, unknown> = { body: body() }
    enrichPage(page, undefined)
    expect(page.modifiedAt).toBeUndefined()
    expect(page.meta).toBeUndefined()
  })

  // The site's search indexes every word of the stored body.
  it('gets the text its blocks stand for, but not the header\'s keys', () => {
    const page: Record<string, unknown> = { body: body(), ...keys }
    enrichPage(page, undefined)
    const value = (page.body as { value: unknown[] }).value
    expect((value[1] as unknown[]).length).toBeGreaterThan(2)
    expect(JSON.stringify(value)).not.toContain('page-keys')
  })

  it('closes with the header\'s keys in the Markdown agents read', async () => {
    const hooks = new Map<string, (event: unknown, page: Record<string, unknown>) => void>()
    const { default: plugin } = await import('../../website/server/plugins/agent-page-keys')
    plugin({ hooks: { hook: (name: string, handler: (event: unknown, page: Record<string, unknown>) => void) => hooks.set(name, handler) } } as never)
    const copy = { ...keys, body: body() }
    hooks.get('agent-discovery:document')!({}, copy)
    expect(copy.body.value.at(-1)).toEqual(['page-keys', {}, expect.arrayContaining(['ul'])])
  })
})

describe('the deploy build', () => {
  // Vercel clones the newest commits only: without the rest of the history,
  // most pages would ship undated and the sitemap without lastmod.
  it('fetches the full history of a shallow clone before it builds', () => {
    const script = read('website/vercel-build.sh')
    const deepen = script.indexOf('git fetch --quiet --unshallow')
    expect(script).toContain('git rev-parse --is-shallow-repository')
    expect(deepen).toBeGreaterThan(-1)
    expect(deepen).toBeLessThan(script.indexOf('nuxt build'))
  })
})
