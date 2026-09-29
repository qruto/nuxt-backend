<!-- nuxt-backend-start -->
## nuxt-backend

This app runs on [nuxt-backend](https://nuxt-backend.dev): a Nuxt module plus an all-in-one Convex
backend (passwordless auth, workspaces, billing with credits and gifts, email, webhooks, an agent
endpoint).

- `backend/` holds the Convex functions (`convex.json` points there). The scaffolded files
  re-export the package's setup; add your own functions beside them. Never edit
  `backend/_generated/`: `convex dev` rewrites it.
- The app imports them through `#backend/api` and `#backend/dataModel`. Composables such as
  `useAuth`, `useBilling`, `useCredits` and `useOrganization` are auto-imported.
- Names are neutral: auth, billing, email, backend. Keep provider names out of app code, labels and
  env var names.
- `npx nuxt-backend dev` runs Convex and Nuxt together, and `npx nuxt-backend doctor` checks the
  whole setup. `npx nuxt-backend env push` syncs `.env.local` to the deployment, and
  `npx nuxt-backend billing sync` turns `backend/billing.catalog.ts` into products.
- The deployment's env: `AUTH_SECRET` and `SITE_URL` are required, and `EMAIL_*` and
  `BILLING_*` are optional. `CONVEX_DEPLOYMENT` belongs to the Convex CLI: read it, never rename
  it.
- Docs for agents: https://nuxt-backend.dev/llms.txt. The `nuxt-backend` skill covers the same
  ground: `npx skills add https://nuxt-backend.dev -s nuxt-backend`.
- For Convex itself, `npx convex ai-files install` writes its guidelines, and the `convex` server in
  `.mcp.json` reads the deployment.
<!-- nuxt-backend-end -->
