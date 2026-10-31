import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { clearNuxtData } from '#app'
import { backendError } from '../../src/convex/errors'
import type { ExperimentResult, FlagValues } from '../../src/convex/integrations/flags'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { useExperiment, useExperimentDiscount, useExperimentResults } from '../../src/runtime/vue/composables/use-experiment'
import { diagnostics } from '../../src/runtime/vue/utils/live-query'

// Experiments over the backend mock: the variant whoever is looking reads,
// the exposure recorded the first time a signed-in person is shown a
// running one (once per account and key on the page, again after a failed
// try), a price test's promotion, and the Experiments view's winner.

enableAutoUnmount(afterEach)
beforeEach(() => clearNuxtData())
afterEach(() => {
  resetBackendMock()
  diagnostics.enabled = false
  vi.restoreAllMocks()
})

const FLAGS = 'flags:getFlags'
const EXPOSE = 'flags:exposeExperiment'

const flags = (fields: Partial<FlagValues> = {}): FlagValues => ({ flags: {}, maintenance: null, variants: { headline: 'strip' }, running: ['headline'], discounts: {}, ...fields })

// The page remembers whom it exposed for as long as it is open, as a tab does: a new account per test.
let account = 0
function signedIn(values: FlagValues = flags()): BackendMock {
  const backend = createBackendMock({ user: { id: `user-${++account}` }, queries: { [FLAGS]: values } })
  backend.stub(EXPOSE, (args: { key: string }) => ({ variant: values.variants[args.key] ?? 'control' }))
  return backend
}

/** Run a composable inside a page of the test's Nuxt app. */
async function inPage<T>(composable: () => T): Promise<T> {
  let result!: T
  await mountSuspended(defineComponent({
    setup() {
      result = composable()
      return () => h('div')
    },
  }))
  await flushPromises()
  return result
}

describe('useExperiment', () => {
  it('reads the variant for whoever is looking, and records a signed-in person\'s exposure once', async () => {
    const backend = signedIn()
    const experiment = await inPage(() => useExperiment('headline'))
    expect(experiment.variant.value).toBe('strip')
    expect(experiment.isLoading.value).toBe(false)
    expect(backend.callsTo(EXPOSE)).toEqual([{ key: 'headline' }])

    // A later read of the same experiment, or a second reader of it, sends nothing more.
    backend.state.queries[FLAGS] = flags({ flags: { other: true } })
    await flushPromises()
    await inPage(() => useExperiment('headline'))
    expect(backend.callsTo(EXPOSE)).toHaveLength(1)
  })

  it('records nothing for a visitor, nor for an experiment the person is not in', async () => {
    const backend = createBackendMock({ queries: { [FLAGS]: flags({ variants: { headline: 'control' }, running: [] }) } })
    const experiment = await inPage(() => useExperiment('headline'))
    // The control, for a signed-out visitor.
    expect(experiment.variant.value).toBe('control')
    expect(backend.callsTo(EXPOSE)).toEqual([])

    const member = signedIn(flags({ running: [] }))
    await inPage(() => useExperiment('headline'))
    expect(member.callsTo(EXPOSE)).toEqual([])
  })

  it('tries a failed exposure again on the next read', async () => {
    const backend = signedIn()
    backend.fail(EXPOSE, backendError('unavailable', { service: 'backend', reason: 'unexpected' }))
    await inPage(() => useExperiment('headline'))
    expect(backend.callsTo(EXPOSE)).toHaveLength(1)

    backend.stub(EXPOSE, () => ({ variant: 'strip' }))
    backend.state.queries[FLAGS] = flags({ flags: { touched: true } })
    await flushPromises()
    expect(backend.callsTo(EXPOSE)).toEqual([{ key: 'headline' }, { key: 'headline' }])
  })

  it('follows a key that changes, exposing the person to the experiment it names now', async () => {
    const backend = signedIn(flags({ variants: { headline: 'strip', hero: 'video' }, running: ['headline', 'hero'] }))
    const key = ref('headline')
    const experiment = await inPage(() => useExperiment(key))
    key.value = 'hero'
    await nextTick()
    expect(experiment.variant.value).toBe('video')
    expect(backend.callsTo(EXPOSE)).toEqual([{ key: 'headline' }, { key: 'hero' }])
  })

  it('is loading, and records nothing, until the flags are read', async () => {
    const backend = createBackendMock({ user: { id: `user-${++account}` } })
    backend.stub(EXPOSE, () => ({ variant: 'strip' }))
    const experiment = await inPage(() => useExperiment('headline'))
    expect(experiment.variant.value).toBeUndefined()
    expect(experiment.isLoading.value).toBe(true)
    expect(backend.callsTo(EXPOSE)).toEqual([])

    backend.state.queries[FLAGS] = flags()
    await flushPromises()
    expect(experiment.variant.value).toBe('strip')
    expect(experiment.isLoading.value).toBe(false)
    expect(backend.callsTo(EXPOSE)).toEqual([{ key: 'headline' }])
  })

  it('reads a flag without variants as no variant, and says so in development', async () => {
    diagnostics.enabled = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const backend = signedIn()
    const experiment = await inPage(() => useExperiment('maintenance'))
    expect(experiment.variant.value).toBeUndefined()
    expect(backend.callsTo(EXPOSE)).toEqual([])
    expect(warn.mock.calls.map(call => String(call[0]))).toContainEqual(expect.stringContaining('useExperiment(\'maintenance\'): the flag declares no variants'))
  })

  it('reads no variant, and loads nothing, for an app without backend/flags.ts', async () => {
    const backend = signedIn()
    const experiment = await inPage(() => useExperiment('headline', { api: {} }))
    expect(experiment.variant.value).toBeUndefined()
    expect(experiment.isLoading.value).toBe(false)
    expect(backend.calls).toEqual([])
  })
})

