<script setup lang="ts">
/**
 * The two dialogs a console tab's actions may open: "Confirm it's you",
 * when the server asks for a recent sign-in, and the question the tab asks
 * before a change.
 *
 * Internal: a part of each console tab that changes something.
 *
 * @internal
 */
import { useLabels } from '../../composables/use-labels'
import type { Confirmation } from '../../utils/confirmation'
import ConfirmDialog from '../shell/ConfirmDialog.vue'

defineOptions({ name: 'AdminTabDialogs' })
defineProps<{
  /** The tab's `useConfirmation`. */
  confirmation: Confirmation
}>()
const { t } = useLabels('admin')
</script>

<template>
  <ReauthenticateDialog />
  <ConfirmDialog
    :confirmation="confirmation"
    :accept-label="t('confirmAccept')"
    :cancel-label="t('confirmCancel')"
  />
</template>
