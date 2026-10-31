// Who asked for a code, as the email names it: the device, an approximate
// place and the time. Read from the request's own headers: the user agent,
// and the IP geolocation the host in front of the app adds (Vercel's
// `x-vercel-ip-*`, which the auth proxy forwards). A request that reaches the
// deployment some other way can send any header it likes, so nothing it
// says reaches an email as it came: the device is one of a few known names,
// the place letters only, the time zone one the runtime knows.

import type { RequestOrigin } from '../email-templates.js'
import { preferredLocale } from '../locale.js'

/** Browsers by the token their user agent carries, most specific first: Edge and Opera also say Chrome. */
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\//, 'Opera'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bVersion\/\d[^ ]* .*Safari\//, 'Safari'],
]

/** Systems, most specific first: an iPhone's user agent also says `like Mac OS X`. */
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bLinux\b/, 'Linux'],
]

function firstMatch(table: ReadonlyArray<readonly [RegExp, string]>, value: string): string | undefined {
  return table.find(([pattern]) => pattern.test(value))?.[1]
}

/** A city as a geolocation header names it (URL-encoded on Vercel): letters, marks, spaces, dots, apostrophes and hyphens, or nothing. */
function cityOf(raw: string | null): string | undefined {
  if (!raw) return undefined
  let city: string
  try {
    city = decodeURIComponent(raw).trim()
  }
  catch {
    return undefined
  }
  return /^[\p{L}\p{M}][\p{L}\p{M} .'-]{0,59}$/u.test(city) ? city : undefined
}

/** A country as an ISO 3166-1 alpha-2 code, or nothing. */
function countryOf(raw: string | null): string | undefined {
  const code = raw?.trim().toUpperCase()
  return code && /^[A-Z]{2}$/.test(code) ? code : undefined
}

/** A time zone the runtime knows, or nothing. */
function timeZoneOf(raw: string | null): string | undefined {
  const zone = raw?.trim()
  if (!zone || !/^[\w+\-/]{1,64}$/.test(zone)) return undefined
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return zone
  }
  catch {
    return undefined
  }
}

/** The headers a hook's context carries of its request. */
function headersOf(endpoint: unknown): Headers | undefined {
  const context = endpoint as { headers?: Headers, request?: Request } | undefined
  const headers = context?.headers ?? context?.request?.headers
  return typeof headers?.get === 'function' ? headers : undefined
}

/** The browser and the system a user agent names, each left out when unknown. */
function deviceOf(agent: string): RequestOrigin['device'] {
  const browser = firstMatch(BROWSERS, agent)
  const os = firstMatch(SYSTEMS, agent)
  return browser || os ? { ...(browser ? { browser } : {}), ...(os ? { os } : {}) } : undefined
}

/** The city and country the host's geolocation names, each left out when unusable. */
function placeOf(headers: Headers | undefined): RequestOrigin['place'] {
  const city = cityOf(headers?.get('x-vercel-ip-city') ?? null)
  const country = countryOf(headers?.get('x-vercel-ip-country') ?? null)
  return city || country ? { ...(city ? { city } : {}), ...(country ? { country } : {}) } : undefined
}

/**
 * The origin of the request a hook runs for, now. Every part but the time is
 * left out when the request does not give it in a form the email may show.
 */
export function requestOrigin(endpoint: unknown, now = Date.now()): RequestOrigin {
  const headers = headersOf(endpoint)
  const device = deviceOf(headers?.get('user-agent') ?? '')
  const place = placeOf(headers)
  const timeZone = timeZoneOf(headers?.get('x-vercel-ip-timezone') ?? null)
  return { ...(device ? { device } : {}), ...(place ? { place } : {}), at: now, ...(timeZone ? { timeZone } : {}) }
}

/**
 * The language the request that asked for a code reads in, from its
 * `Accept-Language` (`useLoginFlow` sets it to the app's language): what a
 * code to an address without an account is written in.
 */
export function requestLocale(endpoint: unknown): string | null {
  const context = endpoint as { headers?: Headers, request?: Request } | undefined
  const headers = context?.headers ?? context?.request?.headers
  return preferredLocale(typeof headers?.get === 'function' ? headers.get('accept-language') : null)
}
