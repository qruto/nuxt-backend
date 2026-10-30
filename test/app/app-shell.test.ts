import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { h } from 'vue'
import { backendError } from '../../src/convex/errors'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import AppShell from '../../src/runtime/vue/components/shell/AppShell.vue'
import PageFrame from '../../src/runtime/vue/components/shell/PageFrame.vue'
import { registerComponents } from '../helpers/register-components'

// <AppShell> over the backend mock, the way an app tests a layout: the
// header's regions for a signed-in person and for a visitor, the workspace
// switcher (roles, switching, a switch that fails, creating one in place),
// the account menu, signing out, and a packaged page inside it.

// The shell's parts and the components it places, by name, as Nuxt registers them.
await registerComponents('AppShell', 'PageFrame')

let backend: BackendMock

const WORKSPACES = [
  { id: 'ws-1', name: 'Personal', slug: 'personal', role: 'owner' },
  { id: 'ws-2', name: 'Acme', slug: 'acme', role: 'member' },
]

/** The popover opening, as the browser reports it. */
const toggle = async (panel: { element: Element }, state: 'open' | 'closed') => {
  panel.element.dispatchEvent(Object.assign(new Event('toggle'), { newState: state, oldState: state === 'open' ? 'closed' : 'open' }))
  await flushPromises()
}

const brand = () => h('a', { href: '/' }, 'Panels')

beforeEach(() => {
  backend = createBackendMock({ user: { name: 'Ada Lovelace', email: 'ada@example.com' }, workspaces: WORKSPACES, activeWorkspace: 'ws-1' })
  // The role of the person in a workspace, as the auth client's member list answers it.
  backend.stub('organization.listMembers', (args: { query: { organizationId: string } }) => ({ members: [{ role: WORKSPACES.find(workspace => workspace.id === args.query.organizationId)!.role }] }))
  backend.stub('organization.listUserInvitations', () => [])
})

