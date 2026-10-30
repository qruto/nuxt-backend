<script setup lang="ts">
import { valueLabel } from '../../composables/use-labels'
import type { ProfileIdentityProps } from '../../parts'
import { useProfileView } from './profile-settings'

/** `<ProfileSettings>`'s identity: the avatar's initials, the name and address, and the verification, role and workspace badges. */
defineOptions({ name: 'ProfileIdentity' })
defineProps<ProfileIdentityProps>()
const view = useProfileView('ProfileIdentity')
const { t } = view.labels
const role = () => valueLabel(view.labels, 'profile', 'roles', view.context.value.role)
</script>

<template>
  <div
    v-if="!view.mounted.value"
    data-profile="identity"
    data-loading
    aria-busy="true"
  />
  <div
    v-else
    data-profile="identity"
  >
    <span
      data-profile="avatar"
      aria-hidden="true"
    >{{ view.context.value.initials }}</span>
    <div data-profile="identity-meta">
      <span data-profile="identity-name">{{ (view.context.value.user?.name as string | undefined) ?? '—' }}</span>
      <span data-profile="identity-email">{{ (view.context.value.user?.email as string | undefined) ?? '' }}</span>
    </div>
    <div data-profile="badges">
      <span
        data-profile="badge"
        :data-tone="view.context.value.user?.emailVerified ? 'ok' : 'warn'"
      >
        {{ view.context.value.user?.emailVerified ? t('emailVerified') : t('emailUnverified') }}
      </span>
      <span
        data-profile="badge"
        data-tone="muted"
      >{{ t('role', { role: role() }) }}</span>
      <span
        v-if="view.context.value.workspaceName"
        data-profile="badge"
        data-tone="muted"
      >{{ view.context.value.workspaceName }}</span>
    </div>
  </div>
</template>
