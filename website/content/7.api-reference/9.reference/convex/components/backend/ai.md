---
navigation: true
---

# convex/components/backend/ai

## Variables

### createRequest

```ts
const createRequest: RegisteredMutation<"public", {
  meterId?: string;
  name: string;
  userId: string;
  args: string;
  streamId: string;
  externalId: string;
  entityId: string;
  cost: number;
}, Promise<null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/ai.ts:25](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/ai.ts#L25)

***

### getByStream

```ts
const getByStream: RegisteredQuery<"public", {
  streamId: string;
}, Promise<
  | {
  meterId?: string;
  createdAt: number;
  name: string;
  userId: string;
  status: "reserved" | "settled" | "released";
  args: string;
  streamId: string;
  externalId: string;
  entityId: string;
  cost: number;
}
| null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/ai.ts:43](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/ai.ts#L43)

***

### markSettled

```ts
const markSettled: RegisteredMutation<"public", {
  streamId: string;
}, Promise<null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/ai.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/ai.ts#L57)

***

### markReleased

```ts
const markReleased: RegisteredMutation<"public", {
  streamId: string;
}, Promise<null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/ai.ts:70](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/ai.ts#L70)

***

### clear

```ts
const clear: RegisteredMutation<"public", {
  beforeMs?: number;
}, Promise<null>>;
```

Defined in: [nuxt-backend/src/convex/components/backend/ai.ts:91](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/ai.ts#L91)

Prune request plumbing older than `beforeMs` (rows are not a ledger).

Dev/test reset plumbing (`pnpm run db:reset`), but a registered component
function all the same: it stays on the `nuxt-backend/component/ai` surface
— the local-install scaffold re-exports it — rather than carrying an
internal tag that would strip it from the published declarations.
