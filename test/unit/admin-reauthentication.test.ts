import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// An admin view that writes behind a recent sign-in asks for it through a
// <ReauthenticateDialog> of its own: `reauthenticate()` rejects at once when
// no prompt is mounted, so a view without one fails every write it guards.

const DIR = join(import.meta.dirname, '../../src/runtime/vue/components/admin')
const read = (file: string) => readFileSync(join(DIR, file), 'utf8')

/** Each view, with the source of its script and the tab helpers it imports. */
const views = readdirSync(DIR).filter(file => file.endsWith('.vue')).map((file) => {
  const vue = read(file)
  const helpers = [...vue.matchAll(/from '\.\/(admin-[\w-]+)'/g)].map(([, name]) => read(`${name}.ts`))
  return { file, vue, script: [vue, ...helpers].join('\n') }
})

describe('admin views that ask for a recent sign-in', () => {
  const guarded = views.filter(view => view.script.includes('withReauthentication'))

  it('are found', () => {
    expect(guarded.map(view => view.file)).toContain('AdminExperiments.vue')
  })

  it.each(guarded.map(view => [view.file, view.vue]))('%s mounts its own <ReauthenticateDialog>', (_file, vue) => {
    expect(vue).toContain('<ReauthenticateDialog')
  })
})
