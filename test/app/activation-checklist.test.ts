import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { backendError } from '../../src/convex/errors'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import ActivationChecklist from '../../src/runtime/vue/components/account/ActivationChecklist.vue'
import { useActivation } from '../../src/runtime/vue/composables/use-activation'

// The activation checklist over the backend mock: the tasks and the
// progress as `getActivation` reads them, the links of the open ones, a
// label that is a key in the person's language, dismissing for good, the
// congratulation shown once, and an administrator's read-only view.

let backend: BackendMock

interface Task { key: string, label: string, to: string | null, scope: string, done: boolean, doneAt: number | null }
const task = (key: string, label: string, extra: Partial<Task> = {}): Task => ({ key, label, to: null, scope: 'person', done: false, doneAt: null, ...extra })
const view = (tasks: Task[], extra: Record<string, unknown> = {}) => {
  const done = tasks.filter(entry => entry.done).length
  return { tasks, done, total: tasks.length, progress: tasks.length ? done / tasks.length : 0, isComplete: tasks.length > 0 && done === tasks.length, isDismissed: false, readOnly: false, ...extra }
}
const OPEN = [
  task('photo', 'Upload a photo', { done: true, doneAt: 1 }),
  task('strip', 'Generate your first strip', { to: '/studio/new' }),
  task('docs', 'Read the guide', { to: 'https://example.com/guide' }),
  task('publish', 'Publish a strip'),
]

beforeEach(() => {
  backend = createBackendMock({ user: {} })
  backend.state.queries['audit:getActivation'] = view(OPEN)
  backend.stub('audit:dismissActivation', () => {
    backend.state.queries['audit:getActivation'] = { ...(backend.state.queries['audit:getActivation'] as object), isDismissed: true }
    return null
  })
})

