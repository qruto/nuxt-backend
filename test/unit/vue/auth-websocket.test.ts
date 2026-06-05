import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { anyApi } from 'convex/server'
import type { ConvexVueClientOptions } from '../../../src/runtime/vue/client'
import { ConvexVueClient } from '../../../src/runtime/vue/client'
import {
  type ClientMessage,
  encodeU64LE,
  nodeWebSocket,
  type WireServerMessage,
  withInMemoryWebSocket,
} from '../../helpers/in_memory_web_socket'

const testVueClient = (address: string, options?: ConvexVueClientOptions) =>
  new ConvexVueClient(address, {
    webSocketConstructor: nodeWebSocket,
    unsavedChangesWarning: false,
    ...options,
  })

type AuthErrorMessage = {
  type: 'AuthError'
  error: string
  baseVersion: number
  authUpdateAttempted: boolean
}

afterEach(() => {
  vi.useRealTimers()
})

// WebSocket auth coverage for the Vue client.
// Disabled to match upstream: the reconnect flow is known to be flaky.
describe.sequential.skip('auth websocket tests', () => {
  it('Authenticate via valid static token', async () => {
    await withInMemoryWebSocket(async ({ address, receive, send }) => {
      const client = testVueClient(address)

      const tokenFetcher = vi.fn(async () =>
        jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret'),
      )
      const onAuthChange = vi.fn()
      client.setAuth(tokenFetcher, onAuthChange)

      expect((await receive()).type).toEqual('Connect')
      expect((await receive()).type).toEqual('Authenticate')
      expect((await receive()).type).toEqual('ModifyQuerySet')

      const querySetVersion = getQuerySetVersion(client)

      send({
        type: 'Transition',
        startVersion: querySetVersion,
        endVersion: {
          ...querySetVersion,
          identity: 1,
        },
        modifications: [],
      })

      await waitForAssertion(() => {
        expect(onAuthChange).toHaveBeenCalledTimes(1)
      })
      await client.close()

      expect(tokenFetcher).toHaveBeenCalledWith({ forceRefreshToken: false })
      expect(onAuthChange).toHaveBeenCalledTimes(1)
      expect(onAuthChange).toHaveBeenCalledWith(true)
    })
  })

  it('Reauthenticate after token expiration with versioning', async () => {
    await withInMemoryWebSocket(async ({ address, receive, send, close }) => {
      const client = testVueClient(address)

      let token = jwtEncode({ iat: 1234500, exp: 1244500 }, 'wobabloobla')
      const tokenFetcher = vi.fn(async () => token)
      const onAuthChange = vi.fn()
      client.setAuth(tokenFetcher, onAuthChange)

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token,
      })

      token = jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret')

      await simulateAuthError({
        send,
        close,
        authError: {
          type: 'AuthError',
          error: 'bla',
          baseVersion: 0,
          authUpdateAttempted: true,
        },
      })

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token,
      })

      const querySetVersion = getQuerySetVersion(client)

      send({
        type: 'Transition',
        startVersion: querySetVersion,
        endVersion: {
          ...querySetVersion,
          identity: 1,
        },
        modifications: [],
      })

      await waitForAssertion(() => {
        expect(onAuthChange).toHaveBeenCalledTimes(1)
      })
      await client.close()

      expect(tokenFetcher).toHaveBeenNthCalledWith(1, {
        forceRefreshToken: false,
      })
      expect(tokenFetcher).toHaveBeenNthCalledWith(2, {
        forceRefreshToken: true,
      })
      expect(onAuthChange).toHaveBeenCalledWith(true)
    })
  })

  it('Reauthenticate after token cache failure', async () => {
    await withInMemoryWebSocket(async ({ address, receive, send }) => {
      const client = testVueClient(address)

      const freshToken = jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret')
      const tokenFetcher = vi.fn(
        async (args: { forceRefreshToken: boolean }) => {
          if (args.forceRefreshToken) {
            return freshToken
          }
          return null
        },
      )
      const onAuthChange = vi.fn()
      client.setAuth(tokenFetcher, onAuthChange)

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: freshToken,
      })

      const querySetVersion = getQuerySetVersion(client)

      send({
        type: 'Transition',
        startVersion: querySetVersion,
        endVersion: {
          ...querySetVersion,
          identity: 1,
        },
        modifications: [],
      })

      await waitForAssertion(() => {
        expect(onAuthChange).toHaveBeenCalledTimes(1)
      })
      await client.close()

      expect(tokenFetcher).toHaveBeenNthCalledWith(1, {
        forceRefreshToken: false,
      })
      expect(tokenFetcher).toHaveBeenNthCalledWith(2, {
        forceRefreshToken: true,
      })
      expect(onAuthChange).toHaveBeenCalledWith(true)
    })
  })

  it('Fail when tokens are always rejected', async () => {
    await withInMemoryWebSocket(async ({ address, receive, send, close }) => {
      const client = testVueClient(address)

      const consoleSpy = vi
        .spyOn(global.console, 'error')
        .mockImplementation(() => undefined)

      const tokens = [
        jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret1'),
        jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret2'),
        jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret3'),
        jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret4'),
      ]

      const tokenFetcher = vi.fn(async () => tokens.shift() ?? null)
      const onAuthChange = vi.fn()
      client.setAuth(tokenFetcher, onAuthChange)

      expect((await receive()).type).toEqual('Connect')
      assertAuthenticateMessage(await receive(), {
        baseVersion: 0,
        token: tokens[0]!,
      })
      expect((await receive()).type).toEqual('ModifyQuerySet')

      send({
        type: 'AuthError',
        error: 'bla',
        baseVersion: 0,
        authUpdateAttempted: true,
      })
      close()

      expect((await receive()).type).toEqual('Connect')
      assertAuthenticateMessage(await receive(), {
        baseVersion: 0,
        token: tokens[0]!,
      })
      expect((await receive()).type).toEqual('ModifyQuerySet')

      const authErrorMessage = 'bada boom'
      send({
        type: 'AuthError',
        error: authErrorMessage,
        baseVersion: 0,
        authUpdateAttempted: true,
      })
      close()

      expect((await receive()).type).toEqual('Connect')
      assertAuthenticateMessage(await receive(), {
        baseVersion: 0,
        token: tokens[0]!,
      })
      expect((await receive()).type).toEqual('ModifyQuerySet')

      send({
        type: 'AuthError',
        error: authErrorMessage,
        baseVersion: 0,
        authUpdateAttempted: true,
      })
      close()

      expect((await receive()).type).toEqual('Connect')
      assertAuthenticateMessage(await receive(), {
        baseVersion: 0,
        token: tokens[0]!,
      })
      expect((await receive()).type).toEqual('ModifyQuerySet')

      send({
        type: 'AuthError',
        error: authErrorMessage,
        baseVersion: 0,
        authUpdateAttempted: true,
      })
      close()

      expect((await receive()).type).toEqual('Connect')
      expect((await receive()).type).toEqual('ModifyQuerySet')
      await client.close()

      expect(onAuthChange).toHaveBeenCalledTimes(1)
      expect(onAuthChange).toHaveBeenCalledWith(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        `Failed to authenticate: "${authErrorMessage}", check your server auth config`,
      )
    })
  })

  it('Fail when tokens cannot be fetched', async () => {
    await withInMemoryWebSocket(async ({ address, receive }) => {
      const client = testVueClient(address)
      const tokenFetcher = vi.fn(async () => null)
      const onAuthChange = vi.fn()
      client.setAuth(tokenFetcher, onAuthChange)

      expect((await receive()).type).toEqual('Connect')
      expect((await receive()).type).toEqual('ModifyQuerySet')

      await waitForAssertion(() => {
        expect(onAuthChange).toHaveBeenCalledTimes(1)
      })
      await client.close()

      expect(onAuthChange).toHaveBeenCalledTimes(1)
      expect(onAuthChange).toHaveBeenCalledWith(false)
    })
  })

  it('Client is protected against token rejection race', async () => {
    await withInMemoryWebSocket(async ({ address, receive, send, close }) => {
      const client = testVueClient(address)

      const badToken = jwtEncode({ iat: 1234500, exp: 1244500 }, 'wobalooba')
      const badTokenFetcher = vi.fn(async () => badToken)
      const firstOnChange = vi.fn()
      client.setAuth(badTokenFetcher, firstOnChange)

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: badToken,
      })

      const querySetVersion = getQuerySetVersion(client)

      const goodToken = jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret')
      const goodTokenFetcher = vi.fn(async () => goodToken)

      const secondOnChange = vi.fn()
      client.setAuth(goodTokenFetcher, secondOnChange)

      assertAuthenticateMessage(await receive(), {
        baseVersion: 1,
        token: goodToken,
      })

      await simulateAuthError({
        send,
        close,
        authError: {
          type: 'AuthError',
          error: 'bla',
          baseVersion: 0,
          authUpdateAttempted: true,
        },
      })

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: goodToken,
      })

      send({
        type: 'Transition',
        startVersion: {
          ...querySetVersion,
          identity: 0,
        },
        endVersion: {
          ...querySetVersion,
          identity: 1,
        },
        modifications: [],
      })

      await waitForAssertion(() => {
        expect(secondOnChange).toHaveBeenCalledTimes(1)
      })
      await client.close()

      expect(firstOnChange).toHaveBeenCalledTimes(0)
      expect(secondOnChange).toHaveBeenCalledWith(true)
    })
  })

  it('Client ignores non-auth responses for token validation', async () => {
    await withInMemoryWebSocket(async ({ address, receive, send, close }) => {
      const client = testVueClient(address)
      const ts = Math.ceil(Date.now() / 1000)
      const initialToken = jwtEncode({ iat: ts, exp: ts + 1000 }, 'token1')
      const freshToken = jwtEncode({ iat: ts, exp: ts + 1000 }, 'token2')
      const tokens = [initialToken, freshToken]
      const tokenFetcher = vi.fn(async () => tokens.shift()!)
      const onChange = vi.fn()
      client.setAuth(tokenFetcher, onChange)

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: initialToken,
      })

      const querySetVersion = getQuerySetVersion(client)

      send({
        type: 'Transition',
        startVersion: {
          ...querySetVersion,
          identity: 0,
        },
        endVersion: {
          ...querySetVersion,
          identity: 1,
        },
        modifications: [],
      })

      assertAuthenticateMessage(await receive(), {
        baseVersion: 1,
        token: freshToken,
      })

      await simulateAuthError({
        send,
        close,
        authError: {
          type: 'AuthError',
          error: 'bla',
          baseVersion: 1,
          authUpdateAttempted: false,
        },
      })

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: freshToken,
      })

      const querySetVersion2 = getQuerySetVersion(client)

      send({
        type: 'Transition',
        startVersion: {
          ...querySetVersion2,
          identity: 0,
        },
        endVersion: {
          ...querySetVersion2,
          identity: 1,
        },
        modifications: [],
      })

      await new Promise(resolve => setTimeout(resolve, 0))
      await client.close()

      expect(onChange).toHaveBeenCalledTimes(2)
      expect(onChange).toHaveBeenNthCalledWith(1, true)
      expect(onChange).toHaveBeenNthCalledWith(2, true)
    }, true)
  })

  it('Client maintains connection when refetch occurs during reauth attempt', async () => {
    await withInMemoryWebSocket(async ({ address, receive, send, close }) => {
      vi.useFakeTimers()
      const client = testVueClient(address)

      const nowInSeconds = Math.ceil(Date.now() / 1000)
      const initialToken = jwtEncode(
        { iat: nowInSeconds - 10, exp: nowInSeconds + 10 },
        'initialToken',
      )
      const freshToken = jwtEncode(
        { iat: nowInSeconds + 1, exp: nowInSeconds + 4 },
        'freshToken',
      )
      const scheduledRefetchToken = jwtEncode(
        { iat: nowInSeconds + 3, exp: nowInSeconds + 6 },
        'scheduledRefetchToken',
      )
      const reauthToken = jwtEncode(
        { iat: nowInSeconds + 2.5, exp: nowInSeconds + 5.5 },
        'reauthToken',
      )
      const tokens = [
        initialToken,
        freshToken,
        reauthToken,
        scheduledRefetchToken,
      ]
      const tokenFetcher = vi.fn(
        async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
          const token = tokens.shift()
          if (!forceRefreshToken) {
            if (token !== initialToken) {
              throw new Error(
                'scheduledRefetchToken should be fetched with forceRefreshToken=true',
              )
            }
            return token ?? null
          }

          vi.advanceTimersByTime(1000)
          return token ?? null
        },
      )
      const onChange = vi.fn((isAuthenticated: boolean) => {
        if (!isAuthenticated) {
          throw new Error('Client is unexpectedly unauthenticated')
        }
      })
      client.setAuth(tokenFetcher, onChange)

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: initialToken,
      })
      const querySetVersion = getQuerySetVersion(client)

      send({
        type: 'Transition',
        startVersion: {
          ...querySetVersion,
          identity: 0,
        },
        endVersion: {
          ...querySetVersion,
          identity: 1,
        },
        modifications: [],
      })

      assertAuthenticateMessage(await receive(), {
        baseVersion: 1,
        token: freshToken,
      })

      send({
        type: 'Transition',
        startVersion: {
          ...querySetVersion,
          identity: 1,
        },
        endVersion: {
          ...querySetVersion,
          identity: 2,
        },
        modifications: [],
      })

      vi.advanceTimersByTime(500)

      await simulateAuthError({
        send,
        close,
        authError: {
          type: 'AuthError',
          error: 'bla',
          baseVersion: 2,
          authUpdateAttempted: false,
        },
      })

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: scheduledRefetchToken,
      })

      send({
        type: 'Transition',
        startVersion: {
          ...querySetVersion,
          identity: 0,
        },
        endVersion: {
          ...querySetVersion,
          identity: 1,
        },
        modifications: [],
      })

      await client.close()

      expect(onChange).toHaveBeenCalledTimes(2)
      expect(onChange).toHaveBeenNthCalledWith(1, true)
      expect(onChange).toHaveBeenNthCalledWith(2, true)
    })
  })

  it('Client retries token validation on error', async () => {
    await withInMemoryWebSocket(async ({ address, receive, send, close }) => {
      const client = testVueClient(address)
      const ts = Math.ceil(Date.now() / 1000)
      const token1 = jwtEncode({ iat: ts, exp: ts + 60 }, 'token1')
      const token2 = jwtEncode({ iat: ts, exp: ts + 60 }, 'token2')
      const token3 = jwtEncode({ iat: ts, exp: ts + 60 }, 'token3')
      const tokens = [token1, token2, token3]
      const tokenFetcher = vi.fn(async () => tokens.shift()!)
      const onChange = vi.fn()
      client.setAuth(tokenFetcher, onChange)

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: token1,
      })

      const querySetVersion = getQuerySetVersion(client)

      send({
        type: 'Transition',
        startVersion: {
          ...querySetVersion,
          identity: 0,
        },
        endVersion: {
          ...querySetVersion,
          identity: 1,
        },
        modifications: [],
      })

      assertAuthenticateMessage(await receive(), {
        baseVersion: 1,
        token: token2,
      })

      await simulateAuthError({
        send,
        close,
        authError: {
          type: 'AuthError',
          error: 'bla',
          baseVersion: 1,
          authUpdateAttempted: true,
        },
      })

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: token3,
      })
      send({
        type: 'Transition',
        startVersion: {
          ...querySetVersion,
          identity: 0,
        },
        endVersion: {
          ...querySetVersion,
          identity: 1,
        },
        modifications: [],
      })

      await new Promise(resolve => setTimeout(resolve, 0))
      await client.close()

      expect(tokenFetcher).toHaveBeenCalledTimes(3)
      expect(tokenFetcher).toHaveBeenNthCalledWith(1, {
        forceRefreshToken: false,
      })
      expect(tokenFetcher).toHaveBeenNthCalledWith(2, {
        forceRefreshToken: true,
      })
      expect(tokenFetcher).toHaveBeenNthCalledWith(3, {
        forceRefreshToken: true,
      })
      expect(onChange).toHaveBeenCalledTimes(2)
      expect(onChange).toHaveBeenNthCalledWith(1, true)
      expect(onChange).toHaveBeenNthCalledWith(2, true)
    })
  })

  it('Authentication runs first', async () => {
    await withInMemoryWebSocket(async ({ address, receive, send }) => {
      const client = testVueClient(address)

      const token1 = jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret')
      const tokenFetcher = vi.fn(async () => token1)
      client.setAuth(tokenFetcher)

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: token1,
      })

      const querySetVersion = getQuerySetVersion(client)

      send({
        type: 'Transition',
        startVersion: querySetVersion,
        endVersion: {
          ...querySetVersion,
          identity: 1,
        },
        modifications: [],
      })

      const token2 = jwtEncode({ iat: 1234550, exp: 1244550 }, 'secret')
      const tokenFetcher2 = vi.fn(async () => token2)
      client.setAuth(tokenFetcher2)
      client.watchQuery(anyApi.myQuery!.default!, {}).onUpdate(() => {})

      assertAuthenticateMessage(await receive(), {
        baseVersion: 1,
        token: token2,
      })
      expect((await receive()).type).toEqual('ModifyQuerySet')
    })
  })

  it('Auth pause does not prevent unsubscribing from queries', async () => {
    await withInMemoryWebSocket(async ({ address, receive, send }) => {
      const client = testVueClient(address)

      const token1 = jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret')
      const tokenFetcher = vi.fn(async () => token1)
      client.setAuth(tokenFetcher)

      const unsubscribe = client
        .watchQuery(anyApi.myQuery!.default!, {})
        .onUpdate(() => {})

      await assertReconnectWithAuth(receive, {
        baseVersion: 0,
        token: token1,
      })

      const querySetVersion = getQuerySetVersion(client)

      send({
        type: 'Transition',
        startVersion: querySetVersion,
        endVersion: {
          querySet: 1,
          identity: 1,
          ts: encodeU64LE(1),
        },
        modifications: [
          {
            type: 'QueryUpdated',
            queryId: 0,
            value: 42,
            logLines: [],
            journal: null,
          },
        ],
      })

      await waitForAssertion(() => {
        expect(getQuerySetVersion(client).identity).toEqual(1)
      })

      let resolve!: (value: string) => void
      const tokenFetcher2 = vi.fn(
        () =>
          new Promise<string>((r) => {
            resolve = r
          }),
      )
      client.setAuth(tokenFetcher2)

      unsubscribe()

      const token2 = jwtEncode({ iat: 1234550, exp: 1244550 }, 'secret')
      resolve(token2)

      assertAuthenticateMessage(await receive(), {
        baseVersion: 1,
        token: token2,
      })
      expect(await receive()).toMatchObject({
        type: 'ModifyQuerySet',
        modifications: [{ type: 'Remove', queryId: 0 }],
        baseVersion: 1,
      })

      client.watchQuery(anyApi.myQuery!.default!, {}).onUpdate(() => {})

      expect(await receive()).toMatchObject({
        type: 'ModifyQuerySet',
        modifications: [{ type: 'Add', queryId: 1 }],
        baseVersion: 2,
      })

      client.watchQuery(anyApi.myQuery!.foo!, {}).onUpdate(() => {})

      expect(await receive()).toMatchObject({
        type: 'ModifyQuerySet',
        modifications: [{ type: 'Add', queryId: 2 }],
        baseVersion: 3,
      })
    })
  })

  it('Local state resume does not cause duplicate AddQuery', async () => {
    await withInMemoryWebSocket(async ({ address, receive }) => {
      const client = testVueClient(address)

      client.watchQuery(anyApi.myQuery!.default!, {}).onUpdate(() => {})

      expect((await receive()).type).toEqual('Connect')
      expect(await receive()).toMatchObject({
        type: 'ModifyQuerySet',
        modifications: [{ type: 'Add', queryId: 0 }],
        baseVersion: 0,
      })

      const tokenFetcher = vi.fn(async () =>
        jwtEncode({ iat: 1234500, exp: 1244500 }, 'secret'),
      )
      client.setAuth(tokenFetcher)

      expect(await receive()).toMatchObject({
        type: 'Authenticate',
        baseVersion: 0,
      })

      client.watchQuery(anyApi.myQuery!.default!, { foo: 'bla' }).onUpdate(() => {})
      expect(await receive()).toMatchObject({
        type: 'ModifyQuerySet',
        modifications: [{ type: 'Add', queryId: 1 }],
        baseVersion: 1,
      })
    })
  })

  it('Local state resume does not send both Add and Remove', async () => {
    await withInMemoryWebSocket(async ({ address, receive }) => {
      const client = testVueClient(address)

      client.watchQuery(anyApi.myQuery!.default!, {}).onUpdate(() => {})

      expect((await receive()).type).toEqual('Connect')
      expect(await receive()).toMatchObject({
        type: 'ModifyQuerySet',
        modifications: [{ type: 'Add', queryId: 0 }],
        baseVersion: 0,
      })

      let resolve!: (value: string) => void
      const tokenFetcher = vi.fn(
        () =>
          new Promise<string>((r) => {
            resolve = r
          }),
      )
      client.setAuth(tokenFetcher)

      const unsubscribe = client
        .watchQuery(anyApi.myQuery!.default!, { foo: 'bla' })
        .onUpdate(() => {})

      client.watchQuery(anyApi.myQuery!.default!, { foo: 'da' }).onUpdate(() => {})

      unsubscribe()

      resolve(jwtEncode({ iat: 1234550, exp: 1244550 }, 'secret'))

      expect(await receive()).toMatchObject({
        type: 'Authenticate',
        baseVersion: 0,
      })

      expect(await receive()).toMatchObject({
        type: 'ModifyQuerySet',
        modifications: [{ type: 'Add', queryId: 2 }],
        baseVersion: 1,
      })
    })
  })

  it('Local state resume refcounts', async () => {
    await withInMemoryWebSocket(async ({ address, receive }) => {
      const client = testVueClient(address)

      client.watchQuery(anyApi.myQuery!.default!, {}).onUpdate(() => {})

      expect((await receive()).type).toEqual('Connect')
      expect(await receive()).toMatchObject({
        type: 'ModifyQuerySet',
        modifications: [{ type: 'Add', queryId: 0 }],
        baseVersion: 0,
      })

      let resolve!: (value: string) => void
      const tokenFetcher = vi.fn(
        () =>
          new Promise<string>((r) => {
            resolve = r
          }),
      )
      client.setAuth(tokenFetcher)

      const unsubscribe = client
        .watchQuery(anyApi.myQuery!.default!, { foo: 'bla' })
        .onUpdate(() => {})

      client.watchQuery(anyApi.myQuery!.default!, { foo: 'bla' }).onUpdate(() => {})

      unsubscribe()

      resolve(jwtEncode({ iat: 1234550, exp: 1244550 }, 'secret'))

      expect(await receive()).toMatchObject({
        type: 'Authenticate',
        baseVersion: 0,
      })

      expect(await receive()).toMatchObject({
        type: 'ModifyQuerySet',
        modifications: [{ type: 'Add', queryId: 1 }],
        baseVersion: 1,
      })
    })
  })

  it('Local state restart does not send both Add and Remove', async () => {
    await withInMemoryWebSocket(async ({ address, receive }) => {
      const client = testVueClient(address)

      let resolve!: (value: string) => void
      const tokenFetcher = vi.fn(
        () =>
          new Promise<string>((r) => {
            resolve = r
          }),
      )
      client.setAuth(tokenFetcher)

      const unsubscribe = client
        .watchQuery(anyApi.myQuery!.default!, {})
        .onUpdate(() => {})

      unsubscribe()

      resolve(jwtEncode({ iat: 1234550, exp: 1244550 }, 'secret'))

      expect((await receive()).type).toEqual('Connect')
      expect((await receive()).type).toEqual('Authenticate')
      expect(await receive()).toMatchObject({
        type: 'ModifyQuerySet',
        baseVersion: 0,
        modifications: [],
      })
    })
  })
})

