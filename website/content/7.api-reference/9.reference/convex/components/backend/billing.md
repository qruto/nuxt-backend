---
navigation: true
---

# convex/components/backend/billing

## Variables

### getByUser

```ts
const getByUser: RegisteredQuery<"public", {
  userId: string;
}, Promise<
  | {
  customerId: string | null;
  activeProductIds: string[];
  benefits: {
     metadata?: Record<string, string | number | boolean>;
     type: string;
     id: string;
     benefitId: string;
  }[];
  meters: {
     meterId: string;
     consumedUnits: number;
     creditedUnits: number;
     balance: number;
  }[];
}
| null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/billing.ts:33](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/billing.ts#L33)

The current user's cached entitlement state, or `null` if never synced.

***

### upsert

```ts
const upsert: RegisteredMutation<"public", {
  customerId?: string;
  userId: string;
  activeProductIds: string[];
  benefits: {
     metadata?: Record<string, string | number | boolean>;
     type: string;
     id: string;
     benefitId: string;
  }[];
  meters: {
     meterId: string;
     consumedUnits: number;
     creditedUnits: number;
     balance: number;
  }[];
}, Promise<null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/billing.ts:67](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/billing.ts#L67)

Upsert a user's entitlement cache (called after a Polar sync). Freshly
synced provider state does not know about in-flight local reservations, so
still-active `pendingSpends` are re-subtracted — otherwise a webhook-driven
refresh landing between `debit` and the event's ingestion would resurrect
balance that is being spent. Invariant: cache = last provider state − active
reservations.

***

### debit

```ts
const debit: RegisteredMutation<"public", {
  userId: string;
  meterId: string;
  amount: number;
  externalId: string;
}, Promise<
  | {
  ok: boolean;
  balance: number;
  reason: "no-row";
}
  | {
  ok: boolean;
  balance: number;
  reason: "no-meter";
}
  | {
  ok: boolean;
  balance: number;
  reason?: undefined;
}
  | {
  ok: boolean;
  balance: number;
  reason: "insufficient";
}>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/billing.ts:111](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/billing.ts#L111)

Atomically reserve credits against the cached balance (reserve → run →
settle). Convex mutations are serializable, so two concurrent spends of the
same entity serialize here — the second sees the decremented balance.
Re-reserving an already-pending `externalId` succeeds idempotently.

`reason` distinguishes a genuinely insufficient balance from a cache that
has never synced (`no-row`) or lacks the meter (`no-meter`) — callers
refresh-and-retry those instead of failing the spend.

***

### settle

```ts
const settle: RegisteredMutation<"public", {
  userId: string;
  externalId: string;
}, Promise<null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/billing.ts:156](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/billing.ts#L156)

Drop a reservation after its provider event ingested — balance stays spent.

***

### release

```ts
const release: RegisteredMutation<"public", {
  userId: string;
  externalId: string;
}, Promise<null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/billing.ts:177](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/billing.ts#L177)

Undo a reservation whose flow failed before ingestion: re-credit the meter
and drop the entry. A failed run never consumes credits.

***

### credit

```ts
const credit: RegisteredMutation<"public", {
  userId: string;
  meterId: string;
  amount: number;
}, Promise<null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/billing.ts:210](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/billing.ts#L210)

Optimistically re-credit a meter after a refund event ingested (sum meters
only — see `refundCredits`). The next provider sync overwrites with truth.

***

### getBenefitMetadata

```ts
const getBenefitMetadata: RegisteredQuery<"public", {
  benefitIds: string[];
}, Promise<{
  benefitId: string;
  metadata: Record<string, string | number | boolean>;
  updatedAt: number;
}[]>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/billing.ts:232](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/billing.ts#L232)

Read the live-metadata snapshot for a set of benefits (feature gating join).

***

### upsertBenefitMetadata

```ts
const upsertBenefitMetadata: RegisteredMutation<"public", {
  entries: {
     metadata: Record<string, string | number | boolean>;
     benefitId: string;
  }[];
}, Promise<null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/billing.ts:253](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/billing.ts#L253)

Upsert benefit-metadata snapshots (post-sync, or from a benefit.updated webhook).

***

### clear

```ts
const clear: RegisteredMutation<"public", {
}, Promise<null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/billing.ts:285](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/billing.ts#L285)

Wipe the entitlement cache — derived data that resyncs from the billing
provider, so this is safe for test/dev resets (`pnpm run db:reset`) and never
loses source truth.

Reset plumbing, but a registered component function all the same: it stays
on the `nuxt-backend/component/billing` surface — the local-install
scaffold re-exports it — rather than carrying an internal tag that would
strip it from the published declarations.

***

### userByCustomer

```ts
const userByCustomer: RegisteredQuery<"public", {
  customerId: string;
}, Promise<string | null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/billing.ts:297](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/billing.ts#L297)

Resolve a billing-provider customer id back to its auth user id (used by webhooks).
