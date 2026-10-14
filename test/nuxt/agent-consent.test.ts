import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

// <AgentConsent> over a stubbed Better Auth client: what it reads, what it
// sends, and where it sends the browser. The server half (forced consent,
// ownership, impersonation, the token guard) is test/unit/agent-consent-flow.test.ts.

const authFetch = vi.fn()
vi.mock('../../src/runtime/vue/composables/use-auth', () => ({ useAuth: () => ({ client: { $fetch: authFetch } }) }))

const { AgentConsent } = await import('../../src/runtime/vue/components/agent-consent')
const { agentAuthorizationUrl } = await import('../../src/runtime/vue/utils/agent-authorization')

const REQUEST = {
  clientId: 'client-1',
  clientName: 'Helpful agent',
  redirectHost: '127.0.0.1:9999',
  scopes: ['openid', 'billing:read', 'todos:write'],
  expiresAt: Date.now() + 600_000,
}

let assign: ReturnType<typeof vi.fn>

beforeEach(() => {
  authFetch.mockReset()
  assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, href: 'http://localhost:3000/oauth/consent?consent_code=code-1&client_id=client-1&scope=openid', assign })
  window.history.replaceState(null, '', '/oauth/consent?consent_code=code-1&client_id=client-1&scope=openid')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<AgentConsent>', () => {
  it('reads the request from the server and takes the consent code out of the address bar', async () => {
    authFetch.mockResolvedValueOnce({ data: REQUEST, error: null })
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const wrapper = mount(AgentConsent)
    await flushPromises()

    expect(authFetch).toHaveBeenCalledWith('/agent-consent/request', { method: 'POST', body: { consent_code: 'code-1' } })
    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, '', '/oauth/consent?client_id=client-1&scope=openid')
    expect(wrapper.find('[data-consent="client"]').text()).toBe('Helpful agent wants to act as you on this site. Unverified')
    expect(wrapper.find('[data-consent="redirect"]').text()).toBe('Approving sends you back to 127.0.0.1:9999.')
    // Known scopes in words; one the app added under its own name.
    expect(wrapper.findAll('[data-consent="scope"]').map(item => item.text())).toEqual(['Confirm who you are', 'See your plan, credits and orders', 'todos:write'])
  })

  it('approves, then sends the browser to the agent with a full navigation', async () => {
    authFetch.mockResolvedValueOnce({ data: REQUEST, error: null })
    authFetch.mockResolvedValueOnce({ data: { redirectURI: 'http://127.0.0.1:9999/callback?code=abc&state=s' }, error: null })
    const wrapper = mount(AgentConsent)
    await flushPromises()
    await wrapper.find('[data-consent="approve"]').trigger('click')
    await flushPromises()

    expect(authFetch).toHaveBeenLastCalledWith('/oauth2/consent', { method: 'POST', body: { accept: true, consent_code: 'code-1' } })
    expect(assign).toHaveBeenCalledWith('http://127.0.0.1:9999/callback?code=abc&state=s')
    expect(wrapper.emitted('answered')).toEqual([[true]])
  })

  it('denies with the same round trip', async () => {
    authFetch.mockResolvedValueOnce({ data: REQUEST, error: null })
    authFetch.mockResolvedValueOnce({ data: { redirectURI: 'http://127.0.0.1:9999/callback?error=access_denied' }, error: null })
    const wrapper = mount(AgentConsent)
    await flushPromises()
    await wrapper.find('[data-consent="deny"]').trigger('click')
    await flushPromises()

    expect(authFetch).toHaveBeenLastCalledWith('/oauth2/consent', { method: 'POST', body: { accept: false, consent_code: 'code-1' } })
    expect(assign).toHaveBeenCalledWith('http://127.0.0.1:9999/callback?error=access_denied')
  })

  it('will not open a script-capable return address', async () => {
    authFetch.mockResolvedValueOnce({ data: REQUEST, error: null })
    authFetch.mockResolvedValueOnce({ data: { redirectURI: 'javascript:alert(1)//?error=access_denied' }, error: null })
    const wrapper = mount(AgentConsent)
    await flushPromises()
    await wrapper.find('[data-consent="deny"]').trigger('click')
    await flushPromises()

    expect(assign).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toBe('The agent\'s return address is not one this page will open.')
  })

  it('opens a native agent\'s own scheme', async () => {
    authFetch.mockResolvedValueOnce({ data: REQUEST, error: null })
    authFetch.mockResolvedValueOnce({ data: { redirectURI: 'com.example.agent:/oauth/callback?code=abc' }, error: null })
    const wrapper = mount(AgentConsent)
    await flushPromises()
    await wrapper.find('[data-consent="approve"]').trigger('click')
    await flushPromises()

    expect(assign).toHaveBeenCalledWith('com.example.agent:/oauth/callback?code=abc')
  })

  it('says the request is gone when the server does not know it', async () => {
    authFetch.mockResolvedValueOnce({ data: null, error: { message: 'This request has expired or was already answered. Start again from the agent.' } })
    const wrapper = mount(AgentConsent)
    await flushPromises()

    const message = wrapper.find('[data-consent="missing"] [data-consent="message"]')
    expect(message.attributes('role')).toBe('alert')
    expect(message.text()).toContain('expired or was already answered')
  })

  it('keeps the request on screen and announces a refused approval', async () => {
    authFetch.mockResolvedValueOnce({ data: REQUEST, error: null })
    authFetch.mockResolvedValueOnce({ data: null, error: { message: 'An administrator acting as this account cannot approve an agent.' } })
    const wrapper = mount(AgentConsent)
    await flushPromises()
    await wrapper.find('[data-consent="approve"]').trigger('click')
    await flushPromises()

    expect(assign).not.toHaveBeenCalled()
    expect(wrapper.find('[data-consent="ready"] [role="alert"]').text()).toBe('An administrator acting as this account cannot approve an agent.')
    expect(wrapper.emitted('error')).toEqual([['An administrator acting as this account cannot approve an agent.']])
  })
})

describe('agentAuthorizationUrl', () => {
  it('rebuilds the authorize request the provider paused for sign-in, on the auth route', () => {
    expect(agentAuthorizationUrl('?client_id=c&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A9999%2Fcb&state=s&code_challenge=x', '/api/auth'))
      .toBe('/api/auth/mcp/authorize?client_id=c&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A9999%2Fcb&state=s&code_challenge=x')
  })

  it('is null for a plain sign-in', () => {
    expect(agentAuthorizationUrl('?redirect=/app', '/api/auth')).toBeNull()
    expect(agentAuthorizationUrl('?client_id=c', '/api/auth')).toBeNull()
  })
})
