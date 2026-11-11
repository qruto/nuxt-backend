import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, reactive, ref, type Ref, shallowRef, toValue } from 'vue'
import { useRoute } from '#imports'
import { useAction, useMutation } from 'nuxt-convex-module/client'
import type { WaitlistCaps, WaitlistConsole, WaitlistPlace, WaitlistStatusView } from '../../../convex/integrations/waitlist'
import { SOURCE_FORM, WAITLIST_SOURCE_MAX, type WaitlistQuestions, type WaitlistStatus } from '../../../convex/waitlist-rules'
import type { CampaignAttribution } from '../../../convex/integrations/billing/types/options'
import { type BackendError, failureOf } from '../utils/backend-error'
import { checkEmail, invalidInput, stepRunner } from '../utils/auth-steps'
import { useActiveLocale } from '../utils/active-locale'
import { useAuthSession } from '../utils/auth-session'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { useCampaign } from './use-campaign'
import { useHumanCheck } from './use-human-check'
import { useLabels } from './use-labels'
import { usePageOrigin } from '../utils/page-origin'
import { onPageOpen } from '../utils/page-open'
import { takeFragment, type TabKeep, tabKeep } from '../utils/tab-keep'

export type { WaitlistCaps, WaitlistConsole, WaitlistEntryRow, WaitlistPlace, WaitlistStatusView } from '../../../convex/integrations/waitlist'
export type { WaitlistStatus } from '../../../convex/waitlist-rules'

/** The functions re-exported from your `backend/waitlist.ts`. */
export interface WaitlistApiRefs {
  getWaitlistQuestions?: FunctionReference<'query', 'public', Record<string, never>, WaitlistQuestions>
  joinWaitlist?: FunctionReference<'action', 'public', { email: string, answers?: Record<string, string>, launchNews?: boolean, launchNewsText?: string, source?: string, ref?: string, locale?: string, human?: string | null }, { join: string } | null>
  waitlistStatus?: FunctionReference<'query', 'public', { token: string }, WaitlistStatusView | null>
  leaveWaitlist?: FunctionReference<'mutation', 'public', { token: string }, null>
  getWaitlistConsole?: FunctionReference<'query', 'public', { status?: WaitlistStatus, domain?: string, source?: string, question?: string, answer?: string }, WaitlistConsole | null>
  admitWaitlist?: FunctionReference<'mutation', 'public', { ids?: string[], next?: number }, { admitted: number }>
  declineWaitlist?: FunctionReference<'mutation', 'public', { ids: string[], abuse?: boolean }, { declined: number }>
  noteWaitlist?: FunctionReference<'mutation', 'public', { id: string, note: string }, null>
  getWaitlistCaps?: FunctionReference<'action', 'public', Record<string, never>, WaitlistCaps | null>
}

/** Where a person is in joining: asking for the code, entering it, or reading their place. */
export type WaitlistStep = 'join' | 'verify' | 'status'

export interface UseWaitlistOptions {
  /** Override the injected `api.waitlist` namespace. */
  api?: WaitlistApiRefs
  /** Where this form is, for the Source column of the Waitlist tab (letters, digits and `. : / - _`, up to 64). Default `form`. */
  source?: string
  /**
   * Record the campaign the visitor came with beside `source` (default
   * `true`): the page address's `utm_source` and `utm_campaign`, as
   * `form:newsletter/launch`, read as the person joins. `false` records
   * `source` alone.
   */
  campaign?: boolean
  /**
   * The share code of the friend whose link the visitor came through.
   * Default: the page address's `?ref=`, read once and never stored on the
   * device. `null` asks for none.
   */
  ref?: string | null
  /** Validate the address before sending a code (as `useLoginFlow` does). Default: a basic shape check. */
  validateEmail?: (email: string) => boolean | string
  /**
   * The page a friend's link opens, for `shareLink`: the one with the join
   * form, as a path on this site. Default: the page this runs on.
   */
  shareTo?: MaybeRefOrGetter<string | undefined>
  /**
   * Open the status link the page was reached by (default `false`), for the
   * page a status email links to: `/waitlist`, or an app's own page there.
   * Once the page mounts, the token leaves the address's fragment
   * (`#<token>`) and the tab keeps it, as it keeps a join's and one passed
   * to `status`, so a reload shows the place again while the address, a
   * bookmark or a copied link never holds it. `leave` drops it. The server
   * cannot read the fragment: `linkChecked` says when the page has.
   */
  statusLink?: boolean
}

