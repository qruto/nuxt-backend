import { defineComponent, h, watch } from 'vue'
import { navigateTo, useRoute } from '#imports'
import { AuthForm } from '../components/auth-form'
import { useAuth } from '../composables/use-auth'

/** Path-only redirect targets — never protocol-relative or absolute URLs. */
function safeRedirect(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : null
}

/**
 * The ready-made sign-in page, registered by the module at `/login` (module
 * option `pages.login`). Renders `<AuthForm>`; after sign-in it returns the
 * visitor to the sanitized `?redirect=` path the auth middleware appended, or
 * `/`. Already-signed-in visitors are sent along immediately.
 */
export default defineComponent({
  name: 'BackendLoginPage',
  setup() {
    const route = useRoute()
    const { isAuthenticated, isLoading } = useAuth()

    const destination = () => safeRedirect(route.query.redirect) ?? '/'

    // Signed in already (or the session resolves while the page is open, e.g.
    // in another tab) — nothing to do here.
    watch([isAuthenticated, isLoading], ([authed, loading]) => {
      if (authed && !loading) void navigateTo(destination())
    }, { immediate: true })

    return () => h('main', { 'data-auth': 'page' }, [
      h(AuthForm, { onSuccess: () => { void navigateTo(destination()) } }),
    ])
  },
})
