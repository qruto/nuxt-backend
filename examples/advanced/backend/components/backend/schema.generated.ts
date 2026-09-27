// The packaged component schema — the auth tables, the billing / AI /
// webhook / email table groups, and the shared validators. Customize in ./schema.ts.
export {
  aiTables,
  authSchema,
  billingTables,
  emailTables,
  tables,
  vEntitlementBenefit,
  vEntitlementMeter,
  vGift,
  vPendingSpend,
  webhookTables,
} from 'nuxt-backend/component/schema'