describe('<ActivationChecklist>', () => {
  it('lists the tasks with the progress, a link per open task, and says done or to do in words', async () => {
    const wrapper = await mountSuspended(ActivationChecklist)
    await flushPromises()
    const root = wrapper.find('section[data-activation="root"]')
    expect(root.attributes('aria-label')).toBe('Get started')
    expect(root.find('[data-activation="count"]').text()).toBe('1 of 4 done')
    const bar = root.find('progress')
    expect(bar.attributes('value')).toBe('1')
    expect(bar.attributes('max')).toBe('4')
    expect(bar.attributes('aria-label')).toBe('Progress')
    expect(bar.attributes('aria-valuetext')).toBe('1 of 4 done')
    const rows = root.findAll('li[data-activation="task"]')
    expect(rows.map(row => [row.attributes('data-task'), row.attributes('data-state'), row.find('[data-activation="state"]').text()])).toEqual([
      ['photo', 'done', 'Done'],
      ['strip', 'open', 'To do'],
      ['docs', 'open', 'To do'],
      ['publish', 'open', 'To do'],
    ])
    // An open task with a place to go is a link: a route, or an https address; a done one is text.
    expect(rows[0]!.find('a').exists()).toBe(false)
    expect(rows[1]!.find('a').attributes('href')).toBe('/studio/new')
    expect(rows[2]!.find('a').attributes('href')).toBe('https://example.com/guide')
    expect(rows[2]!.find('a').attributes('rel')).toBe('noopener')
    expect(rows[3]!.find('a').exists()).toBe(false)
    wrapper.unmount()
  })

  it('dismisses for good on a press, and stays away', async () => {
    const wrapper = await mountSuspended(ActivationChecklist)
    await flushPromises()
    await wrapper.find('[data-activation="dismiss"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('audit:dismissActivation')).toHaveLength(1)
    expect(wrapper.emitted('dismissed')).toHaveLength(1)
    expect(wrapper.find('[data-activation="root"]').exists()).toBe(false)
    wrapper.unmount()

    // A later visit shows nothing: it stays dismissed.
    const later = await mountSuspended(ActivationChecklist)
    await flushPromises()
    expect(later.find('[data-activation="root"]').exists()).toBe(false)
    later.unmount()
  })

  it('renders nothing for an app with no checklist, and for a visitor', async () => {
    backend.state.queries['audit:getActivation'] = view([])
    const empty = await mountSuspended(ActivationChecklist)
    await flushPromises()
    expect(empty.find('[data-activation="root"]').exists()).toBe(false)
    empty.unmount()

    backend.signOut()
    backend.state.queries['audit:getActivation'] = view(OPEN)
    const visitor = await mountSuspended(ActivationChecklist)
    await flushPromises()
    expect(visitor.find('[data-activation="root"]').exists()).toBe(false)
    visitor.unmount()
  })

  it('congratulates once when every task is done, dismisses itself, and shows nothing after a reload', async () => {
    backend.state.queries['audit:getActivation'] = view(OPEN.map(entry => ({ ...entry, done: true, doneAt: 1 })))
    const wrapper = await mountSuspended(ActivationChecklist)
    await flushPromises()
    expect(wrapper.find('[data-activation="congratulations"]').text()).toBe('All done. You finished every first step.')
    expect(wrapper.find('[data-activation="wrapper"] > [data-activation="status"]').text()).toBe('All done. You finished every first step.')
    expect(wrapper.emitted('completed')).toHaveLength(1)
    // It was stamped as dismissed at once, so the next visit starts without it.
    expect(backend.callsTo('audit:dismissActivation')).toHaveLength(1)
    // Closing the congratulation takes it off the page.
    await wrapper.find('[data-activation="dismiss"]').trigger('click')
    expect(wrapper.find('[data-activation="root"]').exists()).toBe(false)
    wrapper.unmount()

    const reload = await mountSuspended(ActivationChecklist)
    await flushPromises()
    expect(reload.find('[data-activation="root"]').exists()).toBe(false)
    expect(backend.callsTo('audit:dismissActivation')).toHaveLength(1)
    reload.unmount()
  })

  it('shows an administrator\'s visit the progress read-only, with no way to dismiss or follow a task', async () => {
    backend.state.queries['audit:getActivation'] = view(OPEN, { readOnly: true })
    const wrapper = await mountSuspended(ActivationChecklist)
    await flushPromises()
    expect(wrapper.find('[data-activation="read-only"]').text()).toBe('You are viewing this account: its checklist cannot be changed.')
    expect(wrapper.find('[data-activation="dismiss"]').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('[data-activation="count"]').text()).toBe('1 of 4 done')
    wrapper.unmount()

    // A finished checklist is not stamped dismissed by a visit.
    backend.state.queries['audit:getActivation'] = view(OPEN.map(entry => ({ ...entry, done: true, doneAt: 1 })), { readOnly: true })
    const finished = await mountSuspended(ActivationChecklist)
    await flushPromises()
    expect(backend.callsTo('audit:dismissActivation')).toEqual([])
    finished.unmount()
  })

  it('keeps the checklist when dismissing fails, and says why', async () => {
    backend.fail('audit:dismissActivation', backendError('unavailable', { service: 'backend', reason: 'down' }))
    const wrapper = await mountSuspended(ActivationChecklist)
    await flushPromises()
    await wrapper.find('[data-activation="dismiss"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-activation="root"]').exists()).toBe(true)
    expect(wrapper.emitted('dismissed')).toBeUndefined()
    wrapper.unmount()
  })

  it('takes copy of the app\'s over the package\'s', async () => {
    const wrapper = await mountSuspended(ActivationChecklist, { props: { labels: { title: 'First steps', dismiss: 'Hide' } } })
    await flushPromises()
    expect(wrapper.find('[data-activation="title"]').text()).toBe('First steps')
    expect(wrapper.find('[data-activation="dismiss"]').text()).toBe('Hide')
    wrapper.unmount()
  })
})

describe('useActivation', () => {
  it('reads a task\'s label as plain text, or as a label key in the language of the app\'s labels', async () => {
    backend.state.queries['audit:getActivation'] = view([task('a', 'activation.title'), task('b', 'Upload a photo'), task('c', 'nobody.knows')])
    let activation!: ReturnType<typeof useActivation>
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        activation = useActivation()
        return () => h('div')
      },
    }))
    await flushPromises()
    // A key some source has reads as that label; text with spaces, and a key nobody has, stay as written.
    expect(activation.tasks.value.map(entry => entry.label)).toEqual(['Get started', 'Upload a photo', 'nobody.knows'])
    expect(activation.done.value).toBe(0)
    expect(activation.total.value).toBe(3)
    expect(activation.progress.value).toBe(0)
    expect(activation.isVisible.value).toBe(true)
    wrapper.unmount()
  })
})
