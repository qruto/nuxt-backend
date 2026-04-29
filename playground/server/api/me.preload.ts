import { api } from '../../backend/_generated/api'

export default defineEventHandler((event) => {
  return backendAuth(event).preloadAuthQuery(api.auth.getCurrentUser, {})
})
