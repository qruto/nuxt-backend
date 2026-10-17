---
title: CLI
description: npx nuxt-backend — init, dev, doctor, env push, billing sync and inbox, with every flag, every finding and each command's contract.
kind: reference
navigation:
  icon: i-lucide-terminal
---

`npx nuxt-backend <command>` ships with the package. Every command takes `--cwd <dir>` (default `.`, the project directory) and reads `.env` + `.env.local` from it. Deployment env **values** are never read — only names, via `npx convex env list` — with one exception: `billing sync` reads `BILLING_ENVIRONMENT`, the sandbox/production switch, to compare it with the environment it syncs. A value the CLI sets reaches `npx convex env set` on its stdin, never as an argument.

No command asks a question: every input is a flag, so a coding agent or a script can run each one unattended. The one exception is the first run of [`dev`](#dev) with no deployment configured, which hands the terminal to `convex dev` for the Convex login. Each command states its contract, which `--help` repeats at the end of its description:

- **Side effects:** what it may change. The classes are *reads only*, *writes project files*, *writes the dev deployment*, *writes a preview deployment*, *writes project env defaults*, *writes production* and *writes provider accounts*. A flag that changes them is named with them: `doctor` reads only, and writes with `--fix`.
- **`--json`:** stdout is one JSON document, and progress lines go to stderr. The shapes are stable (see [Stability](/docs/ship/releases/stability)); the wording of text output is not.
- **Exit codes:** `0` and `1` everywhere, plus `130` when `dev` is interrupted.

## `init`

Scaffold the backend files, `.env.example`, and the `nuxt.config` wiring. Re-run any time to restore missing files — existing scaffold files are never touched unless you `--force`.

```bash
npx nuxt-backend init
npx nuxt-backend init --force       # overwrite existing scaffold files
npx nuxt-backend init --no-agents   # skip AGENTS.md and .mcp.json
npx nuxt-backend init --json        # what it wrote, as one JSON document
```

**Side effects:** writes project files. **`--json`:** `{ created, agentsMd, mcpJson, appComponent, devScript, convexDependency, nuxtConfig, next }` — the files written, what happened to `AGENTS.md` and `.mcp.json` (`null` with `--no-agents`), the root component it changed, the `dev` script it set, the `convex` range it added, whether `nuxt.config` lists the module (`listed`) or you must add it (`manual`), and the commands to run next. **Exit codes:** `0` done — every file written or already in place; `1` a file could not be written.

| Flag | Effect |
|---|---|
| `--force` | Overwrite existing scaffold files (and `.env.example`), and replace the `nuxt-backend` section of `AGENTS.md`. |
| `--no-agents` | Skip `AGENTS.md` and `.mcp.json`. |
| `--json` | Print the outcome as one JSON document; progress goes to stderr. |

What it does: writes every missing file from the [scaffold](/docs/auth/setup#the-scaffolded-files) into the Convex functions directory (`convex.json`'s `functions`, else an existing `backend/` or `convex/`, else `backend/`), writes `.env.example`, and adds `'nuxt-backend'` to `modules` in `nuxt.config.{ts,js,mjs}` via magicast (or tells you to). It also touches two files outside the scaffold when they need it: `app/app.vue` (or `app.vue`) has its `<NuxtWelcome />` replaced with `<NuxtPage />` while it is still the `create nuxt` starter — a root component that already renders `<NuxtPage />` is left alone — and `convex` is added to `dependencies` in `package.json` when neither `dependencies` nor `devDependencies` lists it (a caret range on the installed copy, else this package's peer range; `npx convex dev` refuses to run until the app declares it, so install once more to link it). It points a plain `nuxt dev` script at [`nuxt-backend dev`](#dev), keeping its arguments, and does the same for the `convex dev --start "nuxt dev"` script that `nuxt-convex-module` can write; a `dev` script you wrote yourself stays as it is. For coding agents it writes a `nuxt-backend` section into `AGENTS.md`, between markers so a re-run never duplicates it, and adds the Convex MCP server to `.mcp.json`. It also says when a `CLAUDE.md` does not import `AGENTS.md`. See [Skills & agent files](/docs/agents/coding) for how it merges into files you already have. It ends with the next steps:

```text
Next steps:
  npm run dev                # the first run sets up your Convex dev deployment (log in
                             # when asked) and provisions its env, then runs Convex and Nuxt
  Sign in at /login — with no EMAIL_API_KEY yet, the OTP code prints in the same terminal.
```

An `npm install` line comes first when `init` just added `convex`, and `npx nuxt-backend dev` replaces `npm run dev` when your `dev` script is one of your own.

The dev server runs the same scaffold on startup (`backend.scaffold: 'auto'`); set `scaffold: false` when you prefer `init` explicitly.

## `dev`

Run Convex and Nuxt from one command. `init` points your `dev` script at it, so `npm run dev` runs it; arguments after `dev` go to `nuxt dev`.

```bash
npx nuxt-backend dev
npm run dev -- --port 3001   # through the dev script: arguments reach nuxt dev
```

**Side effects:** writes project files (the scaffold, when the functions directory is missing) and the dev deployment (its env, and the code `convex dev` pushes). **`--json`:** none — it runs until stopped, with Convex and Nuxt printing to the terminal. **Exit codes:** `0` Convex and Nuxt stopped cleanly; `1` no deployment could be set up, or Convex failed (its own exit code is passed on); `130` stopped by Ctrl-C, SIGINT or SIGTERM.

In order, it:

1. scaffolds `backend/` when the app has no functions directory yet, before Convex can create a `convex/` one;
2. runs `convex dev --once` when no deployment is configured. The login and project prompts happen here, and `CONVEX_DEPLOYMENT` lands in `.env.local`. On a new deployment this push fails on the env it has not been given yet, which is expected;
3. runs the [`env push`](#env-push) engine on a dev deployment it has not provisioned yet (`AUTH_SECRET` generated, `SITE_URL` defaulted, `NUXT_BACKEND_LOG_OTP=1`), once per deployment, with the same marker as `backend.autoEnv`;
4. hands over to `convex dev --start "nuxt dev …"`: the push succeeds, codegen runs before Nuxt starts, Convex's function logs (the dev OTP among them) print beside Nuxt's, and Ctrl-C stops both.

To stop it from another process, as a coding agent or a task runner does, send SIGINT or SIGTERM to its process (`kill -INT <pid>` or `kill <pid>`): it passes either on to Convex as SIGINT, which stops Nuxt and a local backend before exiting. On Windows, `taskkill /PID <pid> /T /F` ends the whole tree.

`convex dev --start "nuxt dev"` on its own is not enough: the scaffold requires `AUTH_SECRET` and `SITE_URL` on the deployment, Convex starts the command only after a successful push, and the values come from this package's env provisioning, so on a new deployment it waits forever. `doctor` warns about that script (`dev-script`) and `doctor --fix` replaces it.

Two terminals still work if you prefer them: `npx convex dev` in one, `nuxt dev` in the other, in either order.

## `doctor`

Check the project and the deployment configuration. Exit code `1` when any finding fails.

```bash
npx nuxt-backend doctor
npx nuxt-backend doctor --prod     # production posture
npx nuxt-backend doctor --fix      # restore missing scaffold files + push env
npx nuxt-backend doctor --json     # machine-readable { $schema, findings, summary }
npx nuxt-backend doctor --only billing,email
```

**Side effects:** reads only; with `--fix`, writes project files and the dev deployment (production with `--fix --prod`). **`--json`:** `{ $schema, findings, summary }`, described by [its JSON Schema](https://nuxt-backend.dev/schemas/doctor.json). **Exit codes:** `0` no finding failed (warnings allowed); `1` a finding failed, or the flags were refused.

| Flag | Effect |
|---|---|
| `--prod` | Production posture: checks the project's **production** deployment (`convex … --prod`), and the optional tier's designed degradations become failures (see below). Refuses a dev or preview `CONVEX_DEPLOY_KEY`, which would point the checks at that deployment. |
| `--fix` | Repair what doctor can: restore missing scaffold files (existing files untouched), point a `convex dev --start "nuxt dev"` dev script at `nuxt-backend dev`, then run the `env push` engine — never with `--force`. |
| `--json` | Machine-readable output, described by [its JSON Schema](https://nuxt-backend.dev/schemas/doctor.json). With `--fix`, the repair's progress goes to stderr, so stdout stays one JSON document. |
| `--only <services>` | Run only the checks of these services, comma-separated: `deployment`, `auth`, `workspaces`, `email`, `billing`, `agents`, `ai`, `scaffold`. The other checks never run, so their deployment reads, route probes and provider calls are skipped too. |

### Findings

Each finding has an `id`, the `service` it belongs to, a status (`pass` / `warn` / `fail`), a message, a fix hint, and a `docsUrl`: `https://nuxt-backend.dev/d/<id>`, which opens this table. Ids and services are stable (see [Stability](/docs/ship/releases/stability)); the wording is not.

| Id | Checks | Fails when |
|---|---|---|
| `backend-site-url` | A backend site URL is configured (module option, env, or derived from `CONVEX_DEPLOYMENT`) | — (warn) |
| `auth-secret` | `AUTH_SECRET` set on the deployment, or visible locally, ≥ 32 chars and not a placeholder | too short / placeholder |
| `site-url` | `SITE_URL` is a valid http(s) URL | malformed |
| `email-transport` / `email-webhook-secret` / `billing-access` / `billing-webhook-secret` | `EMAIL_API_KEY` / `EMAIL_WEBHOOK_SECRET` / `BILLING_ACCESS_TOKEN` / `BILLING_WEBHOOK_SECRET` visible locally or set on the deployment | — (warn; **fail with `--prod`**) |
| `convex-codegen` | `<functions dir>/_generated` exists | — (warn) |
| `dev-script` | Reported only when `scripts.dev` is `convex dev --start "nuxt dev"`, which never starts Nuxt on a new deployment (see [`dev`](#dev)) | — (warn; `--fix` points it at `nuxt-backend dev`) |
| `deployment-auth-secret`, `deployment-site-url` | The required pair is set on the deployment | not set |
| `deployment-email-api-key`, `deployment-email-from`, `deployment-email-test-mode`, `deployment-email-webhook-secret`, `deployment-billing-access-token`, `deployment-billing-webhook-secret`, `deployment-billing-environment` | Each optional var's presence on the deployment, with its designed degradation | — (warn; the key/secret ones **fail with `--prod`**) |
| `deployment-auth-trust-local-origins` | Dev-only: unset is healthy; set on a **non-dev** deployment is a leak | — (warn; **fail with `--prod`**) |
| `deployment-env` | The deployment env could be read at all | — (warn) |
| `env-defaults` | The project's preview env defaults hold `AUTH_SECRET` and `SITE_URL`, so a new preview deployment's first push goes through (see [Preview deployments](#preview-deployments)). Not checked with `--prod`, or when the defaults cannot be read (a deployment with no cloud project) | — (warn; `env push --defaults preview --site-url <url>` sets them) |
| `billing-meter-usage` | Every meter in `billing.catalog.ts` is funded by a plan or pack credit grant, or billed by a usage price | — (warn: an orphan meter) |
| `billing-organization` | `BILLING_ACCESS_TOKEN` is visible locally and the provider answers with it for the active `BILLING_ENVIRONMENT` | — (warn: expired / wrong environment — the cross-checks below are skipped) |
| `billing-multiple-subscriptions`, `billing-proration`, `billing-benefit-grace`, `billing-trial-abuse`, `billing-portal`, `billing-feature-benefits` | The provider organization's settings against the catalog: one active subscription per customer when several plans exist, plan-change proration, benefit revocation grace, trial-abuse prevention when a plan has a trial, portal plan changes, native feature-flag benefits | — (warn) |
| `billing-webhook-route`, `email-webhook-route`, `ai-stream-route` | An unsigned empty POST probe of `/billing/events`, `/email/events`, `/ai/stream` on the site URL: `404` = not mounted, `503` = mounted but fail-closed (secret unset), other 4xx = mounted (probe rejected as expected) | 404; `503` warns (**fails with `--prod`** for the billing and email routes; `ai-stream-route` stays a warning) |
| `function-contract` | Every function the composables bind to (`auth:getAuthUser`, `billing:getCredits`, `email:getEmailStatus`, …) exists in `npx convex function-spec` | any missing |
| `invitation-path` | `organization.invitationPath` (deployed `auth:authConfig`) matches `backend.pages.acceptInvitation` (nuxt.config) | mismatch — invitees would 404 |
| `agent-login-path` | `mcp.loginPath` (deployed `auth:authConfig`) matches `backend.pages.login` | mismatch — nobody can authorize an agent |
| `agent-consent-path` | `mcp.consentPath` (deployed `auth:authConfig`) matches `backend.pages.agentConsent` | mismatch — nobody can approve an agent |

The route probes, `function-contract` and the three path checks need the deployment (and `nuxt.config`) to be reachable and produce no finding otherwise; the `billing-*` catalog checks need a `billing.catalog.ts` and run the provider half only with a token visible locally. The same preflight (`backend-site-url` … `billing-webhook-secret`) runs on every dev-server start and in the [DevTools tab](/docs/start/develop/devtools); those two also report an `mcp` finding — the OAuth-protected agent endpoint's route, always `pass` — which `doctor` itself does not emit.

## `env push`

Sync the backend env contract from `.env(.local)` onto the Convex deployment. On **dev** deployments (`dev:`, `local:` and `anonymous:`) it also fills the required gaps so onboarding needs no manual `convex env set`.

```bash
npx nuxt-backend env push
npx nuxt-backend env push --dry-run
npx nuxt-backend env push --prod
npx nuxt-backend env push --json
npx nuxt-backend env push --force BILLING_WEBHOOK_SECRET   # replace a value already set
npx nuxt-backend env push --defaults preview --site-url https://preview.example.com
npx nuxt-backend env push --preview my-branch --site-url https://my-branch.example.app
```

**Side effects:** writes the dev deployment; with `--prod`, production; with `--preview`, a preview deployment; with `--defaults`, the project env defaults; with `--dry-run`, reads only. **`--json`:** `{ deployment, dev, results: [{ name, action, detail, outcome, error }], missingRequired }`, where `deployment` names what was written — `dev:<slug>`, `production`, `preview:<name>` or `defaults:<type>` — and values never appear. **Exit codes:** `0` every value set, or nothing to set; `1` refused, no deployment (or project defaults) reachable, a set failed, or required env is missing.

| Flag | Effect |
|---|---|
| `--prod` | Acts on the project's **production** deployment (`convex env set --prod`), whichever deployment `.env.local` names. Never invents values; fails (exit 1) on missing required env. Refuses to run when `CONVEX_DEPLOY_KEY` is a dev or preview key: the Convex CLI follows the key and ignores `--prod`, so the push would land there. |
| `--preview [name]` | Acts on the preview deployment of that name (`convex env set --preview-name`). Without a name, the branch the CI build names, read as `convex deploy` reads it (`VERCEL_GIT_COMMIT_REF` on Vercel, `HEAD` on Netlify, …). Generates `AUTH_SECRET` and starts mail in test mode and billing in the sandbox when nothing else sets them; `SITE_URL` comes from `--site-url` only. Refuses a deploy key that is not a preview key. |
| `--defaults preview\|dev` | Writes the project's env defaults for new deployments of that type (`convex env default set --type`) instead of a deployment: a generated `AUTH_SECRET`, `SITE_URL`, `EMAIL_TEST_MODE=true` and `BILLING_ENVIRONMENT=sandbox`. A default already set is kept unless `--force` names it. `prod` is refused, and so is a production deploy key. |
| `--site-url <url>` | The `SITE_URL` to write, replacing the one already set — giving it is asking for it. A preview's only source of one, and required for `--defaults preview` until the project has that default. |
| `--dry-run` | Print the plan without setting anything. |
| `--force <names>` | Replace values already set on the deployment with the local ones: a comma-separated list of names (case-insensitive), or `all` for every variable of the contract. Rotation has to be asked for — the plan reads deployment **names**, never values, so it cannot tell a rotated secret from an identical one. |
| `--json` | Machine-readable output. |

The plan, per variable of the contract (`AUTH_SECRET`, `SITE_URL`, `AUTH_TRUST_LOCAL_ORIGINS`, `EMAIL_*`, `BILLING_*`):

| Action | When |
|---|---|
| `skipped` | Already set on the deployment — left alone unless the name is in `--force` (a forced name with no local value is skipped too) |
| `set` (forward) | Present in `.env(.local)` — forwarded |
| `set` (update, `--force` only) | Already set and named in `--force` — replaced with the value from `.env(.local)`. The dev-only variable still never reaches a non-dev deployment |
| `set` (provision, dev only) | Required and missing: `AUTH_SECRET` is generated (32 random bytes, base64), `SITE_URL` defaults to `http://localhost:3000`; and `NUXT_BACKEND_LOG_OTP=1` is set while no `EMAIL_API_KEY` exists anywhere, so OTP codes print in the `convex dev` console |
| `MISSING` | Required and missing on a non-dev push — blocks with exit 1 |
| `unset` | Optional and absent — informational, with the designed degradation; dev-only vars are never forwarded to a non-dev deployment |

Each value reaches `npx convex env set NAME` on its stdin — never as an argument, where every process on the machine could read it (`ps`), and never through a shell. A set that fails is reported as the command, its exit code and the last lines of its stderr, never with the value. The deployment is whatever the Convex CLI targets — `CONVEX_DEPLOYMENT` from `.env.local` in dev, or a `CONVEX_DEPLOY_KEY` in the environment for production. Without a reachable deployment the command exits 1 (`run npx convex dev once, then push again`).

### Preview deployments

`npx convex deploy` with a preview deploy key creates the branch's preview deployment, runs your `--cmd`, then pushes the backend to it. That push fails unless `AUTH_SECRET` and `SITE_URL` are already there, and a new preview starts with nothing but the project's preview env defaults. Two ways to have them there, which work together:

- **In the build, exactly.** `--cmd` runs once the preview exists and before the push, so `env push --preview` can fill its env there, with the branch's own origin as `SITE_URL`. On Vercel, where `VERCEL_BRANCH_URL` is the branch's stable URL and the same build command also runs for production:

  ```bash
  npx convex deploy --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL \
    --cmd 'if [ "$VERCEL_ENV" = preview ]; then npx nuxt-backend env push --preview --site-url "https://$VERCEL_BRANCH_URL"; fi && npm run build'
  ```

- **Project env defaults, once.** Convex copies them into every preview it creates, so a preview built without that step can still push:

  ```bash
  npx nuxt-backend env push --defaults preview --site-url https://preview.example.com
  ```

`SITE_URL` is the one value neither will make up. Auth trusts only that origin, and a preview's origin is its own — one per branch on most hosts — so it has to come from the build, which knows it, or from you. A default cannot be exact for every preview: name a stable preview domain if your host gives you one, and let the build step replace it per branch. `doctor` reports the defaults as [`env-defaults`](#findings).

`--defaults dev` writes the same four values for new dev deployments, with `SITE_URL` at `http://localhost:3000` unless `--site-url` names another: useful when teammates start with a bare `npx convex dev`, which `nuxt-backend dev` makes unnecessary. Every deployment created from the defaults shares their one `AUTH_SECRET`.

::note
`backend.autoEnv` (default `true`) runs this same engine once per dev deployment on dev-server startup, stamped under `node_modules/.cache/nuxt-backend`, and watches `.env.local` for `CONVEX_DEPLOYMENT` to appear so the two first-run terminals can start in any order. It never touches non-dev deployments.
::

## `billing sync`

Push `backend/billing.catalog.ts` to the billing provider and write `backend/billing.generated.ts` — find-or-create, never deletes. It provisions the `/billing/events` webhook endpoint of the deployment it writes, stores the endpoint's secret there as `BILLING_WEBHOOK_SECRET` — never printed — and runs `billing:syncProducts` on that deployment so pricing renders at once. Sandbox writes the deployment `.env.local` names; `--env production` writes the production deployment.

**Side effects:** writes provider accounts, project files (`billing.generated.ts`), and the dev or production deployment. **Exit codes:** `0` synced, or a dry run — a webhook or product step that could not run is reported, not fatal; `1` refused or failed: an unknown environment, no access token or catalog, a deploy key for the other kind of deployment, a production webhook URL that cannot be derived, a webhook URL on a deployment other than the one written, a provider error, or a webhook secret that belongs on the deployment and could not be stored.

```bash
npx nuxt-backend billing sync
npx nuxt-backend billing sync --env production
npx nuxt-backend billing sync --dry-run
npx nuxt-backend billing sync --webhook off
npx nuxt-backend billing sync --adopt pro=prod_123,credits=meter_456
```

| Flag | Effect |
|---|---|
| `--env sandbox\|production` | Target environment (default `BILLING_ENVIRONMENT`, else `sandbox`). |
| `--dry-run` | Print the plan without creating anything. |
| `--webhook <url>` | Provision the webhook endpoint at this URL (default: `<site>/billing/events` of the deployment written; `off` to leave the webhook alone). |
| `--force` | Store the endpoint's secret even over a `BILLING_WEBHOOK_SECRET` the deployment already holds, and create a missing endpoint in that case. |
| `--adopt key=<id>[,…]` | Record existing provider objects under catalog keys — recorded as-is, benefits untouched. |
| `--json` | Print the outcome as one JSON document (`{ environment, dryRun, deployment, log, generated, webhook, products }`, the secret never in it); progress goes to stderr. |

Before it writes anything, it reads the deployment the Convex CLI will write — `npx convex function-spec` and `npx convex env list`, with `--prod` under production — and works from there:

- **Which deployment.** A deploy key decides it, whatever the flags say, so a key for the other kind of deployment is refused: a dev or preview `CONVEX_DEPLOY_KEY` under `--env production`; a production key (a legacy key without a type is one) or a project key under sandbox. The deployment written is named in the output and in `--json`'s `deployment`.
- **The webhook URL.** `--webhook <url>` as given; otherwise `<site>/billing/events`, where the site is `NUXT_PUBLIC_BACKEND_SITE_URL` when set (a custom domain) or the deployment's own `.convex.site` origin. Under production only the shell's site URL counts — `.env.local`'s is the dev deployment's. An endpoint on one deployment whose secret would land on another is refused. When the URL cannot be had — the deployment is unreadable, or it runs on this machine where the provider cannot deliver — a sandbox sync leaves the webhook alone and says why; a production sync stops and asks for `--webhook`.
- **The secret.** A new endpoint's secret is stored on the deployment. An endpoint that already exists has its secret stored when the deployment has none — the provider reports it on every read, so a secret one run could not store is stored by the next. A `BILLING_WEBHOOK_SECRET` the deployment already holds is kept unless `--force`; without it, an endpoint missing at the URL is not created, since its secret would replace that one. To set the secret by hand, `npx convex env set BILLING_WEBHOOK_SECRET` (with `--prod` for production) asks for it — never put it on the command line.
- **The products.** `billing:syncProducts` runs only when the deployment can load the catalog synced: it holds `BILLING_ACCESS_TOKEN`, and its `BILLING_ENVIRONMENT` (sandbox when unset) is the environment synced. Otherwise it is skipped with the command to run once that is set; a run that fails reports the deployment's error.

Needs `BILLING_ACCESS_TOKEN` (env or `.env.local`) and a `billing.catalog.ts`. The full semantics — tagging, drift, adopted products, the generated map — are in [Catalog as code](/docs/billing/catalog).

## `inbox`

Print the sign-in codes a dev deployment sent to one of the email provider's sandbox addresses: how a coding agent, or a script, finishes an email-code sign-in with no mailbox and no terminal to read. It reads the component's [sandbox inbox](/docs/email/sandbox-inbox) with `npx convex run --component backend email:inbox`, so the app need not publish it.

```bash
npx nuxt-backend inbox                               # delivered@resend.dev
npx nuxt-backend inbox delivered+agent@resend.dev --json
```

**Side effects:** reads only. **`--json`:** `{ address, deployment, messages: [{ from, subject, receivedAt, code }], code }` — the mail of the last hour, newest first, and the newest message's six-digit code (`null` when there is none). Message bodies are never printed. **Exit codes:** `0` the inbox was read, even when empty; `1` refused, or the read failed.

| Flag | Effect |
|---|---|
| `[address]` | The sandbox address to read: `delivered@resend.dev` (the default), or `delivered+<label>@resend.dev`. Any other address is refused — only these have an inbox. |
| `--json` | Print the inbox as one JSON document. |
| `--prod` | Refused: the inbox is read on dev deployments only. |

It reads dev-class deployments only (`dev:`, `local:` and `anonymous:`) and refuses everything else: `--prod`, a `CONVEX_DEPLOY_KEY` for anything but a dev deployment (the Convex CLI would follow it), a `CONVEX_DEPLOYMENT` of another kind, and a self-hosted deployment, which does not say what it is. The deployment keeps mail only in test mode, the default, and only for sandbox addresses — with `EMAIL_TEST_MODE=false` the inbox is empty. With no email provider key, sign-in to a sandbox address still works: the code lands in the inbox.
