import { THEME_COLOR } from '~~/shared/theme-color'

// The browser's chrome follows the colour mode the visitor picked, not only
// the OS. The prerendered page carries one theme-color tag per scheme
// (nuxt.config.ts); once a visitor picks a mode, both carry its colour.
export default defineNuxtPlugin(() => {
  const colorMode = useColorMode()
  const color = (scheme: 'light' | 'dark') => colorMode.preference === 'system'
    ? THEME_COLOR[scheme]
    : THEME_COLOR[colorMode.value === 'dark' ? 'dark' : 'light']
  useHead({
    meta: [
      { key: 'theme-color-dark', name: 'theme-color', media: '(prefers-color-scheme: dark)', content: () => color('dark') },
      { key: 'theme-color-light', name: 'theme-color', media: '(prefers-color-scheme: light)', content: () => color('light') },
    ],
  })
})
