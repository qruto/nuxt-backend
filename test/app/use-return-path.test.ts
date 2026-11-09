import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import { useReturnPath } from '../../src/runtime/vue/composables/use-return-path'

// Where a page that interrupted the person sends them on: the page they were
// headed for, kept to this site, else where sign-in lands.

async function returnPathAt(route: string): Promise<string> {
  let back = ''
  await mountSuspended(defineComponent({
    setup() {
      const path = useReturnPath()
      return () => h('p', (back = path.value))
    },
  }), { route })
  return back
}

describe('useReturnPath', () => {
  it('goes back to the page the person was headed for', async () => {
    expect(await returnPathAt('/welcome?redirect=/admin')).toBe('/admin')
  })

  it('never leaves the site, whatever the link says', async () => {
    for (const away of ['https://example.com/', '//example.com/', 'javascript:alert(1)']) {
      expect(await returnPathAt(`/welcome?redirect=${encodeURIComponent(away)}`), away).not.toContain('example.com')
      expect(await returnPathAt(`/welcome?redirect=${encodeURIComponent(away)}`), away).not.toContain('javascript')
    }
  })

  it('never goes back to the sign-in page, which would ask for a sign-in again', async () => {
    const landing = await returnPathAt('/welcome')
    for (const loop of ['/login', '/login?redirect=/admin', '/login/']) {
      expect(await returnPathAt(`/welcome?redirect=${encodeURIComponent(loop)}`), loop).toBe(landing)
    }
  })

  it('lands where sign-in lands without one', async () => {
    expect(await returnPathAt('/welcome')).toMatch(/^\//)
  })
})
