// `#imports` for the passkey autofill page (test/e2e/passkey-autofill.test.ts):
// a page with no Nuxt app around it. What the sign-in form reads of an app
// answers the defaults, and app state falls back to plain refs.

export function useRuntimeConfig() {
  return { public: {} }
}

export function useAppConfig() {
  return {}
}

export function tryUseNuxtApp() {
  return null
}

export function useState(): never {
  throw new Error('useState needs a Nuxt app')
}

export function useCookie(): never {
  throw new Error('useCookie needs a Nuxt app')
}
