<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { AcceptInvitationActionsProps } from '../../parts'
import { useInvitationLabels } from './accept-invitation'

/** `<AcceptInvitation>`'s answer: accept and decline, each saying so while it is on its way. */
defineOptions({ name: 'AcceptInvitationActions' })
defineProps<AcceptInvitationActionsProps>()
const { t } = useInvitationLabels('AcceptInvitationActions')
</script>

<template>
  <div data-invitation="actions">
    <button
      data-invitation="accept"
      type="button"
      v-bind="busyAttributes(invitation.isPending)"
      @click="invitation.accept()"
    >
      {{ invitation.answering === 'accept' ? t('accepting') : t('accept') }}
    </button>
    <button
      data-invitation="decline"
      type="button"
      v-bind="busyAttributes(invitation.isPending)"
      @click="invitation.decline()"
    >
      {{ invitation.answering === 'decline' ? t('declining') : t('decline') }}
    </button>
  </div>
</template>
