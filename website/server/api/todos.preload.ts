import { api } from '#backend/api'

export default defineEventHandler((event) => {
  return convexAuth(event).preloadAuthQuery(api.todos.list, {})
})
