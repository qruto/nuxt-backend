import { describe, expect, it } from 'vitest'
import { assertModuleOptions } from '../../src/nuxt/options'
import { pagesOptionProblems, privatePagePaths, resolvedBackendPages, resolvePagePath } from '../../src/pages'

// What a 0.1 config left behind meets in 0.2: `doctor` and the page helpers
// read it without crashing, and the module refuses it, naming each leftover
// and linking the Upgrade page.

const UPGRADE = 'https://nuxt-backend.dev/docs/ship/migrate/upgrade#pages-the-stylesheet-and-the-webhook-log-are-always-on'

/** The error `assertModuleOptions` throws for these options. */
function refusal(options: unknown): Error {
  try {
    assertModuleOptions(options)
  }
  catch (error) {
    return error as Error
  }
  throw new Error(`accepted ${JSON.stringify(options)}`)
}

describe('the page helpers on a 0.1 config', () => {
  it('read only a string as a path, so a leftover value is the default and never a crash', () => {
    for (const value of [false, true, null, 0, {}, ['/me']]) {
      expect(resolvePagePath({ profile: value } as never, 'profile'), String(value)).toBe('/profile')
    }
  })

  it('read a whole `pages` value that is not an object as no option', () => {
    for (const pages of [false, true, '/pages', 0]) {
      expect(resolvedBackendPages(pages as never), String(pages)).toEqual(resolvedBackendPages(undefined))
      expect(privatePagePaths(pages as never), String(pages)).toEqual(privatePagePaths(undefined))
    }
  })
})

describe('pagesOptionProblems', () => {
  it('has nothing to say about paths, or about no option', () => {
    expect(pagesOptionProblems(undefined)).toEqual([])
    expect(pagesOptionProblems({})).toEqual([])
    expect(pagesOptionProblems({ login: '/sign-in', profile: 'me/', pricing: '  ' })).toEqual([])
  })

  it('names each page key whose value is not a path', () => {
    const problems = pagesOptionProblems({ login: '/sign-in', profile: false, security: true, settings: null })
    expect(problems).toHaveLength(3)
    expect(problems[0]).toMatch(/^`backend\.pages\.profile` is `false`\. Give it a path to move the page, or leave it out; to replace the page, put an app page at its path \(`\/profile` by default\)\.$/)
    expect(problems[1]).toContain('`backend.pages.security` is `true`.')
    expect(problems[2]).toContain('`backend.pages.settings` is `null`.')
  })

  it('names a whole `pages` value that is not an object of paths', () => {
    for (const [pages, shown] of [[false, '`false`'], [true, '`true`'], ['/x', '`"/x"`'], [['/x'], '`["/x"]`'], [null, '`null`']] as const) {
      expect(pagesOptionProblems(pages), shown).toEqual([`\`backend.pages\` is ${shown}. It takes a path per page key, and every page mounts: to replace one, put an app page at its path.`])
    }
  })
})

describe('assertModuleOptions', () => {
  it('passes the options 0.2 takes, and a module turned off', () => {
    expect(() => assertModuleOptions({ pages: { login: '/sign-in' }, authRoute: '/api/auth', devtools: false })).not.toThrow()
    expect(() => assertModuleOptions({})).not.toThrow()
    expect(() => assertModuleOptions(undefined)).not.toThrow()
    expect(() => assertModuleOptions(false)).not.toThrow()
  })

  it('refuses pages turned off, in a named error that links the Upgrade page', () => {
    const error = refusal({ pages: false })
    expect(error.name).toBe('BackendOptionsError')
    expect(error.message).toBe([
      'nuxt-backend: these `backend` options changed in 0.2:',
      '  - `backend.pages` is `false`. It takes a path per page key, and every page mounts: to replace one, put an app page at its path.',
      `What to change: ${UPGRADE}`,
    ].join('\n'))
  })

  it('names every leftover at once: page values, `loginPath` and `css`', () => {
    const { message } = refusal({ pages: { profile: false, pricing: true }, loginPath: '/sign-in', css: false })
    expect(message.split('\n').filter(line => line.startsWith('  - '))).toEqual([
      // In the order the pages are registered.
      expect.stringContaining('`backend.pages.pricing` is `true`.'),
      expect.stringContaining('`backend.pages.profile` is `false`.'),
      '  - `loginPath` is gone. The `auth` middleware follows `backend.pages.login`: set the path there.',
      '  - `css` is gone. The stylesheet always loads, layered, so your own CSS wins: restyle through the `--bk-*` tokens or the `data-*` hooks.',
    ])
    expect(message).toContain(UPGRADE)
  })

  it('refuses `css: true` too: the key is gone, whatever its value', () => {
    expect(refusal({ css: true }).message).toContain('`css` is gone.')
  })
})
