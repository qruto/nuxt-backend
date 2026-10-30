<script setup lang="ts">
import { useBackendConfig } from '../../composables/use-backend-config'
import type { AuthFormHeaderProps } from '../../parts'
import { useAuthFormView } from './auth-form'

/** `<AuthForm>`'s header: the brand's logo when the app configures one, and the form's title. */
defineOptions({ name: 'AuthFormHeader' })
defineProps<AuthFormHeaderProps>()
const config = useBackendConfig()
const view = useAuthFormView('AuthFormHeader')

// In the template: The logo is the brand's, the heading the page's.
</script>

<template>
  <img
    v-if="config.brand.logo"
    data-auth="logo"
    :src="config.brand.logo"
    :alt="config.brand.name ?? ''"
  >
  <h1
    v-if="view.title.value"
    data-auth="title"
  >
    {{ view.title.value }}
  </h1>
</template>
