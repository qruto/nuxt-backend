import { vi } from 'vitest'

/**
 * Run `run` as if the runtime's own default locale were `tag`: every
 * `Intl.NumberFormat`, `Intl.DateTimeFormat` and `Date#toLocale*String`
 * given no locale formats in it. A server and a browser rarely share one;
 * a string formatted the same under two defaults reads the same on both.
 */
export async function inRuntimeLocale<T>(tag: string, run: () => T | Promise<T>): Promise<T> {
  const { NumberFormat, DateTimeFormat } = Intl
  class DefaultedNumberFormat extends NumberFormat {
    constructor(locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions) {
      super(locales ?? tag, options)
    }
  }
  class DefaultedDateTimeFormat extends DateTimeFormat {
    constructor(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
      super(locales ?? tag, options)
    }
  }
  const { toLocaleString, toLocaleDateString, toLocaleTimeString } = Date.prototype
  const defaulted = (method: typeof toLocaleString) => function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
    return method.call(this, locales ?? tag, options)
  }
  vi.stubGlobal('Intl', { ...Object.fromEntries(Object.getOwnPropertyNames(Intl).map(name => [name, (Intl as unknown as Record<string, unknown>)[name]])), NumberFormat: DefaultedNumberFormat, DateTimeFormat: DefaultedDateTimeFormat })
  Object.assign(Date.prototype, { toLocaleString: defaulted(toLocaleString), toLocaleDateString: defaulted(toLocaleDateString), toLocaleTimeString: defaulted(toLocaleTimeString) })
  try {
    return await run()
  }
  finally {
    vi.unstubAllGlobals()
    Object.assign(Date.prototype, { toLocaleString, toLocaleDateString, toLocaleTimeString })
  }
}
