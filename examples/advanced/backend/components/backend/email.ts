// The packaged email module (send / status / cancel + webhook over the
// nested provider component). Inline the implementation to customize it.
export {
  cancel,
  cleanup,
  cleanupAbandoned,
  expireSandboxMessage,
  get,
  handleWebhook,
  inbox,
  send,
  status,
} from 'nuxt-backend/component/email'
