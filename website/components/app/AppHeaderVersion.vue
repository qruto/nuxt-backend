<script setup lang="ts">
import { DOCS_VERSION } from '~~/shared/docs-version'

/**
 * The release line these docs describe, as a chip with its light: amber
 * while the line is not on npm yet, green once `DOCS_VERSION.released`
 * flips. Its menu leads to the release pages and the package.
 */
const { github } = useAppConfig()
const repository = github ? github.url : undefined

const status = DOCS_VERSION.released ? 'on npm' : 'not on npm yet'
const items = [
  [{ type: 'label' as const, label: `${DOCS_VERSION.line} · ${status}` }],
  [
    { label: 'Changelog', icon: 'i-lucide-scroll-text', to: '/docs/ship/releases/changelog' },
    { label: 'Stability', icon: 'i-lucide-shield-check', to: '/docs/ship/releases/stability' },
    { label: 'Upgrade from 0.1', icon: 'i-lucide-arrow-up-circle', to: '/docs/ship/migrate/upgrade' },
  ],
  [
    { label: 'npm', icon: 'i-simple-icons-npm', to: 'https://www.npmjs.com/package/nuxt-backend', target: '_blank' as const },
    ...(repository ? [{ label: 'Releases on GitHub', icon: 'i-simple-icons-github', to: `${repository}/releases`, target: '_blank' as const }] : []),
  ],
]
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end', sideOffset: 8 }"
  >
    <button
      type="button"
      class="k k-xs"
    >
      <Led :tone="DOCS_VERSION.released ? 'ok' : 'warn'" />
      v{{ DOCS_VERSION.line }}<span class="sr-only">, {{ status }}</span>
    </button>
  </UDropdownMenu>
</template>
