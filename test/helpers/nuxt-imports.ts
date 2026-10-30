type TestRuntimeConfig = {
  backend?: {
    siteUrl?: string
  }
  public?: {
    backend?: {
      url?: string
      siteUrl?: string
    }
  }
}

let runtimeConfig: TestRuntimeConfig = {}

export function useRuntimeConfig() {
  return runtimeConfig
}

export function setNuxtRuntimeConfigForTests(config: TestRuntimeConfig) {
  runtimeConfig = config
}

export function resetNuxtRuntimeConfigForTests() {
  runtimeConfig = {}
}

/** No Nuxt app in a unit test: what reads one (`$i18n`, hooks) goes without. */
export function tryUseNuxtApp() {
  return null
}

/** Never reached here: `tryUseNuxtApp()` answers `null`, so app state falls back to plain refs. */
export function useState(): never {
  throw new Error('useState needs a Nuxt app')
}

/** Never reached here, as `useState`. */
export function useCookie(): never {
  throw new Error('useCookie needs a Nuxt app')
}

/** No app config in a unit test: the package's defaults stand. */
export function useAppConfig() {
  return {}
}
