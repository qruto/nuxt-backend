// The packaged email module (send / status / cancel + webhook over the
// nested provider component). Inline the implementation to customize it.
export {
  cancel,
  get,
  handleWebhook,
  send,
  status,
} from 'nuxt-backend/component/email'
