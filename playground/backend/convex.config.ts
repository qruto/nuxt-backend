import { defineApp } from 'convex/server'
import backend from 'nuxt-backend/convex-component'

const app = defineApp()
app.use(backend, { httpPrefix: '/api/auth' })
export default app
