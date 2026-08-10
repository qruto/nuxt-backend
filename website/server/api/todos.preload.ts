import { api } from '#backend/api'

export default defineEventHandler((event) => {
  return backendAuth(event).preloadAuthQuery(api.todos.list, {})
})
