/**
 * Open a URL the deployment handed back — a checkout, a customer portal, an
 * invoice — in a new tab, or in place with `redirect`.
 *
 * Those URLs come from the billing provider through the app's own actions,
 * never from the page, but the browser does not know that: a navigation is
 * only performed for an `http(s)` destination, so nothing that reaches here
 * can ever be a `javascript:` or `data:` target. Anything else is dropped.
 */
export function openProviderUrl(url: string, redirect?: boolean): void {
  if (typeof window === 'undefined') return
  let target: URL
  try {
    target = new URL(url, window.location.href)
  }
  catch {
    return
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return
  // fallow-ignore-next-line security-sink -- provider-issued destination, scheme-checked above; verified 2026-09-17
  if (redirect) window.location.href = target.href
  // fallow-ignore-next-line security-sink -- provider-issued destination, scheme-checked above; verified 2026-09-17
  else window.open(target.href, '_blank')
}
