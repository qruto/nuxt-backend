import { createApi } from '@convex-dev/better-auth'
import type { RegisteredMutation, RegisteredQuery } from 'convex/server'
import { options } from '../auth'
import schema from './schema'

// `createApi` returns types that reference `TableNames` from
// `@convex-dev/better-auth`'s internal `_generated/dataModel`, which isn't a
// portable subpath. Cast the result to a permissive adapter shape; the public
// component surface is generated in ./_generated/component.ts.
type AdapterMutation = RegisteredMutation<'public', Record<string, unknown>, Promise<unknown>>
type AdapterQuery = RegisteredQuery<'public', Record<string, unknown>, Promise<unknown>>

interface Adapter {
  create: AdapterMutation
  findOne: AdapterQuery
  findMany: AdapterQuery
  updateOne: AdapterMutation
  updateMany: AdapterMutation
  deleteOne: AdapterMutation
  deleteMany: AdapterMutation
}

export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
} = createApi(schema, () => options) as unknown as Adapter