describe('useExperimentDiscount', () => {
  it('is the promotion of the first price test the person is in, and records that exposure', async () => {
    const backend = signedIn(flags({ variants: { priceTest: 'half' }, running: ['priceTest'], discounts: { priceTest: 'launch50' } }))
    const discount = await inPage(() => useExperimentDiscount())
    expect(discount.value).toBe('launch50')
    expect(backend.callsTo(EXPOSE)).toEqual([{ key: 'priceTest' }])
  })

  it('is none without a price test, and exposes nobody', async () => {
    const backend = signedIn()
    const discount = await inPage(() => useExperimentDiscount())
    expect(discount.value).toBeUndefined()
    expect(backend.callsTo(EXPOSE)).toEqual([])
  })
})

describe('useExperimentResults', () => {
  const result = (fields: Partial<ExperimentResult> = {}): ExperimentResult => ({
    key: 'headline',
    description: 'Headline test.',
    goal: 'checkout',
    guardrails: [],
    by: 'user',
    running: true,
    winner: null,
    override: { enabled: true, percentage: 50 } as ExperimentResult['override'],
    startedAt: null,
    variants: [],
    verdict: { kind: 'too_few' } as unknown as ExperimentResult['verdict'],
    ...fields,
  })

  it('lists the experiments live, and picks a winner while keeping the rest of the override', async () => {
    const backend = createBackendMock({ user: { role: 'admin' }, queries: { 'flags:getExperiments': [result()] } })
    backend.stub('flags:setFlag', () => null)
    const view = await inPage(() => useExperimentResults())
    expect(view.experiments.value?.map(experiment => experiment.key)).toEqual(['headline'])
    expect(view.isLoading.value).toBe(false)

    await view.pick(view.experiments.value![0]!, 'strip')
    expect(backend.callsTo('flags:setFlag')).toEqual([{ key: 'headline', override: { enabled: true, percentage: 50, winner: 'strip' } }])
  })

  it('runs an experiment again by taking its winner off, and keeps an override-less flag at its default', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    backend.stub('flags:setFlag', () => null)
    const view = await inPage(() => useExperimentResults())
    await view.pick(result({ winner: 'strip', override: { enabled: true, winner: 'strip' } as ExperimentResult['override'] }), null)
    await view.pick(result({ override: null }), 'strip')
    expect(backend.callsTo('flags:setFlag')).toEqual([
      { key: 'headline', override: { enabled: true } },
      { key: 'headline', override: { winner: 'strip' } },
    ])
  })

  it('reads nothing signed out, says why a read was refused, and names what it needs to pick', async () => {
    const visitor = createBackendMock({ queries: { 'flags:getExperiments': [result()] } })
    const signedOut = await inPage(() => useExperimentResults())
    expect([signedOut.experiments.value, signedOut.isLoading.value, signedOut.error.value]).toEqual([undefined, false, null])
    expect(visitor.calls).toEqual([])

    const member = createBackendMock({ user: {} })
    member.fail('flags:getExperiments', backendError('forbidden', { reason: 'not_admin' }))
    const refused = await inPage(() => useExperimentResults())
    expect(refused.error.value).toMatchObject({ code: 'forbidden' })

    const bare = await inPage(() => useExperimentResults({ api: {} }))
    await expect(bare.pick(result(), 'strip')).rejects.toThrow('`setFlag`')
  })
})
