import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNuxtApp, useRuntimeConfig } from '#imports'
import plugin from '../../src/runtime/vue/plugins/protection.client'
import { useHumanCheck } from '../../src/runtime/vue/composables/use-human-check'
import { configureProtection, protectedRequests, protectionClient } from '../../src/runtime/vue/protection/state'
import { getBackendError } from '../../src/convex/errors'

// The browser's half of bot protection, on the test's own Nuxt app: the
// plugin reads the runtime config, starts BotID's client on a Vercel build,
// the auth client answers the challenge on the protected routes, and
// useHumanCheck hands a call its token; and the challenge widget's host, on
// a stand-in of the provider's browser API. BotID's client, the provider
// and the proof route are stood in for: nothing leaves the test.

const initBotId = vi.fn()
vi.mock('botid/client/core', () => ({ initBotId }))
const challengeAnswer = vi.fn()
vi.mock('../../src/runtime/vue/protection/challenge', () => ({ challengeAnswer }))

const SITE_KEY = '1x00000000000000000000AA'

/** Run the plugin as the app would, with this public runtime config. */
async function start({ authRoute = '/api/auth', botDetection = false, challengeSiteKey = '' }: { authRoute?: string, botDetection?: boolean, challengeSiteKey?: string }) {
  const config = useRuntimeConfig().public as Record<string, unknown>
  config.backend = { ...(config.backend as object), authRoute, botDetection, challengeSiteKey }
  const nuxtApp = useNuxtApp()
  await nuxtApp.runWithContext(() => (plugin as unknown as (app: typeof nuxtApp) => unknown)(nuxtApp))
}

/** The auth client plugin's request hook, as Better Auth's fetch runs it. */
async function authRequest(url: string, headers: Record<string, string> = {}) {
  const context = { url: new URL(url, 'http://localhost:3000'), headers: new Headers(headers), method: 'POST' }
  const hook = protectionClient().fetchPlugins[0]!.hooks!.onRequest!
  await hook(context as never)
  return context.headers
}

beforeEach(() => {
  initBotId.mockReset()
  challengeAnswer.mockReset().mockResolvedValue('XXXX.DUMMY.TOKEN.XXXX')
})

afterEach(() => {
  configureProtection(null)
  vi.unstubAllGlobals()
})

describe('the protection plugin', () => {
  it('starts BotID\'s client on a Vercel build, over every protected request and the proof route', async () => {
    await start({ botDetection: true })
    expect(initBotId).toHaveBeenCalledWith({ protect: protectedRequests('/api/auth') })
    expect(protectedRequests('/api/auth')).toEqual([
      { path: '/api/auth/email-otp/send-verification-otp', method: 'POST' },
      { path: '/api/auth/email-otp/request-password-reset', method: 'POST' },
      { path: '/api/auth/forget-password/email-otp', method: 'POST' },
      { path: '/api/auth/sign-up/email', method: 'POST' },
      { path: '/api/auth/sign-in/email', method: 'POST' },
      { path: '/api/human-proof', method: 'POST' },
    ])
  })

  it('loads nothing of BotID elsewhere, and starts it beside a challenge on Vercel', async () => {
    await start({ challengeSiteKey: SITE_KEY })
    expect(initBotId).not.toHaveBeenCalled()
    await start({ botDetection: true, challengeSiteKey: SITE_KEY })
    expect(initBotId).toHaveBeenCalledOnce()
  })
})

describe('the auth client on the app\'s auth route', () => {
  /** Where the plugin sends a request the client builds on its default route. */
  async function sentTo(baseURL: string) {
    const plugin = protectionClient().fetchPlugins[0]!
    const { url, options } = await plugin.init!('/get-session', { baseURL })
    return `${options!.baseURL}${url}`
  }

  it('sends every request to `backend.authRoute`, where the proxy is', async () => {
    await start({ authRoute: '/auth/' })
    expect(await sentTo('https://app.test/api/auth')).toBe('https://app.test/auth/get-session')
  })

  it('leaves the default route, and a client the app pointed elsewhere, as they are', async () => {
    await start({})
    expect(await sentTo('https://app.test/api/auth')).toBe('https://app.test/api/auth/get-session')
    await start({ authRoute: '/auth' })
    expect(await sentTo('https://app.test/custom')).toBe('https://app.test/custom/get-session')
  })
})

