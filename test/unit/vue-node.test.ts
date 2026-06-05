import { expect, test } from 'vitest'
import { anyApi } from 'convex/server'
import { ConvexVueClient, type ConvexVueClientOptions } from '../../src/runtime/vue/client'
import {
  type ClientMessage,
  encodeU64LE,
  nodeWebSocket,
  withInMemoryWebSocket,
  type WireServerMessage,
} from '../helpers/in_memory_web_socket'

const testVueClient = (address: string, options?: ConvexVueClientOptions) =>
  new ConvexVueClient(address, {
    webSocketConstructor: nodeWebSocket,
    unsavedChangesWarning: false,
    ...options,
  })

test('ConvexVueClient ends subscriptions on close', async () => {
  await withInMemoryWebSocket(async ({ address, receive, send }) => {
    const client = testVueClient(address)
    const watch = client.watchQuery(anyApi.myQuery!.default!, {})
    let timesCallbackRan = 0
    watch.onUpdate(() => timesCallbackRan++)

    expect((await receive()).type).toEqual('Connect')
    const modify = expectQuerySetModification(await receive())
    expect(modify.modifications).toEqual([
      {
        args: [{}],
        queryId: 0,
        type: 'Add',
        udfPath: 'myQuery:default',
      },
    ])
    expect(timesCallbackRan).toEqual(0)

    send(transition())

    // After the callback has been registered but before the callback has been
    // run, close the client.
    const closePromise = client.close()

    expect(timesCallbackRan).toEqual(0)

    // After the internal client has closed, same nothing.
    await closePromise
    expect(timesCallbackRan).toEqual(0)
  })
})

type QuerySetModification = {
  type: 'ModifyQuerySet'
  baseVersion: number
  newVersion: number
  modifications: Array<{
    type: 'Add' | 'Remove'
    queryId: number
    udfPath?: string
    args?: unknown[]
  }>
}

function expectQuerySetModification(message: ClientMessage): QuerySetModification {
  expect(message.type).toEqual('ModifyQuerySet')
  if (message.type !== 'ModifyQuerySet') throw new Error('Wrong message!')
  return message as unknown as QuerySetModification
}

function transition(): WireServerMessage {
  return {
    type: 'Transition',
    startVersion: { querySet: 0, identity: 0, ts: encodeU64LE(0) },
    endVersion: { querySet: 1, identity: 0, ts: encodeU64LE(1) },
    modifications: [
      {
        type: 'QueryUpdated',
        queryId: 0,
        value: 0.0,
        logLines: [],
        journal: null,
      },
    ],
  }
}
