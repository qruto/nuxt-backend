import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { ConvexError } from 'convex/values'

// <GiftList>, the gifts page's body, over a stand-in for useGifts: what a
// person received, to claim into a workspace they manage, and what they
// sent, with what they can still do until it is claimed: resend, readdress,
// redate, and cancel behind a recent sign-in. Every action reports in words:
// a polite status for an outcome, an alert for a refusal, and a busy button
// keeps focus.

const received = ref<Array<Record<string, unknown>>>([])
const sent = ref<Array<Record<string, unknown>>>([])
const loading = ref(false)
const workspaces = ref<Array<{ id: string, name: string, slug: string, createdAt: number }>>([])
const gifts = {
  received: computed(() => received.value),
  unclaimed: computed(() => received.value.filter(gift => gift.status === 'paid')),
  sent: computed(() => sent.value),
  isLoading: computed(() => loading.value),
  isPending: computed(() => false),
  error: computed(() => null),
  claim: vi.fn(async (_id: string, _options?: unknown) => true),
  resend: vi.fn(async (_id: string) => {}),
  changeRecipient: vi.fn(async (_id: string, _email: string) => {}),
  reschedule: vi.fn(async (_id: string, _at: unknown) => {}),
  cancel: vi.fn(async (_id: string) => {}),
}
const withReauthentication = vi.fn(async <T>(action: () => Promise<T>) => action())

vi.mock('../../src/runtime/vue/composables/use-gifts', () => ({ useGifts: () => gifts }))
vi.mock('../../src/runtime/vue/composables/use-workspace', () => ({ useWorkspace: () => ({ workspaces: computed(() => workspaces.value) }) }))
vi.mock('../../src/runtime/vue/composables/use-pricing', () => ({
  usePricing: () => ({
    plans: computed(() => [{ key: 'pro', name: 'Pro' }]),
    packs: computed(() => [{ key: 'credits500', name: '500 credits' }]),
  }),
}))
vi.mock('../../src/runtime/vue/composables/use-reauthentication', () => ({ useReauthentication: () => ({ withReauthentication }) }))

const { default: GiftList } = await import('../../src/runtime/vue/components/billing/GiftList.vue')

const waiting = { id: 'in-1', purchaserName: 'Grace', pack: 'credits500', productIds: ['p'], message: 'Enjoy!', status: 'paid', createdAt: 1, deliveredAt: Date.parse('2027-02-01T12:00:00Z') }
const scheduled = { id: 'out-1', item: 'credits500', recipientEmail: 'friend@example.com', status: 'scheduled', createdAt: 1, deliverAt: Date.parse('2027-03-14T09:00:00Z') }
const delivered = { id: 'out-2', item: 'pro', plan: 'pro', months: 3, recipientEmail: 'pal@example.com', status: 'delivered', createdAt: 1, deliveredAt: Date.parse('2027-02-02T09:00:00Z') }
const claimed = { id: 'out-3', item: 'credits500', recipientEmail: 'done@example.com', status: 'claimed', createdAt: 1, claimedAt: Date.parse('2027-02-03T09:00:00Z') }

beforeEach(() => {
  received.value = []
  sent.value = []
  loading.value = false
  workspaces.value = []
  for (const action of [gifts.claim, gifts.resend, gifts.changeRecipient, gifts.reschedule, gifts.cancel, withReauthentication]) action.mockClear()
})

