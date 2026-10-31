import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The challenge widget (Cloudflare Turnstile) beyond its first render, which
// use-human-check.test.ts covers: the provider's script, loaded once per page
// and again after a failed load; where the widget goes while a modal dialog
// is open; and every way an answer fails. The provider's browser API is a
// stand-in the test plays; no script is fetched.

const SITE_KEY = '1x00000000000000000000AA'
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const CAPTION = 'Confirm you\'re a person to continue.'

type Options = Record<string, (...args: never[]) => void>

/** The provider's browser API, stood in: it records each widget's options so the test plays the provider. */
function provider() {
  const widgets: Options[] = []
  const api = {
    render: vi.fn((_host: HTMLElement, options: Options) => {
      widgets.push(options)
      return `widget-${widgets.length}`
    }),
    remove: vi.fn(),
  }
  return { api, widgets }
}

/** A fresh copy of the widget's module: the script it loaded is per page, and each test is a page. */
async function freshAnswer() {
  vi.resetModules()
  return (await import('../../src/runtime/vue/protection/challenge')).challengeAnswer
}

// The scripts the widget adds to the head, kept off the page: the test plays their load.
let added: HTMLScriptElement[] = []
const scripts = () => added.filter(script => script.src === SCRIPT_URL)
const host = () => document.querySelector<HTMLElement>('[data-backend-challenge]')

beforeEach(() => {
  delete (globalThis as { turnstile?: unknown }).turnstile
  added = []
  vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    added.push(...nodes as HTMLScriptElement[])
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  for (const node of document.querySelectorAll('[data-backend-challenge], dialog')) node.remove()
  delete (globalThis as { turnstile?: unknown }).turnstile
  vi.useRealTimers()
})

describe('the challenge script', () => {
  it('loads once for every answer that waits on it, asynchronously, and renders once it has loaded', async () => {
    const answer = await freshAnswer()
    const { api, widgets } = provider()
    const first = answer(SITE_KEY, { caption: CAPTION })
    const second = answer(SITE_KEY, { caption: CAPTION })
    expect(scripts()).toHaveLength(1)
    expect(scripts()[0]!.async).toBe(true)
    expect(api.render).not.toHaveBeenCalled()

    ;(globalThis as { turnstile?: unknown }).turnstile = api
    scripts()[0]!.onload!(new Event('load'))
    await vi.waitFor(() => expect(widgets).toHaveLength(2))
    ;(widgets[0]!.callback as (token: string) => void)('TOKEN-1')
    ;(widgets[1]!.callback as (token: string) => void)('TOKEN-2')
    await expect(Promise.all([first, second])).resolves.toEqual(['TOKEN-1', 'TOKEN-2'])

    // Loaded for the page: the next answer adds no script.
    const third = answer(SITE_KEY, { caption: CAPTION })
    await vi.waitFor(() => expect(widgets).toHaveLength(3))
    expect(scripts()).toHaveLength(1)
    ;(widgets[2]!.callback as (token: string) => void)('TOKEN-3')
    await expect(third).resolves.toBe('TOKEN-3')
  })

  it('fails an answer when the script loads without its API, and loads it again for the next one', async () => {
    const answer = await freshAnswer()
    const pending = answer(SITE_KEY, { caption: CAPTION })
    scripts()[0]!.onload!(new Event('load'))
    await expect(pending).rejects.toThrow('The challenge script loaded without its API.')
    expect(host()).toBeNull()

    const retry = answer(SITE_KEY, { caption: CAPTION })
    expect(scripts()).toHaveLength(2)
    scripts()[1]!.onerror!(new Event('error'))
    await expect(retry).rejects.toThrow('The challenge script did not load.')
  })
})

