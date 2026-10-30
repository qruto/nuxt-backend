<!-- nuxt-backend-start -->
## nuxt-backend

This app runs on [nuxt-backend](https://nuxt-backend.dev): a Nuxt module plus an all-in-one Convex
backend (passwordless auth, workspaces, billing with credits and gifts, email, webhooks, an agent
endpoint).

- Read `node_modules/nuxt-backend/skills/nuxt-backend/SKILL.md` first: the core skill, with the rules
  every change follows and the names that don't exist. The package ships its agent skills, so those
  copies match the installed version; the website documents the latest release.
- Each task has a task skill beside the core in `node_modules/nuxt-backend/skills/`:
  `nuxt-backend-auth`, `nuxt-backend-billing`, `nuxt-backend-growth`, `nuxt-backend-email`,
  `nuxt-backend-ai`, `nuxt-backend-data`, `nuxt-backend-ui`, `nuxt-backend-ship` and
  `nuxt-backend-upgrade`. `init` copies them all into `.agents/skills/` too.
- After an upgrade, `npx nuxt-backend init --agents` refreshes those copies and rewrites this
  section for the new version.
- `backend/` holds the Convex functions (`convex.json` points there). The scaffolded files
  re-export the package's setup; add your own functions beside them. Never edit
  `backend/_generated/`: `convex dev` rewrites it.
- The app imports them through `#backend/api` and `#backend/dataModel`. Composables such as
  `useAuth`, `useBilling`, `useCredits` and `useWorkspace` are auto-imported.
- Names are neutral: auth, billing, email, backend. Keep provider names out of app code, labels and
  env var names.
- `npx nuxt-backend dev` runs Convex and Nuxt together, and `npx nuxt-backend doctor` checks the
  whole setup. `npx nuxt-backend env push` syncs `.env.local` to the deployment, and
  `npx nuxt-backend billing sync` turns `backend/billing.catalog.ts` into products.
- The CLI never prompts: every input is a flag, `--json` prints one JSON document, and `--help`
  ends with what a command may change. To sign in on a dev deployment without a mailbox, request a
  code for `delivered+agent@resend.dev` and read it with
  `npx nuxt-backend inbox delivered+agent@resend.dev --json`.
- The deployment's env: `AUTH_SECRET` and `SITE_URL` are required, and `EMAIL_*` and
  `BILLING_*` are optional. `CONVEX_DEPLOYMENT` belongs to the Convex CLI: read it, never rename
  it.
- Docs for agents: https://nuxt-backend.dev/llms.txt.
- The `nuxt-backend` server in `.mcp.json` (`npx nuxt-backend mcp`) answers `doctor`, `status`, the
  env names, the docs, and the Convex, billing, email and hosting consoles. A tool that writes asks
  first.
- For Convex itself, `npx convex ai-files install` writes its guidelines.
<!-- nuxt-backend-end -->
