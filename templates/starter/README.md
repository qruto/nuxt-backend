# Nuxt backend starter

A Nuxt app with [`nuxt-backend`](https://nuxt-backend.dev) installed: passwordless sign-in with
passkeys and email codes, workspaces with emailed invitations, subscriptions, prepaid credits and
gifts, and delivery-tracked email, all running on a [Convex](https://convex.dev) deployment of your
own. Every file in `backend/` is what `npx nuxt-backend init` generates, so the app has no custom
backend code yet.

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) and the
[nuxt-backend documentation](https://nuxt-backend.dev/docs/start) to learn more.

> [!NOTE]
> Until `0.2.0` is published, `nuxt-backend: latest` installs `0.1.0`, a throwaway test
> publish. Install the [preview build of `main`](https://nuxt-backend.dev/docs/start/templates#preview-builds-pkgprnew)
> over it: `npm install https://pkg.pr.new/qruto/nuxt-backend@main`.

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

With pnpm, `.pnpmfile.mjs` answers pnpm's build-script question (no dependency needs its script
here, so none runs) and makes the backend components resolvable for Convex; npm, Yarn and Bun
ignore it.

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

## Try everything first

Pick **Start without an account** when the first run asks, and the deployment runs on this machine.
Sign in with a test address such as `delivered+you@resend.dev`; its code prints in the terminal. Then
click through the pages the module mounts: `/login`, `/pricing`, `/settings` (workspace, plan and
credits), `/profile` and `/security`. Billing and email read `missing` until you connect the providers'
sandboxes below, and their pages show empty states until then.
[Develop on real sandboxes](https://nuxt-backend.dev/docs/develop/sandboxes) covers each provider's
test mode.

## Connect services

Email and billing are optional until you connect them. Copy the names you need from
`.env.example` into `.env.local`, then push them to the dev deployment:

```bash
npx nuxt-backend env push
```

`backend/billing.catalog.ts` is what `/pricing` sells. Once a Polar sandbox token is in `.env.local`,
push it to the provider's sandbox:

```bash
npx nuxt-backend billing sync   # creates the products, writes backend/billing.generated.ts, loads them into the deployment
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

`npx nuxt-backend deploy` takes production there from your machine in one command: it links the
production deployment, pushes its env, deploys the backend, syncs the billing catalog, registers
both webhooks, writes the app's env into the Vercel project and runs `doctor --prod`.

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fqruto%2Fnuxt-backend%2Ftree%2Fmain%2Ftemplates%2Fstarter&project-name=nuxt-backend-app&repository-name=nuxt-backend-app&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22convex%22%2C%22productSlug%22%3A%22convex%22%2C%22protocol%22%3A%22storage%22%7D%5D)

The button copies this app into your Git account, adds Convex through the Vercel Marketplace and
deploys it. `vercel.json` sets the build command, `npx nuxt-backend deploy --build`: it puts the
env the first push needs on the new production deployment, then ships the backend and the app
against it. The app starts on the providers' test modes; run `npx nuxt-backend deploy` from a clone
to make it live ([Start from the deploy template](https://nuxt-backend.dev/docs/ship/deploy/template)).

See [Deployment](https://nuxt-backend.dev/docs/ship/deploy) for the production env vars, and
the [Nuxt deployment documentation](https://nuxt.com/docs/getting-started/deployment) for hosts.
