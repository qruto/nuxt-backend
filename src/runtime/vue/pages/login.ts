import { defineComponent, h, watch } from 'vue'
import { navigateTo, useHead, useRoute, useRuntimeConfig } from '#imports'
import { agentAuthorizationUrl, publishedAuthRoute } from '../utils/agent-authorization'
import { AuthForm, resolveAuthTitle } from '../components/auth-form'
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

    // Signed in already (or the session resolves while the page is open, e.g.
    // in another tab) — nothing to do here.
    watch([isAuthenticated, isLoading], ([authed, loading]) => {
      if (!authed || loading) return
      const resume = agentAuthorizationUrl(new URLSearchParams(route.query as Record<string, string>).toString(), authRoute)
      void navigateTo(resume ?? destination(), { external: Boolean(resume) })
    }, { immediate: true })

    return () => h('main', { 'data-auth': 'page' }, [
      h(AuthForm, { onSuccess: () => { void navigateTo(destination()) } }),
    ])
  },
})
