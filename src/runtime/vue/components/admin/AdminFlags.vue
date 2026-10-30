<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { isTargeted, MAINTENANCE_MESSAGE_MAX } from '../../../../convex/flags'
import { formatBillingDate } from '../../composables/billing-format'
import { type AdminFlag, type FlagOverride, useFlagAdmin } from '../../composables/use-flags'
import { useLabels, type BackendLabels, type LabelKey } from '../../composables/use-labels'
import { useReauthentication } from '../../composables/use-reauthentication'
import { focusedIn, focusStranded, returnFocus } from '../../utils/focus-return'
import { useConfirmation } from '../../utils/confirmation'
import { useSettingsMessage } from '../../utils/settings-message'
import ConfirmDialog from '../shell/ConfirmDialog.vue'

/**
 * The admin console's Flags tab: the package's kill switches (pause
 * sign-ups, checkout and AI, and the maintenance banner with its message),
 * each a switch, then the app's own flags, each with what it is now and an
 * editor: on or off for everyone or as in code and, while off, the
 * accounts, workspaces and plans it is on for and a percentage rollout.
 * An override left by a flag the code no longer declares is listed last,
 * with a Remove button. Every change asks for a recent sign-in through the
 * tab's own `<ReauthenticateDialog>`, and is recorded on the activity
 * trail. Turning a switch on asks first (`confirm`).
 *
 * @internal
 */
defineOptions({ name: 'AdminFlags' })

const props = withDefaults(defineProps<{
  /** Ask before a switch is turned on; resolves `true` to go ahead. Default: the tab's own confirmation dialog. */
  confirm?: (text: string) => boolean | Promise<boolean>
}>(), { confirm: undefined })

type AdminKey = LabelKey<BackendLabels['admin']>
/** How an app flag reads for everyone in the editor: as in code, or held on or off. */
type Everyone = 'default' | 'on' | 'off'
/** The editor's fields for one app flag. */
interface Draft {
  everyone: Everyone
  users: string
  workspaces: string
  plans: string
  rollout: string
}

/** A list field's entries: one per line, or separated by commas. */
const entries = (text: string): string[] => text.split(/[\n,]/).map(entry => entry.trim()).filter(Boolean)

/** The override an editor's fields stand for; `null` when they hold the flag at its default. */
function overrideOf(draft: Draft): FlagOverride | null {
  const users = entries(draft.users)
  const workspaces = entries(draft.workspaces)
  const plans = entries(draft.plans)
  const rollout = Number(draft.rollout)
  const override: FlagOverride = {
    ...(draft.everyone === 'default' ? {} : { enabled: draft.everyone === 'on' }),
    ...(users.length ? { users } : {}),
    ...(workspaces.length ? { workspaces } : {}),
    ...(plans.length ? { plans } : {}),
    ...(draft.rollout.trim() && rollout > 0 ? { rollout } : {}),
  }
  return Object.keys(override).length ? override : null
}

/** The editor's fields for a flag as it is stored. */
function draftOf(flag: AdminFlag): Draft {
  const override = flag.override
  return {
    everyone: override?.enabled === undefined ? 'default' : override.enabled ? 'on' : 'off',
    users: override?.users?.join('\n') ?? '',
    workspaces: override?.workspaces?.join('\n') ?? '',
    plans: override?.plans?.join('\n') ?? '',
    rollout: override?.rollout ? String(override.rollout) : '',
  }
}

const labels = useLabels('admin')
const { t, errorMessage, locale } = labels
const flags = useFlagAdmin()
const { withReauthentication } = useReauthentication()
const id = useId()
const { note, message } = useSettingsMessage()
const switches = computed(() => (flags.flags.value ?? []).filter(flag => flag.builtIn))
const appFlags = computed(() => (flags.flags.value ?? []).filter(flag => !flag.builtIn))
const running = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)
// The maintenance banner's message, as typed: the stored one until edited.
const typed = ref<string | null>(null)
const maintenance = computed(() => switches.value.find(flag => flag.key === 'maintenance'))
const messageText = computed({
  get: () => typed.value ?? maintenance.value?.override?.message ?? '',
  set: (value: string) => {
    typed.value = value
  },
})
// The flag being edited, and its fields.
const editing = ref<string | null>(null)
const draft = ref<Draft>({ everyone: 'default', users: '', workspaces: '', plans: '', rollout: '' })

