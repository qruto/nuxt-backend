import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createBackendMock } from '../../src/runtime/test-utils'
import EmailUnsubscribe from '../../src/runtime/vue/components/account/EmailUnsubscribe.vue'
import ProfileSettings from '../../src/runtime/vue/components/account/ProfileSettings.vue'
import type { EmailLinkView, EmailTopicPreference } from '../../src/convex/integrations/email-preferences'
import type { NotificationKindChoice } from '../../src/convex/integrations/notifications'
import { useEmailPreferences } from '../../src/runtime/vue/composables/use-email-preferences'
import { watchPresence } from '../../src/runtime/vue/utils/email-presence'
import { registerComponents } from '../helpers/register-components'

await registerComponents('ProfileSettings')

// The preference center on the backend mock, the way an app tests it: the
// profile's Email section lists the topics and changes them, the
// unsubscribe page asks before it acts, and the presence watch reports the
// time zone once.

const topics = ref<EmailTopicPreference[]>([])
let backend: ReturnType<typeof createBackendMock>

beforeEach(() => {
  topics.value = [
    { key: 'productNews', name: 'Product news', description: 'Monthly.', subscribed: false, pending: false },
    { key: 'stripTips', name: 'Strip tips', description: 'Ideas.', subscribed: true, pending: false },
  ]
  backend = createBackendMock({ user: { name: 'Ada' } })
  backend.stub('email:getEmailPreferences', () => topics.value)
  backend.stub('email:setEmailTopic', ({ topic, subscribed }: { topic: string, subscribed: boolean }) => {
    const pending = topic === 'productNews' && subscribed
    topics.value = topics.value.map(entry => entry.key === topic ? { ...entry, subscribed: subscribed && !pending, pending } : entry)
    return { state: pending ? 'pending' : subscribed ? 'subscribed' : 'unsubscribed' }
  })
  backend.stub('email:unsubscribeAllTopics', () => {
    topics.value = topics.value.map(entry => ({ ...entry, subscribed: false, pending: false }))
    return null
  })
})

describe('useEmailPreferences', () => {
  it('reads the topics and sets one', async () => {
    let state: ReturnType<typeof useEmailPreferences> | undefined
    await mountSuspended(defineComponent({
      setup() {
        state = useEmailPreferences()
        return () => h('div')
      },
    }))
    await flushPromises()
    expect(state!.topics.value.map(topic => [topic.key, topic.subscribed])).toEqual([['productNews', false], ['stripTips', true]])
    await state!.set('productNews', true)
    await flushPromises()
    expect(state!.topics.value[0]).toMatchObject({ subscribed: false, pending: true })
  })
})

describe('the profile\'s Email section', () => {
  it('lists each topic as a labelled checkbox, notes a pending confirmation, and leaves every topic', async () => {
    const profile = await mountSuspended(ProfileSettings)
    await flushPromises()
    const section = profile.get('[data-profile="section-preferences"]')
    expect(section.findAll('[data-preferences="topic-label"]').map(label => label.text())).toEqual(['Product news', 'Strip tips'])
    await section.findAll('input[data-preferences="topic-input"]')[0]!.setValue(true)
    await flushPromises()
    expect(profile.get('[data-preferences="pending"]').text()).toBe('Check your inbox to confirm.')
    await profile.get('[data-preferences="unsubscribe-all"]').trigger('click')
    await flushPromises()
    expect(profile.get('[data-preferences="status"]').text()).toBe('You will get no more of these emails.')
    expect(topics.value.every(topic => !topic.subscribed && !topic.pending)).toBe(true)
  })
})

describe('a refused preference', () => {
  it('puts its box back as it is stored', async () => {
    backend.fail('email:setEmailTopic', new Error('Server unreachable'))
    const profile = await mountSuspended(ProfileSettings)
    await flushPromises()
    const box = profile.findAll<HTMLInputElement>('input[data-preferences="topic-input"]')[1]!
    await box.setValue(false)
    await flushPromises()
    expect(backend.callsTo('email:setEmailTopic')).toEqual([{ topic: 'stripTips', subscribed: false }])
    expect(box.element.checked).toBe(true)
    expect(profile.find('[data-profile="section-preferences"] [role="alert"]').exists()).toBe(true)
  })
})