/** The attributes and handlers custom markup spreads on its elements. */
export interface WaitlistBindings {
  // Each is read when the markup renders, so the attributes follow the state.
  /** The address field. */
  emailInput: { 'type': 'email', 'name': 'email', 'autocomplete': 'email', 'required': true, 'aria-invalid': true | undefined, 'value': string, 'onInput': (event: Event) => void }
  /** The code field. */
  codeInput: { 'type': 'text', 'name': 'otp', 'inputmode': 'numeric', 'autocomplete': 'one-time-code', 'required': true, 'aria-invalid': true | undefined, 'value': string, 'onInput': (event: Event) => void }
  /** The launch-news box, unticked until the person ticks it. */
  launchNewsInput: { type: 'checkbox', name: 'launchNews', checked: boolean, onChange: (event: Event) => void }
  /** One question's field, by its key. */
  answerInput: (key: string) => { 'name': string, 'value': string, 'aria-invalid': true | undefined, 'onChange': (event: Event) => void }
}

export interface UseWaitlistReturn {
  /** `join` → `verify` → `status`. */
  step: Ref<WaitlistStep>
  /** The questions your backend asks beside the address, with their choices; empty while they load or when there are none. */
  questions: ComputedRef<WaitlistQuestions>
  email: Ref<string>
  /** The answers to your questions, by question. */
  answers: Record<string, string>
  /** Whether the launch-news box is ticked. */
  launchNews: Ref<boolean>
  /** The sign-in code the person types. */
  code: Ref<string>
  /** The friend's share code the visitor came through, shown so they can drop it. */
  ref: Ref<string | null>
  /** Forget the friend's share code: the join is then made without it. */
  dropReferral: () => void
  /** The person's standing once their code checked (or a status link was opened), live: `undefined` before that. */
  place: ComputedRef<WaitlistPlace | WaitlistStatusView | undefined>
  /**
   * The link a waiting person shares: `shareTo` on the page's own origin
   * (on the server, the request's own host, never a forwarded one), with
   * their code as `?ref=<shareCode>`, which a join there carries. `null`
   * until the place is a waiting one with a code.
   */
  shareLink: ComputedRef<string | null>
  /** `true` while a status token's place is first read. */
  isLoading: ComputedRef<boolean>
  /**
   * `true` once the page has looked for a status link: on mount with
   * `statusLink`, as only the browser reads the fragment, so the server
   * renders a wait; from the start without it.
   */
  linkChecked: Readonly<Ref<boolean>>
  /** `true` once `leave` took the person off the list, until a code checks or a status link is read again. */
  left: Readonly<Ref<boolean>>
  /** `true` once the code signed the person in instead: they hold a ticket, or the app is no longer in early access. */
  signedIn: Ref<boolean>
  /**
   * Ask for a code: the answers are checked and kept, the bot check passes,
   * and a code goes to the address → `verify`. Never rejects: a failure is
   * in `error`.
   */
  join: () => Promise<void>
  /**
   * Check the code → `status` with the person's place (the address is on the
   * list now). Resolves with the place, or `null` when the code failed (see
   * `error`, `invalid_input` on `otp` for a wrong or expired code) or signed
   * the person in. Never rejects.
   */
  verify: () => Promise<WaitlistPlace | null>
  /** Read the place behind a status link's token (the `/waitlist` page's fragment) → `status`. Live: it follows the list. */
  status: (token: string) => void
  /** Leave the list: the entry and the launch-news contact are removed → `join`. Never rejects. */
  leave: () => Promise<void>
  /** Back from `verify` to `join`. */
  back: () => void
  /** `true` while a step's call runs. */
  isPending: ComputedRef<boolean>
  /** Why the last step failed, or `null`. */
  error: Ref<BackendError | null>
  /** Seconds until a rate-limited step can be retried; `null` for any other failure. */
  retryAfter: Ref<number | null>
  /** The attributes and handlers for markup of your own. */
  bind: WaitlistBindings
}

/**
 * A join's source with the campaign it came from: the form's own, then the
 * campaign's `utm_source` and `utm_campaign` when the address carries
 * them, as `form:newsletter/launch`. A character the source takes no part
 * of becomes a dash, and the whole is cut to the longest source there is.
 *
 * @internal
 */
export function campaignSource(source: string, attribution: CampaignAttribution | undefined): string {
  const tags = [attribution?.source, attribution?.campaign].flatMap(tag => (tag ? [tag.replace(/[^\w.-]+/g, '-')] : []))
  return (tags.length > 0 ? `${source}:${tags.join('/')}` : source).slice(0, WAITLIST_SOURCE_MAX)
}

/**
 * The waitlist status token this tab keeps (`statusLink`), out of the
 * address: one key for every page and part that reads it.
 *
 * @internal
 */
export function keptStatusToken(): TabKeep {
  return tabKeep('nuxt-backend:waitlist')
}

