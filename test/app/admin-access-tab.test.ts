import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { backendError } from '../../src/convex/errors'
import type { AccessConsole } from '../../src/convex/integrations/launch'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { registerComponents } from '../helpers/register-components'

await registerComponents('AdminAccess')
const { default: AdminAccess } = await import('../../src/runtime/vue/components/admin/AdminAccess.vue')

// The admin console's Access tab over the backend mock: the codes and links
// it makes (each shown once, a link as an address on this site), the copy of
// what it shows, the revocations behind a confirmation, and the invitations
// by address from a pasted list, with what was skipped and why.

enableAutoUnmount(afterEach)
afterEach(() => {
  resetBackendMock()
  vi.restoreAllMocks()
})

const DAY = 86_400_000
const AT = Date.parse('2026-10-01T10:00:00.000Z')

function consoleOf(fields: Partial<AccessConsole> = {}): AccessConsole {
  return { phase: 'invite-only', phases: ['early-access', 'invite-only', 'public'], invites: [], admissions: [], ...fields }
}

/** An administrator, the console answering `fields`, and every change answered. */
function administrator(fields: Partial<AccessConsole> = {}): BackendMock {
  const backend = createBackendMock({ user: { role: 'admin' }, queries: { 'access:getAccessConsole': consoleOf(fields) } })
  backend.stub('access:createInvite', () => ({ id: 'i-new', code: '7KQ2M-XW9PA' }))
  for (const name of ['access:setAccessPhase', 'access:revokeInvite'] as const) backend.stub(name, () => null)
  backend.stub('access:admitEmails', () => ({ admitted: [], skipped: [] }))
  return backend
}

