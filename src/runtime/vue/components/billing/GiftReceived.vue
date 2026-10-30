<script setup lang="ts">
// One gift the person received: what it is, who sent it and what they wrote,
// and, while it waits, the workspace to receive it into and the button that
// claims it. The page's `<GiftList>` owns the state.
import { busyAttributes } from '../../a11y'
import type { ReceivedGiftView } from '../../composables/use-gift-list'
import type { UseLabelsReturn } from '../../composables/use-labels'

defineProps<{
  gift: ReceivedGiftView
  /** The workspaces the person may receive into; none when there is nothing to choose. */
  workspaces: Array<{ id: string, name: string }>
  /** The element that names the gift, which its button describes. */
  nameId: string
  /** Whether an action runs for this gift. */
  busy: boolean
  t: UseLabelsReturn<'gift'>['t']
}>()
const target = defineModel<string>('target', { default: '' })
defineEmits<{ claim: [] }>()
</script>

<template>
  <li
    data-gift="entry"
    :data-status="gift.status"
    role="group"
    :aria-labelledby="nameId"
  >
    <p
      :id="nameId"
      data-gift="entry-what"
    >
      {{ gift.what }}
    </p>
    <p data-gift="entry-meta">
      {{ t('from', { sender: gift.sender }) }} · {{ gift.dateText }} · {{ gift.statusText }}
    </p>
    <p
      v-if="gift.message"
      data-gift="entry-message"
    >
      {{ gift.message }}
    </p>
    <template v-if="gift.claimable">
      <label
        v-if="workspaces.length > 0"
        data-gift="entry-target"
      >
        <span>{{ t('claimInto') }}</span>
        <select v-model="target">
          <option value="">{{ t('personalWorkspace') }}</option>
          <option
            v-for="workspace in workspaces"
            :key="workspace.id"
            :value="workspace.id"
          >{{ workspace.name }}</option>
        </select>
      </label>
      <button
        type="button"
        data-gift="entry-claim"
        v-bind="busyAttributes(busy)"
        :aria-describedby="nameId"
        @click="$emit('claim')"
      >
        {{ busy ? t('claiming') : t('claim') }}
      </button>
    </template>
  </li>
</template>
