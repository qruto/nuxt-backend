<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { reloadNuxtApp } from '#imports'
import { formatBillingDate } from '../../composables/billing-format'
import { type AdminUser, useAdmin } from '../../composables/use-admin'
import { useLabels, valueLabel, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { useReauthentication } from '../../composables/use-reauthentication'
import { useAuthSession } from '../../utils/auth-session'
import { useConfirmation } from '../../utils/confirmation'
import { usePageTurns } from '../../utils/page-turns'
import ConfirmDialog from '../shell/ConfirmDialog.vue'
import AdminListTail from './AdminListTail.vue'
import { type AdminUsersSlotContext, type AdminUsersSlots, BAN_DURATIONS, provideAdminUsersView, useAdminList } from './admin'

/**
 * Every account of the app, for its administrators: a search by address, a
 * page at a time (`AdminUsersTable`), and a drawer with one account in full
 * (`AdminUserDrawer`): its role, its ban, its device sessions and
 * workspaces, and "Impersonate". Setting a role, banning, lifting a ban and
 * impersonating take a recent sign-in, which the component's own
 * `<ReauthenticateDialog>` asks for; signing an account's sessions out does
 * not. An administrator's own account offers none of these, and another
 * administrator's offers no impersonation.
 *
 * `data-admin` attributes for styling, a slot for every region, and its copy
 * from the `admin` labels. Renders nothing for a caller who is no
 * administrator. Built on `useAdmin`.
 *
 * @example
 * ```vue
 * <AdminUsers :limit="25" landing="/dashboard" />
 * ```
 */
defineOptions({ name: 'AdminUsers' })

const props = withDefaults(defineProps<{
  /** Accounts per page, at most 100. Default 20. */
  limit?: number
  /** The app-wide roles the drawer offers, by key (an account's own role is offered too). Default: `user` and `admin`. */
  roles?: string[]
  /** Where an impersonation lands: the app reloads there as the account. Default `/`. */
  landing?: string
  /** Confirm a ban; return `false` to abort. Default: the component's own confirmation dialog. */
  confirm?: (message: string) => boolean | Promise<boolean>
  /** Copy for this component, over `appConfig.backend.labels.admin` and the translations. */
  labels?: LabelOverrides<BackendLabels['admin']>
  /** An account to open in the drawer, by id, whatever page of the list shows: the console's `?tab=users&user=<id>`, which the Reports tab links an author to. */
  userId?: string
}>(), { limit: undefined, roles: () => ['user', 'admin'], landing: '/', confirm: undefined, labels: undefined, userId: undefined })

const emit = defineEmits({
  'role-changed': (_userId: string, _role: string) => true,
  'banned': (_userId: string) => true,
  'unbanned': (_userId: string) => true,
  'sessions-revoked': (_userId: string) => true,
  'impersonated': (_userId: string) => true,
  'error': (_message: string) => true,
})
const slots = defineSlots<AdminUsersSlots>()

const labels = useLabels('admin', () => props.labels)
const { t, errorMessage, locale } = labels
const auth = useAuthSession()
const { withReauthentication } = useReauthentication()
const id = useId()
const list = useAdminList({ labels, onError: message => emit('error', message) })
const { selected, act } = list
const admin = useAdmin({ search: list.search, limit: () => props.limit, userId: selected })
const items = computed(() => admin.users.value ?? [])
const date = (value: number) => formatBillingDate(value, { dateStyle: 'medium' }, locale.value)
const roleWord = (role: string) => role.split(',').map(part => valueLabel(labels, 'admin', 'roles', part.trim())).join(', ')
const nameOf = (user: Pick<AdminUser, 'name' | 'email'>) => user.name || user.email

// The drawer's fields: the role chosen, the ban's reason and length.
const role = ref('user')
const banReason = ref('')
const banFor = ref<keyof typeof BAN_DURATIONS>('forever')
/** Open an account in the drawer, its ban fields fresh. */
function openUser(userId: string): void {
  banReason.value = ''
  banFor.value = 'forever'
  list.open(userId)
}
// The account the page names opens in the drawer, and again when the page names another.
watch(() => props.userId, (userId) => {
  if (userId) openUser(userId)
}, { immediate: true })
// The role select follows the account it shows.
watch(() => admin.user.value?.user.role, (current) => {
  if (current) role.value = current
}, { immediate: true })

// Asked before a ban: the app's `confirm`, else the component's own dialog.
const confirmation = useConfirmation(() => props.confirm)
const confirmed = confirmation.ask

const context = computed<AdminUsersSlotContext>(() => ({
  admin,
  items: items.value,
  isLoading: admin.isLoading.value,
  error: admin.error.value ? errorMessage(admin.error.value) : null,
  view: openUser,
}))
const pages = usePageTurns(admin, 'admin')

const view = provideAdminUsersView({
  ...list,
  labels,
  context,
  slots,
  id,
  pages,
  date,
  roles: () => props.roles,
  role,
  banReason,
  banFor,
  saveRole: user => act('role', async () => {
    await withReauthentication(() => admin.setRole(user.id, role.value))
    emit('role-changed', user.id, role.value)
  }, () => t('user.roleSaved')),
  ban: async (user) => {
    if (list.running.value || !(await confirmed(t('user.banConfirm', { name: nameOf(user) })))) return
    await act('ban', async () => {
      const expiresIn = BAN_DURATIONS[banFor.value]
      await withReauthentication(() => admin.ban(user.id, { reason: banReason.value, ...(expiresIn ? { expiresIn } : {}) }))
      emit('banned', user.id)
    }, () => t('user.bannedDone'))
  },
  unban: user => act('unban', async () => {
    await withReauthentication(() => admin.unban(user.id))
    emit('unbanned', user.id)
  }, () => t('user.unbanned')),
  // A passkey-only account whose person lost every passkey and the recovery code.
  allowSignInCodes: async (user) => {
    if (list.running.value || !(await confirmed(t('user.passkeyOnlyConfirm', { name: nameOf(user) })))) return
    await act('passkey-only', async () => {
      await withReauthentication(() => admin.allowSignInCodes(user.id))
    }, () => t('user.passkeyOnlyOffDone'))
  },
  revokeSessions: user => act('sessions', async () => {
    await admin.revokeSessions(user.id)
    emit('sessions-revoked', user.id)
  }, () => t('user.signedOut')),
  impersonate: async (user) => {
    const done = await act('impersonate', async () => {
      await withReauthentication(() => admin.impersonate(user.id))
      emit('impersonated', user.id)
    })
    // The browser's session is theirs now: reload, so nothing read as the administrator stays.
    if (done) reloadNuxtApp({ path: props.landing, force: true })
  },
  roleWord,
  status: user => !user.banned ? t('users.active') : user.banExpires ? t('users.bannedUntil', { date: date(user.banExpires) }) : t('users.banned'),
  own: user => user.id === (auth.user.value as { id?: string } | null)?.id,
})

/** The account the drawer shows: its row in the list until its details load. */
const drawn = computed(() => items.value.find(user => user.id === selected.value) ?? admin.user.value?.user ?? null)
// A linked account on no page that is not there to read has no row to draw
// the drawer from: it is let go, and the list says what it has to.
watch(() => admin.user.value, (detail) => {
  if (detail === null && selected.value && !drawn.value) void list.close()
})
const busyList = computed(() => admin.isLoading.value || pages.turning.value !== null)
</script>

<template>
  <section
    v-if="!admin.isRefused.value"
    data-admin="users"
    :aria-busy="busyList ? 'true' : undefined"
  >
    <slot
      name="header"
      v-bind="context"
    >
      <h2 data-admin="title">
        {{ t('users.title') }}
      </h2>
    </slot>
    <AdminUsersTable :admin="admin" />
    <AdminListTail
      :view="view as never"
      :admin="admin"
      :open="Boolean(selected && drawn)"
    />
    <AdminUserDrawer
      v-if="selected && drawn"
      :admin="admin"
      :user="drawn"
    />
    <ReauthenticateDialog />
    <ConfirmDialog
      :confirmation="confirmation"
      :accept-label="t('confirmAccept')"
      :cancel-label="t('confirmCancel')"
    />
  </section>
</template>