describe('the auth client with a challenge', () => {
  it('answers the challenge on a code request, and nowhere else', async () => {
    await start({ challengeSiteKey: SITE_KEY })
    expect((await authRequest('/api/auth/email-otp/send-verification-otp')).get('x-captcha-response')).toBe('XXXX.DUMMY.TOKEN.XXXX')
    expect(challengeAnswer).toHaveBeenCalledWith(SITE_KEY, { action: undefined, caption: 'Confirm you\'re a person to continue.' })
    expect((await authRequest('/api/auth/sign-in/email-otp')).has('x-captcha-response')).toBe(false)
    expect(challengeAnswer).toHaveBeenCalledOnce()
  })

  it('keeps an answer the caller set, and sends the request without one when the challenge fails', async () => {
    await start({ challengeSiteKey: SITE_KEY })
    expect((await authRequest('/api/auth/email-otp/send-verification-otp', { 'x-captcha-response': 'mine' })).get('x-captcha-response')).toBe('mine')
    challengeAnswer.mockRejectedValue(new Error('refused'))
    expect((await authRequest('/api/auth/email-otp/send-verification-otp')).has('x-captcha-response')).toBe(false)
  })

  it('answers on Vercel too when the app has a site key: a deployment that verifies answers only gets one', async () => {
    await start({ botDetection: true, challengeSiteKey: SITE_KEY })
    expect((await authRequest('/api/auth/email-otp/send-verification-otp')).get('x-captcha-response')).toBe('XXXX.DUMMY.TOKEN.XXXX')
  })

  it('answers nothing without a site key, where BotID alone checks the request, or nothing does', async () => {
    await start({ botDetection: true })
    expect((await authRequest('/api/auth/email-otp/send-verification-otp')).has('x-captcha-response')).toBe(false)
    await start({})
    expect((await authRequest('/api/auth/email-otp/send-verification-otp')).has('x-captcha-response')).toBe(false)
    expect(challengeAnswer).not.toHaveBeenCalled()
  })
})

describe('useHumanCheck', () => {
  it('says how this browser checks people, from the runtime config: a site key wins', async () => {
    await start({})
    expect(useHumanCheck().mode.value).toBe('off')
    await start({ challengeSiteKey: SITE_KEY })
    expect(useHumanCheck().mode.value).toBe('challenge')
    await start({ botDetection: true })
    expect(useHumanCheck().mode.value).toBe('detection')
    await start({ botDetection: true, challengeSiteKey: SITE_KEY })
    expect(useHumanCheck().mode.value).toBe('challenge')
  })

  it('answers the challenge for the action with a site key off Vercel, where no proof is signed', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await start({ challengeSiteKey: SITE_KEY })
    await expect(useHumanCheck().token('waitlist')).resolves.toBe('XXXX.DUMMY.TOKEN.XXXX')
    expect(challengeAnswer).toHaveBeenCalledWith(SITE_KEY, expect.objectContaining({ action: 'waitlist' }))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('asks the app\'s server for a proof otherwise, bound to the subject, null when it signs none', async () => {
    const fetch = vi.fn(async () => Response.json({ proof: 'v1.1.signed' }))
    vi.stubGlobal('fetch', fetch)
    await start({ botDetection: true })
    await expect(useHumanCheck().token('contact')).resolves.toBe('v1.1.signed')
    expect(fetch).toHaveBeenCalledWith('/api/human-proof', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'contact' }) }))
    await useHumanCheck().token('waitlist', 'ada@example.com')
    expect(fetch).toHaveBeenLastCalledWith('/api/human-proof', expect.objectContaining({ body: JSON.stringify({ action: 'waitlist', subject: 'ada@example.com' }) }))
    fetch.mockResolvedValue(Response.json({ proof: null }))
    await expect(useHumanCheck().token('contact')).resolves.toBeNull()
  })

  it('on Vercel with a site key, takes the server\'s proof (good in a mutation too), and answers the challenge when it signs none', async () => {
    const fetch = vi.fn(async () => Response.json({ proof: 'v1.1.signed' }))
    vi.stubGlobal('fetch', fetch)
    await start({ botDetection: true, challengeSiteKey: SITE_KEY })
    await expect(useHumanCheck().token('waitlist')).resolves.toBe('v1.1.signed')
    expect(challengeAnswer).not.toHaveBeenCalled()
    fetch.mockResolvedValue(Response.json({ proof: null }))
    await expect(useHumanCheck().token('waitlist')).resolves.toBe('XXXX.DUMMY.TOKEN.XXXX')
  })

  it('rejects with the refusal, and keeps it in error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'forbidden', reason: 'bot_check' }, { status: 403 })))
    await start({ botDetection: true })
    const check = useHumanCheck()
    const failure = await check.token('contact').catch((error: unknown) => error)
    expect(getBackendError(failure)).toMatchObject({ code: 'forbidden', data: { reason: 'bot_check' }, message: 'We couldn\'t confirm you\'re a person. Try again.' })
    expect(check.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'bot_check' } })
    expect(check.isPending.value).toBe(false)

    challengeAnswer.mockRejectedValue(new Error('refused'))
    await start({ challengeSiteKey: SITE_KEY })
    expect(getBackendError(await useHumanCheck().token('contact').catch((error: unknown) => error))).toMatchObject({ code: 'forbidden', data: { reason: 'bot_check' } })
  })
})

