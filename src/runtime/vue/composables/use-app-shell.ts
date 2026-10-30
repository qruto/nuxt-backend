import { computed, type ComputedRef, type MaybeRefOrGetter, onBeforeUnmount, onMounted, ref, type Ref, toValue, useId } from 'vue'
import { navigateTo, useNuxtApp } from '#imports'
import { useAuthSession } from '../utils/auth-session'
import { workspaceSlug } from '../utils/slug'
import { useBackendPagePath } from './use-backend-page-path'
import { type LabelGroupOverrides, useLabels, type UseLabelsReturn, valueLabel } from './use-labels'
import { useWorkspace, type Workspace } from './use-workspace'

/** A link of the account menu. */
export interface AccountLink {
  /** Which page it opens. */
  key: 'profile' | 'security' | 'settings' | 'admin'
  /** What the link says. */
  label: string
  /** Where it goes, in the active language's path. */
  to: string
}

/** One workspace in the switcher. */
export interface SwitcherWorkspace {
  id: string
  name: string
  slug: string
  /** The workspace is the active one. */
  isCurrent: boolean
  /** The person's role in it (`owner`, `admin`, `member` or one of the app's), `null` while that is read. */
  role: string | null
  /** The role in words, in the active language; `null` while it is read. */
  roleLabel: string | null
}

/** What the switcher announces, as a polite status or an alert. */
export interface ShellMessage {
  kind: 'status' | 'error'
  text: string
}

/** The workspace switcher's state, actions and bindings. */
export interface UseWorkspaceSwitcherReturn {
  /** Every workspace the person belongs to, the active one marked. */
  workspaces: ComputedRef<SwitcherWorkspace[]>
  /** The active workspace's name in words ("Untitled workspace" when it has none yet); `''` while none is active. */
  currentName: ComputedRef<string>
  /** How many invitations wait for the person, read when the switcher opens; `null` until then. */
  invitations: Ref<number | null>
  /** `true` while workspace state loads. */
  isLoading: ComputedRef<boolean>
  /** What runs now: `switch:<id>`, `create`, or `null`. */
  pending: Ref<string | null>
  /** What the live region says: a switch made, a failure. */
  message: Ref<ShellMessage | null>
  /** The name typed in the inline create form. */
  newName: Ref<string>
  /** Make a workspace the active one. Resolves `true` once switched; on failure the old one stays active, the failure is announced, and it resolves `false`. */
  switchTo: (id: string) => Promise<boolean>
  /** Create a workspace and make it active. Resolves `true` once created; never rejects. */
  create: (name: string) => Promise<boolean>
  /** Read what only opening the switcher needs: the person's role in each workspace and the invitations waiting. Safe to call again. */
  load: () => Promise<void>
  /** The workspace state the switcher is built on. */
  workspace: ReturnType<typeof useWorkspace>
  /** The switcher's words. */
  labels: UseLabelsReturn<'shell'>
}

/** The state of one native-popover disclosure: its button, its panel and whether it is open. */
export interface PopoverDisclosure {
  id: string
  open: Ref<boolean>
  /** Attributes for the button that opens the panel. */
  trigger: ComputedRef<Record<string, unknown>>
  /** Attributes for the panel: a native `popover` that light-dismisses on Escape or an outside click. */
  panel: (extra?: Record<string, unknown>) => Record<string, unknown>
}

/**
 * A disclosure on the browser's own popover: the button names the panel
 * with `popovertarget`, so it opens and closes without script, Escape and a
 * click outside close it, and focus returns to the button. `aria-expanded`
 * follows the panel's `toggle` event.
 *
 * @internal
 */
export function usePopoverDisclosure(onOpen?: () => void): PopoverDisclosure {
  const id = `bk-menu-${useId()}`
  const open = ref(false)
  return {
    id,
    open,
    trigger: computed(() => ({ 'type': 'button', 'popovertarget': id, 'aria-expanded': open.value ? 'true' : 'false', 'aria-controls': id, 'aria-haspopup': 'true' })),
    panel: (extra = {}) => ({
      id,
      popover: 'auto',
      onToggle: (event: Event) => {
        open.value = (event as Event & { newState?: string }).newState === 'open'
        if (open.value) onOpen?.()
      },
      ...extra,
    }),
  }
}

/** The member row of a workspace as the auth client's `listMembers` answers it. */
interface MemberAnswer {
  data?: { members?: Array<{ role?: unknown }> } | null
}

/**
 * The workspace switcher without its markup: the person's workspaces with
 * their role in each, the invitations waiting, switching the active one, and
 * creating one in place. A switch that fails leaves the old workspace active
 * and says so. `<WorkspaceSwitcher>` is this with the package's markup.
 *
 * @internal
 */