async function tab(props: Record<string, unknown> = { confirm: () => true }): Promise<VueWrapper> {
  const wrapper = await mountSuspended(AdminAccess, { props, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const message = (wrapper: VueWrapper) => wrapper.find('[data-admin="message"]')
const cells = (row: { findAll: (selector: string) => Array<{ text: () => string }> }) => row.findAll('th, td').map(cell => cell.text())

describe('the Access tab', () => {
  it('makes an access link that expires at the end of its day, and shows it once as an address on this site', async () => {
    const backend = administrator()
    const wrapper = await tab()
    const form = wrapper.find('[data-admin="access-create"]')
    await form.find('select').setValue('link')
    // A link needs an expiry; a code does not.
    expect(form.find('input[type="date"]').attributes('required')).toBeDefined()
    const label = form.find<HTMLInputElement>('input[type="text"]')
    await label.setValue('press')
    await form.find('input[type="number"]').setValue('5')
    await form.find('input[type="date"]').setValue('2026-12-31')
    await form.trigger('submit')
    await flushPromises()

    expect(backend.callsTo('access:createInvite')).toEqual([{ kind: 'link', label: 'press', maxUses: 5, expiresAt: new Date('2026-12-31T23:59:59').getTime() }])
    const shown = wrapper.find('[data-admin="access-shown"]')
    expect(shown.attributes('role')).toBe('status')
    expect(shown.text()).toContain('Copy it now: it is shown once.')
    expect(shown.find('[data-admin="access-secret"]').text()).toBe(`${window.location.origin}/invite#7KQ2M-XW9PA`)
    // The label goes for the next one; the kind and its uses stay.
    expect(label.element.value).toBe('')
  })

  it('copies what it shows and says so, and says nothing was copied where the clipboard is refused', async () => {
    administrator()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const wrapper = await tab()
    await wrapper.find('[data-admin="access-create"] input[type="text"]').setValue('friends')
    await wrapper.find('[data-admin="access-create"]').trigger('submit')
    await flushPromises()
    const copy = wrapper.find('[data-admin="access-copy"]')
    expect(copy.text()).toBe('Copy')
    await copy.trigger('click')
    await flushPromises()
    expect(write).toHaveBeenCalledWith('7KQ2M-XW9PA')
    expect(copy.text()).toBe('Copied')

    write.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    await copy.trigger('click')
    await flushPromises()
    expect(copy.text()).toBe('Copy')
  })

  it('lists codes and links with their uses, expiry and status, and offers Revoke only on one that still admits', async () => {
    administrator({
      invites: [
        { id: 'i1', kind: 'code', label: 'meetup', maxUses: 30, uses: 2, status: 'valid', expiresAt: null, createdAt: AT },
        { id: 'i2', kind: 'link', label: 'press', maxUses: 5, uses: 1, status: 'expired', expiresAt: AT - DAY, createdAt: AT },
        { id: 'i3', kind: 'code', label: 'beta', maxUses: 1, uses: 1, status: 'used-up', expiresAt: null, createdAt: AT },
        { id: 'i4', kind: 'code', label: 'old', maxUses: 9, uses: 0, status: 'revoked', expiresAt: null, createdAt: AT },
      ],
    })
    const wrapper = await tab()
    const table = wrapper.find('[data-admin="access-invites-table"]')
    expect(table.findAll('thead th').map(header => header.text())).toEqual(['Label', 'Kind', 'Uses', 'Expires', 'Status'])
    const rows = table.findAll('tbody tr')
    expect(rows.map(row => row.attributes('data-state'))).toEqual(['valid', 'expired', 'used-up', 'revoked'])
    expect(cells(rows[0]!)).toEqual(['meetup', 'Invite code', '2 of 30', 'Never', 'Active', 'Revoke'])
    expect(cells(rows[1]!).slice(0, 2)).toEqual(['press', 'Access link'])
    expect(cells(rows[1]!)[4]).toBe('Expired')
    expect(cells(rows[2]!)[4]).toBe('Used up')
    expect(cells(rows[3]!)[4]).toBe('Revoked')
    // Each row is headed by its label, for a screen reader moving across it.
    expect(rows[0]!.find('th').attributes('scope')).toBe('row')
    expect(table.findAll('[data-admin="access-revoke"]')).toHaveLength(1)
  })

  it('revokes a code only once the administrator confirms, in the tab\'s own dialog', async () => {
    const backend = administrator({ invites: [{ id: 'i1', kind: 'code', label: 'meetup', maxUses: 30, uses: 2, status: 'valid', expiresAt: null, createdAt: AT }] })
    const wrapper = await tab({})
    const revoke = wrapper.find('[data-admin="access-revoke"]')
    await revoke.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-confirm="text"]').text()).toBe('Revoke meetup? It stops admitting anyone at once.')
    await wrapper.find('[data-confirm="cancel"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('access:revokeInvite')).toEqual([])

    await revoke.trigger('click')
    await flushPromises()
    await wrapper.find('[data-confirm="accept"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('access:revokeInvite')).toEqual([{ id: 'i1' }])
  })

  it('moves the phase only once the administrator says yes', async () => {
    const backend = administrator()
    const asked: string[] = []
    let answer = false
    const wrapper = await tab({ confirm: (text: string) => {
      asked.push(text)
      return answer
    } })
    const toPublic = wrapper.findAll('[data-admin="access-move"]').find(button => button.attributes('data-phase') === 'public')!
    await toPublic.trigger('click')
    await flushPromises()
    expect(asked).toEqual(['Move the app to Public? This takes effect on the next sign-up.'])
    expect(backend.callsTo('access:setAccessPhase')).toEqual([])

    answer = true
    await toPublic.trigger('click')
    await flushPromises()
    expect(backend.callsTo('access:setAccessPhase')).toEqual([{ phase: 'public' }])
  })

  it('invites a pasted list, says how many and what it skipped and why, and empties the list', async () => {
    const backend = administrator()
    backend.stub('access:admitEmails', () => ({ admitted: ['ada@example.org', 'grace@example.org'], skipped: [{ email: 'alan@example.org', reason: 'account' }, { email: 'nope', reason: 'malformed' }] }))
    const wrapper = await tab()
    const form = wrapper.find('[data-admin="access-admit-form"]')
    const list = form.find<HTMLTextAreaElement>('textarea')
    // The field is described by the section's hint, which says what may be pasted.
    expect(wrapper.find(`#${list.attributes('aria-describedby')}`).text()).toContain('One address per line')
    await list.setValue('ada@example.org\n grace@example.org , alan@example.org;nope;;\n')
    await form.find('input[type="text"]').setValue('beta-2')
    const emailThem = form.find<HTMLInputElement>('input[type="checkbox"]')
    await emailThem.setValue(true)
    await form.trigger('submit')
    await flushPromises()

    expect(backend.callsTo('access:admitEmails')).toEqual([{ emails: ['ada@example.org', 'grace@example.org', 'alan@example.org', 'nope'], label: 'beta-2', email: true }])
    expect(message(wrapper).text()).toBe('2 addresses invited.')
    expect(wrapper.findAll('[data-admin="access-skipped"] li').map(row => row.text())).toEqual([
      'Skipped alan@example.org: already has an account',
      'Skipped nope: not an address',
    ])
    expect(list.element.value).toBe('')
    expect(emailThem.element.checked).toBe(false)
  })

  it('sends no label and no email unless asked for, and counts one address as one', async () => {
    const backend = administrator()
    backend.stub('access:admitEmails', () => ({ admitted: ['ada@example.org'], skipped: [] }))
    const wrapper = await tab()
    const form = wrapper.find('[data-admin="access-admit-form"]')
    await form.find('textarea').setValue('ada@example.org')
    await form.find('input[type="text"]').setValue('   ')
    await form.trigger('submit')
    await flushPromises()
    expect(backend.callsTo('access:admitEmails')).toEqual([{ emails: ['ada@example.org'] }])
    expect(message(wrapper).text()).toBe('1 address invited.')
    expect(wrapper.find('[data-admin="access-skipped"]').exists()).toBe(false)
  })

  it('lists the invited addresses, waiting or signed up, and revokes only a waiting one', async () => {
    const backend = administrator({
      admissions: [
        { id: 'a1', email: 'grace@example.org', source: 'invitation', label: 'beta-1', expiresAt: AT + DAY, usedAt: null, createdAt: AT },
        { id: 'a2', email: 'ada@example.org', source: 'invitation', label: null, expiresAt: AT + DAY, usedAt: AT, createdAt: AT },
      ] as AccessConsole['admissions'],
    })
    const wrapper = await tab()
    const rows = wrapper.findAll('[data-admin="access-admissions-table"] tbody tr')
    expect(rows.map(row => row.attributes('data-state'))).toEqual(['waiting', 'used'])
    expect(cells(rows[0]!)[0]).toBe('grace@example.org')
    expect(cells(rows[0]!)[3]).toBe('Waiting')
    expect(cells(rows[1]!).slice(1, 2)).toEqual([''])
    expect(cells(rows[1]!)[3]).toBe('Signed up')
    expect(rows[1]!.find('[data-admin="access-revoke"]').exists()).toBe(false)
    await rows[0]!.find('[data-admin="access-revoke"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('access:revokeInvite')).toEqual([{ id: 'a1' }])
  })

  it('says when nothing was made or invited yet', async () => {
    administrator()
    const wrapper = await tab()
    expect(wrapper.findAll('[data-admin="empty"]').map(note => [note.text(), note.attributes('role')])).toEqual([
      ['No codes or links yet.', 'status'],
      ['No addresses invited yet.', 'status'],
    ])
  })

  it('shows nothing once when making a code is refused, and says why as an alert', async () => {
    const backend = administrator()
    backend.fail('access:createInvite', backendError('invalid_input', { field: 'label' }, 'A label names the cohort.'))
    const wrapper = await tab()
    await wrapper.find('[data-admin="access-create"] input[type="text"]').setValue('x')
    await wrapper.find('[data-admin="access-create"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-admin="access-shown"]').exists()).toBe(false)
    expect(message(wrapper).attributes()).toMatchObject({ 'role': 'alert', 'data-state': 'error' })
    // In the reader's words, from the catalog: the server's English stays in the error.
    expect(message(wrapper).text()).toBe('That input isn\'t valid. Check it and try again.')
    expect(wrapper.find<HTMLInputElement>('[data-admin="access-create"] input[type="text"]').element.value).toBe('x')
  })

  it('makes one change at a time: the busy button says so, and keeps its focus', async () => {
    const backend = administrator()
    let land!: () => void
    backend.stub('access:createInvite', () => new Promise((resolve) => {
      land = () => resolve({ id: 'i-new', code: 'SLOW1-CODE2' })
    }))
    const wrapper = await tab()
    await wrapper.find('[data-admin="access-create"] input[type="text"]').setValue('x')
    await wrapper.find('[data-admin="access-create"]').trigger('submit')
    await flushPromises()
    const submit = wrapper.find('[data-admin="access-create-submit"]')
    expect(submit.text()).toBe('Creating…')
    expect(submit.attributes('aria-disabled')).toBe('true')
    expect(submit.attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-admin="access-move"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('access:setAccessPhase')).toEqual([])
    land()
    await flushPromises()
    expect(submit.text()).toBe('Create')
    expect(wrapper.find('[data-admin="access-secret"]').text()).toBe('SLOW1-CODE2')
  })
})
