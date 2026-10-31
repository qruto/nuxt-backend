<script setup lang="ts">
import { computed } from 'vue'
import { useFeatures, type UseFeaturesReturn } from '../../composables/use-features'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { useWorkspace, type UseWorkspaceReturn } from '../../composables/use-workspace'
import { useAuthSession } from '../../utils/auth-session'
import { useHydrated } from '../../utils/hydrated'
import { hasAnyRole } from '../../utils/roles'
import type { GateContent, GateSlots, GateVerdict } from './gate'
import { SingleRoot } from '../../utils/vnodes'
import GateQuota from './GateQuota.vue'

/**
 * Renders its content only for the people every check it names admits:
 * signed in (`signed-in`), an app-wide role (`role`), the active workspace
 * or a role in it (`workspace`), a feature of the plan (`feature`), or
 * room left on a quota (`quota`, `amount`). Naming any check also asks for
 * a sign-in, so a signed-out visitor gets the `fallback`. Exactly one slot
 * renders: the content, `fallback` when a check fails, `placeholder` while
 * they load (the server render, and the browser until it has hydrated), and
 * `error` when the plan's features or quotas could not be read: never the
 * content, and never the `fallback`, which would tell a subscriber to buy
 * what they have.
 *
 * Without a `fallback`, a failed check renders nothing, except `quota`: it
 * says how many are used of how many, names the plans on sale that allow
 * enough and links to the first on the pricing page; a workspace member who
 * manages no billing is asked to ask an owner or admin instead. Its words
 * are the `quota` labels, and its states `data-quota` attributes.
 *
 * It decides what the screen shows, never what a person may do: the
 * function behind the content checks the same rule. The checks it reads
 * are the ones named when it mounts; their values follow the props.
 *
 * @example
 * ```vue
 * <Gate feature="illustrations">
 *   <NuxtLink to="/strips/new">New strip</NuxtLink>
 *   <template #fallback><UpgradePrompt feature="illustrations" /></template>
 * </Gate>
 * ```
 */
// eslint-disable-next-line vue/multi-word-component-names -- the public name the docs and apps use
defineOptions({ name: 'Gate' })

const props = withDefaults(defineProps<{
  /** Only a signed-in account that is not banned. */
  signedIn?: boolean
  /** An app-wide role, or several: any one passes. */
  role?: string | string[]
  /** `true`: the session has an active workspace. A built-in role or a list (`'owner'`, `['owner', 'admin']`): the person holds one of them there. */
  workspace?: boolean | string | string[]
  /** A feature of the active workspace's plan, by its catalog key, or several: any one passes. */
  feature?: string | string[]
  /** A quota of the plan, by its catalog key: passes while it has room for `amount` more. */
  quota?: string
  /** How many the content needs room for, with `quota`: a whole number, at least 1 (the default), so a gate never opens on 0. */
  amount?: number
  /** What the quota counts, as its sentence names it ("strips"). Defaults to the catalog's `description`, else its key, in words. */
  name?: string
  /** Copy for the quota's sentence, over `appConfig.backend.labels.quota` and the translations. */
  labels?: LabelOverrides<BackendLabels['quota']>
}>(), { signedIn: false, role: undefined, workspace: undefined, feature: undefined, quota: undefined, amount: 1, name: undefined, labels: undefined })
defineEmits({})
const slots = defineSlots<GateSlots>()

const auth = useAuthSession()
const hydrated = useHydrated()
// Read only what a named check needs: a role gate subscribes to no plan.
const workspaces: UseWorkspaceReturn | null = props.workspace !== undefined && props.workspace !== false ? useWorkspace() : null
const features: UseFeaturesReturn | null = props.feature !== undefined || props.quota !== undefined ? useFeatures() : null
const { t } = useLabels('quota', () => props.labels)

/** Whether any of `value` passes `check`: one name or a list, any match. */
const anyOf = (value: string | readonly string[], check: (entry: string) => boolean) =>
  (typeof value === 'string' ? [value] : value).some(check)
/** A quota's key as words when neither the app nor the catalog names it: `team_projects` → `team projects`. */
const wordsOf = (quota: string) => quota.replace(/[_-]+/g, ' ')
/** How many the content needs room for: a whole number, at least one, whatever the app passed. */
const neededOf = (amount: number) => Math.max(1, Number.isFinite(amount) ? Math.ceil(amount) : 1)
const named = () => props.signedIn || props.role !== undefined || (props.workspace !== undefined && props.workspace !== false) || props.feature !== undefined || props.quota !== undefined

