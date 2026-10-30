<script setup lang="ts">
/**
 * A labeled form field: a `stamp` label, the control, then a hint or an
 * error. By default the stamp is the `<label>` of one control: the default
 * slot hands it `id` and `describedby`, for the control's `id` and
 * `aria-describedby`, so the label names only the control and a click on
 * it focuses only the control. `as="div"` is a group of several controls,
 * a row of keys: a `role="group"` named by the stamp and described by the
 * hint, with no `<label>` around keys whose own names it would swallow.
 * The `field` part on an input, a textarea or a select mills it into the
 * material.
 */
const props = withDefaults(defineProps<{
  label?: string
  hint?: string
  error?: string | null
  as?: 'label' | 'div'
}>(), { label: undefined, hint: undefined, error: null, as: 'label' })

const id = useId()
const ids = { control: `${id}-control`, label: `${id}-label`, note: `${id}-note` }
// The error stands in for the hint, so either one describes the control.
const describedby = computed(() => props.error || props.hint ? ids.note : undefined)
</script>

<template>
  <div
    v-if="props.as === 'div'"
    role="group"
    :aria-labelledby="props.label ? ids.label : undefined"
    :aria-describedby="describedby"
    class="flex flex-col gap-1.5"
  >
    <span
      v-if="props.label"
      :id="ids.label"
      class="stamp"
    >{{ props.label }}</span>
    <slot :describedby="describedby" />
    <span
      v-if="props.error"
      :id="ids.note"
      class="text-[0.72rem] font-medium text-(--err)"
    >{{ props.error }}</span>
    <span
      v-else-if="props.hint"
      :id="ids.note"
      class="text-[0.72rem] text-(--ink-faint)"
    >{{ props.hint }}</span>
  </div>
  <div
    v-else
    class="flex flex-col gap-1.5"
  >
    <label
      v-if="props.label"
      :id="ids.label"
      :for="ids.control"
      class="stamp"
    >{{ props.label }}</label>
    <slot
      :id="ids.control"
      :describedby="describedby"
    />
    <span
      v-if="props.error"
      :id="ids.note"
      class="text-[0.72rem] font-medium text-(--err)"
    >{{ props.error }}</span>
    <span
      v-else-if="props.hint"
      :id="ids.note"
      class="text-[0.72rem] text-(--ink-faint)"
    >{{ props.hint }}</span>
  </div>
</template>
