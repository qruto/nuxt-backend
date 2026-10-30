import { getCurrentInstance, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { failureOf, type BackendError } from './utils/backend-error'
import { focusDropped, returnFocus } from './utils/focus-return'

// `#backend/a11y`: the helpers the packaged components and the headless
// bindings are built on, for markup of an app's own. Each returns refs and a
// `bind` bag to spread with `v-bind`. `bind` is read fresh on every access, a
// plain object of the attributes as they are now, so a template that spreads
// it re-renders when the state behind them changes: read it as `x.bind`, not
// from a copy of `x`.

/** The attributes a busy control carries: focusable, and saying it waits (`aria-disabled`, never `disabled`). */
export function busyAttributes(pending: boolean): Record<string, string | undefined> {
  return {
    'aria-disabled': pending ? 'true' : undefined,
    'data-disabled': pending ? '' : undefined,
    'data-state': pending ? 'pending' : 'idle',
  }
}

/** The announcer every `busy` text is spoken through: one polite region at the end of `<body>`, made on first use. */
let announcer: HTMLElement | null = null

/** Speak `text` politely, once, through the shared announcer: what a busy button waits for. */
export function announcePolitely(text: string): void {
  if (typeof document === 'undefined' || !text) return
  if (!announcer?.isConnected) {
    announcer = document.createElement('p')
    announcer.setAttribute('role', 'status')
    announcer.setAttribute('aria-live', 'polite')
    announcer.setAttribute('data-backend', 'announcer')
    announcer.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'
    document.body.append(announcer)
  }
  announcer.textContent = ''
  const region = announcer
  // A change the next frame makes is announced even when the same words repeat.
  setTimeout(() => {
    region.textContent = text
  }, 0)
}

/** Options for {@link useActionState}. */
export interface ActionStateOptions {
  /** What the action waits for, in words: announced politely once it starts ("Saving…"). */
  busy?: string
}

/** What {@link useActionState} returns. */
export interface UseActionStateReturn<A extends unknown[], R> {
  /** Run the action; a second call while one runs does nothing and resolves `undefined`. Never rejects: a failure lands in `error`. */
  run: (...args: A) => Promise<R | undefined>
  /** `true` while the action runs. */
  pending: Ref<boolean>
  /** Why the last run failed, as `getBackendError` reads it; cleared when the next one starts. */
  error: Ref<BackendError | null>
  /** For the button that runs it: `aria-disabled` and `data-state` while it runs, so it keeps focus. */
  readonly bind: { 'aria-disabled'?: string, 'data-disabled'?: string, 'data-state': string }
}

/**
 * Run an action once at a time, the way the packaged buttons do: the button
 * stays focusable while it runs (`aria-disabled`, not `disabled`, which
 * drops focus to the page), a second press does nothing, and `busy` is
 * announced as it starts.
 *
 * @example
 * ```vue
 * const action = useActionState(() => rename({ title: title.value }), { busy: 'Saving…' })
 * <button v-bind="action.bind" @click="action.run()">Save</button>
 * ```
 */
export function useActionState<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>, options: ActionStateOptions = {}): UseActionStateReturn<A, R> {
  const pending = ref(false)
  const error = ref<BackendError | null>(null) as Ref<BackendError | null>
  async function run(...args: A): Promise<R | undefined> {
    if (pending.value) return undefined
    pending.value = true
    error.value = null
    if (options.busy) announcePolitely(options.busy)
    try {
      return await fn(...args)
    }
    catch (cause) {
      error.value = failureOf(cause)
      return undefined
    }
    finally {
      pending.value = false
    }
  }
  return {
    run,
    pending,
    error,
    get bind() {
      return busyAttributes(pending.value) as UseActionStateReturn<A, R>['bind']
    },
  }
}

/** What {@link useFocusReturn} returns. */
export interface UseFocusReturnReturn {
  /** Remember `element`, or the element that has focus now. */
  remember: (element?: HTMLElement | null) => void
  /**
   * Put focus back on the element remembered (or the last one that had
   * focus while this component was mounted), when focus has fallen off the
   * page's controls: after a dialog closes or the control that had it went
   * away. Focus the person moved elsewhere stays where it is; `force` moves
   * it anyway.
   */
  restore: (options?: { force?: boolean }) => void
}

/** Keep focus on the page when the control holding it goes away. */
export function useFocusReturn(): UseFocusReturnReturn {
  let remembered: HTMLElement | null = null
  const track = (event: FocusEvent) => {
    if (event.target instanceof HTMLElement && event.target !== document.body) remembered = event.target
  }
  if (getCurrentInstance()) {
    onMounted(() => document.addEventListener('focusin', track))
    onBeforeUnmount(() => document.removeEventListener('focusin', track))
  }
  return {
    remember: (element) => {
      if (element !== undefined) remembered = element
      else if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) remembered = document.activeElement
    },
    restore: (options = {}) => {
      if (!remembered?.isConnected) return
      if (options.force || focusDropped() || document.activeElement === remembered) returnFocus(remembered)
    },
  }
}

/** What {@link useLiveRegion} returns. */
export interface UseLiveRegionReturn {
  /** Speak `text`: a polite status, or an alert with `{ alert: true }`. */
  announce: (text: string, options?: { alert?: boolean }) => void
  /** Clear the region. */
  clear: () => void
  /** For an empty element that stays mounted: its role, its politeness and the words announced. */
  readonly bind: { 'role': string, 'aria-live': string, 'aria-atomic': string, 'textContent': string }
}

/** A live region that stays mounted, and speaks what `announce` puts in it. */
export function useLiveRegion(): UseLiveRegionReturn {
  const message = ref('')
  const alert = ref(false)
  return {
    announce: (text, options = {}) => {
      alert.value = options.alert === true
      message.value = text
    },
    clear: () => {
      message.value = ''
    },
    get bind() {
      return {
        'role': alert.value ? 'alert' : 'status',
        'aria-live': alert.value ? 'assertive' : 'polite',
        'aria-atomic': 'true',
        'textContent': message.value,
      }
    },
  }
}
