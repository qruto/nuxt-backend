import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { backendError } from '../../src/convex/errors'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import OnboardingFlow from '../../src/runtime/vue/components/account/OnboardingFlow.vue'
import { useOnboarding } from '../../src/runtime/vue/composables/use-onboarding'
import { registerComponents } from '../helpers/register-components'

// The first run over the backend mock: the steps in order, what each one
// saves, the steps an app adds, and the stamp that ends it. The redirect
// that leads a new account here is in onboarding-redirect.test.ts.

await registerComponents('OnboardingFlow')

let backend: BackendMock

type Wrapper = Awaited<ReturnType<typeof mountSuspended>>
const step = (wrapper: Wrapper) => wrapper.find('[data-onboarding="step"]').attributes('data-step')
const press = async (wrapper: Wrapper, selector: string) => {
  await wrapper.find(selector).trigger('click')
  await flushPromises()
}

beforeEach(() => {
  backend = createBackendMock({ user: { name: '', email: 'ada@example.com' }, workspaces: [{ id: 'ws-1', name: 'Personal', slug: 'personal' }] })
  backend.state.queries['account:getOnboarding'] = { onboardedAt: null }
  backend.stub('account:completeOnboarding', () => ({ onboardedAt: 1_000 }))
  backend.stub('organization.listUserInvitations', () => [])
  backend.stub('updateUser', () => ({ status: true }))
  backend.stub('organization.update', () => ({}))
  backend.stub('organization.inviteMember', (args: { email: string }) => ({ id: 'inv-1', email: args.email, status: 'pending', workspaceId: 'ws-1', inviterId: 'user-1', expiresAt: 0 }))
})

