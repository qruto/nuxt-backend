import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LABELS } from '../../src/convex/labels'
import { labelGroupFiles, labelGroupsIn, registerLabelGroups } from '../../src/nuxt/labels'
import { englishLabels, registerLabels } from '../../src/runtime/vue/utils/label-registry'

// The labels load by group: a module that names a group gets it imported and
// registered (src/nuxt/labels.ts), so a page ships the groups its components
// read, and nothing in the Vue runtime imports every group at once.

const src = fileURLToPath(new URL('../../src/', import.meta.url))
const files = labelGroupFiles(join(src, 'convex/label-groups'))
const groups = new Set(files.keys())

describe('the label groups', () => {
  it('are one module per group, gathered whole in LABELS', async () => {
    expect([...groups].sort()).toEqual(Object.keys(LABELS).sort())
    for (const [group, file] of files) {
      const { default: labels } = await import(file) as { default: unknown }
      expect(labels).toBe(LABELS[group as keyof typeof LABELS])
    }
  })

  it('stay out of the Vue runtime but for the fallback, which an app\'s build empties', () => {
    const runtime = join(src, 'runtime')
    const sources = (readdirSync(runtime, { recursive: true }) as string[]).filter(file => /\.(?:ts|vue)$/.test(file))
    const importers = sources.filter(file => /^import (?!type )[^\n]*convex\/labels\.js'/m.test(readFileSync(join(runtime, file), 'utf8')))
    expect(importers).toEqual([join('vue', 'utils', 'label-fallback.ts')])
  })
})

describe('naming a group', () => {
  it('reads each group a module writes out, once, in order', () => {
    const code = `const a = useLabels('pricing', props.labels); const b = useLabels<'auth'>("auth")
      lookup(\`cancelFlow.reasons.\${reason}\`); useLabels('pricing'); useLabels('errors'); lookup(task.label)`
    expect(labelGroupsIn(code, groups)).toEqual(['pricing', 'auth', 'cancelFlow'])
  })

  it('leaves a module that does not call useLabels, and a group that does not exist, alone', () => {
    expect(labelGroupsIn('lookup(\'admin.tabs.users\')', groups)).toEqual([])
    expect(labelGroupsIn('useLabels(\'mine\'); useLabels(group)', groups)).toEqual([])
    expect(registerLabelGroups('const x = 1', files, '/registry')).toBeNull()
  })

  it('appends the imports and registrations, keeping every line where it was', () => {
    const code = 'import { useLabels } from \'nuxt-backend\'\nexport const t = () => useLabels(\'auth\').t(\'title\')'
    const out = registerLabelGroups(code, files, '/registry')!
    expect(out.startsWith(code)).toBe(true)
    expect(out).toContain(`import __backendLabels_auth from ${JSON.stringify(files.get('auth'))}`)
    expect(out).toContain('__backendRegisterLabels("auth", __backendLabels_auth)')
  })
})

describe('the registry', () => {
  it('holds every group where nothing loads them one by one, and keeps the first registration', () => {
    expect(englishLabels('pricing')).toBe(LABELS.pricing)
    registerLabels('pricing', { ...LABELS.pricing, title: 'Other' })
    expect(englishLabels('pricing')).toBe(LABELS.pricing)
    expect(englishLabels('mine')).toBeUndefined()
  })
})
