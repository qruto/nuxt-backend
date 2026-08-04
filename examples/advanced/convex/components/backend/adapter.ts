import { createApi } from '@convex-dev/better-auth'
import { createAuthOptions } from '../../auth'
import { authSchema } from './schema'

export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
} = createApi(authSchema, createAuthOptions)