describe('<OnboardingFlow>', () => {
  it('walks the steps in order, saving what each asks for, and stamps the first run once at the end', async () => {
    const wrapper = await mountSuspended(OnboardingFlow, { props: { steps: ['profile', 'workspace', 'teammates'] }, attachTo: document.body })
    await flushPromises()
    expect(step(wrapper)).toBe('profile')
    expect(wrapper.find('[data-onboarding="progress"]').text()).toBe('Step 1 of 3')
    expect(wrapper.find('[data-onboarding="steps"] [aria-current="step"]').text()).toBe('About you')

    // Name and picture go to the account.
    await wrapper.find('[data-onboarding="input-name"]').setValue('  Ada Lovelace ')
    await wrapper.find('[data-onboarding="input-image"]').setValue('https://example.com/ada.png')
    await wrapper.find('[data-onboarding="profile"]').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('updateUser')).toEqual([{ name: 'Ada Lovelace', image: 'https://example.com/ada.png' }])
    expect(step(wrapper)).toBe('workspace')
    expect(wrapper.find('[data-onboarding="progress"]').text()).toBe('Step 2 of 3')
    // Focus follows the person to the new step, and a polite status says where they are.
    expect(document.activeElement).toBe(wrapper.find('[data-onboarding="step"]').element)
    expect(wrapper.find('[data-onboarding="root"] > [data-onboarding="status"]').text()).toBe('Step 2 of 3: Your workspace')

    // The workspace is renamed.
    expect(wrapper.find<HTMLInputElement>('[data-onboarding="input-workspace"]').element.value).toBe('Personal')
    await wrapper.find('[data-onboarding="input-workspace"]').setValue('Studio 9')
    await wrapper.find('[data-onboarding="workspace"] form').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('organization.update')).toEqual([{ data: { name: 'Studio 9' }, organizationId: 'ws-1' }])
    expect(step(wrapper)).toBe('teammates')

    // Teammates are invited one by one; Get started ends the run.
    await wrapper.find('[data-onboarding="input-email"]').setValue('grace@example.com')
    await wrapper.find('[data-onboarding="invite"]').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('organization.inviteMember')).toEqual([{ email: 'grace@example.com', role: 'member', organizationId: undefined }])
    expect(wrapper.find('[data-onboarding="invited"]').text()).toBe('grace@example.com')
    expect(wrapper.find('[data-onboarding="teammates"] [data-onboarding="status"]').text()).toBe('Invitation sent to grace@example.com.')
    expect(backend.callsTo('account:completeOnboarding')).toEqual([])
    await press(wrapper, '[data-onboarding="teammates"] [data-onboarding="next"]')
    expect(backend.callsTo('account:completeOnboarding')).toHaveLength(1)
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(wrapper.find('[data-onboarding="finished"]').text()).toBe('You are all set.')
    wrapper.unmount()
  })

  it('leaves a step as it is when the person skips it, and goes back a step', async () => {
    const wrapper = await mountSuspended(OnboardingFlow, { props: { steps: ['profile', 'workspace'] } })
    await flushPromises()
    await press(wrapper, '[data-onboarding="profile"] [data-onboarding="skip"]')
    expect(backend.callsTo('updateUser')).toEqual([])
    expect(step(wrapper)).toBe('workspace')
    expect(wrapper.find('[data-onboarding="back"]').exists()).toBe(true)
    await press(wrapper, '[data-onboarding="back"]')
    expect(step(wrapper)).toBe('profile')
    expect(wrapper.find('[data-onboarding="back"]').exists()).toBe(false)
    expect(backend.callsTo('account:completeOnboarding')).toEqual([])
    wrapper.unmount()
  })

  it('ends the whole first run from "Skip setup" on any step, and stamps it once', async () => {
    const wrapper = await mountSuspended(OnboardingFlow, { props: { steps: ['profile', 'workspace'] } })
    await flushPromises()
    await press(wrapper, '[data-onboarding="skip-all"]')
    expect(backend.callsTo('account:completeOnboarding')).toHaveLength(1)
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(wrapper.find('[data-onboarding="finished"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the person on the step and says why when the deployment refuses to save it', async () => {
    backend.fail('updateUser', backendError('rate_limited', { limit: 'profile', retryAfter: 30_000 }))
    const wrapper = await mountSuspended(OnboardingFlow, { props: { steps: ['profile', 'workspace'] } })
    await flushPromises()
    await wrapper.find('[data-onboarding="input-name"]').setValue('Ada')
    await wrapper.find('[data-onboarding="profile"]').trigger('submit')
    await flushPromises()
    expect(step(wrapper)).toBe('profile')
    expect(wrapper.find('[data-onboarding="profile"] [role="alert"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('refuses a picture that is not an https address, before it asks the server', async () => {
    const wrapper = await mountSuspended(OnboardingFlow, { props: { steps: ['profile', 'workspace'] } })
    await flushPromises()
    await wrapper.find('[data-onboarding="input-image"]').setValue('javascript:alert(1)')
    await wrapper.find('[data-onboarding="profile"]').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('updateUser')).toEqual([])
    expect(step(wrapper)).toBe('profile')
    const image = wrapper.find('[data-onboarding="input-image"]')
    expect(image.attributes('aria-invalid')).toBe('true')
    expect(wrapper.find(`#${image.attributes('aria-describedby')}`).attributes('role')).toBe('alert')
    wrapper.unmount()
  })

  it('offers a pending invitation on the workspace step, and joining it makes that workspace the active one', async () => {
    backend.stub('organization.listUserInvitations', () => [{ id: 'inv-9', status: 'pending', workspaceId: 'ws-9', organizationName: 'Acme', email: 'ada@example.com' }])
    backend.stub('organization.acceptInvitation', () => ({ member: { id: 'mem-1', organizationId: 'ws-9', userId: 'user-1', role: 'member' } }))
    const wrapper = await mountSuspended(OnboardingFlow, { props: { steps: ['workspace', 'teammates'] } })
    await flushPromises()
    expect(wrapper.find('[data-onboarding="invitation"] p').text()).toBe('You were invited to Acme.')
    await press(wrapper, '[data-onboarding="accept"]')
    expect(backend.callsTo('organization.acceptInvitation')).toEqual([{ invitationId: 'inv-9' }])
    expect(step(wrapper)).toBe('teammates')
    wrapper.unmount()
  })

  it('renames the person\'s own workspace, never the team\'s one they joined and have active', async () => {
    const team = { id: 'ws-9', name: 'Acme', slug: 'acme', createdAt: 0, role: 'admin', members: [
      { id: 'mem-0', workspaceId: 'ws-9', userId: 'user-0', role: 'owner' },
      { id: 'mem-1', workspaceId: 'ws-9', userId: 'user-1', role: 'admin' },
    ] }
    backend.state.workspaces = [{ id: 'ws-1', name: 'Ada\'s workspace', slug: 'personal-user-1', createdAt: 0, role: 'owner' }, team]
    backend.state.activeWorkspace = 'ws-9'
    const wrapper = await mountSuspended(OnboardingFlow, { props: { steps: ['workspace', 'teammates'] } })
    await flushPromises()
    expect(wrapper.find<HTMLInputElement>('[data-onboarding="input-workspace"]').element.value).toBe('Ada\'s workspace')
    await wrapper.find('[data-onboarding="input-workspace"]').setValue('My studio')
    await wrapper.find('[data-onboarding="workspace"] form').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('organization.update')).toEqual([{ data: { name: 'My studio' }, organizationId: 'ws-1' }])
    wrapper.unmount()

    // Without a workspace of their own, the step names none, and Next only moves on.
    backend.state.workspaces = [team]
    const joined = await mountSuspended(OnboardingFlow, { props: { steps: ['workspace', 'teammates'] } })
    await flushPromises()
    expect(joined.find('[data-onboarding="input-workspace"]').exists()).toBe(false)
    await joined.find('[data-onboarding="workspace"] form').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('organization.update')).toHaveLength(1)
    expect(step(joined)).toBe('teammates')
    joined.unmount()
  })

  it('renders a step of the app\'s own in its slot, with next and skip', async () => {
    const wrapper = await mountSuspended(OnboardingFlow, {
      props: { steps: ['genre', 'workspace'] },
      slots: { genre: ({ next, skip, index, total }: { next: () => void, skip: () => void, index: number, total: number }) => h('div', { 'data-test': 'genre' }, [h('span', `${index + 1}/${total}`), h('button', { 'data-test': 'pick', 'type': 'button', 'onClick': next }, 'Pick'), h('button', { 'data-test': 'later', 'type': 'button', 'onClick': skip }, 'Later')]) },
    })
    await flushPromises()
    expect(wrapper.find('[data-test="genre"] span').text()).toBe('1/2')
    // A step of the app's is named in words from its slot's name.
    expect(wrapper.find('[data-onboarding="steps"] [aria-current="step"]').text()).toBe('Genre')
    await press(wrapper, '[data-test="pick"]')
    expect(step(wrapper)).toBe('workspace')
    wrapper.unmount()
  })

  it('lets a slot named like a built-in step replace it', async () => {
    const wrapper = await mountSuspended(OnboardingFlow, { props: { steps: ['profile'] }, slots: { profile: () => h('p', { 'data-test': 'mine' }, 'My profile step') } })
    await flushPromises()
    expect(wrapper.find('[data-test="mine"]').exists()).toBe(true)
    expect(wrapper.find('[data-onboarding="profile"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('leaves the plan step out when the catalog sells nothing, and shows it when it sells a plan', async () => {
    const wrapper = await mountSuspended(OnboardingFlow)
    await flushPromises()
    expect(wrapper.findAll('[data-onboarding="step-name"]').map(name => name.text())).toEqual(['About you', 'Your workspace', 'Your team'])
    wrapper.unmount()

    backend.state.queries['billing:getPricing'] = {
      currency: 'usd',
      currencies: ['usd'],
      packs: [],
      plans: [{ key: 'pro', name: 'Pro', description: null, retired: false, features: [], featureKeys: [], prices: { month: { productId: 'prod_pro', amount: 900, currency: 'usd', monthly: 900 } } }],
    }
    const selling = await mountSuspended(OnboardingFlow)
    await flushPromises()
    await nextTick()
    expect(selling.findAll('[data-onboarding="step-name"]').map(name => name.text())).toEqual(['About you', 'Your workspace', 'Your team', 'Your plan'])
    selling.unmount()
  })
})

describe('useOnboarding', () => {
  it('reads whether the account finished the first run, live', async () => {
    let onboarding!: ReturnType<typeof useOnboarding>
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        onboarding = useOnboarding({ steps: ['profile', 'x'] })
        return () => h('div')
      },
    }))
    await flushPromises()
    expect(onboarding.onboardedAt.value).toBeNull()
    expect(onboarding.isOnboarded.value).toBe(false)
    backend.state.queries['account:getOnboarding'] = { onboardedAt: 5 }
    await flushPromises()
    expect(onboarding.isOnboarded.value).toBe(true)
    wrapper.unmount()
  })

  it('moves between steps by name, stays inside the list, and finishes on the last one', async () => {
    let onboarding!: ReturnType<typeof useOnboarding>
    let done = 0
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        onboarding = useOnboarding({ steps: ['a', 'b', 'a', ' c '], onDone: () => done++ })
        return () => h('div')
      },
    }))
    // Repeats and blanks go; names are trimmed.
    expect(onboarding.steps.value).toEqual(['a', 'b', 'c'])
    expect(onboarding.step.value).toBe('a')
    onboarding.back()
    expect(onboarding.index.value).toBe(0)
    onboarding.goTo('c')
    expect(onboarding.isLast.value).toBe(true)
    onboarding.goTo('nowhere')
    expect(onboarding.step.value).toBe('c')
    expect(await onboarding.next()).toBe(true)
    await flushPromises()
    expect(done).toBe(1)
    expect(onboarding.isDone.value).toBe(true)
    // A second finish stamps nothing more.
    await onboarding.finish()
    expect(backend.callsTo('account:completeOnboarding')).toHaveLength(1)
    wrapper.unmount()
  })

  it('resolves false and stays unfinished when stamping fails, so the person can try again', async () => {
    backend.fail('account:completeOnboarding', backendError('unavailable', { service: 'backend', reason: 'down' }))
    let onboarding!: ReturnType<typeof useOnboarding>
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        onboarding = useOnboarding({ steps: ['a'] })
        return () => h('div')
      },
    }))
    expect(await onboarding.finish()).toBe(false)
    expect(onboarding.isDone.value).toBe(false)
    expect(onboarding.error.value).not.toBeNull()
    backend.stub('account:completeOnboarding', () => ({ onboardedAt: 2 }))
    expect(await onboarding.finish()).toBe(true)
    expect(onboarding.isDone.value).toBe(true)
    wrapper.unmount()
  })
})