describe.sequential('authMode WebSocket', () => {
  it.each([false, true])('expectAuth: %s', async (expectAuth) => {
    await withInMemoryWebSocket(async ({ address, receive, close }) => {
      const client = testVueClient(
        address,
        expectAuth ? { expectAuth: true } : {},
      )

      void client.mutation(anyApi.myMutation!.default!, {})

      if (!expectAuth) {
        expect((await receive()).type).toBe('Connect')
        expect((await receive()).type).toBe('ModifyQuerySet')
        expect((await receive()).type).toBe('Mutation')
      }

      let resolve!: (value: string) => void
      const tokenFetcher = vi.fn(
        () =>
          new Promise<string>((r) => {
            resolve = r
          }),
      )
      const onAuthChange = vi.fn()
      client.setAuth(tokenFetcher, onAuthChange)

      resolve(jwtEncode({ iat: 1234550, exp: 1244550 }, 'secret'))

      if (!expectAuth) {
        expect((await receive()).type).toBe('Authenticate')
      }
      else {
        expect((await receive()).type).toBe('Connect')
        expect((await receive()).type).toBe('Authenticate')
        expect((await receive()).type).toBe('ModifyQuerySet')
        expect((await receive()).type).toBe('Mutation')
      }

      await client.close()
      close()
    }, true)
  })
})

