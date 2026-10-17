import { describe, expect, it } from 'vitest'
import { component, renderComponent } from './sfc'

// The part components as a page renders them (website/components): what a
// key says about itself when it is a link, disabled or pressed, and what an
// LED says when it has a name.

const render = (file: string, props: Record<string, unknown>, text = 'Key') => renderComponent(component(file), props, {}, text)

describe('<Key>', () => {
  it('is a link to its page', async () => {
    const html = await render('website/components/Key.vue', { to: '/docs' })
    expect(html).toMatch(/^<a href="\/docs" class="k">/)
    expect(html).not.toContain('aria-disabled')
  })

  it('has no href when it is a disabled link, and says it is disabled', async () => {
    const html = await render('website/components/Key.vue', { to: '/docs', disabled: true })
    expect(html).toMatch(/^<a /)
    expect(html).not.toContain('href=')
    expect(html).toContain('role="link"')
    expect(html).toContain('aria-disabled="true"')
  })

  it('is current anywhere in its section when it is a pressed link', async () => {
    expect(await render('website/components/Key.vue', { to: '/docs', pressed: true })).toContain('aria-current="true"')
    expect(await render('website/components/Key.vue', { to: '/docs', pressed: false })).not.toContain('aria-current')
  })

  it('is a toggle button when it is pressed without a link', async () => {
    const html = await render('website/components/Key.vue', { pressed: true, signal: 'go' })
    expect(html).toMatch(/^<button type="button" aria-pressed="true" class="k k-go">/)
  })

  it('is a disabled button when it is disabled without a link', async () => {
    expect(await render('website/components/Key.vue', { disabled: true })).toMatch(/^<button type="button" disabled class="k">/)
  })
})

describe('<Led>', () => {
  it('is hidden from assistive technology without a label', async () => {
    const html = await render('website/components/Led.vue', { tone: 'warn' }, '')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('role=')
  })

  it('is an image named by its label', async () => {
    const html = await render('website/components/Led.vue', { tone: 'warn', label: 'Experimental' }, '')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Experimental"')
    expect(html).not.toContain('aria-hidden')
  })
})
