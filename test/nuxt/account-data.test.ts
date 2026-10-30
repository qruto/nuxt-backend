import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { ConvexError } from 'convex/values'
import type { AccountDeletion, AccountExportStatus } from '../../src/convex/integrations/account'

// useAccount and <AccountData> over a stand-in for `backend/account.ts`:
// the export status and the scheduled deletion as live reads, the export as
// an action, the deletion's request through useAuth and its cancellation as
// a mutation. Then the component by keyboard: the typed confirmation, Enter
// to delete, focus on the download once the file is ready, the date and the
// button that keeps the account, and the note an administrator acting as the
// account reads instead.

const status = ref<AccountExportStatus | null | undefined>(undefined)
const scheduled = ref<AccountDeletion | null | undefined>(null)
const runKeep = vi.fn(async (_args: { token?: string }) => true)
const authenticated = ref(true)
const impersonating = ref(false)
const runExport = vi.fn(async () => ({ url: 'https://files.example.com/export.json', createdAt: 1, expiresAt: 3_600_001, parts: [] }))
const deleteAccount = vi.fn(async (_confirmation: string) => {})
const withReauthentication = vi.fn(async <T>(action: () => Promise<T>) => action())

vi.mock('../../src/runtime/vue/utils/auth-session', () => ({ useAuthSession: () => ({
  user: computed(() => (authenticated.value ? { id: 'u_ada', email: 'Ada@Example.com' } : null)),
  isImpersonating: computed(() => impersonating.value),
  deleteAccount,
}),
}))
vi.mock('../../src/runtime/vue/composables/use-reauthentication', async original => ({
  ...await original<Record<string, unknown>>(),
  useReauthentication: () => ({ withReauthentication }),
}))
// The dialog is its own suite's (use-reauthentication.test.ts): here the action just runs.
vi.mock('../../src/runtime/vue/components/auth/ReauthenticateDialog.vue', async () => {
  const { defineComponent: define } = await import('vue')
  return { default: define({ name: 'ReauthenticateDialog', render: () => null }) }
})
vi.mock('nuxt-convex-module/client', async original => ({
  ...await original<Record<string, unknown>>(),
  useQuery_experimental: ({ query, args }: { query: string, args: MaybeRefOrGetter<unknown> }) => computed(() => {
    const data = query === 'account:getAccountDeletion' ? scheduled.value : status.value
    if (toValue(args) === 'skip' || data === undefined) return { status: 'pending' }
    return { status: 'success', data }
  }),
  useAction: () => runExport,
  useMutation: () => runKeep,
}))

const { useAccount } = await import('../../src/runtime/vue/composables/use-account')
const { registerComponents } = await import('../helpers/register-components')
await registerComponents('AccountData')
const { default: AccountData } = await import('../../src/runtime/vue/components/account/AccountData.vue')
const { ConvexAuthStateKey } = await import('nuxt-convex-module/client')
const { BackendApiKey } = await import('../../src/runtime/vue/utils/namespace')

const api = { exportAccountData: 'account:exportAccountData', getAccountExport: 'account:getAccountExport', getAccountDeletion: 'account:getAccountDeletion', cancelAccountDeletion: 'account:cancelAccountDeletion' } as never
const provide = {
  [ConvexAuthStateKey as symbol]: { isAuthenticated: computed(() => authenticated.value), isLoading: computed(() => false) },
  [BackendApiKey as symbol]: { account: api },
}

function inSetup<T>(runner: () => T): T {
  let result: T
  mount(defineComponent({
    setup() {
      result = runner()
      return () => h('div')
    },
  }), { global: { provide } })
  return result!
}

const LATEST = { url: 'https://files.example.com/export.json', createdAt: 1, expiresAt: 3_600_001, parts: [] }

beforeEach(() => {
  status.value = { latest: null, remaining: 3 }
  scheduled.value = null
  runKeep.mockReset().mockResolvedValue(true)
  authenticated.value = true
  impersonating.value = false
  runExport.mockClear()
  deleteAccount.mockReset().mockResolvedValue(undefined)
  withReauthentication.mockClear()
})

