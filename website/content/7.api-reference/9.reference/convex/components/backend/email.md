---
navigation: true
---

# convex/components/backend/email

## Variables

### send

```ts
const send: RegisteredMutation<"public", {
  headers?: {
     value: string;
     name: string;
  }[];
  html?: string;
  text?: string;
  subject?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string[];
  template?: {
     variables?: Record<string, string | number>;
     id: string;
  };
  to: string | string[];
}, Promise<EmailId | null>>;
```

Defined in: [src/convex/components/backend/email.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/email.ts#L39)

Enqueue a transactional email through the nested Resend component.

Exposed as a `public` component function so the parent app (e.g. the auth
flows, or `setupEmail`) can call it via `components.backend.email.send`.
Component functions are only reachable through the parent — never directly by
browser clients.

***

### status

```ts
const status: RegisteredQuery<"public", {
  emailId: string;
}, Promise<EmailStatus | null>>;
```

Defined in: [src/convex/components/backend/email.ts:81](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/email.ts#L81)

Delivery status for a sent email (waiting → queued → sent → delivered/bounced/…).

***

### get

```ts
const get: RegisteredQuery<"public", {
  emailId: string;
}, Promise<
  | {
  from: string;
  to: string[];
  subject?: string;
  replyTo: string[];
  headers?: {
     name: string;
     value: string;
  }[];
  status:   | "sent"
     | "delivered"
     | "delivery_delayed"
     | "bounced"
     | "failed"
     | "waiting"
     | "queued"
     | "cancelled";
  errorMessage?: string;
  bounced?: boolean;
  complained: boolean;
  failed?: boolean;
  deliveryDelayed?: boolean;
  opened?: boolean;
  clicked?: boolean;
  resendId?: string;
  finalizedAt: number;
  createdAt: number;
  html?: string;
  text?: string;
  template?: {
     variables?: Record<string, string | number>;
     id: string;
  };
}
| null>>;
```

Defined in: [src/convex/components/backend/email.ts:89](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/email.ts#L89)

Full stored email record (recipients, subject, status, timestamps, …).

***

### cancel

```ts
const cancel: RegisteredMutation<"public", {
  emailId: string;
}, Promise<null>>;
```

Defined in: [src/convex/components/backend/email.ts:97](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/email.ts#L97)

Cancel a not-yet-sent email (no-op once Resend has sent it).

***

### cleanup

```ts
const cleanup: RegisteredMutation<"public", {
  olderThanMs?: number;
}, Promise<null>>;
```

Defined in: [src/convex/components/backend/email.ts:113](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/email.ts#L113)

Prune finalized emails (delivered, bounced, cancelled, failed …) older than
`olderThanMs` (the nested provider's default: 7 days) from the provider
component's tables. Scheduled rather than run inline — the provider batches
and re-schedules itself until the backlog is gone — so this returns at once
and is safe to call from a cron. Exposed as `components.backend.email.cleanup`.

***

### cleanupAbandoned

```ts
const cleanupAbandoned: RegisteredMutation<"public", {
  olderThanMs?: number;
}, Promise<null>>;
```

Defined in: [src/convex/components/backend/email.ts:128](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/email.ts#L128)

Prune abandoned emails — created more than `olderThanMs` ago (the nested
provider's default: 30 days) and never finalized, e.g. because a delivery
webhook never arrived. Scheduled like [cleanup](#cleanup). Exposed as
`components.backend.email.cleanupAbandoned`.

***

### handleWebhook

```ts
const handleWebhook: RegisteredAction<"public", {
  body: string;
  headers: Record<string, string>;
}, Promise<
  | {
  status: number;
  body: string;
  type?: undefined;
}
  | {
  status: number;
  body: string;
  type: string | undefined;
}>>;
```

Defined in: [src/convex/components/backend/email.ts:168](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/email.ts#L168)

Verify and process an email-provider event webhook. The mounting app routes
its public `/email/events` endpoint here (via `setupEmail().webhookHandler`),
passing the raw body + headers.

Fail-closed: no `EMAIL_WEBHOOK_SECRET` → `503` (never silent acceptance);
signature invalid across the rotation accept-list (comma-separated secrets)
→ `403`; verified → the 8 status-tracked `email.*` types update the email's
delivery record (making `useEmailStatus()` reactive) and everything answers
`202` with the parsed type so the app layer can dispatch its handlers.
svix enforces a ±5 minute timestamp tolerance, so stale replays fail
verification.
