import { defineApp } from 'convex/server'
import auth from '@convex-dev/auth/convex.config'
import authPassword from '@convex-dev/auth/components/password/convex.config'
import authUsername from '@convex-dev/auth/components/username/convex.config'

// Convex Auth's components: the core, mounted as `auth` (the name its tokens
// are issued under), and the two a username and password sign-in uses. The
// package's own `backend` component is not mounted: in Convex Auth mode
// nothing of it runs.
const app = defineApp()
app.use(auth)
app.use(authPassword)
app.use(authUsername)

export default app
