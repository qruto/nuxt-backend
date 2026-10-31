<script setup lang="ts">
import { PACKAGE_MANAGERS, type PackageManager } from '~~/shared/pm'

/**
 * The package-manager picker: a radio group of `k k-xs` keys, one per
 * manager, each with the mark app.config.ts maps for code blocks. The
 * header, the drawer and every converted block draw one; all of them choose
 * through usePackageManager, so they move together.
 *
 * The pressed key is CSS's, read off `html[data-pm]` (app.css), so the
 * reader's pick is down before the page hydrates; `aria-checked` and the
 * roving tab stop follow once it has. Arrow keys, Home and End move the
 * pick, as in any radio group. `labels` letters each key; without it the
 * key is its mark, named for the manager. The group is named by `label`, or
 * by the element `labelledby` points at.
 */
const props = withDefaults(defineProps<{
  label?: string
  labelledby?: string
  labels?: boolean
}>(), { label: undefined, labelledby: undefined, labels: false })

const { pm, choose } = usePackageManager()
const icons = useAppConfig().ui.prose.codeIcon as Record<string, string>
const keys = useTemplateRef<HTMLButtonElement[]>('keys')

const STEPS: Record<string, (index: number) => number> = {
  ArrowRight: index => index + 1,
  ArrowDown: index => index + 1,
  ArrowLeft: index => index - 1,
  ArrowUp: index => index - 1,
  Home: () => 0,
  End: () => PACKAGE_MANAGERS.length - 1,
}

function move(event: KeyboardEvent, from: number) {
  const step = STEPS[event.key]
  if (!step) return
  event.preventDefault()
  const to = (step(from) + PACKAGE_MANAGERS.length) % PACKAGE_MANAGERS.length
  choose(PACKAGE_MANAGERS[to]!)
  keys.value?.[to]?.focus()
}

const pick = (name: PackageManager) => choose(name)
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="props.labelledby ? undefined : (props.label ?? 'Package manager')"
    :aria-labelledby="props.labelledby"
    class="flex flex-wrap items-center gap-1.5"
  >
    <button
      v-for="(name, index) in PACKAGE_MANAGERS"
      :key="name"
      ref="keys"
      type="button"
      role="radio"
      :aria-checked="pm === name"
      :aria-label="props.labels ? undefined : name"
      :tabindex="pm === name ? 0 : -1"
      :data-pm-option="name"
      class="k k-xs normal-case! tracking-normal!"
      :class="{ 'px-0! w-7': !props.labels }"
      @click="pick(name)"
      @keydown="move($event, index)"
    >
      <UIcon
        :name="icons[name]!"
        class="size-3.5 shrink-0"
        aria-hidden="true"
      />
      <span v-if="props.labels">{{ name }}</span>
    </button>
  </div>
</template>
