import { defineComponent } from 'convex/server'
import betterAuth from '@convex-dev/better-auth/convex.config'

const component = defineComponent('backend')
component.use(betterAuth)

export default component
