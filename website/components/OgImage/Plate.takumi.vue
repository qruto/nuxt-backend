<script setup lang="ts">
/**
 * OG image — "the plate": a 1200×630 machined titanium slab, rendered by
 * nuxt-og-image's Takumi renderer (`.takumi.vue` picks the renderer).
 *
 * Material rules (website/design.md): the canvas is titanium — the plate's
 * face is a 135° sheen + hairline machining grain over the dark slab, its
 * edge an inset bevel lit from the top-left. Type is *engraved* (a mid-tone
 * ink + a two-layer text-shadow: dark up-left, light down-right). The only
 * chroma is the green status LED strip (bottom-left) and the coin's LED
 * (bottom-right) — signals are never engraved.
 *
 * Fonts: Takumi resolves `font-family` declarations it finds in this file
 * against @nuxt/fonts' global sheet, so "Bai Jamjuree" and "JetBrains Mono"
 * must stay `global: true` in nuxt.config.ts `fonts`, and @nuxt/fonts must be
 * listed in `modules` (see the note there). A family outside that sheet falls
 * back to the renderer's bundled Inter.
 *
 * Props: Docus passes `headline` and `description` on EVERY docs page (the
 * headline is the section, e.g. "Getting Started"), on top of `title`. Both
 * used to be undeclared, so the module dropped them with a build warning and
 * every docs card came out with the same default eyebrow and no description.
 * `headline` therefore feeds the eyebrow — it is exactly the value that slot
 * wants — and `eyebrow` stays as the explicit override for a hand-written
 * `defineOgImage` call.
 *
 * Usage: defineOgImage('Plate', { title: 'Authentication', eyebrow: 'Guide' })
 */
const props = withDefaults(
  defineProps<{
    title?: string
    eyebrow?: string
    headline?: string
    description?: string
  }>(),
  { title: 'Nuxt backend', eyebrow: 'Nuxt backend' },
)

// Docus's `headline` wins over the default eyebrow, an explicit `eyebrow` wins
// over both. Trimmed so the plate never has to reflow a long string.
const eyebrowText = computed(() =>
  (props.eyebrow !== 'Nuxt backend' ? props.eyebrow : props.headline || props.eyebrow).slice(0, 42),
)
const descriptionText = computed(() => {
  const text = props.description?.trim()
  if (!text) return ''
  return text.length > 128 ? `${text.slice(0, 127).trimEnd()}…` : text
})
</script>