describe('the challenge widget', () => {
  /** The provider's browser API, stood in: it records each widget's options so the test plays the provider. */
  function provider() {
    const widgets: Array<Record<string, (...args: never[]) => void>> = []
    const api = {
      render: vi.fn((_host: HTMLElement, options: Record<string, (...args: never[]) => void>) => {
        widgets.push(options)
        return `widget-${widgets.length}`
      }),
      remove: vi.fn(),
    }
    vi.stubGlobal('turnstile', api)
    return { api, widgets }
  }

  async function realAnswer() {
    const { challengeAnswer: answer } = await vi.importActual<typeof import('../../src/runtime/vue/protection/challenge')>('../../src/runtime/vue/protection/challenge')
    return answer
  }

  it('renders into a named group whose caption shows only while the provider asks for a click', async () => {
    const { api, widgets } = provider()
    const pending = (await realAnswer())(SITE_KEY, { action: 'waitlist', caption: 'Confirm you\'re a person to continue.' })
    await vi.waitFor(() => expect(api.render).toHaveBeenCalledOnce())
    const host = document.querySelector<HTMLElement>('[data-backend-challenge]')!
    expect(host.getAttribute('role')).toBe('group')
    expect(host.getAttribute('aria-label')).toBe('Confirm you\'re a person to continue.')
    // Its look is the stylesheet's: nothing inline an app could not restyle.
    expect(host.getAttribute('style')).toBeNull()
    const caption = host.querySelector('p')!
    expect(caption.hidden).toBe(true)
    expect(api.render.mock.calls[0]![1]).toMatchObject({ sitekey: SITE_KEY, action: 'waitlist', appearance: 'interaction-only' })
    widgets[0]!['before-interactive-callback']!()
    expect(caption.hidden).toBe(false)
    expect(host.hasAttribute('data-interactive')).toBe(true)
    ;(widgets[0]!.callback as (token: string) => void)('XXXX.DUMMY.TOKEN.XXXX')
    await expect(pending).resolves.toBe('XXXX.DUMMY.TOKEN.XXXX')
    expect(document.querySelector('[data-backend-challenge]')).toBeNull()
    expect(api.remove).toHaveBeenCalledWith('widget-1')
  })

  it('takes the focus while it asks for a click, and gives it back to where it was once gone', async () => {
    const { widgets } = provider()
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    const pending = (await realAnswer())(SITE_KEY, { caption: 'Confirm you\'re a person to continue.' })
    await vi.waitFor(() => expect(widgets).toHaveLength(1))
    // Invisible and unasked, it leaves the focus alone.
    expect(document.activeElement).toBe(button)
    widgets[0]!['before-interactive-callback']!()
    expect(document.activeElement).toBe(document.querySelector('[data-backend-challenge]'))
    widgets[0]!['error-callback']!()
    await expect(pending).rejects.toThrow(/provider refused/)
    expect(document.activeElement).toBe(button)
    button.remove()
  })
})
