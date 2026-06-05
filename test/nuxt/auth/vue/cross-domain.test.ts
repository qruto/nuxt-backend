// This suite exercises a pure browser-side helper (it mocks its only
// dependency and touches only `window`/`URL`), so it runs in a plain happy-dom
// environment rather than the full `nuxt` one. That avoids Nuxt's app entry
// trying — and failing — to auto-mount onto `#__nuxt`, which otherwise emits a
// benign "[Vue warn]: Failed to mount app" line into the test output.
// @vitest-environment happy-dom
// @vitest-environment-options { "url": "https://nuxt-backend.localhost/" }
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockUpdateSession, mockVerify } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockUpdateSession: vi.fn(),
  mockVerify: vi.fn(),
}))

vi.mock('../../../../src/runtime/vue/auth/client', () => ({
  authClient: {
    getSession: mockGetSession,
    crossDomain: {
      oneTimeToken: {
        verify: mockVerify,
      },
      updateSession: mockUpdateSession,
    },
  },
}))

async function loadModule() {
  return import('../../../../src/runtime/vue/auth/cross-domain')
}

describe('auth/vue/cross-domain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', 'https://nuxt-backend.localhost/profile')
  })

  it('exchanges the cross-domain one-time token and refreshes the auth session', async () => {
    const { consumeCrossDomainOneTimeToken } = await loadModule()
    mockVerify.mockResolvedValue({
      data: {
        session: {
          token: 'session-token',
        },
      },
    })
    window.history.replaceState({}, '', 'https://nuxt-backend.localhost/profile?ott=one-time-token&next=%2Fdashboard')

    await consumeCrossDomainOneTimeToken()

    expect(mockVerify).toHaveBeenCalledWith({ token: 'one-time-token' })
    expect(mockGetSession).toHaveBeenCalledWith({
      fetchOptions: {
        headers: {
          Authorization: 'Bearer session-token',
        },
      },
    })
    expect(mockUpdateSession).toHaveBeenCalledTimes(1)
    expect(new URL(window.location.href).searchParams.get('ott')).toBeNull()
    expect(new URL(window.location.href).searchParams.get('next')).toBe('/dashboard')
  })

  it('no-ops when the OTT exchange does not return a session token', async () => {
    const { consumeCrossDomainOneTimeToken } = await loadModule()
    mockVerify.mockResolvedValue({ data: { session: null } })
    window.history.replaceState({}, '', 'https://nuxt-backend.localhost/profile?ott=missing-token')

    await consumeCrossDomainOneTimeToken()

    expect(mockVerify).toHaveBeenCalledWith({ token: 'missing-token' })
    expect(mockGetSession).not.toHaveBeenCalled()
    expect(mockUpdateSession).not.toHaveBeenCalled()
    expect(new URL(window.location.href).searchParams.get('ott')).toBeNull()
  })
})
