<script setup lang="ts">
import {
  isDeliveredTestEmail,
  normalizeTestEmail,
  TEST_EMAIL_HELP,
  TEST_EMAIL_PRESETS,
} from '../utils/testEmail'

// Standalone full-screen page: no layout, and no Docus chrome (the docs
// header/footer render from app.vue, so they must be disabled via meta too).
//
// This app page shadows the module's built-in /login route (the module
// detects it and skips its own) — the whole flow is the packaged <AuthForm>;
// the site adds only the Strata shell, the Resend test-inbox gate, and the
// preset chips.
definePageMeta({ layout: false, header: false, footer: false })

function validateEmail(value: string): boolean | string {
  // Sign-up only accepts Resend's delivered inbox (alias-aware) — the OTP
  // must actually arrive.
  return isDeliveredTestEmail(value) || TEST_EMAIL_HELP
}

function done() {
  const redirect = useRoute().query.redirect
  const target = typeof redirect === 'string' && /^\/(?!\/)/.test(redirect) ? redirect : '/playground'
  return navigateTo(target)
}

function usePreset(flow: { email: { value: string }, error: { value: string | null } }, preset: string) {
  flow.email.value = preset
  flow.error.value = null
}
</script>

<template>
  <main class="page bk-depth">
    <div class="auth-card">
      <AuthForm
        title="Sign in"
        :validate-email="validateEmail"
        @success="done"
      >
        <template #header="flow">
          <div class="auth-brand">
            <span
              class="mark"
              aria-hidden="true"
            >▲</span>
            <div class="auth-brandtext">
              <span class="auth-name">Nuxt backend</span>
              <span class="auth-sub">access</span>
            </div>
          </div>
          <div class="testmail">
            <span class="lab-label">test inbox</span>
            <div class="presets">
              <button
                v-for="preset in TEST_EMAIL_PRESETS"
                :key="preset"
                type="button"
                class="preset"
                :class="{ on: normalizeTestEmail(flow.email.value) === preset }"
                @click="usePreset(flow, preset)"
              >
                {{ preset }}
              </button>
            </div>
            <p class="hint">
              The public playground only delivers to Resend's test inbox — pick
              a preset (swap <code>you</code> for your own label), then continue
              with an email code.
            </p>
          </div>
        </template>
      </AuthForm>
    </div>
  </main>
</template>

<style scoped>
.page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 2rem 1rem;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font);
}

.auth-card {
  width: min(26rem, 100%);
  padding: 1.6rem;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--raise-lg);
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 1.1rem;
}

.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: var(--r-sm);
  background: var(--accent);
  color: var(--on-accent);
  font-size: 0.9rem;
  box-shadow: var(--raise-accent);
}

.auth-brandtext {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.auth-name {
  font-family: var(--display);
  font-weight: 700;
}

.auth-sub {
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.testmail {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.preset {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--edge);
  border-radius: 999px;
  background: transparent;
  color: var(--ink-dim);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.preset.on {
  border-color: var(--accent);
  color: var(--accent);
}

/* The packaged form inherits the depth palette via .bk-depth; only sizing
   tweaks live here. */
.auth-card :deep([data-auth='form']) {
  max-width: none;
}

.auth-card :deep([data-auth='title']) {
  font-family: var(--display);
  font-size: 1.35rem;
}
</style>