describe('<AppShell> for a signed-in person', () => {
  it('puts the brand, the app\'s links, the switcher and the account menu in one banner, then the page in the one main landmark', async () => {
    const shell = await mountSuspended(AppShell, {
      slots: { brand, nav: () => h('a', { href: '/strips' }, 'Strips'), actions: () => h('button', { type: 'button' }, 'New strip'), default: () => h('p', { id: 'page' }, 'The page') },
    })
    await flushPromises()
    const header = shell.find('header[data-shell="header"]')
    expect(header.find('[data-shell="brand"]').text()).toBe('Panels')
    expect(header.find('nav[data-shell="nav"]').attributes('aria-label')).toBe('Main')
    expect(header.find('nav[data-shell="nav"]').text()).toBe('Strips')
    expect(header.find('[data-shell="end"]').text()).toContain('New strip')
    expect(header.find('[data-shell="switcher-button"]').attributes('aria-label')).toBe('Personal, switch workspace')
    const account = header.find('[data-shell="account-button"]')
    expect(account.attributes('aria-label')).toBe('Ada Lovelace, account menu')
    expect(account.attributes('aria-expanded')).toBe('false')
    expect(shell.findAll('main')).toHaveLength(1)
    expect(shell.find('main #page').text()).toBe('The page')
    // The skip link jumps to the landmark.
    expect(shell.find('[data-shell="skip"]').attributes('href')).toBe(`#${shell.find('main').attributes('id')}`)
    // The header comes before the notices region and the main landmark.
    expect(shell.element.querySelector('header')!.compareDocumentPosition(shell.element.querySelector('main')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    shell.unmount()
  })

  it('links the account menu to the pages that are on, and the admin console to an administrator alone', async () => {
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    const links = () => shell.findAll('[data-shell="account-links"] a').map(link => [link.text(), link.attributes('href')])
    expect(links()).toEqual([['Profile', '/profile'], ['Security', '/security'], ['Settings', '/settings']])
    expect(shell.find('[data-shell="signed-in-as"]').text()).toBe('Signed in as ada@example.com')
    shell.unmount()

    backend.signIn({ role: 'admin' })
    const admin = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    expect(admin.findAll('[data-shell="account-links"] a').map(link => link.attributes('href'))).toEqual(['/profile', '/security', '/settings', '/admin'])
    admin.unmount()
  })

  it('names the account by its address when it has no name yet, and draws an initial for a missing picture', async () => {
    backend.signIn({ name: '' })
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    expect(shell.find('[data-shell="account-name"]').text()).toBe('ada')
    expect(shell.find('[data-shell="avatar"]').text()).toBe('A')
    expect(shell.find('[data-shell="avatar"]').attributes('aria-hidden')).toBe('true')
    shell.unmount()
  })

  it('hides the switcher with `:switcher="false"`', async () => {
    const shell = await mountSuspended(AppShell, { props: { switcher: false }, slots: { brand } })
    await flushPromises()
    expect(shell.find('[data-shell="switcher"]').exists()).toBe(false)
    expect(shell.find('[data-shell="account"]').exists()).toBe(true)
    shell.unmount()
  })

  it('signs out and goes to the sign-in page, saying so', async () => {
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    await shell.find('[data-shell="sign-out"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('signOut')).toHaveLength(1)
    // The session ended, so the menu is gone with it.
    expect(shell.find('[data-shell="account"]').exists()).toBe(false)
    expect(shell.find('[data-shell="sign-in"]').exists()).toBe(true)
    shell.unmount()
  })

  it('says a sign-out that failed, and lets the person try again', async () => {
    backend.fail('signOut', backendError('unavailable', { service: 'auth', reason: 'down' }))
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    await shell.find('[data-shell="sign-out"]').trigger('click')
    await flushPromises()
    expect(shell.find('[data-shell="account"] [role="alert"]').text()).toBe('Could not sign you out. Try again.')
    expect(shell.find('[data-shell="sign-out"]').attributes('aria-disabled')).toBeUndefined()
    shell.unmount()
  })
})

describe('the workspace switcher', () => {
  it('lists the workspaces with the person\'s role in each, once it opens', async () => {
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    // The active workspace's role is live; the others' are read when the menu opens.
    const rows = () => shell.findAll('[data-shell="workspace"]').map(row => row.text().replace(/\s+/g, ' ').trim())
    expect(rows()).toEqual(['Personal personal Owner Current', 'Acme acme'])
    await toggle(shell.find('[data-shell="switcher-panel"]'), 'open')
    expect(rows()).toEqual(['Personal personal Owner Current', 'Acme acme Member'])
    expect(shell.find('[data-shell="switcher-button"]').attributes('aria-expanded')).toBe('true')
    expect(shell.find('[data-shell="workspace"][aria-current="true"]').text()).toContain('Personal')
    shell.unmount()
  })

  it('counts the invitations waiting', async () => {
    backend.stub('organization.listUserInvitations', () => [{ id: 'inv-1', status: 'pending', workspaceId: 'ws-9', email: 'ada@example.com' }, { id: 'inv-2', status: 'canceled', workspaceId: 'ws-8', email: 'ada@example.com' }])
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    expect(shell.find('[data-shell="invitations"]').exists()).toBe(false)
    await toggle(shell.find('[data-shell="switcher-panel"]'), 'open')
    expect(shell.find('[data-shell="invitations"]').text()).toBe('1 invitation waiting')
    shell.unmount()
  })

  it('switches the active workspace and says it did', async () => {
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    const acme = shell.findAll('[data-shell="workspace"]')[1]!
    await acme.trigger('click')
    await flushPromises()
    expect(backend.callsTo('organization.setActive')).toEqual([{ organizationId: 'ws-2' }])
    expect(shell.find('[data-shell="switcher"] [data-shell="status"]').text()).toBe('Switched to Acme.')
    shell.unmount()
  })

  it('keeps the old workspace active when a switch fails, and announces the failure as an alert', async () => {
    backend.fail('organization.setActive', backendError('forbidden', { reason: 'not_member' }))
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    await shell.findAll('[data-shell="workspace"]')[1]!.trigger('click')
    await flushPromises()
    expect(shell.find('[data-shell="switcher"] [role="alert"]').text()).toBe('Could not switch workspaces. You are still in Personal.')
    expect(shell.find('[data-shell="switcher-button"]').attributes('aria-label')).toBe('Personal, switch workspace')
    expect(shell.find('[data-shell="workspace"][aria-current="true"]').text()).toContain('Personal')
    shell.unmount()
  })

  it('creates a workspace in place and makes it the active one', async () => {
    backend.stub('organization.create', (args: { name: string, slug: string }) => ({ id: 'ws-3', name: args.name, slug: args.slug, createdAt: 0 }))
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    await shell.find('[data-shell="create-input"]').setValue('  Studio 9 ')
    await shell.find('[data-shell="create"]').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('organization.create')).toEqual([{ name: 'Studio 9', slug: expect.stringMatching(/^studio-9-[0-9a-f]{8}$/) }])
    expect(shell.find('[data-shell="switcher"] [data-shell="status"]').text()).toBe('Workspace “Studio 9” created.')
    shell.unmount()
  })

  it('does not call the server for a name of spaces', async () => {
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    await flushPromises()
    await shell.find('[data-shell="create-input"]').setValue('   ')
    await shell.find('[data-shell="create"]').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('organization.create')).toEqual([])
    shell.unmount()
  })
})

describe('<AppShell> for a visitor', () => {
  it('shows the brand, the links and a way in, and nothing of an account', async () => {
    backend.signOut()
    const shell = await mountSuspended(AppShell, { slots: { brand, nav: () => h('a', { href: '/strips' }, 'Strips') } })
    await flushPromises()
    expect(shell.find('[data-shell="brand"]').text()).toBe('Panels')
    expect(shell.find('nav[data-shell="nav"]').text()).toBe('Strips')
    const signIn = shell.find('a[data-shell="sign-in"]')
    expect(signIn.text()).toBe('Sign in')
    expect(signIn.attributes('href')).toBe('/login')
    expect(shell.find('[data-shell="account"]').exists()).toBe(false)
    expect(shell.find('[data-shell="switcher"]').exists()).toBe(false)
    shell.unmount()
  })

  it('says it waits, and shows no way in, while the session is read', async () => {
    backend = createBackendMock({ user: { name: 'Ada' }, isLoading: true })
    const shell = await mountSuspended(AppShell, { slots: { brand } })
    expect(shell.find('[data-shell="root"]').attributes('aria-busy')).toBe('true')
    expect(shell.find('[data-shell="root"] > [data-shell="status"]').text()).toBe('Loading…')
    expect(shell.find('[data-shell="sign-in"]').exists()).toBe(false)
    shell.unmount()
  })
})

describe('a packaged page inside the shell', () => {
  const page = () => h(PageFrame, { page: 'profile', family: 'profile', title: 'Profile' }, { default: () => h('p', 'Your profile') })

  it('leaves the landmark, the notices and the consent dialog to the shell, so nothing shows twice', async () => {
    const shell = await mountSuspended(AppShell, { slots: { brand, default: page } })
    await flushPromises()
    expect(shell.findAll('main')).toHaveLength(1)
    const inner = shell.find('main [data-backend-page="profile"]')
    expect(inner.element.tagName).toBe('DIV')
    expect(inner.find('h1').text()).toBe('Profile')
    expect(inner.text()).toContain('Your profile')
    // The shell's own regions, once: the notices, the status.
    expect(shell.findAll('[data-backend-region="banner"]')).toHaveLength(0)
    expect(shell.findAll('[data-backend-region="status"]')).toHaveLength(1)
    shell.unmount()
  })

  it('is its own main landmark outside the shell', async () => {
    const frame = await mountSuspended(PageFrame, { props: { page: 'profile', family: 'profile', title: 'Profile' } })
    expect(frame.element.tagName).toBe('MAIN')
    frame.unmount()
  })
})