const PLACEHOLDER: GateVerdict = { kind: 'placeholder' }
const FALLBACK: GateVerdict = { kind: 'fallback' }

/** Who is signed in, and the app-wide role. */
function session(): GateVerdict | undefined {
  if (!hydrated.value || auth.isLoading.value) return PLACEHOLDER
  if (named() && (!auth.isAuthenticated.value || auth.banned.value)) return FALLBACK
  if (props.role !== undefined && !auth.hasRole(props.role)) return FALLBACK
  return undefined
}

/** The active workspace, and a built-in role in it. */
function workspaceCheck(content: GateContent): GateVerdict | undefined {
  if (!workspaces) return undefined
  if (workspaces.isLoading.value) return PLACEHOLDER
  const current = workspaces.current.value
  if (!current) return FALLBACK
  const required = props.workspace
  if (typeof required !== 'boolean' && required !== undefined && !anyOf(required, role => hasAnyRole(workspaces.role.value, role))) return FALLBACK
  content.workspace = current
  return undefined
}

/** The plan, read: loading and a failed read, each in its own words. */
function planRead(plan: UseFeaturesReturn): GateVerdict | undefined {
  if (plan.isLoading.value) {
    if (slots.placeholder !== undefined) return PLACEHOLDER
    return props.quota !== undefined ? { kind: 'quota-loading' } : { kind: 'nothing' }
  }
  const error = plan.error.value
  if (!error) return undefined
  if (slots.error !== undefined) return { kind: 'error', error }
  return props.quota !== undefined ? { kind: 'quota-error' } : { kind: 'nothing' }
}

/** The plan's feature and quota: room left, or the refusal. */
function planCheck(content: GateContent): GateVerdict | undefined {
  if (!features) return undefined
  const read = planRead(features)
  if (read !== undefined) return read
  if (props.feature !== undefined && !anyOf(props.feature, feature => features.has(feature))) return FALLBACK
  if (props.quota === undefined) return undefined
  const usage = features.quota(props.quota) ?? { limit: 0, used: 0 }
  const remaining = features.remaining(props.quota)
  const amount = neededOf(props.amount)
  if (remaining >= amount) {
    Object.assign(content, { limit: usage.limit, used: usage.used, remaining })
    return undefined
  }
  return {
    kind: 'quota',
    quota: props.quota,
    name: props.name ?? (usage as { description?: string }).description ?? wordsOf(props.quota),
    // No room left: the limit is a number.
    limit: usage.limit === 'unlimited' ? 0 : usage.limit,
    used: usage.used,
    amount,
  }
}

const verdict = computed<GateVerdict>(() => {
  const content: GateContent = {}
  for (const step of [session, () => workspaceCheck(content), () => planCheck(content)]) {
    const refused = step()
    if (refused !== undefined) return refused
  }
  return { kind: 'content', content }
})
</script>

<template>
  <SingleRoot>
    <slot
      v-if="verdict.kind === 'content'"
      v-bind="verdict.content"
    />
    <slot
      v-else-if="verdict.kind === 'placeholder'"
      name="placeholder"
    />
    <slot
      v-else-if="verdict.kind === 'fallback'"
      name="fallback"
    />
    <slot
      v-else-if="verdict.kind === 'error'"
      name="error"
      :error="verdict.error"
    />
    <p
      v-else-if="verdict.kind === 'quota-loading'"
      data-quota="loading"
      role="status"
      aria-busy="true"
    >
      {{ t('loading') }}
    </p>
    <p
      v-else-if="verdict.kind === 'quota-error'"
      data-quota="error"
      role="alert"
    >
      {{ t('unavailable') }}
    </p>
    <GateQuota
      v-else-if="verdict.kind === 'quota'"
      :quota="verdict.quota"
      :name="verdict.name"
      :limit="verdict.limit"
      :used="verdict.used"
      :amount="verdict.amount"
      :labels="labels"
    >
      <template
        v-if="slots.fallback"
        #fallback="context"
      >
        <slot
          name="fallback"
          v-bind="context"
        />
      </template>
    </GateQuota>
  </SingleRoot>
</template>
