import { useRuntimeConfig } from '#imports'

type BackendRuntimeConfig = {
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

export function getBackendRuntimeConfig() {
  try {
    const config = useRuntimeConfig() as BackendRuntimeConfig
    return {
      url: config.public?.backend?.url,
      siteUrl: config.backend?.siteUrl || config.public?.backend?.siteUrl,
    }
  }
  catch {
    return {}
  }
}
