// The app's own server init: it serves no managed tunnel.
import * as Sentry from '@sentry/nuxt'

Sentry.init({ dsn: process.env.MONITORING_DSN })
