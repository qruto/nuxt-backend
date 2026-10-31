import { createError as h3CreateError, getCookie as h3GetCookie, getRequestHeader as h3RequestHeader, getRequestProtocol as h3RequestProtocol, getRequestURL as h3RequestURL, readBody as h3ReadBody, setCookie as h3SetCookie, setResponseStatus as h3SetResponseStatus, toWebRequest, type H3Event } from 'h3'

// Stand-in for `nuxt/server` in the unit project. The real one is Nuxt's
// runtime for the server builder in use, which only a built server resolves.
// This one does what Nuxt's nitropack 2 runtime does over an h3 1 event, so
// a handler under test runs inside a real h3 app: the event a handler gets
// is the h3 event with a web view on top (`req`, `res`, `url`), cached per
// request, so every handler of one request sees the same `req`. Runtime
// config is whatever the test mocks `nitropack/runtime` with.
export { useRuntimeConfig } from 'nitropack/runtime'

/** A node response's headers, in the `Headers` shape `event.res.headers` has. */
function responseHeaders(event: H3Event) {
  const res = event.node.res
  return {
    get: (name: string) => {
      const value = res.getHeader(name)
      return value === undefined ? null : String(value)
    },
    has: (name: string) => res.hasHeader(name),
    set: (name: string, value: string) => void res.setHeader(name, value),
    delete: (name: string) => void res.removeHeader(name),
  }
}

const portable = new WeakMap<H3Event, H3Event>()

/** The event in the portable shape, the h3 event underneath it. */
function toPortableEvent(event: H3Event): H3Event {
  const cached = portable.get(event)
  if (cached) return cached
  let req: Request | undefined
  const view: Record<string, unknown> = {
    get req() {
      return (req ??= toWebRequest(event))
    },
    res: {
      get status() {
        return event.node.res.statusCode
      },
      set status(status: number) {
        event.node.res.statusCode = status
      },
      headers: responseHeaders(event),
    },
    get url() {
      return h3RequestURL(event)
    },
  }
  const proxy = new Proxy(event, {
    get: (target, property) => property in view ? view[property as string] : Reflect.get(target, property, target),
  })
  portable.set(event, proxy)
  return proxy
}

export const defineEventHandler = <Result>(handler: (event: never) => Result) =>
  (event: H3Event) => handler(toPortableEvent(event) as never)

export function createError(input: { status?: number, statusText?: string, message?: string }) {
  const { status, statusText, ...rest } = input
  return h3CreateError({ ...rest, statusCode: status, statusMessage: statusText })
}

export const getRequestHeader = (event: H3Event, name: string) => h3RequestHeader(event, name) || undefined
export const getRequestURL = (event: H3Event) => h3RequestURL(event)
export const readBody = (event: H3Event) => h3ReadBody(event)
export const setResponseStatus = (event: H3Event, status: number, statusText?: string) => h3SetResponseStatus(event, status, statusText)
export const getCookie = (event: H3Event, name: string) => h3GetCookie(event, name)
export const setCookie = (event: H3Event, name: string, value: string, options?: Parameters<typeof h3SetCookie>[3]) => h3SetCookie(event, name, value, options)
export const getRequestProtocol = (event: H3Event, options?: { xForwardedProto?: boolean }) => h3RequestProtocol(event, options)
