import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { backendError } from '../../src/convex/errors'
import { createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'
import { registerComponents } from '../helpers/register-components'

await registerComponents('AdminQueue')
const { default: AdminQueue } = await import('../../src/runtime/vue/components/admin/AdminQueue.vue')

// The admin console's Queue tab over the backend mock: the queue at a
// glance, the tiers with their trimmed slots, the models, the jobs and the
// dead letters, and the changes it sends to backend/jobs.ts, asking for a
// recent sign-in through its own <ReauthenticateDialog> when one is refused
// for an old one.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

const queue = {
  paused: false,
  pausedAi: false,
  concurrency: 1,
  configuredConcurrency: 3,
  shared: 1,
  averageMs: 42_000,
  running: 1,
  waiting: 4,
  guests: null as { running: number, waiting: number } | null,
  trimmed: true,
  tiers: [
    { name: 'priority', feature: 'priority_queue', headStart: 600_000, perOwner: 2, dedicated: 1, dedicatedInEffect: 0, budget: null, overridden: [], running: 1, waiting: 1 },
    { name: 'standard', feature: null, headStart: 0, perOwner: 1, dedicated: 0, dedicatedInEffect: 0, budget: { units: 60, period: 86_400_000 }, overridden: ['budgetUnits'], running: 0, waiting: 3 },
  ],
  models: [{ model: 'google/gemini-3.1-flash-image-preview', perMinute: 3, min: 1, max: 30, count429: 2, last429At: null }],
}
const failed = { id: 'job-9', kind: 'strips:render', owner: 'workspace-1', status: 'failed', guest: false, attempts: 4, retries: 0, cost: 30, joinedAt: 0, lastError: 'Error: Too Many Requests', deadLetter: true }
const guest = { id: 'job-10', kind: 'strips:preview', owner: 'guest:AdaAdaAdaAdaAdaAdaAda0', status: 'queued', guest: true, attempts: 0, retries: 0, cost: 10, joinedAt: 0, deadLetter: false }

describe('the Queue tab', () => {
  it('shows the queue, its trimmed slots and its dead letters, and sends each change', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    backend.stub('jobs:getQueue', () => queue)
    backend.stub('jobs:listJobs', () => ({ page: [failed], isDone: true, continueCursor: '' }))
    for (const name of ['jobs:setQueue', 'jobs:retryJob', 'jobs:discardJob'] as const) backend.stub(name, () => null)

    const tab = await mountSuspended(AdminQueue)
    await flushPromises()
    const text = tab.text()
    expect(text).toContain('1 running, 4 waiting')
    expect(text).toContain('1 at once, 1 shared')
    expect(text).toContain('trimmed')
    expect(text).toContain('1 (0 in effect)')
    expect(text).toContain('60 per 24 h')
    expect(text).toContain('google/gemini-3.1-flash-image-preview')
    expect(tab.find('[data-admin-queue-tier="standard"] input[aria-label="standard: Budget"]').element).toHaveProperty('value', '60')

    await tab.findAll('[data-admin-queue="button"]').find(button => button.text() === 'Pause')!.trigger('click')
    expect(backend.callsTo('jobs:setQueue')).toEqual([{ paused: true }])

    await tab.findAll('[data-admin-queue="button"]').find(button => button.text() === 'Back to code')!.trigger('click')
    expect(backend.callsTo('jobs:setQueue')).toEqual([{ paused: true }, { concurrency: null }])

    await tab.findAll('button').find(button => button.text() === 'Retry')!.trigger('click')
    expect(backend.callsTo('jobs:retryJob')).toEqual([{ jobId: 'job-9' }])
  })

  it('counts the guest jobs that run and wait, once the queue takes guests', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    backend.stub('jobs:getQueue', () => ({ ...queue, guests: { running: 1, waiting: 2 } }))
    backend.stub('jobs:listJobs', () => ({ page: [], isDone: true, continueCursor: '' }))
    const tab = await mountSuspended(AdminQueue)
    await flushPromises()
    expect(tab.find('[data-admin-queue="overview"]').text()).toContain('Guests: 1 running, 2 waiting')
  })

  it('says nothing of guests for a queue that takes none', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    backend.stub('jobs:getQueue', () => queue)
    backend.stub('jobs:listJobs', () => ({ page: [], isDone: true, continueCursor: '' }))
    const tab = await mountSuspended(AdminQueue)
    await flushPromises()
    expect(tab.find('[data-admin-queue="overview"]').text()).not.toContain('Guests')
  })

  it('marks a visitor\'s job as a guest\'s, whatever tier its claim would give it', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    backend.stub('jobs:getQueue', () => queue)
    backend.stub('jobs:listJobs', () => ({ page: [guest], isDone: true, continueCursor: '' }))
    const tab = await mountSuspended(AdminQueue)
    await flushPromises()
    const cells = tab.findAll('[data-state="queued"] td').map(cell => cell.text())
    expect(cells.slice(0, 2)).toEqual(['guest:AdaAdaAdaAdaAdaAdaAda0', 'Guest'])
  })

  it('asks for a recent sign-in when a change is refused for an old one, and makes the change once it is given', async () => {
    const backend = createBackendMock({ user: { role: 'admin', email: 'admin@example.com' } })
    backend.stub('jobs:getQueue', () => queue)
    backend.stub('jobs:listJobs', () => ({ page: [], isDone: true, continueCursor: '' }))
    let refused = false
    backend.stub('jobs:setQueue', () => {
      if (refused) return null
      refused = true
      throw backendError('reauthentication_required')
    })

    const tab = await mountSuspended(AdminQueue)
    await flushPromises()
    expect(tab.find('[data-reauthenticate="dialog"]').exists()).toBe(false)
    await tab.findAll('[data-admin-queue="button"]').find(button => button.text() === 'Pause')!.trigger('click')
    await flushPromises()
    expect(tab.find('[data-reauthenticate="dialog"]').exists()).toBe(true)
    expect(backend.callsTo('jobs:setQueue')).toEqual([{ paused: true }])

    // A code to the account's own address, then the change goes through.
    await tab.findAll('[data-reauthenticate="dialog"] button').find(button => /code/i.test(button.text()))!.trigger('click')
    await flushPromises()
    await tab.find('[data-reauthenticate="dialog"] input').setValue('123456')
    await tab.find('[data-reauthenticate="dialog"] form').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('jobs:setQueue')).toEqual([{ paused: true }, { paused: true }])
    expect(tab.find('[data-reauthenticate="dialog"]').exists()).toBe(false)
  })

  it('shows nothing of the queue to anyone but an administrator', async () => {
    const backend = createBackendMock({ user: {} })
    backend.stub('jobs:getQueue', () => null)
    const tab = await mountSuspended(AdminQueue)
    await flushPromises()
    expect(tab.text()).toBe('')
  })
})
