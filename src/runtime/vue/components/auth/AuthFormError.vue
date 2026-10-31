<script setup lang="ts">
import type { AuthFormErrorProps } from '../../parts'
import { useAuthFormView } from './auth-form'

/** Why `<AuthForm>`'s last step failed: an alert, which a refused field is described by. */
defineOptions({ name: 'AuthFormError' })
defineProps<AuthFormErrorProps>()
const view = useAuthFormView('AuthFormError')
</script>

<template>
  <p
    :id="view.errorId"
    data-auth="error"
    role="alert"
  >
    {{ view.errorText.value }}
  </p>
</template>
