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