export function useWorkspaceSwitcher(overrides?: MaybeRefOrGetter<LabelGroupOverrides<'shell'> | undefined>): UseWorkspaceSwitcherReturn {
  const workspace = useWorkspace()
  const auth = useAuthSession()
  const labels = useLabels('shell', () => toValue(overrides))
  const { t } = labels

  const roles = ref<Record<string, string>>({})
  const invitations = ref<number | null>(null)
  const pending = ref<string | null>(null)
  const message = ref<ShellMessage | null>(null)
  const newName = ref('')
  let loaded = false

  const unnamed = () => t('workspaces.unnamed')
  const nameOf = (entry: Pick<Workspace, 'name'> | null | undefined) => entry?.name?.trim() || unnamed()
  const currentId = computed(() => workspace.current.value?.id ?? null)

  const workspaces = computed<SwitcherWorkspace[]>(() => workspace.workspaces.value.map((entry) => {
    const isCurrent = entry.id === currentId.value
    // The active workspace's role is known live; the others' once the switcher has been opened.
    const role = isCurrent ? workspace.role.value ?? roles.value[entry.id] ?? null : roles.value[entry.id] ?? null
    return {
      id: entry.id,
      name: nameOf(entry),
      slug: entry.slug,
      isCurrent,
      role,
      roleLabel: role === null ? null : valueLabel(labels, 'shell', 'workspaces.roles', role),
    }
  }))

  async function load(): Promise<void> {
    if (loaded) return
    loaded = true
    const userId = (auth.user.value as { id?: string } | null)?.id
    const client = (auth.client?.organization ?? {}) as {
      listMembers?: (args: { query: Record<string, unknown> }) => Promise<MemberAnswer>
    }
    const found: Record<string, string> = {}
    await Promise.all([
      (async () => {
        try {
          invitations.value = (await workspace.listReceivedInvitations()).filter(invitation => invitation.status === 'pending').length
        }
        catch {
          // Unknown stays unknown: no count is better than a wrong one.
          invitations.value = null
        }
      })(),
      ...workspace.workspaces.value.map(async (entry) => {
        if (!userId || typeof client.listMembers !== 'function') return
        try {
          const answer = await client.listMembers({ query: { organizationId: entry.id, filterField: 'userId', filterValue: userId, limit: 1 } })
          const role = answer.data?.members?.[0]?.role
          if (typeof role === 'string' && role) found[entry.id] = role
        }
        catch {
          // The role stays blank for this one; switching still works.
        }
      }),
    ])
    roles.value = { ...roles.value, ...found }
  }

  async function switchTo(id: string): Promise<boolean> {
    if (pending.value !== null) return false
    const target = workspaces.value.find(entry => entry.id === id)
    const old = workspace.current.value
    pending.value = `switch:${id}`
    message.value = { kind: 'status', text: t('workspaces.switching') }
    try {
      await workspace.setActive(id)
      message.value = { kind: 'status', text: t('workspaces.switched', { name: target?.name ?? unnamed() }) }
      return true
    }
    catch {
      message.value = { kind: 'error', text: t('workspaces.switchFailed', { name: nameOf(old) }) }
      return false
    }
    finally {
      pending.value = null
    }
  }

  async function create(name: string): Promise<boolean> {
    const trimmed = name.trim()
    if (!trimmed || pending.value !== null) return false
    pending.value = 'create'
    message.value = { kind: 'status', text: t('workspaces.creating') }
    try {
      await workspace.create({ name: trimmed, slug: workspaceSlug(trimmed) })
      newName.value = ''
      message.value = { kind: 'status', text: t('workspaces.created', { name: trimmed }) }
      return true
    }
    catch {
      message.value = { kind: 'error', text: t('workspaces.createFailed') }
      return false
    }
    finally {
      pending.value = null
    }
  }

  return {
    workspaces,
    currentName: computed(() => (workspace.current.value ? nameOf(workspace.current.value) : '')),
    invitations,
    isLoading: workspace.isLoading,
    pending,
    message,
    newName,
    switchTo,
    create,
    load,
    workspace,
    labels,
  }
}

