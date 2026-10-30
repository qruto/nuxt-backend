<script setup lang="ts">
import { useLastSignInState } from '../../../src/runtime/vue/utils/last-sign-in'

const method = useLastSignInState()
</script>

<template>
  <main>
    <p data-last-sign-in>
      {{ method ?? 'none' }}
    </p>
  </main>
</template>
