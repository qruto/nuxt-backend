<script setup lang="ts">
import { watch } from 'vue'
import { resolveAuthRedirect } from 'nuxt-convex-module/better-auth/client'
import { navigateTo, useRoute, useRuntimeConfig } from '#imports'
import { useAuthTitle } from '../components/auth/auth-form'
import PageFrame from '../components/shell/PageFrame.vue'
import type { LoginStep } from '../composables/use-login-flow'
import { useAuthSession } from '../utils/auth-session'

/**
 * The ready-made sign-in page, registered by the module at `/login` (module
 * option `pages.login`). Renders `<AuthForm>`; after sign-in it returns the
 * visitor to the `?redirect=` path the page guard appended when it names a
 * page of this site, else to `redirects.afterSignIn` (`/` by default).
 * Already-signed-in visitors are sent along immediately.
 */
defineOptions({ name: 'BackendLoginPage' })

const route = useRoute()
const { isAuthenticated, isLoading } = useAuthSession()
// The same heading <AuthForm> renders (as the page's h1), as the document title.
const title = useAuthTitle()

const runtimeConfig = useRuntimeConfig()
const afterSignIn = (runtimeConfig.public.backend as { redirects?: { afterSignIn?: string } } | undefined)?.redirects?.afterSignIn ?? '/'
const destination = () => resolveAuthRedirect(route.query.redirect, afterSignIn)

// One way out, taken once: the session watcher and the form's `success` can
// both fire for the same sign-in.
let leaving = false
function leave(to: string): void {
  if (leaving) return
  leaving = true
  void navigateTo(to)
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