export interface UseAppShellOptions {
  /** Show the workspace switcher (default `true`). Read once, when the shell is set up. */
  switcher?: MaybeRefOrGetter<boolean | undefined>
  /** Copy for the shell, over app config and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'shell'> | undefined>
}

export interface UseAppShellReturn {
  /** Someone is signed in. */
  isSignedIn: ComputedRef<boolean>
  /** `true` while the session resolves. */
  isLoading: ComputedRef<boolean>
  /** The account the shell shows. */
  account: {
    /** The name to show: the account's name, else the part of the address before the `@`, else "Your account". */
    name: ComputedRef<string>
    /** The address, or `null`. */
    email: ComputedRef<string | null>
    /** The avatar's address, or `null`: the shell draws the initial then. */
    image: ComputedRef<string | null>
    /** One or two capitals of the name, for an avatar without a picture. */
    initials: ComputedRef<string>
    /** The account holds the app-wide `admin` role. */
    isAdmin: ComputedRef<boolean>
    /** An administrator is visiting the account. */
    impersonating: ComputedRef<boolean>
    /** The links of the account menu: profile, security and settings, and the admin console for an administrator. Pages turned off are left out. */
    links: ComputedRef<AccountLink[]>
    /** `true` while signing out. */
    isSigningOut: Ref<boolean>
    /** Why the last sign-out failed, in words; `null` otherwise. */
    signOutError: Ref<string | null>
    /** What the live region says after a sign-out. */
    announcement: Ref<string>
    /** Sign this browser out and go to the sign-in page, without `?redirect=`. Resolves `true` once signed out; never rejects. */
    signOut: () => Promise<boolean>
  }
  /** Where the sign-in page is; `null` when it is turned off. */
  login: ComputedRef<string | null>
  /** The workspace switcher; `null` when the shell was set up without one. */
  switcher: UseWorkspaceSwitcherReturn | null
  /** The id of the `<main>` landmark, which the skip link points to. */
  mainId: string
  /** The shell's words. */
  labels: UseLabelsReturn<'shell'>
}

/** One or two capitals for a name: the first letters of its first and last words. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = [...words[0]!][0] ?? ''
  const last = words.length > 1 ? [...words.at(-1)!][0] ?? '' : ''
  return `${first}${last}`.toUpperCase()
}

/**
 * The app shell without its markup: who is signed in, the links of the
 * account menu, signing out, and the workspace switcher. `<AppShell>` is
 * this with the package's markup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const shell = useAppShell({ switcher: false })
 * </script>
 * <template>
 *   <header>
 *     <NuxtLink v-if="!shell.isSignedIn.value" :to="shell.login.value ?? '/'">Sign in</NuxtLink>
 *     <button v-else @click="shell.account.signOut()">Sign out {{ shell.account.name.value }}</button>
 *   </header>
 * </template>
 * ```
 */
export function useAppShell(options: UseAppShellOptions = {}): UseAppShellReturn {
  const auth = useAuthSession()
  // The server renders before the session is read here, and the browser's
  // first render already knows it: until the page has hydrated, the shell
  // reads as loading on both sides, so the two renders match.
  const hydrated = ref(!useNuxtApp().isHydrating)
  onMounted(() => {
    hydrated.value = true
  })
  const labels = useLabels('shell', () => toValue(options.labels))
  const { t } = labels
  const login = useBackendPagePath('login')
  const pages = {
    profile: useBackendPagePath('profile'),
    security: useBackendPagePath('security'),
    settings: useBackendPagePath('settings'),
    admin: useBackendPagePath('admin'),
  }

  const user = computed(() => auth.user.value as { name?: string | null, email?: string | null, image?: string | null } | null)
  const email = computed(() => user.value?.email ?? null)
  const name = computed(() => user.value?.name?.trim() || email.value?.split('@')[0] || t('account.unnamed'))
  const isAdmin = computed(() => auth.hasRole(['admin']))

  const links = computed<AccountLink[]>(() => {
    const out: AccountLink[] = []
    for (const key of ['profile', 'security', 'settings'] as const) {
      const to = pages[key].value
      if (to) out.push({ key, label: t(`account.${key}`), to })
    }
    if (isAdmin.value && pages.admin.value) out.push({ key: 'admin', label: t('account.admin'), to: pages.admin.value })
    return out
  })

  const isSigningOut = ref(false)
  const signOutError = ref<string | null>(null)
  const announcement = ref('')
  let leaving = false
  onBeforeUnmount(() => {
    leaving = true
  })

  async function signOut(): Promise<boolean> {
    if (isSigningOut.value) return false
    isSigningOut.value = true
    signOutError.value = null
    announcement.value = t('account.signingOut')
    try {
      await auth.signOut()
      announcement.value = t('account.signedOut')
      await navigateTo(login.value ?? '/')
      return true
    }
    catch {
      signOutError.value = t('account.signOutFailed')
      announcement.value = ''
      return false
    }
    finally {
      if (!leaving) isSigningOut.value = false
    }
  }

  return {
    isSignedIn: computed(() => hydrated.value && auth.isAuthenticated.value),
    isLoading: computed(() => !hydrated.value || auth.isLoading.value),
    account: {
      name,
      email,
      image: computed(() => user.value?.image ?? null),
      initials: computed(() => initialsOf(name.value)),
      isAdmin,
      impersonating: auth.isImpersonating,
      links,
      isSigningOut,
      signOutError,
      announcement,
      signOut,
    },
    login,
    switcher: toValue(options.switcher) === false ? null : useWorkspaceSwitcher(options.labels),
    mainId: `bk-main-${useId()}`,
    labels,
  }
}
