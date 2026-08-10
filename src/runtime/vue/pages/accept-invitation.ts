import { defineComponent, h } from 'vue'
import { AcceptInvitation } from '../components/accept-invitation'

/**
 * The ready-made invitation accept page, registered by the module at
 * `/accept-invitation` (module option `pages.acceptInvitation`) behind the `auth`
 * route middleware — so an emailed accept link signs the invitee in (or up)
 * and lands here. Apps wanting a custom page set `pages.acceptInvitation: false` and
 * build their own with the `AcceptInvitation` component.
 */
export default defineComponent({
  name: 'AcceptInvitationPage',
  setup() {
    return () => h('main', { 'data-invitation': 'page' }, [h(AcceptInvitation)])
  },
})
