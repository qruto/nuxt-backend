<script setup lang="ts">
/**
 * The landing plate: the homepage's social card, 1200×630, in place of
 * Docus's own `Landing` card (its landing template asks for that name, and
 * an app component wins over the layer's). The docs plate is
 * Plate.takumi.vue.
 *
 * The same gunmetal slab, with the nameplate as the subject: the house mark
 * and the wordmark at display size, the page's title engraved under them,
 * and the three signals lit along the top, the only chroma on the card.
 * Engraving is two stacked text layers under the ink (utils/og-plate.ts).
 *
 * Fonts: the families and weights this file's static `style` attributes
 * name (Anybody 700 and 400, Martian Mono 500), as in Plate.takumi.vue.
 */
import { OG_GROUND, OG_INK, OG_RELIEF, OG_RELIEF_SM, OG_SLAB, ogClip, ogMarkSrc, ogStrip } from '../../utils/og-plate'

const props = defineProps<{
  title?: string
  description?: string
}>()

// The page's title, else its description, cut to two lines.
const titleText = computed(() => ogClip(props.title || props.description || 'Auth, billing, email and agents for Nuxt on Convex', 70))
const mark = ogMarkSrc(132)
const strips = (['ok', 'warn', 'err'] as const).map(signal => ({ signal, ...ogStrip(signal, 56) }))
</script>

<template>
  <div :style="OG_GROUND">
    <div :style="OG_SLAB">
      <!-- The top: a stamp, and the three signals lit. -->
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="position: relative; display: flex; font-family: 'Martian Mono'; font-weight: 500; font-size: 22px; line-height: 1; letter-spacing: 0.14em;">
          <div
            v-for="layer in OG_RELIEF_SM"
            :key="layer.top"
            :style="layer"
          >
            THE SAAS BACKEND FOR NUXT
          </div>
          <div :style="{ position: 'relative', display: 'flex', color: OG_INK.small }">
            THE SAAS BACKEND FOR NUXT
          </div>
        </div>
        <div style="display: flex; gap: 14px;">
          <div
            v-for="strip in strips"
            :key="strip.signal"
            :style="strip.slot"
          >
            <div :style="strip.light" />
          </div>
        </div>
      </div>

      <!-- The nameplate at display size: the mark and the wordmark, engraved. -->
      <div style="display: flex; align-items: center; gap: 40px;">
        <img
          :src="mark"
          width="132"
          height="132"
          alt=""
        >
        <div style="position: relative; display: flex; flex-shrink: 0; white-space: nowrap; font-family: 'Anybody'; font-weight: 700; font-size: 96px; line-height: 1; letter-spacing: 0.01em;">
          <div
            v-for="layer in OG_RELIEF"
            :key="layer.top"
            :style="layer"
          >
            nuxt-backend
          </div>
          <div :style="{ position: 'relative', display: 'flex', color: OG_INK.display }">
            nuxt-backend
          </div>
        </div>
      </div>

      <!-- The page's title, engraved: Anybody regular. -->
      <div style="position: relative; display: flex; width: 960px; font-family: 'Anybody'; font-weight: 400; font-size: 40px; line-height: 1.25;">
        <div
          v-for="layer in OG_RELIEF_SM"
          :key="layer.top"
          :style="layer"
        >
          {{ titleText }}
        </div>
        <div :style="{ position: 'relative', display: 'flex', width: '100%', color: OG_INK.small }">
          {{ titleText }}
        </div>
      </div>
    </div>
  </div>
</template>
