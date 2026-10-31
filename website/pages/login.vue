<script setup lang="ts">
import { isSandboxIdentity, SANDBOX_IDENTITY_HELP } from '../utils/testEmail'

// Standalone full-screen page: no layout, and no Docus chrome (the docs
// header/footer render from app.vue, so they must be disabled via meta too).
//
// This app page shadows the module's built-in /login route (the module
// detects it and skips its own) — the whole flow is the packaged <AuthForm>;
// the site adds only its nameplate and the sandbox: a generated identity
// (<SandboxIdentities>, remembered on this device), and its sign-in code
// read from the dev inbox (<SandboxInbox>).
definePageMeta({ layout: false, header: false, footer: false })

function validateEmail(value: string): boolean | string {
  // The server's canSignIn admits the same addresses (backend/auth.ts).
  return isSandboxIdentity(value) || SANDBOX_IDENTITY_HELP
}

// Back where the page guard sent the visitor from, when that is a page
// of this site; the playground otherwise.
function done() {
  return navigateTo(resolveAuthRedirect(useRoute().query.redirect, '/playground'))
}

// What the slots hand over is the whole login flow; this helper uses two refs of it.
type Flow = { email: { value: string }, error: { value: unknown } }

function fillIdentity(flow: Flow, address: string) {
  flow.email.value = address
  flow.error.value = null
}
</script>

<template>
  <main class="pg-shell bk-depth grid min-h-dvh place-items-center px-4 py-8">
    <div class="plaque w-full max-w-[26rem] p-6 [&_[data-auth=form]]:max-w-none">
      <AuthForm
        title="Sign in"
        :validate-email="validateEmail"
        @success="done"
      >
        <template #header="flow">
          <div class="grid gap-4">
            <Nameplate sub="access" />
            <EngravedTitle
              as="h1"
              text="Sign in"
              size="sm"
              class="font-display text-2xl leading-tight font-bold"
            />
            <SandboxIdentities
              :model-value="flow.email.value"
              @update:model-value="address => fillIdentity(flow, address)"
            />
          </div>
        </template>
        <template #footer="flow">
          <SandboxInbox
            v-if="flow.step.value === 'verify-code'"
            :email="flow.email.value"
            @fill="code => flow.otp.value = code"
          />
        </template>
      </AuthForm>
    </div>
  </main>
</template>
