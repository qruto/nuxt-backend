<script setup lang="ts">
// CUSTOMIZATION: the document's language follows the active locale on the
// app's own pages too (the packaged pages declare theirs).
const head = useLocaleHead()
useHead({ htmlAttrs: { lang: () => head.value.htmlAttrs.lang } })
</script>

<template>
  <NuxtPage />
</template>
