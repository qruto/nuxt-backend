import { isBackendEventType } from './events.js'

// The activation checklist's rules, runtime-neutral (no Vue, no Convex
// runtime): `defineActivation` checks a list of first tasks when the
// deployment loads, and the component's task lookup and the composable read
// the same shapes. A task is done when one event of its kind is recorded for
// the person (or for their workspace); nothing here reads the events.

/** The fewest tasks a checklist holds: fewer is not a path to a first result. */
export const ACTIVATION_TASKS_MIN = 3

/** The most tasks a checklist holds: each extra one lowers how many people finish. */
export const ACTIVATION_TASKS_MAX = 7

/** The longest label a task carries, in characters. */
export const ACTIVATION_LABEL_MAX = 120

/** Whose events tick a task off: the person's own, or any member's in the workspace they are in. */
export type ActivationScope = 'person' | 'workspace'

/** One first task of the checklist. */
export interface ActivationTask {
  /** The task's name: letters, digits, `-` and `_`, unique in the list. */
  key: string
  /**
   * What the person reads: plain text, or a label key (`group.key`) that
   * reads in their language, over `appConfig.backend.labels` and the
   * `backend.<group>.<key>` messages of `@nuxtjs/i18n`.
   */
  label: string
  /**
   * The event kind that ticks the task off: one of yours (`app.photo_uploaded`)
   * or one the package records (`workspace.member_invited`). The task is done
   * the first time that event is recorded for the person.
   */
  done: string
  /** Where the task's link goes: a path of your app, or an `https:` address. */
  to?: string
  /** `'workspace'`: the event may be any member's in the workspace the person is in. Default `'person'`. */
  scope?: ActivationScope
}

/** The checklist from {@link defineActivation}: pass it to `setupAudit({ checklist })`. */
export interface Activation {
  readonly tasks: readonly Readonly<ActivationTask>[]
}

const KEY = /^[A-Z0-9][\w-]{0,39}$/i
const APP_KIND = /^app\.[a-z][a-z0-9_]{0,63}$/

/** A path of the app (never `//host`), or an `https:` address; `javascript:` and the rest are refused. */
export function isTaskTarget(to: string): boolean {
  if (to.startsWith('/')) return !to.startsWith('//') && !/[\s\\]/.test(to)
  try {
    return new URL(to).protocol === 'https:'
  }
  catch {
    return false
  }
}

/**
 * What is wrong with a task, one sentence; `null` for a good one. Shared by
 * {@link defineActivation} and the checks around it.
 */
function taskProblem(task: unknown, index: number): string | null {
  const where = `task ${index + 1}`
  if (typeof task !== 'object' || task === null) return `${where} is not an object with a \`key\`, a \`label\` and \`done\``
  const { key, label, done, to, scope } = task as Record<string, unknown>
  if (typeof key !== 'string' || !KEY.test(key)) return `${where} needs a \`key\` of letters, digits, \`-\` and \`_\` (up to 40 characters)`
  const named = `task \`${key}\``
  if (typeof label !== 'string' || !label.trim() || label.length > ACTIVATION_LABEL_MAX) return `${named} needs a \`label\` of 1 to ${ACTIVATION_LABEL_MAX} characters`
  if (typeof done !== 'string' || !(APP_KIND.test(done) || isBackendEventType(done))) {
    return `${named} names \`done: ${typeof done === 'string' ? done : String(done)}\`, which is neither one of the package's event kinds nor one of yours under \`app.\` (\`app.photo_uploaded\`)`
  }
  if (to !== undefined && (typeof to !== 'string' || !isTaskTarget(to))) return `${named} has a \`to\` that is neither a path of your app nor an \`https:\` address`
  if (scope !== undefined && scope !== 'person' && scope !== 'workspace') return `${named} has a \`scope\` that is neither \`'person'\` nor \`'workspace'\``
  return null
}

/**
 * The activation checklist: three to seven first tasks that lead to value,
 * each done when one of your own events (or one the package records) is
 * recorded for the person. Pass the result to `setupAudit({ checklist })`.
 * Throws, naming the problem, when the list has fewer than three or more
 * than seven tasks, two tasks share a key, or a task is malformed, so a
 * mistake shows when the deployment loads.
 *
 * @example
 * ```ts [backend/activation.ts]
 * import { defineActivation } from 'nuxt-backend/audit'
 *
 * export const activation = defineActivation([
 *   { key: 'photo', label: 'Upload a photo of yourself', done: 'app.photo_uploaded', to: '/studio/photos' },
 *   { key: 'strip', label: 'Generate your first strip', done: 'app.strip_generated', to: '/studio/new' },
 *   { key: 'publish', label: 'Publish a strip', done: 'app.strip_published', to: '/studio' },
 * ])
 * ```
 */
export function defineActivation(tasks: readonly ActivationTask[]): Activation {
  if (!Array.isArray(tasks)) throw new TypeError('[nuxt-backend] defineActivation: pass an array of tasks, each `{ key, label, done }`.')
  if (tasks.length < ACTIVATION_TASKS_MIN || tasks.length > ACTIVATION_TASKS_MAX) {
    throw new RangeError(`[nuxt-backend] defineActivation: a checklist holds ${ACTIVATION_TASKS_MIN} to ${ACTIVATION_TASKS_MAX} tasks, and this one has ${tasks.length}.`)
  }
  const seen = new Set<string>()
  tasks.forEach((task, index) => {
    const problem = taskProblem(task, index)
    if (problem) throw new TypeError(`[nuxt-backend] defineActivation: ${problem}.`)
    if (seen.has(task.key)) throw new RangeError(`[nuxt-backend] defineActivation: two tasks share the key \`${task.key}\`; each needs its own.`)
    seen.add(task.key)
  })
  return { tasks: tasks.map(task => Object.freeze({ ...task })) }
}

/** One task as a reader gets it: the definition, and whether (and when) the event landed. */
export interface ActivationTaskView {
  key: string
  label: string
  to: string | null
  scope: ActivationScope
  /** Whether the task's event was recorded. */
  done: boolean
  /** When it was first recorded, epoch ms; `null` while the task is open. */
  doneAt: number | null
}

/** The checklist as one person reads it. */
export interface ActivationView {
  tasks: ActivationTaskView[]
  /** How many tasks are done. */
  done: number
  /** How many tasks there are. */
  total: number
  /** The fraction done, 0 to 1. */
  progress: number
  /** Every task is done. */
  isComplete: boolean
  /** The person dismissed the checklist. */
  isDismissed: boolean
  /** An administrator is looking at the person's progress: dismissing is refused. */
  readOnly: boolean
}

/** The part of a task a lookup needs: what ticks it and whose events count. */
export interface ActivationLookup {
  key: string
  kind: string
  scope: ActivationScope
}
