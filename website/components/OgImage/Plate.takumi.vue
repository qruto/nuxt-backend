<script setup lang="ts">
/**
 * The docs plate: every docs page's social card, and the site's default
 * (the `/**` route rule in nuxt.config.ts), 1200×630, drawn by
 * nuxt-og-image's Takumi renderer (`.takumi.vue` picks it). The homepage has
 * its own, Landing.takumi.vue.
 *
 * A gunmetal slab on the gunmetal ground (website/design.md §2), with the
 * page's tab stamped at the top, its title and description engraved in the
 * middle, and at the foot the nameplate (the house mark and the wordmark)
 * beside a lit strip. Engraving is two stacked text layers under the ink
 * (utils/og-plate.ts); a signal is never engraved.
 *
 * Fonts: nuxt-og-image loads the families and weights this file's static
 * `style` attributes name (Anybody 700 and 400, Martian Mono 500), from
 * @nuxt/fonts' global sheet, so they stay `global: true` in nuxt.config.ts.
 * A family outside that sheet falls back to the renderer's own Inter.
 *
 * Props: the docs page passes `headline` (the page's section, which feeds the
 * eyebrow), `title` and `description`; `eyebrow` overrides the headline for a
 * hand-written `defineOgImage('Plate', …)`.
 */
import { OG_GROUND, OG_INK, OG_RELIEF, OG_RELIEF_SM, OG_SLAB, ogClip, ogMarkSrc, ogStrip } from '../../utils/og-plate'

const props = withDefaults(
  defineProps<{
    title?: string
    eyebrow?: string
    headline?: string
    description?: string
  }>(),
  { title: 'Nuxt backend', eyebrow: undefined, headline: undefined, description: undefined },
)

// The site has one uppercase recipe, the `stamp` part, which a card cannot
// use, so the eyebrow is capitalised here (design.md §4).
const eyebrowText = computed(() => ogClip(props.eyebrow || props.headline || 'Docs', 42).toUpperCase())
const titleText = computed(() => ogClip(props.title, 80))
const descriptionText = computed(() => ogClip(props.description, 128))
const mark = ogMarkSrc(64)
const strip = ogStrip('ok')
</script>

<template>
  <div :style="OG_GROUND">
    <div :style="OG_SLAB">
      <!-- The tab, stamped: Martian Mono, engraved small. -->
      <div style="position: relative; display: flex; font-family: 'Martian Mono'; font-weight: 500; font-size: 24px; line-height: 1; letter-spacing: 0.14em;">
        <div
          v-for="layer in OG_RELIEF_SM"
          :key="layer.top"
          :style="layer"
        >
          {{ eyebrowText }}
        </div>
        <div :style="{ position: 'relative', display: 'flex', color: OG_INK.small }">
          {{ eyebrowText }}
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 22px;">
        <!-- The title, engraved: Anybody bold. -->
        <div style="position: relative; display: flex; width: 900px; font-family: 'Anybody'; font-weight: 700; font-size: 72px; line-height: 1.08; letter-spacing: 0.005em;">
          <div
            v-for="layer in OG_RELIEF"
            :key="layer.top"
            :style="layer"
          >
            {{ titleText }}
          </div>
          <div :style="{ position: 'relative', display: 'flex', width: '100%', color: OG_INK.display }">
            {{ titleText }}
          </div>
        </div>
        <!-- The description, engraved small: Anybody regular. -->
        <div
          v-if="descriptionText"
          style="position: relative; display: flex; width: 820px; font-family: 'Anybody'; font-weight: 400; font-size: 28px; line-height: 1.35;"
        >
          <div
            v-for="layer in OG_RELIEF_SM"
            :key="layer.top"
            :style="layer"
          >
            {{ descriptionText }}
          </div>
          <div :style="{ position: 'relative', display: 'flex', width: '100%', color: OG_INK.small }">
            {{ descriptionText }}
          </div>
        </div>
      </div>

      <!-- The foot: the nameplate, and a lit strip — go. -->
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 18px;">
          <img
            :src="mark"
            width="64"
            height="64"
            alt=""
          >
          <div style="position: relative; display: flex; font-family: 'Anybody'; font-weight: 700; font-size: 34px; line-height: 1; letter-spacing: 0.01em;">
            <div
              v-for="layer in OG_RELIEF_SM"
              :key="layer.top"
              :style="layer"
            >
              nuxt-backend
            </div>
            <div :style="{ position: 'relative', display: 'flex', color: OG_INK.small }">
              nuxt-backend
            </div>
          </div>
        </div>
        <div :style="strip.slot">
          <div :style="strip.light" />
        </div>
      </div>
    </div>
  </div>
</template>
