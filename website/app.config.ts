export default defineAppConfig({
  docus: {
    locale: 'en',
    // System preference with a toggle (EDC works in both light and dark).
    colorMode: '',
  },

  ui: {
    colors: {
      // "Flare" — fluorescent orange. The actual ramp is overridden in app.css
      // (we re-tone Tailwind's `orange`); titanium-grey neutral via `zinc`.
      primary: 'orange',
      neutral: 'zinc',
      // No blue in the EDC palette — fold `info` (the default ::note callout
      // colour, normally blue) into the orange accent. success/warning/error
      // keep their semantic green/amber/red, which already live in the palette.
      info: 'orange',
    },
  },

  seo: {
    titleTemplate: '%s · Nuxt backend',
    title: 'Nuxt backend',
    description:
      'A full-stack Convex backend for Nuxt — one package that ships a Nuxt module and a Convex auth component with Better Auth built in.',
  },

  header: {
    title: 'Nuxt backend',
    logo: {
      light: '/favicon.svg',
      dark: '/favicon.svg',
      alt: 'Nuxt backend',
    },
  },

  socials: {
    github: 'https://github.com/qruto/nuxt-backend',
  },

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
