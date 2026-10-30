<script setup lang="ts">
const { locale } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
</script>

<template>
  <main>
    <!-- CUSTOMIZATION: the title is the app's own message; every other word is
         a packaged label, translated in i18n/locales/fr.json. -->
    <AuthForm
      :title="$t('login.title')"
      @success="navigateTo(localePath('/app'))"
    />
    <NuxtLink :to="switchLocalePath(locale === 'fr' ? 'en' : 'fr')">
      {{ $t('login.language') }}
    </NuxtLink>
  </main>
</template>
