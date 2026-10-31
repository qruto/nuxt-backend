import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BACKEND_PATH_KEYS, DEFAULT_BACKEND_PATHS } from '../../src/convex/paths'
import { BACKEND_PAGE_DEFS } from '../../src/pages'
import { backendPathsOf, parsePathsFile, pathOption, pathsSourceOf, renderPathsFile } from '../../src/paths-file'
import { pathsFileFinding, syncPathsFile } from '../../src/paths-sync'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'
import { registerPathsFile } from '../../src/nuxt/paths'
import { packageDir } from '../../src/dirs'

// One path source: nuxt.config declares every path, and the module carries
// the ones the backend needs into the functions directory as
// paths.generated.ts, which the scaffold passes to the backend's helpers.

describe('the paths nuxt.config declares', () => {
  it('are each page\'s default path, and the default auth route, when it moves none', () => {
    expect(backendPathsOf(undefined)).toEqual(DEFAULT_BACKEND_PATHS)
    expect(backendPathsOf({})).toEqual({ authRoute: '/api/auth', acceptInvitation: '/accept-invitation', keepAccount: '/account/keep', security: '/security', waitlist: '/waitlist', login: '/login', unsubscribe: '/unsubscribe', report: '/report', settings: '/settings', privacy: '/legal/privacy' })
  })

  it('default each page to the path the module mounts it at', () => {
    for (const key of BACKEND_PATH_KEYS.filter(key => key !== 'authRoute')) {
      const page = pathOption(key).replace('backend.pages.', '')
      expect(DEFAULT_BACKEND_PATHS[key], key).toBe(BACKEND_PAGE_DEFS.find(def => def.key === page)!.defaultPath)
    }
  })

  // The module mounts the proxy at '/api/auth' with a warning: the backend must serve the same route, not refuse it.
  it('read an auth route as the module mounts it, with a leading slash and none trailing', () => {
    expect(backendPathsOf({ authRoute: 'api/auth' }).authRoute).toBe('/api/auth')
    expect(backendPathsOf({ authRoute: ' auth// ' }).authRoute).toBe('/auth')
    expect(backendPathsOf({ authRoute: '/' }).authRoute).toBe('/')
  })

  it('follow a moved page and auth route, and keep a page turned off at its default path', () => {
    expect(backendPathsOf({ authRoute: '/auth/', pages: { acceptInvitation: '/join', security: '/account/security', keepAccount: false, login: '/sign-in' } })).toEqual({
      ...DEFAULT_BACKEND_PATHS,
      authRoute: '/auth',
      acceptInvitation: '/join',
      security: '/account/security',
      login: '/sign-in',
    })
  })
})

// doctor and doctor --fix read nuxt.config as the module does: --fix once rewrote an inline authRoute back to the default.
describe('the options nuxt.config gives the module', () => {
  it('are the inline ones over the backend key, merged as Nuxt merges them', () => {
    expect(pathsSourceOf({ modules: [['nuxt-backend', { authRoute: '/auth' }]] })).toEqual({ authRoute: '/auth' })
    expect(pathsSourceOf({
      backend: { authRoute: '/a', pages: { login: '/sign-in', security: '/s' } },
      modules: ['@nuxtjs/i18n', ['nuxt-backend', { authRoute: '/b', pages: { security: '/account/security' } }]],
    })).toEqual({ authRoute: '/b', pages: { login: '/sign-in', security: '/account/security' } })
    expect(pathsSourceOf({ backend: { authRoute: '/a' }, modules: ['nuxt-backend'] })).toEqual({ authRoute: '/a' })
    expect(pathsSourceOf({})).toEqual({})
  })
})