describe('the notification channels', () => {
  const channels = ref<NotificationKindChoice[]>([])

  beforeEach(() => {
    channels.value = [
      { type: 'auth.passkey_added', channels: [{ channel: 'app', enabled: true }, { channel: 'email', enabled: true }] },
      { type: 'billing.credits_low', channels: [{ channel: 'app', enabled: true }] },
    ]
    backend.stub('notifications:getNotificationChannels', () => channels.value)
    backend.stub('notifications:setNotificationChannel', ({ type, channel, enabled }: { type: string, channel: string, enabled: boolean }) => {
      channels.value = channels.value.map(kind => kind.type === type ? { ...kind, channels: kind.channels.map(choice => choice.channel === channel ? { ...choice, enabled } : choice) } : kind)
      return null
    })
  })

  it('reads each kind\'s channels, and turns one off through set', async () => {
    let state: ReturnType<typeof useEmailPreferences> | undefined
    await mountSuspended(defineComponent({
      setup() {
        state = useEmailPreferences()
        return () => h('div')
      },
    }))
    await flushPromises()
    expect(state!.channels.value.map(kind => kind.type)).toEqual(['auth.passkey_added', 'billing.credits_low'])
    await state!.set({ kind: 'auth.passkey_added', channel: 'email' }, false)
    await flushPromises()
    expect(state!.channels.value[0]!.channels).toEqual([{ channel: 'app', enabled: true }, { channel: 'email', enabled: false }])
  })

  it('lists each kind by its words with a labelled checkbox per channel it allows, and saves a change', async () => {
    const profile = await mountSuspended(ProfileSettings)
    await flushPromises()
    const kinds = profile.findAll('[data-preferences="kind"]')
    expect(kinds.map(kind => kind.get('[data-preferences="kind-name"]').text())).toEqual(['A passkey was added', 'Credits are running low'])
    expect(kinds[0]!.findAll('[data-preferences="channel"]').map(label => label.text())).toEqual(['In the app', 'By email'])
    // A billing kind stays in the app: no email or push box.
    expect(kinds[1]!.findAll('[data-preferences="channel"]').map(label => label.attributes('data-channel'))).toEqual(['app'])
    await kinds[0]!.findAll('input[data-preferences="channel-input"]')[1]!.setValue(false)
    await flushPromises()
    expect(channels.value[0]!.channels[1]).toEqual({ channel: 'email', enabled: false })
    expect(profile.get('[data-preferences="status"]').text()).toBe('Saved.')
  })
})

describe('the unsubscribe page', () => {
  it('names the topic, changes nothing on opening, and leaves it on one press', async () => {
    const view = ref<EmailLinkView | null>({ kind: 'unsubscribe', topic: { key: 'stripTips', name: 'Strip tips', description: 'Ideas.' }, subscribed: true })
    const leave = vi.fn(() => true)
    backend.stub('email:getEmailLink', () => view.value)
    backend.stub('email:unsubscribeByLink', leave)
    const page = await mountSuspended(EmailUnsubscribe, { props: { link: { token: '1.k1.stripTips.sig' } } })
    await flushPromises()
    expect(page.get('[data-unsubscribe="message"]').text()).toBe('You get this email because you joined Strip tips. Leave it with one press.')
    expect(leave).not.toHaveBeenCalled()
    await page.get('[data-unsubscribe="leave"]').trigger('click')
    await flushPromises()
    expect(leave).toHaveBeenCalledWith({ token: '1.k1.stripTips.sig', all: false })
    expect(page.get('[data-unsubscribe="message"]').text()).toBe('You are unsubscribed from Strip tips.')
  })

  it('says a link that does not work, and a link without a code', async () => {
    backend.stub('email:getEmailLink', () => null)
    const broken = await mountSuspended(EmailUnsubscribe, { props: { link: { token: 'forged' } } })
    await flushPromises()
    expect(broken.get('[data-unsubscribe="message"]').text()).toBe('This link does not work. Open the link in the email again.')
    const empty = await mountSuspended(EmailUnsubscribe, { props: { link: {} } })
    expect(empty.get('[data-unsubscribe="message"]').text()).toBe('This link has no code. Open the link in the email again.')
  })

  it('confirms a double opt-in once', async () => {
    backend.stub('email:getEmailLink', () => ({ kind: 'confirm', topic: { key: 'productNews', name: 'Product news', description: 'Monthly.' }, subscribed: false }))
    backend.stub('email:confirmEmailTopic', () => 'confirmed')
    const page = await mountSuspended(EmailUnsubscribe, { props: { link: { confirm: 'c1.k1.productNews.x.sig' } } })
    await flushPromises()
    await page.get('[data-unsubscribe="confirm"]').trigger('click')
    await flushPromises()
    expect(page.get('[data-unsubscribe="message"]').text()).toBe('You are subscribed to Product news.')
  })
})

describe('the presence watch', () => {
  it('records the browser\'s time zone once a day per tab, signed in', async () => {
    sessionStorage.clear()
    const recorded = vi.fn(() => null)
    backend.stub('email:recordTimeZone', recorded)
    await mountSuspended(defineComponent({
      setup() {
        watchPresence()
        watchPresence()
        return () => h('div')
      },
    }))
    await flushPromises()
    expect(recorded).toHaveBeenCalledTimes(1)
    expect(recorded).toHaveBeenCalledWith({ timeZone: expect.any(String) })
  })
})