describe('the challenge widget', () => {
  it('goes inside the open dialog the person is in, so it can be clicked and focused there', async () => {
    const answer = await freshAnswer()
    const { api, widgets } = provider()
    ;(globalThis as { turnstile?: unknown }).turnstile = api
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    const field = document.createElement('input')
    dialog.append(field)
    document.body.append(dialog)
    field.focus()

    const pending = answer(SITE_KEY, { caption: CAPTION })
    await vi.waitFor(() => expect(widgets).toHaveLength(1))
    expect(host()!.parentElement).toBe(dialog)
    widgets[0]!['before-interactive-callback']!()
    expect(document.activeElement).toBe(host())
    ;(widgets[0]!.callback as (token: string) => void)('TOKEN')
    await expect(pending).resolves.toBe('TOKEN')
    // Focus goes back to the field it left.
    expect(document.activeElement).toBe(field)
  })

  it('goes inside the last modal dialog when the focus is elsewhere, past a non-modal one, and on the page with none open', async () => {
    const answer = await freshAnswer()
    const { api, widgets } = provider()
    ;(globalThis as { turnstile?: unknown }).turnstile = api
    // An open dialog as a browser with `:modal` tells them apart (the test DOM has no modal dialogs).
    const dialog = (modal: boolean) => {
      const element = document.createElement('dialog')
      element.setAttribute('open', '')
      element.matches = ((selector: string) => (selector === ':modal' ? modal : Element.prototype.matches.call(element, selector))) as typeof element.matches
      document.body.append(element)
      return element
    }
    const modal = dialog(true)
    const beside = dialog(false)
    const first = answer(SITE_KEY, { caption: CAPTION })
    await vi.waitFor(() => expect(widgets).toHaveLength(1))
    // Outside an open modal dialog the page is inert: the widget goes in it.
    expect(host()!.parentElement).toBe(modal)
    ;(widgets[0]!.callback as (token: string) => void)('A')
    await first

    modal.remove()
    beside.remove()
    const second = answer(SITE_KEY, { caption: CAPTION })
    await vi.waitFor(() => expect(widgets).toHaveLength(2))
    expect(host()!.parentElement).toBe(document.body)
    ;(widgets[1]!.callback as (token: string) => void)('B')
    await expect(second).resolves.toBe('B')
  })

  it('treats every open dialog as modal in a browser without `:modal`', async () => {
    const answer = await freshAnswer()
    const { api, widgets } = provider()
    ;(globalThis as { turnstile?: unknown }).turnstile = api
    const [under, over] = [document.createElement('dialog'), document.createElement('dialog')]
    for (const element of [under, over]) {
      element.setAttribute('open', '')
      element.matches = ((selector: string) => {
        if (selector === ':modal') throw new SyntaxError('unknown pseudo-class')
        return Element.prototype.matches.call(element, selector)
      }) as typeof element.matches
      document.body.append(element)
    }
    const pending = answer(SITE_KEY, { caption: CAPTION })
    await vi.waitFor(() => expect(widgets).toHaveLength(1))
    expect(host()!.parentElement).toBe(over)
    ;(widgets[0]!.callback as (token: string) => void)('A')
    await pending
  })

  it('hides its caption again once the click is done', async () => {
    const answer = await freshAnswer()
    const { api, widgets } = provider()
    ;(globalThis as { turnstile?: unknown }).turnstile = api
    const pending = answer(SITE_KEY, { caption: CAPTION })
    await vi.waitFor(() => expect(widgets).toHaveLength(1))
    const caption = host()!.querySelector('p')!
    widgets[0]!['before-interactive-callback']!()
    expect(caption.hidden).toBe(false)
    widgets[0]!['after-interactive-callback']!()
    expect(caption.hidden).toBe(true)
    ;(widgets[0]!.callback as (token: string) => void)('TOKEN')
    await pending
  })

  it('fails an answer that expired, a click that came too late, and no answer within two minutes', async () => {
    const answer = await freshAnswer()
    const { api, widgets } = provider()
    ;(globalThis as { turnstile?: unknown }).turnstile = api

    const expired = answer(SITE_KEY, { caption: CAPTION })
    await vi.waitFor(() => expect(widgets).toHaveLength(1))
    widgets[0]!['expired-callback']!()
    await expect(expired).rejects.toThrow('The challenge was not answered: the answer expired.')

    const late = answer(SITE_KEY, { caption: CAPTION })
    await vi.waitFor(() => expect(widgets).toHaveLength(2))
    widgets[1]!['timeout-callback']!()
    await expect(late).rejects.toThrow('the click came too late')

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const silent = answer(SITE_KEY, { caption: CAPTION })
    const settled = expect(silent).rejects.toThrow('no answer in time')
    await vi.advanceTimersByTimeAsync(0)
    expect(widgets).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(119_999)
    expect(host()).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    await settled
    expect(host()).toBeNull()
    expect(api.remove).toHaveBeenLastCalledWith('widget-3')
  })

  it('goes from the page even when the provider already removed its widget', async () => {
    const answer = await freshAnswer()
    const { api, widgets } = provider()
    api.remove.mockImplementation(() => {
      throw new Error('widget not found')
    })
    ;(globalThis as { turnstile?: unknown }).turnstile = api
    const pending = answer(SITE_KEY, { caption: CAPTION })
    await vi.waitFor(() => expect(widgets).toHaveLength(1))
    ;(widgets[0]!.callback as (token: string) => void)('TOKEN')
    await expect(pending).resolves.toBe('TOKEN')
    expect(host()).toBeNull()
  })
})
