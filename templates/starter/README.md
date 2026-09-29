# Nuxt backend starter

A Nuxt app with [`nuxt-backend`](https://nuxt-backend.dev) installed: passwordless sign-in with
passkeys and email codes, workspaces with emailed invitations, subscriptions, prepaid credits and
gifts, and delivery-tracked email, all running on a [Convex](https://convex.dev) deployment of your
own. Every file in `backend/` is what `npx nuxt-backend init` generates, so the app has no custom
backend code yet.

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) and the
[nuxt-backend documentation](https://nuxt-backend.dev/getting-started/introduction) to learn more.

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
(`AUTH_SECRET`, `SITE_URL`); then Convex and Nuxt run side by side in that terminal.

Open `/login` and sign in. With no email provider configured yet, the one-time code prints in the
same terminal. Until the first run writes `backend/_generated`, the `#backend/*` imports are
typed `any`.

## Connect services

Email and billing are optional until you connect them. Copy the names you need from
`.env.example` into `.env.local`, then push them to the dev deployment:

```bash
npx nuxt-backend env push
```

To sell something, fill in `backend/billing.catalog.ts`, then:

```bash
npx nuxt-backend billing sync          # creates the products, writes backend/billing.generated.ts
npx convex run billing:syncProducts    # loads them into the deployment
```

`npx nuxt-backend doctor` checks the whole setup and says what is missing.

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

A production deploy pushes `backend/` to your production deployment and builds the app against
it, in one command on your host (with a production `CONVEX_DEPLOY_KEY` in its environment):

```bash
npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL
```

See [Deployment](https://nuxt-backend.dev/production/deployment) for the production env vars, and
the [Nuxt deployment documentation](https://nuxt.com/docs/getting-started/deployment) for hosts.