const nameOf = (flag: AdminFlag) => flag.builtIn ? t(`flags.names.${flag.key}` as AdminKey) : flag.key
const descriptionOf = (flag: AdminFlag) => flag.builtIn ? t(`flags.descriptions.${flag.key}` as AdminKey) : flag.description
const isOn = (flag: AdminFlag) => (flag.override?.enabled ?? flag.default) === true

const confirmation = useConfirmation(() => props.confirm)
const confirmed = confirmation.ask

/** Save one change: one at a time, its outcome in the tab's message. */
async function save(key: string, override: FlagOverride | null): Promise<boolean> {
  if (running.value) return false
  note.value = null
  running.value = key
  try {
    await withReauthentication(() => flags.setFlag(key, override))
    note.value = { ok: true, text: () => t('flags.saved') }
    return true
  }
  catch (cause) {
    note.value = { ok: false, text: () => errorMessage(cause) }
    return false
  }
  finally {
    running.value = null
  }
}

async function toggle(flag: AdminFlag): Promise<void> {
  if (running.value) return
  const on = !isOn(flag)
  if (on && !(await confirmed(t('flags.confirmOn', { name: nameOf(flag) })))) return
  const text = flag.key === 'maintenance' ? messageText.value.trim() : ''
  // Off holds the switch at its default, keeping the banner's message for next time.
  const override: FlagOverride | null = on ? { enabled: true, ...(text ? { message: text } : {}) } : text ? { enabled: false, message: text } : null
  await save(flag.key, override)
}

async function saveMessage(): Promise<void> {
  const flag = maintenance.value
  if (!flag) return
  const text = messageText.value.trim()
  const enabled = flag.override?.enabled
  const override: FlagOverride | null = text || enabled !== undefined ? { ...(enabled === undefined ? {} : { enabled }), ...(text ? { message: text } : {}) } : null
  if (await save(flag.key, override)) typed.value = null
}

/** The button that opened the editor, which focus returns to when it closes. */
let opener: HTMLElement | null = null
async function edit(flag: AdminFlag, event: Event): Promise<void> {
  opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  draft.value = draftOf(flag)
  editing.value = flag.key
  await nextTick()
  root.value?.querySelector<HTMLElement>('[data-admin="flag-editor"] input')?.focus()
}
async function closeEditor(): Promise<void> {
  const key = editing.value
  editing.value = null
  await nextTick()
  const back = opener?.isConnected ? opener : root.value?.querySelector<HTMLElement>(`[data-flag="${key}"] [data-admin="flag-edit"]`)
  opener = null
  returnFocus(back)
}
async function submit(): Promise<void> {
  if (editing.value && await save(editing.value, overrideOf(draft.value))) await closeEditor()
}
async function reset(): Promise<void> {
  if (editing.value && await save(editing.value, null)) await closeEditor()
}

/** What the flag is now. On for everyone comes first: targets and a rollout only turn on a flag that is off. */
function state(flag: AdminFlag): string {
  if (!flag.declared) return t('flags.states.undeclared')
  const override = flag.override
  if (isOn(flag)) {
    const everyone = override?.enabled === true ? t('flags.states.on') : t('flags.states.defaultOn')
    return isTargeted(override) ? `${everyone} · ${t('flags.targetsIdle')}` : everyone
  }
  if (isTargeted(override)) return override?.rollout ? `${t('flags.states.targeted')} · ${t('flags.rolledOut', { percent: override.rollout })}` : t('flags.states.targeted')
  return override?.enabled === false ? t('flags.states.off') : t('flags.states.defaultOff')
}

/**
 * Remove an override the code no longer declares. Its row goes with it:
 * focus, if it was on the button, moves to the next flag's button, or to
 * the first switch, never to the page.
 */
