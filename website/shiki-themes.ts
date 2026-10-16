// Syntax highlighting in the site's three signals and its gunmetal inks.
//
// The site has three colours and no brand hue, so the code blocks get the
// same three. Shiki's default here was @nuxt/ui's Material pair
// (material-theme-lighter / -palenight), which paints comments violet,
// strings lime and numbers orange: hues design.md rules out.
//
// The gunmetal inks carry structure (identifiers, punctuation, comments),
// yellow marks the language's own machinery (keywords, storage, tags: "look
// here"), green marks values (strings, numbers, insertions: "go"), red marks
// what is wrong (invalid, deleted). The ground is the well code sits in,
// `--sink` in assets/css/tokens.css. Every ink clears 4.5:1 on it, which
// test/docs/design-tokens.test.ts checks; the ratios are in the comments.
//
// `theme` is typed `string | Record<string, string>` by @nuxtjs/mdc, but both
// consumers resolve a ThemeRegistration object at build time (@nuxt/content's
// `_getHighlightPlugin` passes non-strings straight through; @nuxtjs/mdc
// inlines them into its bundled-themes map keyed by `name`). Naming them as
// strings instead would make @nuxtjs/mdc emit an
// `import('@shikijs/themes/<name>')` that cannot resolve, so nuxt.config.ts
// passes the objects directly and casts the narrower type away.

/** The well a code block sits in, per theme: `--sink`. */
export const CODE_GROUND = { light: '#ced1d6', dark: '#1c1e22' } as const

export const codeInk = {
  light: {
    fg: '#1f2226', //    10.43:1 on #ced1d6: --ink
    dim: '#33373e', //    7.81:1: identifiers (zinc-800)
    punct: '#42464e', //  6.18:1: punctuation and operators (zinc-700)
    faint: '#54585f', //  4.67:1: comments (--ink-faint in a well)
    warn: '#5e4800', //   5.71:1: keywords (amber-600)
    ok: '#025727', //     5.73:1: strings (green-600)
    okAlt: '#116632', //  4.62:1: numbers (green-500)
    err: '#8d2423', //    5.69:1: invalid and deleted (red-600)
  },
  dark: {
    fg: '#e6e8ec', //    13.61:1 on #1c1e22: --ink
    dim: '#c4c7cd', //    9.85:1: identifiers
    punct: '#9fa3ad', //  6.61:1: punctuation and operators (--ink-dim)
    faint: '#9498a3', //  5.79:1: comments (--ink-faint)
    warn: '#facc15', //  10.90:1: keywords (amber-400)
    ok: '#4ade80', //     9.58:1: strings (green-400)
    okAlt: '#86efac', // 11.89:1: numbers (green-300)
    err: '#f87171', //    6.03:1: invalid and deleted (red-400)
  },
} as const

function machinedTheme(name: string, type: 'light' | 'dark') {
  const c = codeInk[type]
  const bg = CODE_GROUND[type]
  return {
    name,
    type,
    bg,
    fg: c.fg,
    settings: [
      { settings: { foreground: c.fg, background: bg } },
      {
        scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
        settings: { foreground: c.faint, fontStyle: 'italic' },
      },
      {
        scope: ['punctuation', 'meta.brace', 'meta.delimiter', 'keyword.operator', 'punctuation.definition.tag'],
        settings: { foreground: c.punct },
      },
      {
        scope: [
          'keyword', 'keyword.control', 'storage', 'storage.type', 'storage.modifier',
          'variable.language', 'constant.language', 'support.type.primitive',
          'entity.name.tag', 'markup.heading', 'keyword.other.unit',
        ],
        settings: { foreground: c.warn },
      },
      {
        scope: [
          'string', 'string.template', 'constant.character', 'punctuation.definition.string',
          'markup.inline.raw', 'markup.fenced_code', 'markup.inserted',
        ],
        settings: { foreground: c.ok },
      },
      {
        scope: ['constant.numeric', 'constant.language.boolean', 'constant.other', 'support.constant'],
        settings: { foreground: c.okAlt },
      },
      {
        scope: [
          'entity.name.function', 'support.function', 'meta.function-call',
          'entity.name.class', 'entity.name.type', 'support.class', 'support.type',
        ],
        settings: { foreground: c.fg },
      },
      {
        scope: [
          'variable', 'variable.other', 'support.variable', 'meta.object-literal.key',
          'entity.other.attribute-name', 'meta.attribute', 'meta.property-name',
        ],
        settings: { foreground: c.dim },
      },
      {
        scope: ['invalid', 'invalid.illegal', 'markup.deleted', 'message.error'],
        settings: { foreground: c.err },
      },
    ],
  }
}

export const codeThemeLight = machinedTheme('nuxt-backend-light', 'light')
export const codeThemeDark = machinedTheme('nuxt-backend-dark', 'dark')
