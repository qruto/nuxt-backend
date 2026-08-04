<script setup lang="ts">
import {
  isDeliveredTestEmail,
  normalizeTestEmail,
  TEST_EMAIL_HELP,
  TEST_EMAIL_PRESETS,
} from '../utils/testEmail'

// Standalone full-screen page: no layout, and no Docus chrome (the docs
// header/footer render from app.vue, so they must be disabled via meta too).
definePageMeta({ layout: false, header: false, footer: false })

// The whole passwordless state machine (steps, guards, sequencing) comes from
// the package; this page only supplies the Strata markup and the playground's
// Resend-test-inbox email gate.
const {
  step, name, email, otp, pending, error, emailValid,
  signInWithPasskey, sendCode, verifyCode,
  addPasskey: addPasskeyToCurrentAccount, skipPasskey, goTo,
} = useLoginFlow({
  // Sign-up only accepts Resend's delivered inbox (alias-aware) — the OTP must arrive.
  validateEmail: value => isDeliveredTestEmail(value) || TEST_EMAIL_HELP,
  onSuccess: () => navigateTo('/playground'),
})

// Default to the aliased Resend test inbox: the playground only accepts
// `delivered@resend.dev`, so a personal address autofilled by the browser would
// always be rejected. The `+you` alias avoids everyone sharing one account
// (and its 5/min OTP limit) — swap `you` for your own label. A non-empty value
// also keeps browser autofill from injecting a saved address over it.
email.value = TEST_EMAIL_PRESETS[1]

function trimmedEmail() {
  return normalizeTestEmail(email.value)
}
function useTestEmail(preset: string) {
  email.value = preset
  error.value = null
}
function startEmailFlow() {
  goTo('request-code')
}
</script>

<template>
  <main class="page">
    <div class="auth-card">
      <div class="auth-brand">
        <span class="mark">
          <svg
            class="mark-glyph"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 4 19 8.5 12 13 5 8.5Z"
              fill="#fff"
            />
            <path
              d="M5 11.7 12 16 19 11.7"
              stroke="#fff"
              stroke-width="1.9"
              stroke-linejoin="round"
              stroke-linecap="round"
              opacity="0.78"
            />
            <path
              d="M5 14.9 12 19.2 19 14.9"
              stroke="#fff"
              stroke-width="1.9"
              stroke-linejoin="round"
              stroke-linecap="round"
              opacity="0.5"
            />
          </svg>
        </span>
        <div class="auth-brandtext">
          <span class="auth-name">Nuxt backend</span>
          <span class="auth-sub">access</span>
        </div>
      </div>

      <div class="auth-body">
        <h1>Sign in</h1>
        <p class="muted">
          Use a passkey or an email code to enter the playground.
        </p>

        <section v-if="step === 'choose'">
          <button
            type="button"
            class="primary"
            :disabled="pending"
            @click="signInWithPasskey"
          >
            {{ pending ? 'Waiting…' : 'Sign in with passkey' }}
          </button>
          <p class="choosehint">
            Returning? Picks a passkey already saved on this device.
          </p>
          <div class="divider">
            <span>or</span>
          </div>
          <button
            type="button"
            :disabled="pending"
            @click="startEmailFlow"
          >
            Continue with email code
          </button>
          <p class="choosehint">
            New here? Get an email code, then add a passkey once you're in.
          </p>
        </section>

        <form
          v-else-if="step === 'request-code'"
          @submit.prevent="sendCode"
        >
          <h2>Email code</h2>
          <label>Name <span class="hint">for new accounts</span><input
            v-model="name"
            type="text"
            name="display-name"
            autocomplete="off"
          ></label>
          <!-- Non-semantic name + autocomplete=off: Chrome ignores `off` alone on
               email-shaped fields, and a saved personal gmail would fail the
               Resend-only allowlist. The prefilled test inbox does the rest —
               autofill never overwrites a non-empty field. -->
          <label>Email<input
            v-model="email"
            type="email"
            name="test-inbox"
            autocomplete="off"
            spellcheck="false"
            required
          ></label>
          <div class="testmail">
            <div class="presets">
              <button
                v-for="p in TEST_EMAIL_PRESETS"
                :key="p"
                type="button"
                class="preset"
                :class="{ on: trimmedEmail() === p }"
                @click="useTestEmail(p)"
              >
                {{ p }}
              </button>
            </div>
            <p
              v-if="email && !emailValid"
              class="badmail"
            >
              Use <code>delivered@resend.dev</code> — pick one above or add a <code>+label</code>.
            </p>
            <p
              v-else
              class="okmail"
            >
              Delivered inbox only — add <code>+label</code> for a distinct account.
            </p>
          </div>
          <button
            type="submit"
            class="primary"
            :disabled="pending || !emailValid"
          >
            {{ pending ? 'Sending…' : 'Email me a code' }}
          </button>
          <button
            type="button"
            class="link"
            :disabled="pending"
            @click="step = 'choose'"
          >
            Back
          </button>
        </form>

        <form
          v-else-if="step === 'verify-code'"
          @submit.prevent="verifyCode"
        >
          <p class="muted">
            We sent a verification code to <strong>{{ email }}</strong> via the
            backend component's email module. Without <code>EMAIL_API_KEY</code>
            set, the code is logged to the Convex console instead.
          </p>
          <label>Verification code<input
            v-model="otp"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            required
          ></label>
          <button
            type="submit"
            class="primary"
            :disabled="pending"
          >
            {{ pending ? 'Verifying…' : 'Verify' }}
          </button>
          <button
            type="button"
            class="link"
            :disabled="pending"
            @click="step = 'request-code'"
          >
            Use a different email
          </button>
        </form>

        <section v-else-if="step === 'add-passkey'">
          <h2>Add a passkey</h2>
          <p class="muted">
            Save a passkey on this device to sign in instantly next time.
          </p>
          <button
            type="button"
            class="primary"
            :disabled="pending"
            @click="addPasskeyToCurrentAccount"
          >
            {{ pending ? 'Adding…' : 'Add passkey' }}
          </button>
          <button
            type="button"
            class="link"
            :disabled="pending"
            @click="skipPasskey"
          >
            Skip for now
          </button>
        </section>

        <p
          v-if="error"
          class="error"
        >
          {{ error }}
        </p>
      </div>

      <LiveTrace
        class="auth-trace"
        :height="48"
        :speed="10"
      />
    </div>
  </main>
