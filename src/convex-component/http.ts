import { httpRouter } from 'convex/server'
import { authComponent, createComponentAuth } from './componentAuth'
import { COMPONENT_AUTH_ROUTE } from './constants'

const http = httpRouter()

authComponent.registerRoutesLazy(http, createComponentAuth, {
  basePath: COMPONENT_AUTH_ROUTE,
})

export default http
