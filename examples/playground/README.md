# Nuxt backend playground

The [nuxt-backend.dev playground](https://nuxt-backend.dev/playground) as a standalone Nuxt app:
live queries, pagination, file storage, SSR, the packaged SaaS pages, workspaces, billing, credits,
metered AI, email, webhooks, workflows, rate limiting and the agent endpoint, each on a page of its
own. It runs on a [Convex](https://convex.dev) deployment of yours.

```bash
npm create nuxt@latest my-playground -- -t gh:qruto/nuxt-backend/examples/playground
```

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

With pnpm, `.pnpmfile.mjs` approves the one build script this app has and makes the backend
components resolvable for Convex; npm, Yarn and Bun ignore it.

## Development Server

Start Convex and Nuxt on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

`dev` runs `nuxt-backend dev`. The first run logs you in to Convex, creates or attaches your dev
deployment, writes `CONVEX_DEPLOYMENT` to `.env.local` and provisions the deployment's env
(`AUTH_SECRET`, `SITE_URL`). Until then, `/playground` shows how to start it.

Sign in at `/login` with a sandbox identity, a generated `delivered+…@resend.dev` address: the
playground is a sandbox like the live one. With no email provider connected, the sign-in code
prints in the terminal that runs `dev`. Once one is connected (email stays in test mode), the code
shows up on the login page itself, as it does on the live playground.

## Connect services

The billing, credits and email pages show empty states until you connect those services. Copy the
names you need from `.env.example` into `.env.local`, then push them to the dev deployment:

```bash
npx nuxt-backend env push
```

`backend/billing.catalog.ts` holds the plans and credit packs the pages sell. Create them in your
billing sandbox, then load them into the deployment:

```bash
npx nuxt-backend billing sync          # creates the products, rewrites backend/billing.generated.ts
npx convex run billing:syncProducts    # loads them into the deployment
```

`npx nuxt-backend doctor` checks the whole setup and says what is missing.

## How this app is made

Most files here are copied from the website's playground, byte for byte, by the package
repository's `pnpm playground:sync`, and CI fails when the two drift apart. The app keeps the
site's flat layout (`pages/`, `components/`, `backend/` at the root) so every copied import still
resolves. `app.css` is the site's stylesheet with Tailwind's `@theme static` blocks written as
`:root`. The files written for this app are its config, the manifest, `app.vue`,
`app.config.ts`, `assets/reset.css`, the offline page, and a small stand-in for the one Nuxt UI
component the layout uses (`components/UColorModeImage.vue`).

Links from the pages into the documentation redirect to [nuxt-backend.dev](https://nuxt-backend.dev).

## StackBlitz

In StackBlitz, `.stackblitz/start.mjs` asks for a Convex development deploy key instead of logging
in, then starts `npm run dev` against that deployment. Sign-in checks the page origin against
`SITE_URL`, so set it to the preview's origin to sign in there:

```bash
npx convex env set SITE_URL https://<preview origin>
```
