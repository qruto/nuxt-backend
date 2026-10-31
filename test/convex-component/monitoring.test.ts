/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { internal } from '../../src/convex/components/backend/_generated/api'
import { MAINTENANCE_JOB, MAINTENANCE_TASKS } from '../../src/convex/components/backend/maintenance'
import { scheduleHeartbeat } from '../../src/convex/components/backend/monitoring'

// The backend component's cron checking in: its maintenance pass runs as
// mutations, which cannot fetch, so the task that finishes the pass last
// schedules a heartbeat action that posts the check-in to the DSN the app
// forwards: `ok`, or `error` when a task failed. A run that throws rolls
// the heartbeat back with it, which the monitor sees as a missed check-in.
// Only a deployment named production (or anything but development and
// preview) checks in. A stubbed fetch stands in for the monitoring service.

const DSN = 'https://public-key@o7.ingest.monitor.test/42'

let t: ReturnType<typeof convexTest>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  t = convexTest(schema, component.modules)
  resendComponent.register(t, 'resend')
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.MONITORING_DSN
  delete process.env.BACKEND_ENVIRONMENT
})

/** The DSN, and the environment env push names production by. */
function onProduction() {
  process.env.MONITORING_DSN = DSN
  process.env.BACKEND_ENVIRONMENT = 'production'
}

/** The functions scheduled so far, by name. */
async function scheduled(): Promise<string[]> {
  return t.run(async ctx => (await ctx.db.system.query('_scheduled_functions').collect()).map(job => job.name))
}

/** The check-ins posted so far, each its payload line. */
function checkIns(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map(([, init]) => {
    const [, item, payload] = ((init as RequestInit).body as string).trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(item).toEqual({ type: 'check_in' })
    return payload!
  })
}

describe('the maintenance cron\'s check-in', () => {
  test('a pass checks in once its last task finishes, to backend-maintenance with its hourly schedule', async () => {
    onProduction()
    await t.mutation(internal.maintenance.run, {})
    // Started, not finished: no check-in yet.
    expect(await scheduled()).not.toContain('monitoring:heartbeat')
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]![0]).toBe('https://o7.ingest.monitor.test/api/42/envelope/?sentry_key=public-key&sentry_version=7')
    expect(checkIns()).toEqual([expect.objectContaining({
      monitor_slug: 'backend-maintenance',
      status: 'ok',
      environment: 'production',
      monitor_config: expect.objectContaining({ schedule: { type: 'interval', value: 1, unit: 'hour' } }),
    })])
  })

  test('a pass whose task fails checks in as an error', async () => {
    onProduction()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(MAINTENANCE_TASKS, 'sessions').mockRejectedValueOnce(new Error('poison row'))
    await t.mutation(internal.maintenance.run, {})
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(checkIns()).toEqual([expect.objectContaining({ monitor_slug: 'backend-maintenance', status: 'error' })])
  })

  test('without a DSN, or from a dev or a preview deployment, nothing is scheduled or posted', async () => {
    for (const environment of [undefined, 'development', 'preview']) {
      if (environment) {
        process.env.MONITORING_DSN = DSN
        process.env.BACKEND_ENVIRONMENT = environment
      }
      await t.mutation(internal.maintenance.run, {})
      await t.finishAllScheduledFunctions(() => vi.runAllTimers())
      expect(await scheduled(), String(environment)).not.toContain('monitoring:heartbeat')
      expect(fetchMock).not.toHaveBeenCalled()
      vi.advanceTimersByTime(60 * 60 * 1000)
    }
    // A DSN on a deployment env push never named: no check-in either.
    process.env.MONITORING_DSN = DSN
    delete process.env.BACKEND_ENVIRONMENT
    expect(await t.action(internal.monitoring.heartbeat, { monitor: MAINTENANCE_JOB, schedule: { every: { hours: 1 } } })).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('a job that throws takes its heartbeat with it: the monitor sees a missed check-in', async () => {
    onProduction()
    await expect(t.run(async (ctx) => {
      await scheduleHeartbeat(ctx, MAINTENANCE_JOB, { every: { hours: 1 } })
      throw new Error('the run failed')
    })).rejects.toThrow('the run failed')
    expect(await scheduled()).toEqual([])
  })

  test('a check-in the service refuses is logged, and the job goes on', async () => {
    onProduction()
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await t.action(internal.monitoring.heartbeat, { monitor: MAINTENANCE_JOB, schedule: { every: { hours: 1 } } })).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('monitoring.report_failed'))
    warn.mockRestore()
  })
})
