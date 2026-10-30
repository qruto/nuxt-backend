import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { busyAttributes, useActionState, useFocusReturn, useLiveRegion } from '../../src/runtime/vue/a11y'
import { loginBindings, type LoginBindingsContext } from '../../src/runtime/vue/utils/login-bindings'
import { pricingBindings } from '../../src/runtime/vue/utils/pricing-bindings'

// `#backend/a11y` and the bindings the headless composables return: the
// attribute and handler bags an app spreads on markup of its own, which carry
// the packaged components' accessibility.

describe('#backend/a11y', () => {
  it('runs an action once at a time, keeping the button focusable while it runs', async () => {
    let release!: () => void
    const fn = vi.fn(() => new Promise<string>((resolve) => {
      release = () => resolve('done')
    }))
    const action = useActionState(fn, { busy: 'Saving…' })
    expect(action.bind['aria-disabled']).toBeUndefined()
    expect(action.bind['data-state']).toBe('idle')
    const first = action.run()
    expect(action.pending.value).toBe(true)
    expect(action.bind['aria-disabled']).toBe('true')
    expect(action.bind['data-state']).toBe('pending')
    // A second press while it runs does nothing.
    await expect(action.run()).resolves.toBeUndefined()
    expect(fn).toHaveBeenCalledTimes(1)
    release()
    await expect(first).resolves.toBe('done')
    expect(action.pending.value).toBe(false)
  })

  it('keeps a failure in `error` and never rejects', async () => {
    const action = useActionState(() => {
      throw Object.assign(new Error('Too many tries.'), { data: { code: 'rate_limited', data: {}, message: 'Too many tries.' } })
    })
    await expect(action.run()).resolves.toBeUndefined()
    expect(action.error.value).not.toBeNull()
  })

  it('speaks through a region that stays mounted: politely, or as an alert', async () => {
    const Region = defineComponent({
      setup() {
        const live = useLiveRegion()
        return { live }
      },
      render() {
        return h('p', this.live.bind)
      },
    })
    const wrapper = mount(Region)
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-live')).toBe('polite')
    wrapper.vm.live.announce('Title saved.')
    await nextTick()
    expect(wrapper.text()).toBe('Title saved.')
    wrapper.vm.live.announce('It failed.', { alert: true })
    await nextTick()
    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.text()).toBe('It failed.')
  })

  it('returns focus to the control that had it, once focus fell off the page', async () => {
    const Panel = defineComponent({
      setup() {
        const focus = useFocusReturn()
        const open = ref(true)
        return { focus, open }
      },
      render() {
        return h('div', [this.open ? h('button', { 'data-probe': 'close' }, 'Close') : null, h('button', { 'data-probe': 'other' }, 'Other')])
      },
    })
    const wrapper = mount(Panel, { attachTo: document.body })
    const other = wrapper.find('[data-probe="other"]').element as HTMLElement
    other.focus()
    wrapper.vm.focus.remember()
    other.blur()
    wrapper.vm.focus.restore()
    expect(document.activeElement).toBe(other)
    wrapper.unmount()
  })

  it('marks a busy control with aria-disabled and data-state, never disabled', () => {
    expect(busyAttributes(true)).toEqual({ 'aria-disabled': 'true', 'data-disabled': '', 'data-state': 'pending' })
    expect(busyAttributes(false)).toEqual({ 'aria-disabled': undefined, 'data-disabled': undefined, 'data-state': 'idle' })
  })
})

describe('the login bindings', () => {
  const context = (overrides: Partial<LoginBindingsContext> = {}): LoginBindingsContext => ({
    step: ref('verify-code'),
    isPending: ref(false),
    error: ref(null),
    lastMethod: ref('passkey'),
    email: ref('ada@example.com'),
    signInWithPasskey: vi.fn(),
    goTo: vi.fn(),
    ids: { error: 'e', sent: 's', lastUsed: 'l' },
    sentText: () => 'We sent a code to ada@example.com.',
    errorText: () => null,
    movedByPerson: () => false,
    ...overrides,
  })

  it('gives the code field its one-time-code attributes and the sent note as its description', () => {
    const bind = loginBindings(context())
    expect(bind.codeInput).toMatchObject({ 'inputmode': 'numeric', 'autocomplete': 'one-time-code', 'required': true, 'aria-describedby': 's' })
    expect(bind.emailInput).toMatchObject({ type: 'email', autocomplete: 'username webauthn' })
  })

  it('marks a refused field invalid and describes it with the refusal', () => {
    const bind = loginBindings(context({ error: ref({ code: 'invalid_input', data: { field: 'otp' }, message: 'Wrong code.' }) }))
    expect(bind.codeInput).toMatchObject({ 'aria-invalid': 'true', 'data-invalid': '', 'aria-describedby': 's e' })
  })

  it('keeps a busy submit focusable, and the passkey button described by its "Last used" mark', () => {
    const bind = loginBindings(context({ isPending: computed(() => true) }))
    expect(bind.submit).toMatchObject({ 'type': 'submit', 'aria-disabled': 'true', 'data-state': 'pending' })
    expect(bind.passkeyButton).toMatchObject({ 'aria-describedby': 'l' })
  })

  it('goes back one step, and says a sent code politely and a failure as an alert', () => {
    const goTo = vi.fn()
    const sent = loginBindings(context({ goTo }))
    ;(sent.back.onClick as () => void)()
    expect(goTo).toHaveBeenCalledWith('request-code')
    expect(sent.status).toMatchObject({ 'role': 'status', 'aria-live': 'polite', 'textContent': 'We sent a code to ada@example.com.' })
    const failed = loginBindings(context({ errorText: () => 'Wrong code.' }))
    expect(failed.status).toMatchObject({ role: 'alert', textContent: 'Wrong code.', id: 'e' })
  })
})

describe('the pricing bindings', () => {
  const plan = { key: 'pro', name: 'Pro' }

  it('switches the interval as a switch, and names each card by its plan', () => {
    const interval = ref<'month' | 'year'>('month')
    const bind = pricingBindings({ interval, setInterval: next => (interval.value = next), pending: ref(null), manages: () => true, act: vi.fn() })
    expect(bind.periodSwitch).toMatchObject({ 'role': 'switch', 'aria-checked': 'false', 'data-state': 'unchecked' })
    ;(bind.periodSwitch.onClick as () => void)()
    expect(interval.value).toBe('year')
    expect(bind.periodSwitch['aria-checked']).toBe('true')
    expect(bind.planCard(plan)).toEqual({ 'role': 'group', 'aria-label': 'Pro' })
    expect(bind.packCard({ key: 'credits100', name: '100 credits' })).toEqual({ 'role': 'group', 'aria-label': '100 credits' })
  })

  it('runs the plan\'s action once, keeps its button focusable while it runs, and hides it from who manages no billing', () => {
    const act = vi.fn()
    const pending = ref<string | null>(null)
    const bind = pricingBindings({ interval: ref('month'), setInterval: vi.fn(), pending, manages: () => true, act })
    ;(bind.planAction(plan).onClick as () => void)()
    expect(act).toHaveBeenCalledWith(plan)
    pending.value = 'pro'
    expect(bind.planAction(plan)).toMatchObject({ 'aria-disabled': 'true' })
    ;(bind.planAction(plan).onClick as () => void)()
    expect(act).toHaveBeenCalledTimes(1)
    const managed = pricingBindings({ interval: ref('month'), setInterval: vi.fn(), pending: ref(null), manages: () => false, act })
    expect(managed.planAction(plan)).toEqual({ hidden: true })
  })
})