function getQuerySetVersion(client: ConvexVueClient) {
  return (client.sync as unknown as {
    remoteQuerySet: {
      version: {
        querySet: number
        identity: number
        ts: string
      }
    }
  }).remoteQuerySet.version
}

function assertAuthenticateMessage(
  message: ClientMessage,
  expected: {
    baseVersion: number
    token: string
  },
) {
  expect(message.type).toEqual('Authenticate')
  if (message.type !== 'Authenticate') {
    throw new Error('Expected an Authenticate message')
  }
  expect(message.baseVersion).toEqual(expected.baseVersion)
  expect(message.tokenType).toEqual('User')
  if (message.tokenType !== 'User') {
    throw new Error('Expected a User token')
  }
  expect(message.value).toEqual(expected.token)
}

async function assertReconnectWithAuth(
  receive: () => Promise<ClientMessage>,
  expectedAuth: {
    baseVersion: number
    token: string
  },
) {
  expect((await receive()).type).toEqual('Connect')
  assertAuthenticateMessage(await receive(), expectedAuth)
  expect((await receive()).type).toEqual('ModifyQuerySet')
}

async function simulateAuthError(args: {
  send: (message: WireServerMessage) => void
  close: () => void
  authError: AuthErrorMessage
}) {
  args.send({
    type: 'AuthError',
    error: args.authError.error,
    baseVersion: args.authError.baseVersion,
    authUpdateAttempted: args.authError.authUpdateAttempted,
  })
  args.close()
}

function jwtEncode(payload: Record<string, number>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const data = `${encodedHeader}.${encodedPayload}`
  const signature = createHmac('sha256', secret)
    .update(data)
    .digest('base64url')
  return `${data}.${signature}`
}

async function waitForAssertion(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 2000
  while (true) {
    try {
      assertion()
      return
    }
    catch (error) {
      if (Date.now() >= deadline) {
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
}