</template>

<style scoped>
.page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  /* Standalone page (`layout: false`): reproduce the playground shell's canvas
     (see `.pg-shell` in app.css) so the login keeps the depth-design look. */
  color: var(--ink);
  background-color: var(--bg);
  background-image:
    radial-gradient(900px 520px at 94% -12%, var(--accent-dim), transparent 60%);
  background-attachment: fixed;
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.page ::selection { background: var(--accent); color: var(--on-accent); }
.auth-card {
  width: 100%;
  max-width: 392px;
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
  box-shadow: var(--raise-lg);
}

.auth-brand { display: flex; align-items: center; gap: 0.7rem; padding: 1.1rem 1.25rem 0; }
.mark {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  background: var(--accent); box-shadow: var(--raise-accent);
  display: flex; align-items: center; justify-content: center;
}
.mark-glyph { width: 21px; height: 21px; }
.auth-brandtext { display: flex; flex-direction: column; line-height: 1.1; }
.auth-name { font-family: var(--display); font-size: 1.05rem; font-weight: 700; }
.auth-sub { font-family: var(--mono); font-size: 0.58rem; font-weight: 600; letter-spacing: 0.16em; color: var(--ink-faint); text-transform: uppercase; }

.auth-body { padding: 1.4rem 1.35rem 1.5rem; display: flex; flex-direction: column; gap: 0.95rem; }
section, form { display: flex; flex-direction: column; gap: 0.65rem; }
label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8rem; font-weight: 500; color: var(--ink-dim); }
.hint { color: var(--ink-faint); font-weight: 400; }
input {
  padding: 0.6rem 0.75rem; border: 0; border-radius: var(--r-sm);
  background: var(--sink); color: var(--ink); font: inherit; font-size: 0.95rem;
  box-shadow: var(--inset-sm); transition: box-shadow var(--transition);
}
input:focus { outline: none; box-shadow: var(--inset-sm), 0 0 0 2px var(--accent); }

button {
  padding: 0.65rem 0.9rem; cursor: pointer; border: 0; border-radius: var(--r-sm);
  background: var(--surface); color: var(--ink); font: inherit; font-weight: 600;
  box-shadow: var(--raise-sm);
  transition: background var(--transition), color var(--transition), box-shadow var(--transition), transform var(--press) var(--ease-out);
}
button:hover:not(:disabled) { color: var(--accent); }
button:active:not(:disabled) { box-shadow: var(--inset-sm); transform: translateY(0.5px); }
button.primary { background: var(--accent); color: var(--on-accent); box-shadow: var(--raise-accent); }
button.primary:hover:not(:disabled) { background: var(--accent-press); color: var(--on-accent); }
button.link { background: none; box-shadow: none; color: var(--ink-dim); padding: 0.15rem 0; font-weight: 500; font-size: 0.88rem; }
button.link:hover { color: var(--accent); }
button:disabled { opacity: 0.5; cursor: not-allowed; }

.divider { display: flex; align-items: center; text-align: center; margin: 0.1rem 0; }
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--edge-hi); }
.divider span { padding: 0 0.6rem; color: var(--ink-faint); font-size: 0.68rem; font-family: var(--mono); letter-spacing: 0.08em; text-transform: uppercase; }

.muted { color: var(--ink-dim); font-size: 0.85rem; margin: 0; line-height: 1.5; }
.error { color: var(--err); padding: 0.6rem 0.75rem; background: var(--err-dim); border-radius: var(--r-sm); font-size: 0.82rem; }

/* Resend test-inbox presets + allowlist hint */
.testmail { display: flex; flex-direction: column; gap: 0.45rem; margin: -0.15rem 0 0.05rem; }
.presets { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.preset {
  font-family: var(--mono); font-size: 0.66rem; font-weight: 500;
  padding: 0.24rem 0.55rem; border-radius: 999px;
  background: var(--sink); color: var(--ink-dim);
  box-shadow: var(--inset-sm);
}
.preset:hover:not(:disabled) { color: var(--accent); }
.preset.on { color: var(--accent-soft); background: var(--surface); box-shadow: var(--raise-sm); }
.okmail, .badmail { font-size: 0.7rem; margin: 0; line-height: 1.45; }
.okmail { color: var(--ink-faint); }
.badmail { color: var(--warn); }
.okmail code, .badmail code { font-family: var(--mono); color: var(--accent-soft); font-size: 0.92em; }
.choosehint { font-size: 0.7rem; color: var(--ink-faint); margin: -0.35rem 0 0.15rem; line-height: 1.4; }
h1 { margin: 0; font-family: var(--display); font-size: 1.9rem; font-weight: 700; letter-spacing: -0.02em; }
h2 { margin: 0; font-family: var(--display); font-size: 1.25rem; font-weight: 600; }

.auth-trace { margin: 0 1rem 1rem; }
</style>
