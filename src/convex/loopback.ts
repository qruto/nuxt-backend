// Whether a host or a URL is on this machine. Runtime-neutral, so the
// monitoring layer and the backend's health read a loopback address the
// same way.

/** A host on this machine: `localhost` and its subdomains, `::1`, and all of 127.0.0.0/8. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
}

/** Whether a URL names a host on this machine; `false` for no URL, or one that does not parse. */
export function isLoopbackUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    return isLoopbackHost(new URL(url).hostname)
  }
  catch {
    return false
  }
}
