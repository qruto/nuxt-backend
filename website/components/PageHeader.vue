<script setup lang="ts">
/**
 * A playground page's header: the API it shows in a `slot slot-xs` chip,
 * the amber Experimental chip and the breathing live light, then the title
 * engraved into the metal (`cut`, with its lighter floor) and the lead
 * in the slot.
 */
const props = withDefaults(defineProps<{
  tag: string
  title: string
  live?: boolean
  experimental?: boolean
}>(), { live: false, experimental: false })
</script>

<template>
  <header class="mb-6">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <code class="slot slot-xs px-2 py-1 font-mono text-[0.67rem] font-semibold tracking-[0.02em] text-(--ok)">{{ props.tag }}</code>
      <span
        v-if="props.experimental"
        class="stamp slot slot-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 text-(--warn)!"
      >
        <Led
          tone="warn"
          shape="square"
        />
        Experimental
      </span>
      <span
        v-if="props.live"
        class="stamp inline-flex items-center gap-1.5 text-(--ok)!"
      >
        <Led
          tone="ok"
          pulse
        />
        Live
      </span>
    </div>
    <EngravedTitle
      as="h1"
      :text="props.title"
      class="mt-0 mb-1.5 font-display text-[2.05rem] leading-[1.08] font-semibold tracking-[-0.005em]"
    />
    <p class="m-0 max-w-[64ch] text-[0.88rem] leading-normal text-(--ink-dim) [&_code]:text-[0.82em] [&_code]:text-(--ok)">
      <slot />
    </p>
  </header>
</template>
