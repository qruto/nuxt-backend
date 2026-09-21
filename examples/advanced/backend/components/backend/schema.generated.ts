// The packaged component schema — the auth tables, the billing / AI /
// webhook table groups, and the shared validators. Customize in ./schema.ts.
export {
  aiTables,
  authSchema,
  billingTables,
  tables,
  vEntitlementBenefit,
  vEntitlementMeter,
  vGift,
  vPendingSpend,
  webhookTables,
} from 'nuxt-backend/component/schema'
