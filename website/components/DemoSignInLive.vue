<script setup lang="ts">
import { isSandboxIdentity, SANDBOX_IDENTITY_HELP } from '../utils/testEmail'

/**
 * The live half of ::demo-sign-in: useLoginFlow() with markup of the
 * site's parts, the way the page around it builds a custom form, against
 * this site's deployment. It renders only inside <DemoBlock>, once the
 * backend client has loaded. An account is a test identity
 * (<SandboxIdentities>, shared with the sign-in page) whose code shows up in
 * the dev inbox (<SandboxInbox>), so no real mailbox is involved; the
 * server admits nothing else (backend/auth.ts). The readout is what the
 * composable returns, as it changes. Signed in, it says as whom, with a key
 * to sign out. A browser without WebAuthn gets no passkey key and goes past
 * the passkey offer, as <AuthForm> does.
 */
const { user, isLoading, signOut } = useAuth()
const finished = ref(false)
const flow = useLoginFlow({
  validateEmail: value => isSandboxIdentity(value) || SANDBOX_IDENTITY_HELP,
  onSuccess: () => {
    finished.value = true
  },
})
const { step, email, otp, isPending, error, retryAfter } = flow

// The live part renders in the browser only, so `window` is there. The
// same test as <AuthForm>'s: a webview can name the API without having it.
const passkeys = typeof window.PublicKeyCredential === 'function'
watch(step, (value) => {
  if (value === 'passkey-offer' && !passkeys) void flow.skipPasskey()
})

/**
 * Who is signed in, once the flow is done or before it starts (the passkey
 * offer comes first, unless this browser cannot save one).
 */
const signedIn = computed(() => {
  if (!user.value) return null
  const done = finished.value || step.value === 'choose' || (step.value === 'passkey-offer' && !passkeys)
  return done ? user.value.email : null
})
/** The pane on show: one per step, the session read first, the signed-in view last. */
const view = computed(() => {
  if (isLoading.value) return 'loading'
  if (signedIn.value) return 'signed-in'
  if (step.value === 'choose' || step.value === 'request-code') return 'request'
  return step.value === 'verify-code' ? 'verify' : 'offer'
})
const readout = computed(() => ({ step: step.value, email: email.value, isPending: isPending.value, error: error.value, retryAfter: retryAfter.value }))

// One action at a time: the key that started it shows its spinner, and the
// others say they are unavailable (aria-disabled, never `disabled`, so focus
// stays) and do nothing until it is done. The flow's actions never reject,
// so the mark always clears.
type Action = 'code' | 'passkey' | 'verify' | 'save' | 'skip' | 'sign-out'
const running = ref<Action | null>(null)
const busy = computed(() => running.value !== null || isPending.value)
async function act(name: Action, action: () => Promise<unknown>) {
  if (busy.value) return
  running.value = name
  try {
    await action()
  }
  finally {
    running.value = null
  }
}
/** What a key binds: its spinner while its action runs, `aria-disabled` while another one does. */
function keyState(name: Action) {
  return { loading: running.value === name, ...(busy.value && running.value !== name ? { 'aria-disabled': 'true' as const } : {}) }
}

function pick(address: string) {
  email.value = address
  error.value = null
}

function anotherAddress() {
  if (!busy.value) flow.goTo('request-code')
}

// The flow goes back to its start before the session goes, so its last
// step (the passkey offer) never shows in between, and a second sign-in
// hands off again.
function leave() {
  return act('sign-out', async () => {
    finished.value = false
    flow.reset()
    try {
      await signOut()
    }
    catch { /* still signed in: the signed-in view and its key stay */ }
  })
}

// Each pane replaces the markup that held focus. When the reader was in the
// pane that goes (they pressed its key), focus moves to the new pane's
// first field, or its first key, so a keyboard or a screen reader lands
// where they act next, as in <AuthForm>. A pane without a control (the
// session being read) holds that over to the next one, unless the reader
// has moved on meanwhile; focus elsewhere on the page is left alone.
const root = useTemplateRef<HTMLElement>('root')
const pane = () => root.value?.querySelector<HTMLElement>('[data-pane]') ?? null
let carry = false
watch(view, () => {
  carry ||= pane()?.contains(document.activeElement) ?? false
}, { flush: 'pre' })
watch(view, () => {
  if (!carry) return
  const active = document.activeElement
  if (active && active !== document.body && !root.value?.contains(active)) {
    carry = false
    return
  }
  const next = pane()
  const target = next?.querySelector<HTMLElement>('input') ?? next?.querySelector<HTMLElement>('button')
  if (!target) return
  target.focus()
  carry = false
}, { flush: 'post' })
</script>

