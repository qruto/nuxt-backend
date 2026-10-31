# Panels

A comic-strip maker built on [`nuxt-backend`](https://nuxt-backend.dev). People sign in with a code
or a passkey, buy credits, add a photo, and turn an idea into a three-panel strip a model draws.
They hear when it is ready, by email and in the app, and share it by a link anyone can open.

Panels is the app the [tutorial](https://nuxt-backend.dev/docs/start/tutorial) builds, part by
part, and the app the public demo runs in sandbox mode. It uses only the package's public APIs.

## Create it

```bash
npm create nuxt@latest my-panels -- -t gh:qruto/nuxt-backend/templates/panels
cd my-panels
npx nuxt-backend dev --anonymous
```

`--anonymous` runs the deployment on your machine, with no account. Open `/login` and sign in: with
no email provider connected yet, the code prints in the terminal. With pnpm, `.pnpmfile.mjs`
answers pnpm's build-script question and makes the backend components resolvable for Convex; npm,
Yarn and Bun ignore it.

## What is where

| File | What it does | Tutorial part |
|---|---|---|
| `backend/schema.ts` | The `strips` table, one row per strip, per workspace | 1 |
| `backend/strips.ts` | The strip functions: list, create, the photo, the drawing job, the share page | 1, 3, 4, 5 |
| `backend/billing.catalog.ts` | The credit meter, the Free and Studio plans, two packs | 2 |
| `backend/storage.ts` | Checked photo uploads and share links | 3, 5 |
| `backend/ai.ts`, `backend/admin.ts` | Moderation, content credentials and the Reports tab | 3, 4 |
| `backend/jobs.ts` | The generation queue, with a head start for Studio | 4 |
| `backend/email.ts`, `backend/notifications.ts` | The brand of every email, and the "strip ready" notification | 5 |
| `app/pages/strips/` | The list of strips, and one strip as it draws | 1, 3, 4, 5 |
| `app/pages/s/[token].vue` | A shared strip, for anyone with the link | 5 |
| `backend/routes.ts` | Panels' own paths, for the links the backend writes and for sign-in | |
| `backend/demo.ts`, `backend/crons.ts`, `app/pages/admin/demo.vue` | The public demo: canned ideas, the nightly reset, the admin tab that draws them | |
| `backend/auth.ts` | The public demo's accounts: generated sandbox addresses only | |
| `backend/strips.test.ts`, `test/app/`, `e2e/` | The backend, page and browser tests | 6 |

Every other file in `backend/` is what `npx nuxt-backend init` writes.

## Connect services

Each part of the tutorial names the account it needs, and each has a free tier or a sandbox. Copy
the names you need from `.env.example` into `.env.local`, then push them:

```bash
npx nuxt-backend env push
npx nuxt-backend billing sync   # the credit catalog, on Polar's sandbox
npx nuxt-backend email sync     # the email topics and the webhook
```

`npx nuxt-backend doctor` checks the whole setup and says what is missing.

## Test

```bash
npx vitest run                  # the backend and page tests, with no deployment
npx playwright test             # the paid path, against `npx nuxt-backend dev`
```

The browser run signs in with a code from the dev inbox and pays with Polar's test card, so it
needs the sandboxes above.

## Deploy

```bash
npx nuxt-backend deploy --sandbox
```

`--sandbox` runs the production deployment as a demo: every provider stays in its test mode, and
nobody is charged or mailed for real. There Panels holds itself to a public demo (`backend/demo.ts`):
accounts use generated sandbox addresses (`delivered+<label>@resend.dev`, `backend/auth.ts`); strips start from canned ideas, copied for free once an administrator draws them from the admin
console's Demo tab; an idea of one's own needs a passkey sign-in; share links are off; strips older
than a day go each night; and `spendLimit` in `backend/ai.ts` pauses AI for the rest of a costly day.
[Deploy a demo or staging app](https://nuxt-backend.dev/docs/ship/deploy/staging) lists the limits
a public demo needs. Deploy without `--sandbox`, on a project of its own, when you are ready to
charge real customers.
