import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAPABILITY_NAMES } from '../../src/capabilities/registry'
import { ACCOUNT_DATA_SOURCES } from '../../src/convex/account-data'
import { LAST_SIGN_IN_COOKIE } from '../../src/convex/constants'
import { STORAGE_COOKIE, STORAGE_PURPOSES } from '../../src/convex/consent-rules'
import { PUSH_WORKER_URL } from '../../src/convex/web-push'
import { BROWSER_STORAGE, browserStorageInUse, capabilityInUse, dataMap, LEGAL_PAGE_KEYS, plainText, SUBPROCESSORS, subprocessorsInUse } from '../../src/convex/legal'
import { LABELS } from '../../src/convex/labels'
import { SECURE_VISITOR_COOKIE } from '../../src/convex/proof'
import { BACKEND_PAGE_DEFS } from '../../src/pages'

// The facts the legal pages print (LEGAL): the data map regroups every
// participant of the account-data registry by capability, the processors
// and the stored items each name a capability, every key the package's
// browser code writes is listed, and the pages read them in plain words.

const root = join(import.meta.dirname, '..', '..')

/** Every source file under a folder. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.(?:ts|vue)$/.test(name) ? [path] : []
  })
}

const names = Object.values(BROWSER_STORAGE).map(item => item.name)

describe('the data map', () => {
  it('lists every participant once, under its capability', () => {
    for (const source of Object.values(ACCOUNT_DATA_SOURCES)) expect(CAPABILITY_NAMES).toContain(source.capability)
    const groups = dataMap()
    expect(groups.flatMap(group => group.participants).sort()).toEqual(Object.keys(ACCOUNT_DATA_SOURCES).sort())
    for (const group of groups) {
      for (const key of group.participants) expect(ACCOUNT_DATA_SOURCES[key].capability).toBe(group.capability)
    }
    expect(new Set(groups.map(group => group.capability)).size).toBe(groups.length)
  })

  it('leaves out a capability the app does not use, and keeps one the health does not name', () => {
    const states = { billing: 'missing', email: 'live' }
    const inUse = (capability: Parameters<typeof capabilityInUse>[1]) => capabilityInUse(states, capability)
    expect(dataMap(inUse).map(group => group.capability)).not.toContain('billing')
    expect(dataMap(inUse).map(group => group.capability)).toContain('email')
    expect(subprocessorsInUse(inUse)).not.toContain('billing')
    // The backend could not be reached: every capability counts.
    expect(capabilityInUse(null, 'billing')).toBe(true)
    expect(subprocessorsInUse(() => true)).toEqual(Object.keys(SUBPROCESSORS))
  })
})

describe('the processors and the stored items', () => {
  it('each belong to a capability', () => {
    for (const row of [...Object.values(SUBPROCESSORS), ...Object.values(BROWSER_STORAGE)]) expect(CAPABILITY_NAMES).toContain(row.capability)
  })

  it('wait for a purpose of the consent manager, or are strictly necessary', () => {
    for (const item of Object.values(BROWSER_STORAGE)) expect(['necessary', ...STORAGE_PURPOSES]).toContain(item.consent)
    expect(BROWSER_STORAGE.lastSignIn.consent).toBe('preferences')
    expect(BROWSER_STORAGE.replay.consent).toBe('replay')
  })

  it('name every cookie the package sets, the HttpOnly visitor cookie of guest generation among them', () => {
    expect(names).toEqual(expect.arrayContaining([`better-auth.${'session_token'}`, LAST_SIGN_IN_COOKIE, STORAGE_COOKIE, SECURE_VISITOR_COOKIE, 'better-auth.sign_in_code', 'better-auth.under_age']))
    expect(BROWSER_STORAGE.visitor).toMatchObject({ name: '__Host-backend.visitor', kind: 'cookie', httpOnly: true })
  })

  it('list web push under notifications: the browsers\' push services, and the subscription with the module\'s service worker', () => {
    expect(SUBPROCESSORS.webPush).toMatchObject({ capability: 'notifications', configuredBy: expect.stringContaining('PUSH_PUBLIC_KEY') })
    expect(BROWSER_STORAGE.pushSubscription).toMatchObject({ capability: 'notifications', name: PUSH_WORKER_URL, kind: 'push', consent: 'necessary' })
    expect(subprocessorsInUse(capability => capability !== 'notifications')).not.toContain('webPush')
    expect(browserStorageInUse(capability => capability !== 'notifications')).not.toContain('pushSubscription')
  })

  it('name every storage key the package\'s browser code writes', () => {
    // Every `nuxt-backend:<name>` key a runtime file keeps in the browser's storage: a constant beside a Storage call.
    const keys = walk(join(root, 'src/runtime')).flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return /(?:local|session)Storage/.test(text) ? [...text.matchAll(/'(nuxt-backend:[\w-]+)'/g)].map(([, key]) => key!) : []
    })
    expect(keys.length).toBeGreaterThan(0)
    for (const key of new Set(keys)) expect(names, key).toContain(key)
  })
})

describe('the legal labels', () => {
  it('give every participant, processor and stored item its words, plain', () => {
    expect(Object.keys(LABELS.legal.data).sort()).toEqual(Object.keys(ACCOUNT_DATA_SOURCES).sort())
    expect(Object.keys(LABELS.legal.processors)).toEqual(Object.keys(SUBPROCESSORS))
    expect(Object.keys(LABELS.legal.storage)).toEqual(Object.keys(BROWSER_STORAGE))
    expect(Object.keys(LABELS.legal.capabilities).sort()).toEqual([...CAPABILITY_NAMES].sort())
    const words = [...Object.values(LABELS.legal.data), ...Object.values(LABELS.legal.processors), ...Object.values(LABELS.legal.storage)].flatMap(row => Object.values(row))
    for (const text of words) expect(text, text).not.toMatch(/[`{}|@]/)
  })

  it('drop an aside on code', () => {
    expect(plainText('7 days after a final status, 30 days without one (`setupEmail({ retention })`).')).toBe('7 days after a final status, 30 days without one.')
    expect(LABELS.legal.data.aiThreads.holds).toContain('The chat threads an account started: which chat')
  })

  it('title every legal page, and every one is a packaged page', () => {
    expect(Object.keys(LABELS.legal.pages)).toEqual([...LEGAL_PAGE_KEYS])
    for (const key of LEGAL_PAGE_KEYS) expect(BACKEND_PAGE_DEFS.find(def => def.key === key)).toMatchObject({ defaultPath: `/legal/${key}`, auth: false })
  })
})

describe('the stored items in use', () => {
  it('follow the capabilities', () => {
    expect(browserStorageInUse(capability => capability !== 'monitoring')).not.toContain('replay')
    expect(browserStorageInUse()).toEqual(Object.keys(BROWSER_STORAGE))
  })
})
