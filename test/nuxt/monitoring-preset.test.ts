import { type EffectScope, effectScope, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNuxtApp } from '#imports'

// The monitoring preset's browser plugin, over a stand-in for the SDK:
// session replay only while this browser allows the `replay` purpose (and
// only when the app lists it), stopped without sending what it held when
// the visitor withdraws; and the feedback widget when the app config turns
// it on, in the words of the `feedback` labels, asking for no name, address
// or screenshot. Both integrations load on demand, so each check waits for
// the import to land.

const sdk = vi.hoisted(() => {
  const replay = {
    mode: undefined as string | undefined,
    getRecordingMode: () => replay.mode,
    stop: vi.fn(async () => {
      replay.mode = undefined
    }),
    startBuffering: vi.fn(() => {
      replay.mode = 'buffer'
    }),
  }
  return {
    replay,
    added: [] as Array<{ name: string, options: Record<string, unknown> }>,
    installed: false,
  }
})

vi.mock('@sentry/nuxt', () => ({
  getClient: () => ({ getIntegrationByName: (name: string) => (name === 'Replay' && sdk.installed ? sdk.replay : undefined) }),
  replayIntegration: (options: Record<string, unknown>) => ({ name: 'Replay', options }),
  feedbackIntegration: (options: Record<string, unknown>) => ({ name: 'Feedback', options }),
  addIntegration: (integration: { name: string, options: Record<string, unknown> }) => {
    sdk.added.push(integration)
    if (integration.name === 'Replay') {
      sdk.installed = true
      sdk.replay.mode = 'buffer'
    }
  },
}))

const config = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({ useBackendConfig: () => config.value }))

const { default: plugin, applyReplay } = await import('../../src/runtime/monitoring/sdk/observe.client')
const { STORAGE_CHOICE_STATE } = await import('../../src/runtime/vue/utils/storage-choice')

let scope: EffectScope | undefined

/** Run the plugin's setup in the test app, as Nuxt would, its watchers in a scope each test stops. */
async function install() {
  const app = useNuxtApp()
  scope = effectScope()
  await scope.run(() => app.runWithContext(() => (plugin as unknown as { setup: () => void }).setup()))
  return app
}

beforeEach(() => {
  sdk.added.length = 0
  sdk.installed = false
  sdk.replay.mode = undefined
  sdk.replay.stop.mockClear()
  sdk.replay.startBuffering.mockClear()
  useNuxtApp().payload.state[`$s${STORAGE_CHOICE_STATE}`] = undefined
})

afterEach(() => {
  scope?.stop()
  config.value = {}
})

describe('session replay', () => {
  it('waits for the visitor to allow it, and stops without sending what it held when they withdraw', async () => {
    config.value = { consent: { purposes: ['replay'] } }
    const app = await install()
    expect(sdk.added).toEqual([])
    app.payload.state[`$s${STORAGE_CHOICE_STATE}`] = 'preferences,replay'
    await vi.waitFor(() => expect(sdk.added).toEqual([{ name: 'Replay', options: { maskAllText: true, maskAllInputs: true, blockAllMedia: true } }]))
    app.payload.state[`$s${STORAGE_CHOICE_STATE}`] = 'preferences'
    await nextTick()
    expect(sdk.replay.stop).toHaveBeenCalledWith({ flush: false })
    app.payload.state[`$s${STORAGE_CHOICE_STATE}`] = 'replay'
    await nextTick()
    expect(sdk.replay.startBuffering).toHaveBeenCalledOnce()
    expect(sdk.added).toHaveLength(1)
  })

  it('never starts when the app does not list the purpose, whatever the cookie says', async () => {
    const app = await install()
    app.payload.state[`$s${STORAGE_CHOICE_STATE}`] = 'replay'
    await nextTick()
    expect(sdk.added).toEqual([])
  })

  it('does nothing to stop when it never ran', async () => {
    await applyReplay(false)
    expect(sdk.replay.stop).not.toHaveBeenCalled()
  })

  it('adds nothing when the visitor withdraws while it loads', async () => {
    let arrive: (load: (options: Record<string, unknown>) => { name: string, options: Record<string, unknown> }) => void = () => {}
    const added: unknown[] = []
    const controls = {
      getReplay: () => undefined,
      addIntegration: (integration: unknown) => added.push(integration),
      loadReplay: () => new Promise(resolve => arrive = resolve),
    }
    const allowing = applyReplay(true, controls as never)
    await applyReplay(false, controls as never)
    arrive(options => ({ name: 'Replay', options }))
    await allowing
    expect(added).toEqual([])
  })
})

describe('the feedback widget', () => {
  it('is added when the app config turns it on, asking for no name, address or screenshot, in the labels\' words', async () => {
    config.value = { monitoring: { feedback: true }, labels: { feedback: { trigger: 'Something broke?' } } }
    await install()
    await vi.waitFor(() => expect(sdk.added).toHaveLength(1))
    expect(sdk.added).toEqual([{
      name: 'Feedback',
      options: expect.objectContaining({
        showName: false,
        showEmail: false,
        enableScreenshot: false,
        triggerLabel: 'Something broke?',
        formTitle: 'Report a problem',
        submitButtonLabel: 'Send report',
        successMessageText: 'Thank you. Your report reached the team.',
      }),
    }])
  })

  it('stays off by default', async () => {
    await install()
    expect(sdk.added).toEqual([])
  })
})
