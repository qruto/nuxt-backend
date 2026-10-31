import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { repairProjectFiles } from '../../src/cli/repair'
import { convexConfigFinding, readConvexConfigDrift } from '../../src/convex-config'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'
import { ADDED_SINCE_BASE, checkoutBaseStarter, removeFixture, UPGRADE_BASE } from '../helpers/upgrade-fixture'

// The upgrade fixture: the starter as it shipped at UPGRADE_BASE, repaired
// by `doctor --fix` (its file half; the env push needs a deployment). The
// repair must add exactly what the scaffold gained since, and leave the
// starter what a new one is today. test/e2e/upgrade.test.ts typechecks and
// builds the result.

let dir: string
let repair: Awaited<ReturnType<typeof repairProjectFiles>>
let before: string[]
let driftBefore: Awaited<ReturnType<typeof readConvexConfigDrift>>

beforeAll(async () => {
  dir = checkoutBaseStarter(join(tmpdir(), 'nuxt-backend-upgrade'))
  before = readdirSync(join(dir, 'backend')).sort()
  driftBefore = await readConvexConfigDrift(dir)
  repair = await repairProjectFiles(dir)
}, 60_000)

afterAll(() => {
  if (dir) removeFixture(dir)
})

describe(`the ${UPGRADE_BASE} starter, after doctor --fix`, () => {
  it('starts from a starter that lacks what was added since', () => {
    expect(before.filter(file => ADDED_SINCE_BASE.files.includes(file))).toEqual([])
    expect(driftBefore.missingMounts.length).toBe(ADDED_SINCE_BASE.mounts.length)
    expect(driftBefore.missingRoutes).toEqual(ADDED_SINCE_BASE.routes)
    expect(driftBefore.missingForwards).toEqual(ADDED_SINCE_BASE.forwards)
  })

  it('gains the backend files the scaffold added since, and nothing else', () => {
    expect(repair.written.sort()).toEqual(ADDED_SINCE_BASE.files.map(file => `backend/${file}`).sort())
  })

  it('gains the mounts, forwarded env names and route groups the scaffold added since', () => {
    const mounted = repair.changes.find(change => change.startsWith('backend/convex.config.ts: mounted '))
    expect(mounted?.replace('backend/convex.config.ts: mounted ', '').split(', ') ?? []).toEqual(ADDED_SINCE_BASE.mounts)
    const forwarded = repair.changes.find(change => change.startsWith('backend/convex.config.ts: forwarded '))
    expect(forwarded?.replace('backend/convex.config.ts: forwarded ', '').split(', ') ?? []).toEqual(ADDED_SINCE_BASE.forwards)
    const registered = repair.changes.find(change => change.startsWith('backend/http.ts: registered '))
    expect(registered?.replace('backend/http.ts: registered ', '').split(', ') ?? []).toEqual(ADDED_SINCE_BASE.routes)
  })

  it('comes out as the scaffold writes those files today, byte for byte', () => {
    for (const file of ['convex.config.ts', 'http.ts', ...ADDED_SINCE_BASE.files]) {
      expect(readFileSync(join(dir, 'backend', file), 'utf-8'), `backend/${file}`).toBe(BACKEND_FILE_TEMPLATES[file])
    }
  })

  it('then passes the convex-config check', async () => {
    expect(await convexConfigFinding(dir)).toMatchObject({ id: 'convex-config', status: 'pass' })
  })

  it('mounts the optional crons component once the app imports it', async () => {
    mkdirSync(join(dir, 'node_modules/@convex-dev/crons'), { recursive: true })
    writeFileSync(join(dir, 'node_modules/@convex-dev/crons/package.json'), '{ "name": "@convex-dev/crons" }\n')
    writeFileSync(join(dir, 'backend/digest.ts'), 'import { Crons } from \'@convex-dev/crons\'\nimport { components } from \'./_generated/api\'\nexport const schedules = new Crons(components.crons)\n')
    try {
      expect((await repairProjectFiles(dir)).changes).toEqual(['backend/convex.config.ts: mounted crons'])
      expect(await convexConfigFinding(dir)).toMatchObject({ status: 'pass' })
    }
    finally {
      writeFileSync(join(dir, 'backend/convex.config.ts'), BACKEND_FILE_TEMPLATES['convex.config.ts']!)
      rmSync(join(dir, 'backend/digest.ts'))
    }
  })

  it('changes nothing on a second run', async () => {
    expect(await repairProjectFiles(dir)).toEqual({ written: [], changes: [] })
  })
})
