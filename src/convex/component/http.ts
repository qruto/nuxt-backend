import { createClient } from '@convex-dev/better-auth'
import { httpRouter } from 'convex/server'
import authConfig from '../auth.config'
import { createAuth } from '../client/index'
import { components } from './_generated/api'
import { COMPONENT_AUTH_ROUTE } from './constants'

const authComponent = createClient(components.betterAuth)
const http = httpRouter()

authComponent.registerRoutesLazy(http, ctx => createAuth(ctx, components.betterAuth, { authConfig }), {
  basePath: COMPONENT_AUTH_ROUTE,
})

export default http
