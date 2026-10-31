import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'
import { useJob } from '../../src/runtime/vue/composables/use-job'

// useJob over the backend mock: a queued job's place in line, a running
// one's progress, a failed one's catalog error, and cancel through
// `jobs:cancelJob`.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

function inSetup<T>(composable: () => T): T {
  let result!: T
  mount(defineComponent({
    setup() {
      result = composable()
      return () => h('div')
    },
  }))
  return result
}

const job = (fields: Record<string, unknown>) => ({ id: 'job-1', kind: 'strips:render', joinedAt: 0, canCancel: true, ...fields })

describe('useJob', () => {
  it('reads a waiting job\'s place in line, then its progress', async () => {
    const backend = createBackendMock({ user: {} })
    let current: Record<string, unknown> = job({ status: 'queued', waitingOn: 'line', position: 3, estimatedWait: 90_000 })
    backend.stub('jobs:getJob', () => current)
    const view = inSetup(() => useJob('job-1'))
    await flushPromises()
    expect(view.status.value).toBe('queued')
    expect(view.waitingOn.value).toBe('line')
    expect(view.position.value).toBe(3)
    expect(view.estimatedWait.value).toBe(90_000)
    expect(view.canCancel.value).toBe(true)

    current = job({ status: 'running', progress: { done: 2, total: 6, label: 'Panel 2' } })
    backend.stub('jobs:getJob', () => current)
    await flushPromises()
    expect(view.waitingOn.value).toBeUndefined()
    expect(view.position.value).toBeNull()
    expect(view.progress.value).toEqual({ done: 2, total: 6, label: 'Panel 2' })
  })

  it('reads what made a done job\'s result, and nothing before it is done', async () => {
    const backend = createBackendMock({ user: {} })
    const provenance = { models: ['google/gemini-3.1-flash-image-preview'], finishedAt: 1_793_000_000_000, inputs: ['strip_1', 'photo_1'] }
    let current: Record<string, unknown> = job({ status: 'running', progress: { done: 1, total: 3 }, provenance })
    backend.stub('jobs:getJob', () => current)
    const view = inSetup(() => useJob('job-1'))
    await flushPromises()
    expect(view.provenance.value).toBeUndefined()

    current = job({ status: 'done', result: { stripId: 'strip_1' }, provenance })
    backend.stub('jobs:getJob', () => current)
    await flushPromises()
    expect(view.provenance.value).toEqual(provenance)
  })

  it('reads no position while the owner holds the job', async () => {
    const backend = createBackendMock({ user: {} })
    backend.stub('jobs:getJob', () => job({ status: 'queued', waitingOn: 'owner', position: null, estimatedWait: 30_000 }))
    const view = inSetup(() => useJob(() => 'job-1'))
    await flushPromises()
    expect(view.waitingOn.value).toBe('owner')
    expect(view.position.value).toBeNull()
    expect(view.estimatedWait.value).toBe(30_000)
  })

  it('reads a failed job\'s refusal as a catalog error with a sentence to show', async () => {
    const backend = createBackendMock({ user: {} })
    backend.stub('jobs:getJob', () => job({ status: 'failed', error: { code: 'unavailable', service: 'ai', reason: 'stalled' } }))
    const view = inSetup(() => useJob('job-1'))
    await flushPromises()
    expect(view.error.value).toMatchObject({ code: 'unavailable', data: { reason: 'stalled' }, message: 'This job stopped responding. Your credits were refunded.' })
  })

  it('cancels through cancelJob, and waits while the id is empty', async () => {
    const backend = createBackendMock({ user: {} })
    backend.stub('jobs:getJob', () => job({ status: 'queued', waitingOn: 'line', position: 1 }))
    backend.stub('jobs:cancelJob', () => null)
    const empty = inSetup(() => useJob(() => undefined))
    await flushPromises()
    expect(empty.status.value).toBeUndefined()
    expect(backend.callsTo('jobs:getJob')).toEqual([])

    const view = inSetup(() => useJob('job-1'))
    await flushPromises()
    await view.cancel()
    expect(backend.callsTo('jobs:cancelJob')).toEqual([{ jobId: 'job-1' }])
  })
})
