import { defineComponent, h, watch } from 'vue'
import { navigateTo, useHead, useRoute, useRuntimeConfig } from '#imports'
import { agentAuthorizationUrl, publishedAuthRoute } from '../utils/agent-authorization'
import { AuthForm, resolveAuthTitle } from '../components/auth-form'
import type { LoginStep } from '../composables/use-login-flow'
import { useAuth } from '../composables/use-auth'
import { useBackendConfig } from '../composables/use-backend-config'

/**
 * Path-only redirect targets — never protocol-relative or absolute URLs.
 * Exported for tests.
 *
 * @internal
 */
export function safeRedirect(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : null
}

/**
 * The ready-made sign-in page, registered by the module at `/login` (module
 * option `pages.login`). Renders `<AuthForm>`; after sign-in it returns the
 * visitor to the sanitized `?redirect=` path the auth middleware appended, or
 * `/`. Already-signed-in visitors are sent along immediately.
 *
 * When an agent's authorization brought the person here, `<AuthForm>` resumes
 * it on sign-in, and a visitor who is signed in already is sent straight on.
 */
export default defineComponent({
  name: 'BackendLoginPage',
  setup() {
    const route = useRoute()
    const { isAuthenticated, isLoading } = useAuth()
    // The same heading <AuthForm> renders, as the document title.
    useHead({ title: resolveAuthTitle(useBackendConfig()) })

    const authRoute = publishedAuthRoute(useRuntimeConfig())
    const destination = () => safeRedirect(route.query.redirect) ?? '/'

    // One way out, taken once: the session watcher and the form's `success`
    // can both fire for the same sign-in.
    let leaving = false
    const leave = (to: string, external = false) => {
      if (leaving) return
      leaving = true
      void navigateTo(to, { external })
    }

    // A sign-in made with the form is the form's to finish: after a code it
    // offers to save a passkey, and only its `success` sends the visitor on.
    let signingIn = false

    // Signed in already (or the session resolves while the page is open, e.g.
    // in another tab) — nothing to do here.
    watch([isAuthenticated, isLoading], ([authed, loading]) => {
      if (!authed || loading || signingIn) return
      const resume = agentAuthorizationUrl(new URLSearchParams(route.query as Record<string, string>).toString(), authRoute)
      leave(resume ?? destination(), Boolean(resume))
    }, { immediate: true })

    return () => h('main', { 'data-auth': 'page' }, [
      h(AuthForm, {
        onStep: (step: LoginStep) => { signingIn = step !== 'choose' },
        onSuccess: () => leave(destination()),
      }),
    ])
  },
})