async function remove(flag: AdminFlag): Promise<void> {
  const pressed = focusedIn(root.value)
  if (!await save(flag.key, null) || !pressed) return
  await nextTick()
  if (focusStranded(pressed)) returnFocus(root.value?.querySelector<HTMLElement>('[data-admin="flag-edit"], [data-admin="flag-remove"], [data-admin="switch-toggle"]'))
}

const busy = (key: string) => (running.value === key ? 'true' : undefined)
const changed = (flag: AdminFlag) => t('flags.changed', { date: formatBillingDate(flag.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }, locale.value) })
const everyoneWords: Record<Everyone, AdminKey> = { default: 'flags.everyoneDefault', on: 'flags.everyoneOn', off: 'flags.everyoneOff' }
const listFields = ['users', 'workspaces', 'plans'] as const
</script>

<template>
  <section
    ref="root"
    data-admin="flags"
    :aria-busy="flags.isLoading.value ? 'true' : undefined"
  >
    <h2 data-admin="title">
      {{ t('flags.title') }}
    </h2>
    <p
      v-if="flags.isLoading.value"
      data-admin="loading"
      role="status"
      aria-live="polite"
    >
      {{ t('loading') }}
    </p>
    <p
      v-if="flags.isRefused.value"
      data-admin="error"
      role="alert"
    >
      {{ t('flags.refused') }}
    </p>
    <p
      v-if="!flags.isRefused.value && flags.error.value && !message"
      data-admin="error"
      role="alert"
    >
      {{ errorMessage(flags.error.value) }}
    </p>
    <template v-if="switches.length">
      <h3 data-admin="section-title">
        {{ t('flags.switchesTitle') }}
      </h3>
      <p data-admin="flags-hint">
        {{ t('flags.switchesHint') }}
      </p>
      <ul data-admin="switch-list">
        <li
          v-for="flag in switches"
          :key="flag.key"
          data-admin="switch"
          :data-flag="flag.key"
          :data-on="isOn(flag) || undefined"
        >
          <button
            data-admin="switch-toggle"
            type="button"
            role="switch"
            :aria-checked="isOn(flag) ? 'true' : 'false'"
            :data-state="isOn(flag) ? 'checked' : 'unchecked'"
            :aria-describedby="`${id}-${flag.key}-description`"
            :aria-disabled="busy(flag.key)"
            @click="toggle(flag)"
          >
            {{ nameOf(flag) }}
          </button>
          <p
            :id="`${id}-${flag.key}-description`"
            data-admin="switch-description"
          >
            {{ descriptionOf(flag) }}
          </p>
          <div
            v-if="flag.key === 'maintenance'"
            data-admin="maintenance-form"
          >
            <label
              data-admin="label"
              :for="`${id}-message`"
            >{{ t('flags.message') }}</label>
            <textarea
              :id="`${id}-message`"
              v-model="messageText"
              data-admin="maintenance-message"
              rows="2"
              :maxlength="MAINTENANCE_MESSAGE_MAX"
              :aria-describedby="`${id}-message-hint`"
            />
            <p
              :id="`${id}-message-hint`"
              data-admin="flags-hint"
            >
              {{ t('flags.messageHint') }}
            </p>
            <button
              data-admin="save-message"
              type="button"
              :aria-disabled="busy(flag.key)"
              @click="saveMessage"
            >
              {{ t('flags.saveMessage') }}
            </button>
          </div>
        </li>
      </ul>
      <h3 data-admin="section-title">
        {{ t('flags.flagsTitle') }}
      </h3>
      <p data-admin="flags-hint">
        {{ t('flags.flagsHint') }}
      </p>
      <table
        v-if="appFlags.length"
        data-admin="table"
      >
        <thead>
          <tr>
            <th scope="col">
              {{ t('flags.key') }}
            </th>
            <th scope="col">
              {{ t('flags.state') }}
            </th>
            <th scope="col">
              <span data-admin="visually-hidden">{{ t('flags.edit') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template
            v-for="flag in appFlags"
            :key="flag.key"
          >
            <tr
              data-admin="flag"
              :data-flag="flag.key"
            >
              <th scope="row">
                <code>{{ flag.key }}</code>
                <template v-if="flag.description">
                  <br><span data-admin="flag-description">{{ flag.description }}</span>
                </template>
              </th>
              <td data-admin="flag-state">
                {{ state(flag) }}
                <template v-if="flag.updatedAt">
                  <br><span data-admin="flag-changed">{{ changed(flag) }}</span>
                </template>
              </td>
              <td>
                <button
                  v-if="flag.declared"
                  data-admin="flag-edit"
                  type="button"
                  :aria-expanded="editing === flag.key ? 'true' : 'false'"
                  @click="edit(flag, $event)"
                >
                  {{ t('flags.edit') }}
                </button>
                <button
                  v-else
                  data-admin="flag-remove"
                  type="button"
                  :aria-disabled="busy(flag.key)"
                  @click="remove(flag)"
                >
                  {{ t('flags.remove') }}
                </button>
              </td>
            </tr>
            <tr
              v-if="editing === flag.key"
              data-admin="flag-editor-row"
            >
              <td colspan="3">
                <form
                  data-admin="flag-editor"
                  :aria-label="t('flags.editing', { key: flag.key })"
                  @submit.prevent="submit"
                >
                  <fieldset data-admin="flag-everyone">
                    <legend>{{ t('flags.everyone') }}</legend>
                    <label
                      v-for="choice in (['default', 'on', 'off'] as const)"
                      :key="choice"
                      data-admin="choice"
                    >
                      <input
                        v-model="draft.everyone"
                        type="radio"
                        :name="`${id}-everyone`"
                        :value="choice"
                      >
                      {{ ` ${t(everyoneWords[choice])}` }}
                    </label>
                  </fieldset>
                  <div
                    v-for="name in listFields"
                    :key="name"
                    data-admin="flag-field"
                  >
                    <label
                      data-admin="label"
                      :for="`${id}-${name}`"
                    >{{ t(`flags.${name}` as AdminKey) }}</label>
                    <textarea
                      :id="`${id}-${name}`"
                      v-model="draft[name]"
                      :data-admin="`flag-${name}`"
                      rows="2"
                      :aria-describedby="`${id}-list-hint`"
                    />
                  </div>
                  <p
                    :id="`${id}-list-hint`"
                    data-admin="flags-hint"
                  >
                    {{ t('flags.listHint') }}
                  </p>
                  <div data-admin="flag-field">
                    <label
                      data-admin="label"
                      :for="`${id}-rollout`"
                    >{{ t('flags.rollout') }}</label>
                    <input
                      :id="`${id}-rollout`"
                      :value="draft.rollout"
                      data-admin="flag-rollout"
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      inputmode="decimal"
                      :aria-describedby="`${id}-rollout-hint`"
                      @input="draft.rollout = ($event.target as HTMLInputElement).value"
                    >
                    <p
                      :id="`${id}-rollout-hint`"
                      data-admin="flags-hint"
                    >
                      {{ t(`flags.rolloutBy.${flag.by}` as AdminKey) }}
                    </p>
                  </div>
                  <div data-admin="flag-actions">
                    <button
                      data-admin="flag-save"
                      type="submit"
                      :aria-disabled="busy(flag.key)"
                    >
                      {{ running === flag.key ? t('flags.saving') : t('flags.save') }}
                    </button>
                    <button
                      v-if="flag.override"
                      data-admin="flag-reset"
                      type="button"
                      :aria-disabled="busy(flag.key)"
                      @click="reset"
                    >
                      {{ t('flags.reset') }}
                    </button>
                    <button
                      data-admin="flag-cancel"
                      type="button"
                      @click="closeEditor"
                    >
                      {{ t('flags.cancel') }}
                    </button>
                  </div>
                </form>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <p
        v-else
        data-admin="empty"
      >
        {{ t('flags.empty') }}
      </p>
    </template>
    <p
      data-admin="message"
      :data-tone="message ? (message.ok ? 'ok' : 'error') : undefined"
      role="status"
      aria-live="polite"
    >
      {{ message?.text ?? '' }}
    </p>
    <ReauthenticateDialog />
    <ConfirmDialog
      :confirmation="confirmation"
      :accept-label="t('confirmAccept')"
      :cancel-label="t('confirmCancel')"
    />
  </section>
</template>
