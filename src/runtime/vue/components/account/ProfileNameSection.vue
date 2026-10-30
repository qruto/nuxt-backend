<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { ProfileNameSectionProps } from '../../parts'
import { useProfileView } from './profile-settings'

/** `<ProfileSettings>`'s display-name form. */
defineOptions({ name: 'ProfileNameSection' })
defineProps<ProfileNameSectionProps>()
const view = useProfileView('ProfileNameSection')
const { t } = view.labels
const name = view.context.value.name
</script>

<template>
  <form
    data-profile="section-name"
    @submit.prevent="view.context.value.saveName()"
  >
    <label data-profile="label-name">
      {{ t('name') }}
      <input
        v-model="name"
        data-profile="input-name"
        type="text"
        autocomplete="name"
      >
    </label>
    <button
      data-profile="save"
      type="submit"
      v-bind="busyAttributes(view.context.value.savingName)"
    >
      {{ view.context.value.savingName ? t('saving') : t('save') }}
    </button>
  </form>
</template>