describe('the generated file', () => {
  it('reads back the paths it was written with', () => {
    const paths = backendPathsOf({ authRoute: '/auth', pages: { waitlist: '/line' } })
    expect(parsePathsFile(renderPathsFile(paths))).toEqual(paths)
  })

  // A quote nuxt.config accepts in a path wrote a file that did not parse, and the push failed.
  it('writes a quote or a backslash in a path as TypeScript that parses, and reads it back', async () => {
    const paths = backendPathsOf({ pages: { security: '/o\'neil', waitlist: '/say-"hi"', report: '/back\\slash' } })
    const text = renderPathsFile(paths)
    expect(text).toContain('  security: \'/o\\\'neil\',')
    expect(parsePathsFile(text)).toEqual(paths)
    const module = await import(`data:text/javascript,${encodeURIComponent(text.replace(' as const', ''))}`) as { paths: unknown }
    expect(module.paths).toEqual(paths)
  })

  it('is what the scaffold writes before the module has run: the defaults', () => {
    expect(BACKEND_FILE_TEMPLATES['paths.generated.ts']).toBe(renderPathsFile(DEFAULT_BACKEND_PATHS))
  })

  it('is read by every scaffold file that needs a path', () => {
    for (const file of ['auth.config.ts', 'auth.ts', 'account.ts']) {
      expect(BACKEND_FILE_TEMPLATES[file], file).toContain('import { paths } from \'./paths.generated\'')
    }
    expect(BACKEND_FILE_TEMPLATES['auth.config.ts']).toContain('defineBackendAuthConfig({ paths })')
    expect(BACKEND_FILE_TEMPLATES['account.ts']).toContain('setupAccount(components, { audit, billing, email, paths })')
    expect(BACKEND_FILE_TEMPLATES['auth.ts']).toMatch(/setupAuth\(components, query, \{[\s\S]*\n {2}paths,\n/)
  })
})

describe('syncing and checking the file', () => {
  let rootDir: string
  const file = () => join(rootDir, 'backend', 'paths.generated.ts')

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'paths-file-'))
  })
  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('writes nothing, and checks nothing, before there is a functions directory', () => {
    expect(syncPathsFile(rootDir, DEFAULT_BACKEND_PATHS)).toBe('no-functions-dir')
    expect(pathsFileFinding(rootDir, {})).toEqual([])
  })

  it('writes the file when it says something else, and leaves an up-to-date one alone', () => {
    mkdirSync(join(rootDir, 'backend'))
    const moved = backendPathsOf({ pages: { acceptInvitation: '/join' } })
    expect(syncPathsFile(rootDir, moved)).toBe('written')
    expect(readFileSync(file(), 'utf-8')).toBe(renderPathsFile(moved))
    expect(syncPathsFile(rootDir, moved)).toBe('unchanged')
  })

  it('follows convex.json\'s functions directory', () => {
    writeFileSync(join(rootDir, 'convex.json'), JSON.stringify({ functions: 'server/convex/' }))
    mkdirSync(join(rootDir, 'server', 'convex'), { recursive: true })
    expect(syncPathsFile(rootDir, DEFAULT_BACKEND_PATHS)).toBe('written')
    expect(readFileSync(join(rootDir, 'server', 'convex', 'paths.generated.ts'), 'utf-8')).toContain('authRoute: \'/api/auth\'')
  })

  it('names a missing file, a stale one by each path it holds apart, and passes one that agrees', () => {
    mkdirSync(join(rootDir, 'backend'))
    expect(pathsFileFinding(rootDir, {})).toMatchObject([{ id: 'paths-file', status: 'warn', message: expect.stringContaining('backend/paths.generated.ts is missing') }])

    writeFileSync(file(), renderPathsFile(DEFAULT_BACKEND_PATHS))
    expect(pathsFileFinding(rootDir, {})).toMatchObject([{ id: 'paths-file', status: 'pass' }])

    const [stale] = pathsFileFinding(rootDir, { authRoute: '/auth', pages: { security: '/account' } })
    expect(stale).toMatchObject({ id: 'paths-file', status: 'warn', fixHint: expect.stringContaining('doctor --fix') })
    expect(stale!.message).toContain('authRoute is /api/auth, and backend.authRoute says /auth')
    expect(stale!.message).toContain('security is /security, and backend.pages.security says /account')
  })

  it('is what the module writes on a start, never under a test runner or in this package\'s own root', () => {
    mkdirSync(join(rootDir, 'backend'))
    const nuxt = (options: { test: boolean, rootDir: string }) => ({ options }) as never
    registerPathsFile({ pages: { waitlist: '/line' } }, nuxt({ test: true, rootDir }))
    expect(pathsFileFinding(rootDir, {})[0]!.message).toContain('is missing')
    registerPathsFile({ pages: { waitlist: '/line' } }, nuxt({ test: false, rootDir }))
    expect(parsePathsFile(readFileSync(file(), 'utf-8')).waitlist).toBe('/line')
    // The package's own root boots in `nuxt-module-build prepare` with no app's config: its convex.json names the website's functions.
    const before = readFileSync(join(packageDir, 'website', 'backend', 'paths.generated.ts'), 'utf-8')
    registerPathsFile({}, nuxt({ test: false, rootDir: packageDir }))
    expect(readFileSync(join(packageDir, 'website', 'backend', 'paths.generated.ts'), 'utf-8')).toBe(before)
  })

  // An 0.1 auth.config.ts re-exports the default config: the JWKS route stays at /api/auth while the proxy moves.
  it('names a backend file that does not pass the paths on while nuxt.config moves one its helper reads', () => {
    mkdirSync(join(rootDir, 'backend'))
    const moved = { authRoute: '/auth', pages: { keepAccount: '/keep' } }
    writeFileSync(file(), renderPathsFile(backendPathsOf(moved)))
    writeFileSync(join(rootDir, 'backend', 'auth.config.ts'), 'export { default } from \'nuxt-backend/auth.config\'\n')
    writeFileSync(join(rootDir, 'backend', 'auth.ts'), BACKEND_FILE_TEMPLATES['auth.ts']!)
    writeFileSync(join(rootDir, 'backend', 'account.ts'), 'export const account = setupAccount(components, { email })\n')
    const [unread] = pathsFileFinding(rootDir, moved)
    expect(unread).toMatchObject({ id: 'paths-file', status: 'warn', fixHint: expect.stringContaining('{ paths } from \'./paths.generated\'') })
    expect(unread!.message).toContain('auth.config.ts does not pass the paths on, so it uses authRoute /api/auth where backend.authRoute says /auth')
    expect(unread!.message).toContain('account.ts does not pass the paths on, so it uses keepAccount /account/keep where backend.pages.keepAccount says /keep')
    expect(unread!.message).not.toContain('auth.ts does not')
    // setupAccess links an invitation to the privacy policy.
    writeFileSync(join(rootDir, 'backend', 'access.ts'), 'export const access = setupAccess(components, { audit })\n')
    writeFileSync(file(), renderPathsFile(backendPathsOf({ pages: { privacy: '/policies/privacy' } })))
    expect(pathsFileFinding(rootDir, { pages: { privacy: '/policies/privacy' } })[0]!.message).toContain('access.ts does not pass the paths on, so it uses privacy /legal/privacy where backend.pages.privacy says /policies/privacy')
    writeFileSync(file(), renderPathsFile(backendPathsOf(moved)))
    // At the default paths, a file that does not pass them on breaks nothing.
    writeFileSync(file(), renderPathsFile(DEFAULT_BACKEND_PATHS))
    expect(pathsFileFinding(rootDir, {})).toMatchObject([{ status: 'pass' }])
  })

  it('reports nothing when nuxt.config did not load', () => {
    mkdirSync(join(rootDir, 'backend'))
    expect(pathsFileFinding(rootDir, null)).toEqual([])
  })
})
