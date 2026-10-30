<script setup lang="ts">
import type { PmVariant } from '~~/shared/pm-blocks'

/**
 * A bash block in every package manager: the `pm-code` block the build
 * wraps around a block whose commands all convert (shared/pm-blocks.ts).
 * Its slot is the npm block as the page parsed it; `variants` carry pnpm,
 * yarn and bun, each line as the tokens Shiki gave the npm text, so they
 * render in the npm block's colours. All four render; CSS shows the one
 * `html[data-pm]` names (app.css), so a prerendered page shows the reader's
 * pick before it hydrates, and each copy button copies its own variant,
 * the one on screen. The plate above is the picker, the same one as the
 * header's.
 */
const props = defineProps<{
  variants: PmVariant[]
  preClass?: string | string[]
}>()
</script>

<template>
  <div
    class="pm-code my-5"
    data-pm-code
  >
    <div class="code-plate flex items-center gap-2 px-2 py-1.5">
      <PmChoice
        label="Package manager"
        labels
      />
    </div>
    <div data-pm-variant="npm">
      <slot />
    </div>
    <div
      v-for="variant in props.variants"
      :key="variant.pm"
      :data-pm-variant="variant.pm"
    >
      <ProsePre
        :code="variant.code"
        language="bash"
        :class="props.preClass"
      >
        <span
          v-for="(line, index) in variant.lines"
          :key="index"
          class="line"
        >
          <span
            v-for="([token, text], at) in line"
            :key="at"
            :class="token || undefined"
          >{{ text }}</span>
        </span>
      </ProsePre>
    </div>
  </div>
</template>