describe('useAccount', () => {
  it('reads the newest export and how many are left, and turns to nothing once signed out', async () => {
    const account = inSetup(() => useAccount({ api }))
    expect([account.latestExport.value, account.exportsLeft.value]).toEqual([null, 3])
    status.value = { latest: LATEST, remaining: 2 }
    await nextTick()
    expect([account.latestExport.value, account.exportsLeft.value]).toEqual([LATEST, 2])
    expect(account.confirmation.value).toBe('Ada@Example.com')
    authenticated.value = false
    await nextTick()
    expect([account.latestExport.value, account.exportsLeft.value, account.confirmation.value]).toEqual([null, 0, ''])
  })

  it('is loading until the status is read', () => {
    status.value = undefined
    const account = inSetup(() => useAccount({ api }))
    expect(account.isLoading.value).toBe(true)
    expect(account.latestExport.value).toBeUndefined()
  })

  it('exports through the action, and deletes through useAuth with the address typed', async () => {
    const account = inSetup(() => useAccount({ api }))
    await expect(account.exportData()).resolves.toEqual(LATEST)
    expect(runExport).toHaveBeenCalledWith({})
    await account.deleteAccount('ada@example.com')
    expect(deleteAccount).toHaveBeenCalledWith('ada@example.com')
  })

  it('reads the scheduled deletion live, and keeps the account through the mutation', async () => {
    const account = inSetup(() => useAccount({ api }))
    expect(account.deletion.value).toBeNull()
    scheduled.value = { requestedAt: 1_000, deletesAt: 2_000 }
    await nextTick()
    expect(account.deletion.value).toEqual({ requestedAt: 1_000, deletesAt: 2_000 })
    await expect(account.cancelDeletion()).resolves.toBe(true)
    expect(runKeep).toHaveBeenCalledWith({})
    authenticated.value = false
    await nextTick()
    expect(account.deletion.value).toBeNull()
  })

  it('is undefined while the deletion is read, and null without getAccountDeletion', async () => {
    scheduled.value = undefined
    const account = inSetup(() => useAccount({ api }))
    expect(account.deletion.value).toBeUndefined()
    expect(inSetup(() => useAccount({ api: { exportAccountData: 'account:exportAccountData' } as never })).deletion.value).toBeNull()
  })

  it('rejects a refused export, keeping the failure in error', async () => {
    runExport.mockRejectedValueOnce(new ConvexError({ code: 'rate_limited', limit: 'accountExport', retryAfter: 60_000 }))
    const account = inSetup(() => useAccount({ api }))
    await expect(account.exportData()).rejects.toBeInstanceOf(ConvexError)
    expect(account.error.value).toMatchObject({ code: 'rate_limited' })
  })
})

