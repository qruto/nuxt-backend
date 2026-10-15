export default defineAppConfig({
  // The nuxt-backend content layer: the plan catalog rendered by
  // <PricingTable> / <WorkspaceSettings>. Keys match the products map in
  // backend/billing.ts — names and prices resolve live from Polar sandbox.
  backend: {
    billing: {
      plans: [
        { key: 'starter', credits: 50, blurb: 'For trying things out.' },
        { key: 'pro', credits: 200, blurb: 'For products finding their feet.', features: ['premium'] },
        { key: 'ultra', credits: 500, blurb: 'Everything, unlocked.', features: ['premium', 'ultra'], highlight: true },
      ],
      packs: [
        { key: 'credits100', credits: 100 },
        { key: 'credits500', credits: 500 },
      ],
    },
    brand: { name: 'Nuxt backend' },
  },

  docus: {
    locale: 'en',
    // System preference with a toggle (EDC works in both light and dark).
    colorMode: '',
  },

  ui: {
    colors: {
      // No brand colour. The site speaks in three status signals — green (go /
      // ok / live / primary action), yellow (attention / idle / secondary /
      // experimental), red (danger / error / destructive) — on gunmetal.
      // app.css re-tones Tailwind's `green`, `amber` (which carries the
      // yellow), `red` and `zinc` ramps in `@theme static`, so every Nuxt UI
      // alias below lands on the house palette natively (Nuxt UI binds each
      // alias to the ramp's 500 step in light, 400 in dark — both text-safe
      // here). Key set = Nuxt UI 4's default `theme.colors` aliases + `neutral`.
      primary: 'green',
      secondary: 'amber',
      success: 'green',
      // No blue: `info` (the ::note callout colour, normally blue) is amber —
      // a note is attention, not a status.
      info: 'amber',
      warning: 'amber',
      error: 'red',
      neutral: 'zinc',
    },
    // The parts (assets/css/depth.css, console.css) are Tailwind utilities,
    // so in a Nuxt UI slot string they meet the component's own classes. A
    // part's class group conflicts with what the part draws, so the part,
    // named last, replaces the component's background, ring, border, radius
    // and shadow (or text colour and shadow, for relief) instead of losing to
    // them in the stylesheet's order. `carved` and `seam` draw only an edge,
    // so they keep a tinted background; `stamp` sets a whole label's type.
    // Modifiers (`k-xs`, `slot-pill`, `led-warn` …) only set custom
    // properties and belong to no group. test/docs/design-parts.test.ts keeps
    // these lists equal to the parts the stylesheets declare.
    tv: {
      twMergeConfig: {
        extend: {
          classGroups: {
            'depth': ['k', 'unit', 'plaque', 'slot', 'lcd', 'bar', 'code-plate'],
            'depth-edge': ['carved', 'seam'],
            'relief': ['cut', 'cut-sm', 'emb', 'emb-sm', 'engr', 'engr-lt'],
            'label': ['stamp'],
          },
          conflictingClassGroups: {
            'depth': ['bg-color', 'bg-image', 'rounded', 'shadow', 'shadow-color', 'inset-shadow', 'inset-shadow-color', 'ring-w', 'ring-color', 'inset-ring-w', 'border-w', 'border-color', 'backdrop-blur'],
            'depth-edge': ['shadow', 'shadow-color', 'inset-shadow', 'inset-shadow-color', 'ring-w', 'ring-color', 'inset-ring-w'],
            'relief': ['text-color', 'text-shadow', 'text-shadow-color'],
            'label': ['font-family', 'font-size', 'font-weight', 'font-stretch', 'tracking', 'text-transform', 'text-color', 'leading'],
          },
        },
      },
    },
    // The docs chrome on the parts (design.md §Chrome map), through Nuxt
    // UI's slots rather than CSS selectors. NOTE: never override
    // `commandPalette.slots.input` or `contentNavigation.slots.*` without
    // copying Docus's own strings first — defu REPLACES same-key strings.
    header: { slots: { root: 'bar' } },
    pageHeader: {
      slots: { title: 'font-display font-semibold tracking-[0.015em] cut-sm' },
    },
    contentToc: {
      slots: { trigger: 'engr uppercase tracking-[0.08em] text-xs' },
    },
    contentSearchButton: { slots: { base: 'slot slot-pill' } },
    contentNavigation: {
      slots: {
        // Docus's string, kept.
        linkLeadingIcon: 'size-4 mx-0.5',
        // Docus hides the trailing slot; the sidebar's groups collapse, so
        // their chevrons show, and so does an Experimental badge.
        linkTrailing: 'ms-auto inline-flex gap-1.5 items-center',
      },
      // The page you are on sits in a milled pill.
      compoundVariants: [{ variant: 'link', active: true, class: { link: 'slot slot-pill' } }],
    },
    contentSurround: { slots: { link: 'plaque' } },
    // Docs-embedded demo cards (DemoCounter, DemoConnection).
    card: { slots: { root: 'plaque' } },
    footer: { slots: { root: 'seam' } },
    prose: {
      h1: { slots: { base: 'font-display font-semibold tracking-[0.015em] cut-sm' } },
      h2: { slots: { base: 'font-display font-semibold tracking-[0.01em] pb-2 rule-carved emb-sm' } },
      h3: { slots: { base: 'font-display font-medium tracking-[0.01em]' } },
      pre: { slots: { base: 'slot', header: 'code-plate' } },
      code: { base: 'slot slot-xs' },
      card: { slots: { base: 'plaque', title: 'font-display font-semibold embossed-sm' } },
      // Shadow-only carve — the callout keeps its tinted bg → a pressed tinted well.
      callout: { slots: { base: 'carved rounded-[10px]' } },
      // Code-block filename / package-manager marks. Nuxt UI's default map
      // points every one of these at `vscode-icons`, whose glyphs are
      // full-colour vendor logos baked into a data-URI (orange pnpm #f9ad00,
      // red npm #c12127, blue TypeScript #007acc, a second green for Vue) —
      // they bypass `currentColor` and would put four more hues on a canvas
      // that has no brand colour and only three signals. `simple-icons` are
      // single-path marks that inherit `currentColor`, so the tabs stay
      // titanium. Keys are matched filename-first, then by extension, so the
      // dotfiles and bare package-manager tab names are listed explicitly;
      // anything unlisted falls back to Nuxt UI's `i-vscode-icons-file-type-*`
      // guess, so add the extension here when a new language appears.
      codeIcon: {
        'ts': 'i-simple-icons-typescript',
        'tsx': 'i-simple-icons-typescript',
        'mts': 'i-simple-icons-typescript',
        'js': 'i-simple-icons-javascript',
        'mjs': 'i-simple-icons-javascript',
        'jsx': 'i-simple-icons-javascript',
        'vue': 'i-simple-icons-vuedotjs',
        'md': 'i-simple-icons-markdown',
        'json': 'i-simple-icons-json',
        'css': 'i-lucide-palette',
        'ini': 'i-lucide-sliders-horizontal',
        'yml': 'i-lucide-file-code',
        'yaml': 'i-lucide-file-code',
        'npm': 'i-simple-icons-npm',
        'npx': 'i-simple-icons-npm',
        'pnpm': 'i-simple-icons-pnpm',
        'yarn': 'i-simple-icons-yarn',
        'bun': 'i-simple-icons-bun',
        'nuxt': 'i-simple-icons-nuxt',
        'nuxt.config.ts': 'i-simple-icons-nuxt',
        'nuxt.config.js': 'i-simple-icons-nuxt',
        'nuxt.schema.ts': 'i-simple-icons-nuxt',
        'package.json': 'i-simple-icons-npm',
        'tsconfig.json': 'i-simple-icons-typescript',
        '.npmrc': 'i-lucide-sliders-horizontal',
        '.env': 'i-lucide-file-key',
        '.env.local': 'i-lucide-file-key',
        '.env.example': 'i-lucide-file-key',
      },
    },
  },

  // Keep `description` in sync with `site.description` in nuxt.config.ts —
  // that one string is the meta description, the OG/Twitter description and
  // the llms.txt summary, so the product says the same sentence everywhere.
  seo: {
    titleTemplate: '%s · Nuxt backend',
    title: 'Nuxt backend',
    description:
      'The all-in-one SaaS backend for Nuxt on Convex — authentication, billing, credits, transactional email, webhooks and an agent (MCP) surface from a single package.',
  },

  // The ten docs tabs ride in the header (Docus's sub-navigation), and the
  // sidebar shows only the current tab's groups.
  navigation: {
    sub: 'header',
  },

  header: {
    title: 'nuxt-backend',
    logo: {
      light: '/logo-light.svg',
      dark: '/logo-dark.svg',
      alt: 'nuxt-backend',
    },
  },

  // No `socials` block: Docus's footer renders `socials.*` AND `github.url`
  // side by side, so declaring the repo in both put two identical octocats
  // next to each other. `github` stays — it also powers "Edit this page".
  // The same repository as REPOSITORY in shared/page-keys.ts (the Source
  // keys); app config cannot import it, and test/docs/page-header.test.ts
  // keeps the two equal.
  github: {
    url: 'https://github.com/qruto/nuxt-backend',
    branch: 'main',
    rootDir: 'website',
  },

  toc: {
    title: 'On this page',
    bottom: {
      title: 'Ecosystem',
      links: [
        {
          icon: 'i-simple-icons-nuxt',
          label: 'Nuxt docs',
          to: 'https://nuxt.com',
          target: '_blank',
        },
        {
          icon: 'i-simple-icons-convex',
          label: 'Convex docs',
          to: 'https://docs.convex.dev',
          target: '_blank',
        },
        {
          icon: 'i-lucide-shield-check',
          label: 'Better Auth docs',
          to: 'https://www.better-auth.com',
          target: '_blank',
        },
      ],
    },
  },
})
