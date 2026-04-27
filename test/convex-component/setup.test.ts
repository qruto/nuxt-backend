/// <reference types="vite/client" />
import { test } from 'vitest'
import { convexTest } from 'convex-test'
import { componentsGeneric, defineSchema, type GenericSchema, type SchemaDefinition } from 'convex/server'
import betterAuth from '@convex-dev/better-auth/test'
import component from '../../src/convex/test'

export function initConvexTest<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(schema?: Schema) {
  const t = convexTest(schema ?? defineSchema({}), component.modules)
  betterAuth.register(t, 'betterAuth')
  return t
}

export const components = componentsGeneric() as unknown as {
  betterAuth: {
    adapter: {
      create: import('convex/server').FunctionReference<'mutation', 'internal', any, any>
      findOne: import('convex/server').FunctionReference<'query', 'internal', any, any>
      findMany: import('convex/server').FunctionReference<'query', 'internal', any, any>
      updateOne: import('convex/server').FunctionReference<'mutation', 'internal', any, any>
      updateMany: import('convex/server').FunctionReference<'mutation', 'internal', any, any>
      deleteOne: import('convex/server').FunctionReference<'mutation', 'internal', any, any>
      deleteMany: import('convex/server').FunctionReference<'mutation', 'internal', any, any>
    }
  }
}

test('setup', () => {})
