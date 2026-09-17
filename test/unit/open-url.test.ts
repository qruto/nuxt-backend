import { afterEach, describe, expect, it, vi } from 'vitest'
import { openProviderUrl } from '../../src/runtime/vue/utils/open-url'

// The `unit` project runs in Node, so there is no `window` until a test puts
// one there: the SSR guard is the default, and the browser branches see only
// the two members the helper touches.
function stubWindow(href = 'https://app.test/billing') {
  const win = { location: { href }, open: vi.fn() }
  vi.stubGlobal('window', win)
  return win
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('openProviderUrl', () => {
  it('does nothing without a window (SSR)', () => {
    expect(typeof window).toBe('undefined')
    expect(() => openProviderUrl('https://polar.test/checkout')).not.toThrow()
    expect(() => openProviderUrl('https://polar.test/checkout', true)).not.toThrow()
  })

  it('opens an http(s) destination in a new tab by default', () => {
    const win = stubWindow()
    openProviderUrl('https://polar.test/checkout?session=abc')
    expect(win.open).toHaveBeenCalledWith('https://polar.test/checkout?session=abc', '_blank')
    expect(win.location.href).toBe('https://app.test/billing')
  })

  it('navigates in place with redirect, resolving app-relative paths against the page', () => {
    const win = stubWindow()
    openProviderUrl('/settings/billing', true)
    expect(win.location.href).toBe('https://app.test/settings/billing')
    expect(win.open).not.toHaveBeenCalled()

    openProviderUrl('http://polar.test/portal', true)
    expect(win.location.href).toBe('http://polar.test/portal')
  })

  it('drops every non-http(s) scheme, in both modes', () => {
    const win = stubWindow()
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:MsgBox(1)',
      'file:///etc/passwd',
      'blob:https://app.test/0b3c',
    ]) {
      openProviderUrl(url)
      openProviderUrl(url, true)
    }
    expect(win.open).not.toHaveBeenCalled()
    expect(win.location.href).toBe('https://app.test/billing')
  })

  it('drops what the URL parser rejects', () => {
    const win = stubWindow()
    for (const url of ['http://[', 'https://exa mple.com']) {
      expect(() => openProviderUrl(url)).not.toThrow()
      expect(() => openProviderUrl(url, true)).not.toThrow()
    }
    expect(win.open).not.toHaveBeenCalled()
    expect(win.location.href).toBe('https://app.test/billing')
  })
})
