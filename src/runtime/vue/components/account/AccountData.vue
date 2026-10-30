<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { type AccountExport, useAccount } from '../../composables/use-account'
import { type BackendLabels, type LabelOverrides, useLabels } from '../../composables/use-labels'
import { useReauthentication } from '../../composables/use-reauthentication'
import { useAuthSession } from '../../utils/auth-session'
import { type AccountDataSection, type AccountDataSlotContext, type AccountDataSlots, provideAccountDataView } from './account-data'

/**
 * The account's data rights: download everything the app keeps of the
 * account in one file, and delete the account, once the person typed their
 * address to confirm it. The deletion waits out a grace period: the section
 * then shows the date and a button that keeps the account. Built on `useAccount`; an action that
 * takes a recent sign-in asks for one through `<ReauthenticateDialog>`
 * (rendered here), then runs again.
 *
 * Markup on `data-account` hooks, built from parts (`AccountExport`,
 * `AccountDeletion`); replace any region through its slot, each receiving
 * {@link AccountDataSlotContext}. An administrator acting as the account
 * sees a note instead of either control: neither is theirs to use.
 *
 * @example
 * ```vue
 * <AccountData @scheduled="navigateTo('/')" />
 * ```
 */
defineOptions({ name: 'AccountData' })

const props = withDefaults(defineProps<{
  /** The sections to show, in order. Default both. */
  sections?: AccountDataSection[]
  /** Copy for this component, over `appConfig.backend.labels.account` and the translations. */
  labels?: LabelOverrides<BackendLabels['account']>
}>(), { sections: () => ['export', 'delete'], labels: undefined })

const emit = defineEmits({
  exported: (_export: AccountExport) => true,
  /** The deletion was scheduled: it runs at `deletesAt` unless the account is kept. */
  scheduled: () => true,
  /** The account was kept: the scheduled deletion is cancelled. */
  kept: () => true,
  error: (_message: string) => true,
})
defineSlots<AccountDataSlots>()

const account = useAccount()
const auth = useAuthSession()
const { withReauthentication } = useReauthentication()
const labels = useLabels('account', () => props.labels)
const { t, errorMessage } = labels
const id = useId()
const typed = ref('')
const pending = ref<AccountDataSection | null>(null)
const failure = ref<string | null>(null)
const status = ref('')
const mismatched = ref(false)
const link = ref<HTMLAnchorElement | null>(null)

const confirmed = computed(() => account.confirmation.value !== '' && typed.value.trim().toLowerCase() === account.confirmation.value.toLowerCase())

/** Run one action, once: a second press while it runs does nothing. */
async function act(section: AccountDataSection, action: () => Promise<void>): Promise<void> {
  if (pending.value) return
  pending.value = section
  failure.value = null
  status.value = ''
  try {
    await action()
  }
  catch (error) {
    const message = errorMessage(error)
    failure.value = message
    emit('error', message)
  }
  finally {
    pending.value = null
  }
}

const exportData = () => act('export', async () => {
  const made = await account.exportData()
  status.value = t('exportReady')
  emit('exported', made)
  // The link the person came for, once it renders.
  await nextTick()
  link.value?.focus()
})
const deleteAccount = async () => {
  if (!confirmed.value) {
    mismatched.value = true
    return
  }
  mismatched.value = false
  await act('delete', async () => {
    await withReauthentication(() => account.deleteAccount(typed.value.trim()))
    typed.value = ''
    status.value = t('scheduled')
    emit('scheduled')
  })
}
const keepAccount = () => act('delete', async () => {
  await account.cancelDeletion()
  status.value = t('kept')
  emit('kept')
})

const context = computed<AccountDataSlotContext>(() => ({
  account,
  latestExport: account.latestExport.value ?? null,
  deletion: account.deletion.value ?? null,
  typed: typed.value,
  confirmed: confirmed.value,
  isPending: pending.value !== null,
  pendingAction: pending.value,
  error: failure.value,
  exportData,
  deleteAccount,
  keepAccount,
}))

provideAccountDataView({ labels, context, id, typed, mismatched, link })

// In the template: An administrator's visit: neither control is theirs.
</script>

<template>
  <div
    v-if="auth.isImpersonating.value"
    data-account="root"
  >
    <p data-account="refused">
      {{ t('impersonating') }}
    </p>
  </div>
  <div
    v-else
    data-account="root"
    :aria-busy="pending !== null || account.isLoading.value ? 'true' : undefined"
  >
    <template
      v-for="section in sections"
      :key="section"
    >
      <slot
        v-if="section === 'export'"
        name="export"
        v-bind="context"
      >
        <AccountExport :account="account" />
      </slot>
      <slot
        v-else-if="section === 'delete'"
        name="delete"
        v-bind="context"
      >
        <AccountDeletion :account="account" />
      </slot>
    </template>
    <slot
      v-if="failure"
      name="error"
      v-bind="context"
    >
      <p
        data-account="error"
        role="alert"
      >
        {{ failure }}
      </p>
    </slot>
    <!-- One status, always there: what an action said, or that the export is still being read. -->
    <p
      data-account="status"
      role="status"
      aria-live="polite"
    >
      {{ status || (account.isLoading.value ? t('loading') : '') }}
    </p>
    <slot
      name="footer"
      v-bind="context"
    />
    <ReauthenticateDialog />
  </div>
</template>
