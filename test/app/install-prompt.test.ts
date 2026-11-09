import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { UseInstallPromptReturn } from '../../src/runtime/vue/composables/use-install-prompt'

// useInstallPrompt on the browser's install events: Chromium's
// `beforeinstallprompt` hands over a dialog the app's button opens once,
// `appinstalled` and a standalone window say the app is installed, and every
// other browser leaves both false. The page's state is shared, so each test
// takes a fresh copy of the module.

type Choice = 'accepted' | 'dismissed'

/** Chromium's install event, with the dialog it hands over answering `choice`. */
function installEvent(choice: Choice) {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>, userChoice: Promise<{ outcome: Choice }> }
  event.prompt = vi.fn(async () => {})
  event.userChoice = Promise.resolve({ outcome: choice })
  return event
}

/** The display modes a window answers `matches` for. */
function displayMode(...modes: string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: modes.some(mode => query === `(display-mode:${mode})`), media: query, addEventListener() {}, removeEventListener() {} }))
}

let useInstallPrompt: () => UseInstallPromptReturn
let listenForInstallPrompt: () => void

beforeEach(async () => {
  vi.resetModules()
  ;({ useInstallPrompt, listenForInstallPrompt } = await import('../../src/runtime/vue/composables/use-install-prompt'))
  displayMode()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mounted() {
  let state: UseInstallPromptReturn | undefined
  await mountSuspended(defineComponent({
    setup() {
      state = useInstallPrompt()
      return () => h('div')
    },
  }))
  await flushPromises()
  return state!
}

describe('useInstallPrompt', () => {
  it('keeps the dialog the browser hands over, opens it once from the app, and reads an accepted install as installed', async () => {
    // The plugin listens from the app's start: the event may come before any component mounts.
    listenForInstallPrompt()
    const event = installEvent('accepted')
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    const install = await mounted()
    expect(install.canInstall.value).toBe(true)
    expect(install.installed.value).toBe(false)
    expect(await install.prompt()).toBe('accepted')
    expect(event.prompt).toHaveBeenCalledOnce()
    expect(install.canInstall.value).toBe(false)
    expect(install.installed.value).toBe(true)
    // The dialog is spent: a second call has nothing to show.
    expect(await install.prompt()).toBe('unavailable')
  })

  it('spends the dialog on a dismissal too, and leaves the app uninstalled', async () => {
    const install = await mounted()
    window.dispatchEvent(installEvent('dismissed'))
    expect(install.canInstall.value).toBe(true)
    expect(await install.prompt()).toBe('dismissed')
    expect(install.canInstall.value).toBe(false)
    expect(install.installed.value).toBe(false)
  })

  it('offers nothing where the browser hands no dialog over', async () => {
    const install = await mounted()
    expect(install.canInstall.value).toBe(false)
    expect(install.installed.value).toBe(false)
    expect(await install.prompt()).toBe('unavailable')
  })

  it('reads the app as installed in its own window, on the Home Screen, and once the browser installed it', async () => {
    displayMode('standalone')
    expect((await mounted()).installed.value).toBe(true)

    displayMode('window-controls-overlay')
    expect((await mounted()).installed.value).toBe(true)

    displayMode()
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    expect((await mounted()).installed.value).toBe(true)
    Reflect.deleteProperty(navigator, 'standalone')

    const install = await mounted()
    window.dispatchEvent(installEvent('accepted'))
    expect(install.canInstall.value).toBe(true)
    window.dispatchEvent(new Event('appinstalled'))
    expect(install.installed.value).toBe(true)
    expect(install.canInstall.value).toBe(false)
  })
})
