import { defineApp } from 'convex/server'
import backend from 'nuxt-backend/convex/component/convex.config'

const app = defineApp()
app.use(backend, { httpPrefix: '/api/auth' })
export default app
