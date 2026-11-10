<script setup lang="ts">
import { watch } from 'vue'
import { navigateTo } from '#imports'
import { useAuthTitle } from '../components/auth/auth-form'
import PageFrame from '../components/shell/PageFrame.vue'
import type { LoginStep } from '../composables/use-login-flow'
import { useReturnPath } from '../composables/use-return-path'
import { useAuthSession } from '../utils/auth-session'

/**
 * The ready-made sign-in page, registered by the module at `/login` (module
 * option `pages.login`). Renders `<AuthForm>`; after sign-in it returns the
 * visitor to the `?redirect=` path the page guard appended when it names a
 * page of this site other than this one, else to `redirects.afterSignIn`
 * (`/` by default): {@link useReturnPath}. The way there replaces this page
 * in the history, so Back never returns to a sign-in that is done.
 * Already-signed-in visitors are sent along immediately.
 */
defineOptions({ name: 'BackendLoginPage' })

const { isAuthenticated, isLoading } = useAuthSession()
// The same heading <AuthForm> renders (as the page's h1), as the document title.
const title = useAuthTitle()

const back = useReturnPath()
const destination = () => back.value

// One way out, taken once: the session watcher and the form's `success` can
// both fire for the same sign-in.
let leaving = false
function leave(to: string): void {
  if (leaving) return
  leaving = true
  void navigateTo(to, { replace: true })
}

// A sign-in made with the form is the form's to finish: after a code it
// offers to save a passkey, and only its `success` sends the visitor on.
let signingIn = false
const step = (value: LoginStep) => {
  signingIn = value !== 'choose'
}

// Signed in already (or the session resolves while the page is open, e.g.
// in another tab) — nothing to do here.
watch([isAuthenticated, isLoading], ([authed, loading]) => {
  if (!authed || loading || signingIn) return
  leave(destination())
}, { immediate: true })
</script>

<template>
  <PageFrame
    page="login"
    family="auth"
    :title="title"
    :heading="false"
    noindex
  >
    <AuthForm
      @step="step"
      @success="leave(destination())"
    />
  </PageFrame>
</template>