<template>
  <div
    style="position: relative; display: flex; width: 1200px; height: 630px; overflow: hidden; background-color: #161616; background-image: radial-gradient(1000px 700px at 18% -10%, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02) 42%, rgba(255, 255, 255, 0) 100%), repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0px, rgba(255, 255, 255, 0.012) 1px, rgba(255, 255, 255, 0) 1px, rgba(255, 255, 255, 0) 3px), repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.05) 0px, rgba(0, 0, 0, 0.05) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 7px);"
  >
    <!-- The plate: raised slab with an inset bevel (lit top-left, dark bottom-right) and a cast. -->
    <div
      style="position: absolute; left: 48px; top: 48px; width: 1104px; height: 534px; display: flex; flex-direction: column; justify-content: space-between; padding: 64px 72px 56px 72px; border-radius: 28px; background-color: #232323; background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0) 45%), linear-gradient(315deg, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0) 45%), repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.018) 0px, rgba(255, 255, 255, 0.018) 1px, rgba(255, 255, 255, 0) 1px, rgba(255, 255, 255, 0) 3px); box-shadow: inset 1.5px 2.5px 3px rgba(255, 255, 255, 0.07), inset -1.5px -2.5px 3px rgba(0, 0, 0, 0.55), inset 0.5px 1px 1px rgba(255, 255, 255, 0.06), inset -0.5px -1px 1px rgba(0, 0, 0, 0.45), 2px 4px 8px rgba(0, 0, 0, 0.45), 8px 16px 36px rgba(0, 0, 0, 0.45);"
    >
      <!-- Eyebrow — mono, engraved-sm -->
      <div
        style="display: flex; font-family: 'JetBrains Mono'; font-weight: 500; font-size: 26px; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #8a8a8a; text-shadow: -0.5px -0.9px 0.5px rgba(0, 0, 0, 0.8), 0.6px 1px 0.5px rgba(255, 255, 255, 0.14);"
      >
        {{ eyebrowText }}
      </div>

      <!-- Title + description — display, engraved -->
      <div style="display: flex; flex-direction: column; gap: 22px;">
        <div
          style="display: flex; width: 800px; font-family: 'Bai Jamjuree'; font-weight: 600; font-size: 78px; line-height: 1.08; letter-spacing: 0.005em; color: #8f8f8f; text-shadow: -1px -1.7px 1px rgba(0, 0, 0, 0.85), 1.2px 2px 1px rgba(255, 255, 255, 0.17);"
        >
          {{ title?.slice(0, 80) }}
        </div>
        <div
          v-if="descriptionText"
          style="display: flex; width: 720px; font-family: 'Bai Jamjuree'; font-weight: 500; font-size: 28px; line-height: 1.35; color: #7d7d7d; text-shadow: -0.5px -0.9px 0.5px rgba(0, 0, 0, 0.8), 0.6px 1px 0.5px rgba(255, 255, 255, 0.14);"
        >
          {{ descriptionText }}
        </div>
      </div>

      <!-- LED strip in a milled slot — go / live -->
      <div
        style="display: flex; align-items: center; width: 132px; height: 18px; padding: 0 5px; border-radius: 9px; background-color: #151515; box-shadow: inset 1px 2px 3px rgba(0, 0, 0, 0.6), inset -1px -1.5px 1.5px rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.05);"
      >
        <div style="display: flex; width: 122px; height: 8px; border-radius: 4px; background-color: #49b567; box-shadow: 0 0 10px rgba(73, 181, 103, 0.55), 0 0 22px rgba(73, 181, 103, 0.28);" />
      </div>
    </div>

    <!-- The house mark, bottom-right (colours baked in: takumi resolves no
         external SVG). STALE: still the pre-2026-09 coin, while /logo.svg is now
         the three-bar mark — the plate is rebuilt as the console card in the
         website redesign, which redraws this with the new mark. -->
    <div style="position: absolute; right: 104px; bottom: 100px; display: flex; width: 168px; height: 168px;">
      <svg
        width="168"
        height="168"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id="og-edge"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop
              offset="0"
              stop-color="#5c5c5c"
            />
            <stop
              offset="0.55"
              stop-color="#2a2a2a"
            />
            <stop
              offset="1"
              stop-color="#090909"
            />
          </linearGradient>
          <radialGradient
            id="og-face"
            cx="0.34"
            cy="0.30"
            r="0.86"
          >
            <stop
              offset="0"
              stop-color="#343434"
            />
            <stop
              offset="0.5"
              stop-color="#262626"
            />
            <stop
              offset="1"
              stop-color="#171717"
            />
          </radialGradient>
          <linearGradient
            id="og-rim"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop
              offset="0"
              stop-color="#ffffff"
              stop-opacity="0.32"
            />
            <stop
              offset="0.45"
              stop-color="#ffffff"
              stop-opacity="0"
            />
            <stop
              offset="0.6"
              stop-color="#000000"
              stop-opacity="0"
            />
            <stop
              offset="1"
              stop-color="#000000"
              stop-opacity="0.6"
            />
          </linearGradient>
          <pattern
            id="og-grain"
            width="0.6"
            height="2.1"
            patternUnits="userSpaceOnUse"
          >
            <rect
              width="0.6"
              height="0.3"
              fill="#ffffff"
              fill-opacity="0.06"
            />
            <rect
              y="1.2"
              width="0.6"
              height="0.3"
              fill="#000000"
              fill-opacity="0.16"
            />
          </pattern>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="url(#og-edge)"
        />
        <circle
          cx="50"
          cy="50"
          r="46.4"
          fill="url(#og-face)"
        />
        <circle
          cx="50"
          cy="50"
          r="46.4"
          fill="url(#og-grain)"
        />
        <circle
          cx="50"
          cy="50"
          r="45.9"
          fill="none"
          stroke="url(#og-rim)"
          stroke-width="1"
        />
        <!-- engraved stack: wide dark / wide light / tight dark / tight light / ink -->
        <g
          transform="translate(-2.2 -3.2) translate(50 49) scale(0.8) translate(-50 -50)"
          fill="#000"
          stroke="#000"
          fill-opacity="0.35"
          stroke-opacity="0.35"
          stroke-width="7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M50 20 82 38 50 56 18 38Z"
            stroke="none"
          />
          <path
            d="M18 50 50 68 82 50"
            fill="none"
            opacity="0.8"
          />
          <path
            d="M18 62 50 80 82 62"
            fill="none"
            opacity="0.6"
          />
        </g>
        <g
          transform="translate(2 3) translate(50 49) scale(0.8) translate(-50 -50)"
          fill="#fff"
          stroke="#fff"
          fill-opacity="0.05"
          stroke-opacity="0.05"
          stroke-width="7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M50 20 82 38 50 56 18 38Z"
            stroke="none"
          />
          <path
            d="M18 50 50 68 82 50"
            fill="none"
            opacity="0.8"
          />
          <path
            d="M18 62 50 80 82 62"
            fill="none"
            opacity="0.6"
          />
        </g>
        <g
          transform="translate(-1 -1.4) translate(50 49) scale(0.8) translate(-50 -50)"
          fill="#000"
          stroke="#000"
          fill-opacity="0.85"
          stroke-opacity="0.85"
          stroke-width="7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M50 20 82 38 50 56 18 38Z"
            stroke="none"
          />
          <path
            d="M18 50 50 68 82 50"
            fill="none"
            opacity="0.8"
          />
          <path
            d="M18 62 50 80 82 62"
            fill="none"
            opacity="0.6"
          />
        </g>
        <g
          transform="translate(1 1.6) translate(50 49) scale(0.8) translate(-50 -50)"
          fill="#fff"
          stroke="#fff"
          fill-opacity="0.16"
          stroke-opacity="0.16"
          stroke-width="7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M50 20 82 38 50 56 18 38Z"
            stroke="none"
          />
          <path
            d="M18 50 50 68 82 50"
            fill="none"
            opacity="0.8"
          />
          <path
            d="M18 62 50 80 82 62"
            fill="none"
            opacity="0.6"
          />
        </g>
        <g
          transform="translate(50 49) scale(0.8) translate(-50 -50)"
          fill="#7a7a7a"
          stroke="#7a7a7a"
          stroke-width="7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M50 20 82 38 50 56 18 38Z"
            stroke="none"
          />
          <path
            d="M18 50 50 68 82 50"
            fill="none"
            opacity="0.8"
          />
          <path
            d="M18 62 50 80 82 62"
            fill="none"
            opacity="0.6"
          />
        </g>
        <circle
          cx="74"
          cy="74"
          r="5.4"
          fill="#000"
          fill-opacity="0.55"
        />
        <circle
          cx="74"
          cy="74"
          r="7.6"
          fill="#49b567"
          fill-opacity="0.32"
        />
        <circle
          cx="74"
          cy="74"
          r="3.7"
          fill="#49b567"
        />
        <circle
          cx="72.9"
          cy="72.9"
          r="1.25"
          fill="#afe8c0"
          fill-opacity="0.9"
        />
      </svg>
    </div>
  </div>
</template>