<template>
  <div
    ref="root"
    class="@container"
  >
    <div class="grid items-start gap-4 @xl:grid-cols-2">
      <p
        v-if="view === 'loading'"
        data-pane="loading"
        class="m-0 text-sm text-(--ink-dim)"
      >
        Reading your session…
      </p>

      <div
        v-else-if="view === 'signed-in'"
        data-pane="signed-in"
        class="grid gap-3"
      >
        <p class="m-0 flex items-center gap-2 text-sm font-semibold text-(--ink)">
          <Led tone="ok" />
          Signed in
        </p>
        <p class="m-0 font-mono text-xs break-all text-(--ink-dim)">
          {{ signedIn }}
        </p>
        <p class="m-0 text-sm leading-relaxed text-(--ink-dim)">
          The session belongs to the site, so the playground opens signed
          in too.
        </p>
        <div class="flex flex-wrap gap-2">
          <Key
            v-bind="keyState('sign-out')"
            @click="leave"
          >
            Sign out
          </Key>
        </div>
      </div>

      <form
        v-else-if="view === 'request'"
        data-pane="request"
        class="grid gap-3"
        novalidate
        @submit.prevent="act('code', flow.sendCode)"
      >
        <SandboxIdentities
          :model-value="email"
          @update:model-value="pick"
        />
        <LabField
          v-slot="{ id, describedby }"
          label="Email"
          :error="error?.code === 'invalid_input' ? error.message : null"
        >
          <input
            :id="id"
            v-model="email"
            class="field"
            type="email"
            autocomplete="email"
            :aria-describedby="describedby"
            :aria-invalid="error?.code === 'invalid_input' ? 'true' : undefined"
          >
        </LabField>
        <div class="flex flex-wrap gap-2">
          <Key
            type="submit"
            signal="go"
            v-bind="keyState('code')"
          >
            Email me a code
          </Key>
          <Key
            v-if="passkeys"
            v-bind="keyState('passkey')"
            @click="act('passkey', flow.signInWithPasskey)"
          >
            Use a passkey
          </Key>
        </div>
      </form>

      <form
        v-else-if="view === 'verify'"
        data-pane="verify"
        class="grid gap-3"
        novalidate
        @submit.prevent="act('verify', flow.verifyCode)"
      >
        <SandboxInbox
          :email="email"
          @fill="code => otp = code"
        />
        <LabField
          v-slot="{ id, describedby }"
          label="Code"
          :error="error?.code === 'invalid_input' ? error.message : null"
        >
          <input
            :id="id"
            v-model="otp"
            class="field font-mono tracking-[0.18em]"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            :aria-describedby="describedby"
            :aria-invalid="error?.code === 'invalid_input' ? 'true' : undefined"
          >
        </LabField>
        <div class="flex flex-wrap gap-2">
          <Key
            type="submit"
            signal="go"
            v-bind="keyState('verify')"
          >
            Sign in
          </Key>
          <Key
            v-bind="busy ? { 'aria-disabled': 'true' } : {}"
            @click="anotherAddress"
          >
            Use another address
          </Key>
        </div>
      </form>

      <div
        v-else
        data-pane="offer"
        class="grid gap-3"
      >
        <p class="m-0 text-sm leading-relaxed text-(--ink)">
          Signed in. Save a passkey on this device, so the next sign-in
          skips the code?
        </p>
        <div class="flex flex-wrap gap-2">
          <Key
            signal="go"
            v-bind="keyState('save')"
            @click="act('save', flow.addPasskey)"
          >
            Save a passkey
          </Key>
          <Key
            v-bind="keyState('skip')"
            @click="act('skip', flow.skipPasskey)"
          >
            Not now
          </Key>
        </div>
      </div>

      <StateReadout
        label="useLoginFlow()"
        :value="readout"
        :tone="error ? 'err' : 'neutral'"
      />

      <!-- The message says how long a rate limit asks to wait; the readout
           shows the same wait as `retryAfter`. -->
      <p
        v-if="error && error.code !== 'invalid_input' && !signedIn"
        role="alert"
        class="m-0 text-sm text-(--err) @xl:col-span-2"
      >
        {{ error.message }}
      </p>
    </div>
  </div>
</template>