describe('<GiftList>', () => {
  it('says so when there is nothing on either side', () => {
    const wrapper = mount(GiftList)
    expect(wrapper.attributes('data-state')).toBe('empty')
    expect(wrapper.findAll('[data-gift="empty"]').map(empty => empty.text())).toEqual(['No gifts for you yet.', 'You have not sent a gift yet.'])
  })

  it('is busy and says it is loading while the lists load', () => {
    loading.value = true
    const wrapper = mount(GiftList)
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-gift="loading"]').attributes('role')).toBe('status')
  })

  it('shows a received gift by what it is, who sent it and what they wrote, and claims it into the personal workspace', async () => {
    received.value = [waiting]
    const wrapper = mount(GiftList)
    const entry = wrapper.find('[data-gift="entry"]')
    expect(entry.attributes('role')).toBe('group')
    expect(entry.text()).toContain('500 credits')
    expect(entry.text()).toContain('From Grace')
    expect(entry.text()).toContain('Enjoy!')
    // A person with one workspace has nothing to choose.
    expect(entry.find('select').exists()).toBe(false)
    await entry.find('[data-gift="entry-claim"]').trigger('click')
    await flushPromises()
    expect(gifts.claim).toHaveBeenCalledWith('in-1', {})
    expect(wrapper.find('[data-gift="status"]').text()).toBe('Gift received. The credits arrive in a moment.')
  })

  it('offers the workspaces a person has when there is more than one, and claims into the chosen one', async () => {
    received.value = [{ ...waiting, pack: undefined, plan: 'pro', months: 3 }]
    workspaces.value = [{ id: 'org-a', name: 'Studio', slug: 'a', createdAt: 1 }, { id: 'org-b', name: 'Family', slug: 'b', createdAt: 1 }]
    const wrapper = mount(GiftList)
    expect(wrapper.find('[data-gift="entry-what"]').text()).toBe('3 months of Pro')
    const select = wrapper.find('select')
    expect(wrapper.find('label[data-gift="entry-target"]').text()).toContain('Receive into')
    await select.setValue('org-b')
    await wrapper.find('[data-gift="entry-claim"]').trigger('click')
    await flushPromises()
    expect(gifts.claim).toHaveBeenCalledWith('in-1', { workspaceId: 'org-b' })
  })

  it('offers the purchaser only what each state allows', () => {
    sent.value = [scheduled, delivered, claimed]
    const wrapper = mount(GiftList)
    const [first, second, third] = wrapper.findAll('[data-gift="section"]')[1]!.findAll('[data-gift="entry"]')
    const buttons = (entry: typeof first) => entry!.findAll('button').map(button => button.text())
    // Scheduled: change the address or the date, cancel; nothing to resend yet.
    expect(buttons(first)).toEqual(['Change recipient', 'Change the date', 'Cancel and refund'])
    expect(first!.text()).toContain('Arrives')
    // Delivered: resend and cancel, and the address, not the date.
    expect(buttons(second)).toEqual(['Send the notice again', 'Change recipient', 'Cancel and refund'])
    expect(second!.text()).toContain('3 months of Pro')
    // Claimed: nothing, it cannot be taken back.
    expect(buttons(third)).toEqual([])
    expect(wrapper.find('[data-gift="hint"]').text()).toContain('A claimed gift cannot be canceled')
  })

  it('opens a form for a new recipient, saves it, and says it changed', async () => {
    sent.value = [scheduled]
    const wrapper = mount(GiftList, { attachTo: document.body })
    await wrapper.find('[data-gift="entry-recipient"]').trigger('click')
    expect(wrapper.find('[data-gift="entry-recipient"]').attributes('aria-expanded')).toBe('true')
    const input = wrapper.find('[data-gift="entry-form"] input')
    expect(input.attributes('type')).toBe('email')
    await input.setValue('  new@example.com ')
    await wrapper.find('[data-gift="entry-form"]').trigger('submit')
    await flushPromises()
    expect(gifts.changeRecipient).toHaveBeenCalledWith('out-1', 'new@example.com')
    expect(wrapper.find('[data-gift="entry-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-gift="status"]').text()).toBe('The gift now goes to the new address.')
    wrapper.unmount()
  })

  it('moves the date of a scheduled gift from a date field', async () => {
    sent.value = [scheduled]
    const wrapper = mount(GiftList)
    await wrapper.find('[data-gift="entry-date"]').trigger('click')
    const input = wrapper.find('[data-gift="entry-form"] input')
    expect(input.attributes('type')).toBe('datetime-local')
    await input.setValue('2027-05-01T08:00')
    await wrapper.find('[data-gift="entry-form"]').trigger('submit')
    await flushPromises()
    expect(gifts.reschedule).toHaveBeenCalledWith('out-1', new Date('2027-05-01T08:00'))
  })

  it('resends a delivered gift\'s notice', async () => {
    sent.value = [delivered]
    const wrapper = mount(GiftList)
    await wrapper.find('[data-gift="entry-resend"]').trigger('click')
    await flushPromises()
    expect(gifts.resend).toHaveBeenCalledWith('out-2')
    expect(wrapper.find('[data-gift="status"]').text()).toBe('The notice was sent again.')
  })

  it('cancels behind a recent sign-in, and says why a cancel was refused', async () => {
    sent.value = [delivered]
    const wrapper = mount(GiftList)
    await wrapper.find('[data-gift="entry-cancel"]').trigger('click')
    await flushPromises()
    expect(withReauthentication).toHaveBeenCalledOnce()
    expect(gifts.cancel).toHaveBeenCalledWith('out-2')
    expect(wrapper.find('[data-gift="status"]').text()).toBe('The gift was canceled and refunded.')

    gifts.cancel.mockRejectedValueOnce(new ConvexError({ code: 'forbidden', reason: 'gift_claimed' }))
    await wrapper.find('[data-gift="entry-cancel"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-gift="list-error"]').attributes('role')).toBe('alert')
    expect(wrapper.find('[data-gift="list-error"]').text()).not.toBe('')
  })

  it('names each button by the gift it acts on', () => {
    sent.value = [delivered]
    const wrapper = mount(GiftList)
    const what = wrapper.find('[data-gift="entry-what"]').attributes('id')!
    for (const button of wrapper.findAll('[data-gift="entry"] button')) expect(button.attributes('aria-describedby')).toContain(what)
  })
})
