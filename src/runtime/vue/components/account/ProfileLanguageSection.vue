<script setup lang="ts">
import type { ProfileLanguageSectionProps } from '../../parts'
import { useProfileView } from './profile-settings'

/** `<ProfileSettings>`'s language picker: the app's languages, the one the account's emails are written in selected. Only where there are two or more. */
defineOptions({ name: 'ProfileLanguageSection' })
defineProps<ProfileLanguageSectionProps>()
const view = useProfileView('ProfileLanguageSection')
const { t } = view.labels
const hintId = `${view.id}-language-hint`
const select = (event: Event) => void view.context.value.selectLanguage((event.target as HTMLSelectElement).value)
</script>

<template>
  <div
    v-if="view.context.value.languages.length >= 2"
    data-profile="section-language"
  >
    <label data-profile="label-language">
      {{ t('language') }}
      <select
        data-profile="input-language"
        :value="view.context.value.language"
        :aria-describedby="hintId"
        @change="select"
      >
        <option
          v-for="option in view.context.value.languages"
          :key="option.code"
          :value="option.code"
          :selected="option.code === view.context.value.language"
        >
          {{ option.name }}
        </option>
      </select>
    </label>
    <p
      :id="hintId"
      data-profile="hint"
    >
      {{ t('languageHint') }}
    </p>
  </div>
</template>
