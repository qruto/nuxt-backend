// What a `provider/model` id looks like, as the AI Gateway names its models:
// `openai/gpt-5-mini`, `anthropic/claude-sonnet-4.5`. One pattern for the
// runtime, which refuses any other id where it is configured, and for
// doctor, which reads the ids a backend names from its source. Both are
// literals, written with the same id inside: a provider (letters, digits,
// dashes), a slash, then anything but whitespace and quotes, slashes and dots
// included (test/unit/doctor-gateway-key.test.ts holds them to each other).

/** A whole `provider/model` id. */
export const MODEL_ID = /^[a-z0-9][a-z0-9-]*\/[^\s'"`]+$/i

/**
 * The `setupAi({ routes })` key an id takes its order from: its own, else
 * the longest pattern ending in `*` it matches (`google/*`,
 * `google/gemini-3-*`); `undefined` when none does. The runtime routes by
 * it, and doctor reads a backend's routes with it.
 */
export function routeKeyFor(id: string, routes: Readonly<Record<string, unknown>>): string | undefined {
  if (Object.hasOwn(routes, id)) return id
  let best: string | undefined
  for (const key of Object.keys(routes)) {
    if (key.endsWith('*') && id.startsWith(key.slice(0, -1)) && (best === undefined || key.length > best.length)) best = key
  }
  return best
}

/**
 * An id named as a string in a `model:` option or a `model(…)` call (`ctx.model('…')`),
 * quoted any way: the id is the second group.
 */
export const NAMED_MODEL = /\bmodel\s*(?::|\()\s*(['"`])([a-z0-9][a-z0-9-]*\/[^\s'"`]+)\1/gi
