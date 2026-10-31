// The challenge widget (Cloudflare Turnstile), loaded on first use: the
// provider's script once per page, then one interaction-only widget per
// answer, removed as soon as it answers. It stays invisible unless the
// provider asks for a click; then it shows at the foot of the page, under a
// caption in the reader's language, and takes the focus, which goes back
// where it was once the widget is gone. While a modal dialog is open (the
// "Confirm it's you" dialog, or an app's own sign-in modal), the widget
// lives inside it: everything outside an open modal dialog is inert, so a
// widget there could be neither clicked nor focused. Its look is the neutral
// stylesheet's (`[data-backend-challenge]` in auth.css), so an app themes it
// like any other part.

import { trustedScriptUrl } from '../trusted-types'

/** The provider's script, rendering only what it is asked to. */
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** How long an answer may take, a click included, before the request goes without one. */
const ANSWER_TIMEOUT_MS = 120_000

/** The part of the provider's browser API the widget uses. */
interface ChallengeApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string | null | undefined
  remove: (widgetId: string) => void
}

let loading: Promise<ChallengeApi> | undefined

/** The provider's script, once per page; a failed load is not kept, so the next answer tries again. */
function loadChallenge(): Promise<ChallengeApi> {
  const ready = (globalThis as { turnstile?: ChallengeApi }).turnstile
  if (ready) return Promise.resolve(ready)
  loading ??= new Promise<ChallengeApi>((resolve, reject) => {
    const script = document.createElement('script')
    // Through the package's Trusted Types policy: the page's CSP requires one at this sink.
    script.src = trustedScriptUrl(SCRIPT_URL)
    script.async = true
    script.onload = () => {
      const api = (globalThis as { turnstile?: ChallengeApi }).turnstile
      if (api) resolve(api)
      else reject(new Error('[nuxt-backend] The challenge script loaded without its API.'))
    }
    script.onerror = () => reject(new Error('[nuxt-backend] The challenge script did not load.'))
    document.head.append(script)
  }).catch((cause: unknown) => {
    loading = undefined
    throw cause
  })
  return loading
}

/** The widget's host: a named group at the foot of the page, its caption hidden until the provider asks for a click. */
function challengeHost(caption: string): HTMLElement {
  const host = document.createElement('div')
  host.dataset.backendChallenge = ''
  host.setAttribute('role', 'group')
  host.setAttribute('aria-label', caption)
  // Focusable from script only: it takes the focus while it asks for a click.
  host.tabIndex = -1
  const text = document.createElement('p')
  text.textContent = caption
  text.hidden = true
  host.append(text)
  return host
}

/** Whether an open dialog is modal; a browser without `:modal` treats every open one as if it were. */
function isModal(dialog: Element): boolean {
  try {
    return dialog.matches(':modal')
  }
  catch {
    return true
  }
}

/**
 * Where the widget's host goes: the open dialog the person is in (the one
 * holding the focus), else the last open modal dialog, else the page.
 */
function challengeParent(): HTMLElement {
  const current = document.activeElement?.closest('dialog[open]')
  if (current instanceof HTMLElement) return current
  const modal = [...document.querySelectorAll<HTMLElement>('dialog[open]')].filter(isModal).at(-1)
  return modal ?? document.body
}

/** Where the focus was before the widget took it, to give it back; `null` while it has not. */
interface FocusReturn { to: HTMLElement | null }

/** Give the focus back where it was, if the widget took it and that element is still on the page. */
function restoreFocus(saved: FocusReturn): void {
  if (saved.to?.isConnected) saved.to.focus()
}

/**
 * One answer to the challenge under `siteKey`, given for `action` when one
 * is named. Rejects when the provider refuses, the answer expires before it
 * is used, or nobody answers within two minutes.
 */
export async function challengeAnswer(siteKey: string, { action, caption }: { action?: string, caption: string }): Promise<string> {
  const api = await loadChallenge()
  const host = challengeHost(caption)
  const text = host.firstElementChild as HTMLElement
  challengeParent().append(host)
  return new Promise<string>((resolve, reject) => {
    // Set once the widget renders; read when it answers, which is never before.
    const widget: { id?: string | null } = {}
    const focus: FocusReturn = { to: null }
    const finish = (settle: () => void) => {
      clearTimeout(timer)
      try {
        if (widget.id) api.remove(widget.id)
      }
      catch {
        // Already gone with its host.
      }
      host.remove()
      restoreFocus(focus)
      settle()
    }
    const fail = (reason: string) => () => finish(() => reject(new Error(`[nuxt-backend] The challenge was not answered: ${reason}.`)))
    const timer = setTimeout(fail('no answer in time'), ANSWER_TIMEOUT_MS)
    widget.id = api.render(host, {
      'sitekey': siteKey,
      ...(action ? { action } : {}),
      'appearance': 'interaction-only',
      'callback': (token: string) => finish(() => resolve(token)),
      'error-callback': fail('the provider refused'),
      'expired-callback': fail('the answer expired'),
      'timeout-callback': fail('the click came too late'),
      'before-interactive-callback': () => {
        text.hidden = false
        host.dataset.interactive = ''
        // The person is asked for a click: the focus moves to the named group, the widget next in tab order.
        const active = document.activeElement
        focus.to = active instanceof HTMLElement && active !== document.body ? active : null
        host.focus()
      },
      'after-interactive-callback': () => {
        text.hidden = true
      },
    })
  })
}
