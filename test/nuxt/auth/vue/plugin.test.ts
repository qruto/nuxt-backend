import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockUpdateSession, mockVerify } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockUpdateSession: vi.fn(),
  mockVerify: vi.fn(),
}))

vi.mock('../../../../src/runtime/auth/client', () => ({
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

async function loadPlugin() {
  return import('../../../../src/runtime/auth/vue/plugin')
}

describe('auth/vue/plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', 'http://localhost:3000/profile')
  })

  it('exchanges the cross-domain one-time token and refreshes the auth session', async () => {
    const { consumeCrossDomainOneTimeToken } = await loadPlugin()
    mockVerify.mockResolvedValue({
      data: {
        session: {
          token: 'session-token',
        },
      },
    })
    window.history.replaceState({}, '', 'http://localhost:3000/profile?ott=one-time-token&next=%2Fdashboard')

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
    const { consumeCrossDomainOneTimeToken } = await loadPlugin()
    mockVerify.mockResolvedValue({ data: { session: null } })
    window.history.replaceState({}, '', 'http://localhost:3000/profile?ott=missing-token')

    await consumeCrossDomainOneTimeToken()

    expect(mockVerify).toHaveBeenCalledWith({ token: 'missing-token' })
    expect(mockGetSession).not.toHaveBeenCalled()
    expect(mockUpdateSession).not.toHaveBeenCalled()
    expect(new URL(window.location.href).searchParams.get('ott')).toBeNull()
  })
})
