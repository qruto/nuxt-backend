import { defineNuxtPlugin, useRuntimeConfig } from '#imports'
import { configureProtection, protectedRequests } from '../protection/state'

/**
 * Bot protection in the browser. On Vercel (a build there sets
 * `backend.botDetection`), BotID's client checks every protected auth request and
 * the proof route, before any of them leaves: it runs first, so no request
 * goes out unchecked. It records the challenge's site key too, for the auth
 * client and `useHumanCheck`; the challenge loads on first use.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:protection',
  enforce: 'pre',
  async setup(nuxtApp) {
    const config = useRuntimeConfig().public.backend as { authRoute?: string, botDetection?: boolean, challengeSiteKey?: string } | undefined
    const authRoute = config?.authRoute ?? '/api/auth'
    const botDetection = config?.botDetection === true
    configureProtection({
      authRoute,
      botDetection,
      challengeSiteKey: config?.challengeSiteKey ?? '',
      // The labels load with the challenge, never with the page.
      caption: () => import('../utils/challenge-caption').then(({ challengeCaption }) => nuxtApp.runWithContext(challengeCaption)),
    })
    if (botDetection) {
      const { initBotId } = await import('botid/client/core')
      initBotId({ protect: protectedRequests(authRoute) })
    }
  },
})