describe('<AccountData>', () => {
  const mountIt = () => mount(AccountData, { global: { provide }, attachTo: document.body })

  it('keeps deletion unavailable until the address typed matches, saying why on a press', async () => {
    const wrapper = mountIt()
    const input = wrapper.find('[data-account="confirm-input"]')
    const remove = wrapper.find('[data-account="delete"]')
    expect(remove.attributes('aria-disabled')).toBe('true')
    await input.setValue('grace@example.com')
    await remove.trigger('click')
    expect(deleteAccount).not.toHaveBeenCalled()
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('[data-account="confirm-hint"]').text()).toBe('That isn\'t your address. Type it exactly as it is shown.')
    await input.setValue(' ada@example.COM ')
    expect(remove.attributes('aria-disabled')).toBeUndefined()
    expect(input.attributes('aria-invalid')).toBeUndefined()
    wrapper.unmount()
  })

  it('schedules the deletion with Enter in the field, after a recent sign-in, and says so', async () => {
    const wrapper = mountIt()
    const input = wrapper.find('[data-account="confirm-input"]')
    await input.setValue('ada@example.com')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(withReauthentication).toHaveBeenCalledTimes(1)
    expect(deleteAccount).toHaveBeenCalledWith('ada@example.com')
    expect(wrapper.emitted('scheduled')).toHaveLength(1)
    expect(wrapper.find('[data-account="status"]').text()).toBe('Your account is scheduled for deletion.')
    wrapper.unmount()
  })

  it('shows the only-owner refusal as an alert, and deletes nothing more on a second press while it runs', async () => {
    let refuse!: (error: unknown) => void
    deleteAccount.mockImplementationOnce(() => new Promise((_, reject) => {
      refuse = reject
    }))
    const wrapper = mountIt()
    await wrapper.find('[data-account="confirm-input"]').setValue('ada@example.com')
    const remove = wrapper.find('[data-account="delete"]')
    ;(remove.element as HTMLElement).focus()
    await remove.trigger('click')
    expect(remove.attributes('aria-disabled')).toBe('true')
    expect(remove.text()).toBe('Scheduling the deletion…')
    await remove.trigger('click')
    expect(deleteAccount).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(remove.element)
    refuse(new ConvexError({ code: 'forbidden', reason: 'sole_owner' }))
    await flushPromises()
    expect(wrapper.find('[data-account="error"][role="alert"]').text()).toBe('You\'re the only owner of a workspace others belong to. Make another member an owner first.')
    expect(wrapper.emitted('error')).toHaveLength(1)
    wrapper.unmount()
  })

  it('lists the account\'s files as zip parts beside the download', async () => {
    status.value = { latest: { ...LATEST, parts: [{ url: 'https://files.example.com/p1.zip', bytes: 10, files: 2 }, { url: 'https://files.example.com/p2.zip', bytes: 5, files: 1 }] }, remaining: 2 }
    const wrapper = mountIt()
    await flushPromises()
    const links = wrapper.findAll('[data-account="export-part-link"]')
    expect(links.map(link => [link.text(), link.attributes('href')])).toEqual([
      ['Your files, part 1 of 2', 'https://files.example.com/p1.zip'],
      ['Your files, part 2 of 2', 'https://files.example.com/p2.zip'],
    ])
    wrapper.unmount()
  })

  it('shows the date of a scheduled deletion and a button that keeps the account, instead of the form', async () => {
    scheduled.value = { requestedAt: Date.UTC(2027, 0, 1), deletesAt: Date.UTC(2027, 0, 31) }
    const wrapper = mountIt()
    await flushPromises()
    const section = wrapper.find('[data-account="section-delete"]')
    expect(section.attributes('data-state')).toBe('scheduled')
    expect(section.find('[data-account="warning"]').text()).toMatch(/^Your account will be deleted on .*2027.*Until then it works as before\.$/)
    expect(wrapper.find('[data-account="confirm-input"]').exists()).toBe(false)
    await wrapper.find('[data-account="keep"]').trigger('click')
    await flushPromises()
    expect(runKeep).toHaveBeenCalledWith({})
    expect(wrapper.emitted('kept')).toHaveLength(1)
    expect(wrapper.find('[data-account="status"]').text()).toBe('Your account is kept.')
    wrapper.unmount()
  })

  it('moves focus to the download once the file is ready', async () => {
    const wrapper = mountIt()
    const button = wrapper.find('[data-account="export"]')
    ;(button.element as HTMLElement).focus()
    await button.trigger('click')
    status.value = { latest: LATEST, remaining: 2 }
    await flushPromises()
    const link = wrapper.find('[data-account="export-link"]')
    expect(link.attributes('href')).toBe(LATEST.url)
    expect(document.activeElement).toBe(link.element)
    expect(wrapper.emitted('exported')).toEqual([[LATEST]])
    wrapper.unmount()
  })

  it('gives an administrator acting as the account a note instead of either control', () => {
    impersonating.value = true
    const wrapper = mountIt()
    expect(wrapper.find('[data-account="refused"]').text()).toBe('An administrator acting as this account can\'t export its data or delete it.')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(false)
    wrapper.unmount()
  })
})
