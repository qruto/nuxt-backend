import { defineEventHandler, getRequestIP } from 'nuxt/server'

// `/api/backend/visitor-ip`: the visitor's IP address as the app's server
// sees it, for the billing provider's local pricing (LIFECYCLE). A checkout
// is created on the deployment, whose address the provider would otherwise
// price and pre-fill the billing country by; `useBilling().checkout` reads
// this and sends it with the checkout. It answers the caller's own address
// and nothing else, never cached, and nothing keeps it.

export default defineEventHandler((event) => {
  event.res.headers.set('Cache-Control', 'no-store')
  // Behind the host's proxy the client's address is the first of `x-forwarded-for`.
  return { ip: getRequestIP(event, { xForwardedFor: true }) ?? null }
})