/** The `?ref=` of the page address, read once. */
function referralFromAddress(route: ReturnType<typeof useRoute>): string | null {
  const value = route.query.ref
  const code = Array.isArray(value) ? value[0] : value
  return typeof code === 'string' && code.trim() ? code.trim() : null
}

/**
 * Join the waitlist, and read a place in it, on markup of your own: the
 * steps `<WaitlistForm>` runs. `join` checks your questions' answers and the
 * bot check, then asks for a sign-in code; `verify` checks the code (the
 * double opt-in) and answers the person's place; `status` follows a place by
 * its status link; `leave` removes the entry. Steps never reject: a failure
 * is in `error`, with `retryAfter` for a rate limit.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { step, bind, join, verify, place, error } = useWaitlist()
 * </script>
 * <template>
 *   <form v-if="step === 'join'" @submit.prevent="join">
 *     <input v-bind="bind.emailInput">
 *     <button>Join</button>
 *   </form>
 *   <form v-else-if="step === 'verify'" @submit.prevent="verify">
 *     <input v-bind="bind.codeInput">
 *     <button>Confirm</button>
 *   </form>
 *   <p v-else-if="place">You're #{{ place.position }} of {{ place.total }}</p>
 * </template>
 * ```
 */
export function useWaitlist(options: UseWaitlistOptions = {}): UseWaitlistReturn {
  const api = useBackendNamespace<WaitlistApiRefs>('waitlist', 'useWaitlist', options.api)
  const route = useRoute()
  const auth = useAuthSession()
  const activeLocale = useActiveLocale()
  const human = useHumanCheck()
  const { t } = useLabels('waitlist')
  const runJoin = api.joinWaitlist ? useAction(api.joinWaitlist) : null
  const runLeave = api.leaveWaitlist ? useMutation(api.leaveWaitlist) : null
  const { attribution } = useCampaign()
  /** The source a join records: the form's, with the campaign the address carries now unless `campaign` is off. */
  const sourceOf = (): string | undefined => {
    if (options.campaign === false) return options.source
    const withCampaign = campaignSource(options.source ?? SOURCE_FORM, attribution.value)
    return withCampaign === SOURCE_FORM && !options.source ? undefined : withCampaign
  }

  const step = ref<WaitlistStep>('join')
  const email = ref('')
  const answers = reactive<Record<string, string>>({})
  const launchNews = ref(false)
  const code = ref('')
  // The key the join answered: the code check carries it, so only this browser's join applies.
  let joinKey: string | undefined
  const ref_ = ref<string | null>(options.ref === undefined ? referralFromAddress(route) : options.ref)
  const signedIn = ref(false)
  const pending = ref(false)
  const error = ref<BackendError | null>(null)
  const retryAfter = ref<number | null>(null)
  const { run, clearError, refuse } = stepRunner({ pending, error, retryAfter })

  // The person's own standing: what the code's check showed, then the live
  // read behind their status token.
  const joined = shallowRef<WaitlistPlace | null>(null)
  const token = ref<string | null>(null)
  const live = api.waitlistStatus ? useLiveQuery(api.waitlistStatus, () => (token.value ? { token: token.value } : 'skip')) : absentQuery<WaitlistStatusView | null>()
  const place = computed(() => live.data.value ?? joined.value ?? undefined)
  const origin = usePageOrigin()
  const shareLink = computed(() => {
    const standing = place.value
    const code = standing?.status === 'waiting' ? standing.shareCode : ''
    if (!code) return null
    const to = toValue(options.shareTo) || route.path || '/'
    return `${origin}${to}${to.includes('?') ? '&' : '?'}ref=${encodeURIComponent(code)}`
  })
  const asked = api.getWaitlistQuestions ? useLiveQuery(api.getWaitlistQuestions, {}) : absentQuery<WaitlistQuestions>()

  // With `statusLink`, the status token this tab keeps, out of the address.
  const kept: TabKeep | null = options.statusLink ? keptStatusToken() : null
  const linkChecked = ref(!options.statusLink)
  const left = ref(false)

  const trimmed = () => email.value.trim()

  const join = async () => {
    clearError()
    const verdict = checkEmail(options.validateEmail, email.value)
    if (verdict !== true) return refuse(invalidInput('email', verdict))
    await run(async () => {
      if (!runJoin) throw new Error('[nuxt-backend] Joining needs `joinWaitlist` re-exported from setupWaitlist() in backend/waitlist.ts, or pass `{ api }` to useWaitlist().')
      const address = trimmed()
      const locale = activeLocale()
      const source = sourceOf()
      const filled = Object.fromEntries(Object.entries(answers).filter(([, answer]) => answer))
      const started = await runJoin({
        email: address,
        ...(Object.keys(filled).length ? { answers: filled } : {}),
        // The words the person saw beside the box are the words they agreed to.
        ...(launchNews.value ? { launchNews: true, launchNewsText: t('launchNews') } : {}),
        ...(source ? { source } : {}),
        ...(ref_.value ? { ref: ref_.value } : {}),
        ...(locale ? { locale } : {}),
        human: await human.token('waitlist', address),
      })
      joinKey = started?.join
      // The code is the sign-in code: a new address in early access gets one like anyone.
      await auth.sendOtp(address, 'sign-in', { locale })
      code.value = ''
      step.value = 'verify'
    })
  }

  const verify = async (): Promise<WaitlistPlace | null> => {
    let result: WaitlistPlace | null = null
    await run(async () => {
      try {
        await auth.signInWithOtp({ email: trimmed(), otp: code.value.trim(), ...(joinKey ? { waitlistJoin: joinKey } : {}), locale: activeLocale() })
      }
      catch (cause) {
        const failure = failureOf(cause)
        const waiting = (failure.data as { waitlist?: { position: number, total: number, token: string } }).waitlist
        if (failure.code !== 'forbidden' || failure.data.reason !== 'ticket_required' || failure.data.phase !== 'early-access') throw cause
        // The code checked: the address is on the list.
        token.value = waiting?.token ?? null
        if (token.value) kept?.keep(token.value)
        left.value = false
        result = { status: 'waiting', position: waiting?.position ?? null, total: waiting?.total ?? 0, friends: 0, cap: 0, shareCode: '', launchNews: launchNews.value, token: waiting?.token ?? '' }
        joined.value = result
        step.value = 'status'
        return
      }
      // A ticket, or an app that opened: the code signed the person in.
      signedIn.value = true
      await auth.session.value.refetch()
    })
    return result
  }

  const status = (statusToken: string) => {
    clearError()
    token.value = statusToken.trim() || null
    if (token.value) kept?.keep(token.value)
    left.value = false
    step.value = 'status'
  }

  if (options.statusLink) {
    // A status link's token leaves the address at once; a reload reads the one the tab keeps.
    const open = () => {
      const found = takeFragment() ?? kept?.read()
      if (found) status(found)
      linkChecked.value = true
    }
    onPageOpen(open)
  }

  const leave = async () => {
    await run(async () => {
      if (!runLeave || !token.value) throw new Error('[nuxt-backend] Leaving needs `leaveWaitlist` re-exported from setupWaitlist() in backend/waitlist.ts, and a place to leave.')
      await runLeave({ token: token.value })
      token.value = null
      kept?.drop()
      left.value = true
      joined.value = null
      code.value = ''
      step.value = 'join'
    })
  }

  const invalid = (field: string) => (error.value?.code === 'invalid_input' && error.value.data.field === field) || undefined

  return {
    step,
    questions: computed(() => asked.data.value ?? {}),
    email,
    answers,
    launchNews,
    code,
    ref: ref_,
    dropReferral: () => {
      ref_.value = null
    },
    place,
    shareLink,
    isLoading: computed(() => live.isLoading.value),
    linkChecked,
    left,
    signedIn,
    join,
    verify,
    status,
    leave,
    back: () => {
      clearError()
      code.value = ''
      step.value = 'join'
    },
    isPending: computed(() => pending.value || human.isPending.value),
    error,
    retryAfter,
    bind: {
      get emailInput() {
        return {
          'type': 'email' as const,
          'name': 'email' as const,
          'autocomplete': 'email' as const,
          'required': true as const,
          'aria-invalid': invalid('email'),
          'value': email.value,
          'onInput': (event: Event) => {
            email.value = (event.target as HTMLInputElement).value
          },
        }
      },
      get codeInput() {
        return {
          'type': 'text' as const,
          'name': 'otp' as const,
          'inputmode': 'numeric' as const,
          'autocomplete': 'one-time-code' as const,
          'required': true as const,
          'aria-invalid': invalid('otp'),
          'value': code.value,
          'onInput': (event: Event) => {
            code.value = (event.target as HTMLInputElement).value
          },
        }
      },
      get launchNewsInput() {
        return {
          type: 'checkbox' as const,
          name: 'launchNews' as const,
          checked: launchNews.value,
          onChange: (event: Event) => {
            launchNews.value = (event.target as HTMLInputElement).checked
          },
        }
      },
      answerInput: key => ({
        'name': key,
        'value': answers[key] ?? '',
        'aria-invalid': invalid(key),
        'onChange': (event: Event) => {
          answers[key] = (event.target as HTMLSelectElement).value
        },
      }),
    },
  }
}
