---
title: CLI
description: "npx nuxt-backend: init, dev, doctor, status, env push, env rotate, billing sync, email sync, inbox, upgrade, deploy, analyze, eject and mcp, with every flag and each command's contract."
kind: reference
capability: tools
status: changing
changedBy: OPS2
source: src/cli/contract.ts
navigation:
  title: Commands
  icon: i-lucide-terminal
---

`npx nuxt-backend <command>` ships with the package and covers an app's life from the terminal: scaffold it, run it, check it, push its env, sync its billing catalog and email topics, read its dev inbox, upgrade it and deploy it. Each section below gives one command's flags and its contract: what it may change, what `--json` prints, and what each exit code means.

Every command takes `--cwd <dir>` (default `.`, the project directory) and reads `.env` and `.env.local` from it. A deployment's env is read by name, through `npx convex env list`. A **value** is read only where a name alone says too little, and never printed: `BACKEND_ENVIRONMENT` (by `status`, `doctor --prod` and `billing sync`), and the origin of production's `SITE_URL` under `--prod`. A value the CLI sets reaches `npx convex env set` on its stdin, never as an argument.

No command needs an answer: every input is a flag, so a coding agent or a script runs each one unattended. A few ask at a terminal, and only there: the first run of [`dev`](#dev) with no deployment configured, which hands the terminal to `convex dev` for the Convex login, and `doctor --fix`, which asks for the first administrator's address on a deployment with none and asks before each change it makes at a provider (`--yes` answers for it). An empty answer skips it, and `--json` or a run without a terminal never asks. Each command states its contract, which `--help` repeats at the end of its description:

- **Side effects:** what it may change. The classes are *reads only*, *writes project files*, *writes the dev deployment*, *writes a preview deployment*, *writes project env defaults*, *writes production* and *writes provider accounts*. A flag that changes them is named with them: `doctor` reads only, and writes with `--fix`.
- **`--json`:** stdout is one JSON document, and progress lines go to stderr. The shapes are stable (see [Stability](/docs/ship/releases/stability)); the wording of text output is not.
- **Exit codes:** `0` and `1` everywhere, plus `130` when `dev` is interrupted.

## What changes

`0.2.0` builds the CLI around the providers' real sandboxes and one variable, `BACKEND_ENVIRONMENT`, which `dev` provisions and `env push` derives from the deployment in place of five mode variables. The billing simulator and simulated email events are gone, and six commands arrive:

| Command | In `0.2.0` | Unit |
|---|---|---|
| `init` | Writes the slimmer scaffold, and one `nuxt-backend` server into `.mcp.json`. `npx nuxt module add nuxt-backend` runs the same setup on install | SIMPLIFY, DEVMCP, SETUP |
| `dev` | `--anonymous` starts on an account-free local deployment on every OS | SETUP |
| `doctor` | Checks the twelve capabilities, and names the app components and composables that share a name with the package's. `--fix` also applies the provider settings the billing findings recommend, and runs `email sync` | DEFER, OPS2 |
| `status` | Twelve capabilities, each `live`, `test`, `missing` or `failing` | OPS2, PROD |
| `env rotate` | New: rotates the auth secret, the session signing keys and the webhook secrets with no downtime | OPS2 |
| `email sync` | New: creates the email topics, segments, contact properties and the webhook subscription at Resend, as `billing sync` does for the catalog | PREFS |
| `upgrade` | Repairs the scaffold and runs the package's data migrations, and rewrites no code | RESET |
| `deploy` | New: takes production from nothing to a passing `doctor --prod` in one command | PROD |
| `analyze` | New: measures the Convex bundle and the Nuxt bundles, with the package's share | ANALYZE |
| `eject` | New: copies a part's, a page's or an email's source into the app, with a version stamp | UIKIT |
| `mcp` | New: the developer MCP server for your coding agent | DEVMCP |

Each command's contract line (**Side effects**, **`--json`** and **Exit codes**) is generated from the code as it stands, and keeps the previous behaviour until the command's unit lands. A flag that leaves says so in its row.

## `init`

Scaffold the backend files, `.env.example`, the `nuxt.config` wiring and the files your coding agent reads. Run it again any time to restore missing files: it never touches an existing scaffold file unless you pass `--force`.

`npx nuxt module add nuxt-backend` is the whole install: the module's install step runs this same setup once, at an interactive terminal, asks whether to write the agent files, and installs `convex` with the project's package manager. `init` is for restoring files, and for a project where the package was added another way, or without a terminal (CI, a coding agent).

```bash
npx nuxt-backend init
npx nuxt-backend init --force       # overwrite existing scaffold files
npx nuxt-backend init --agents      # rewrite only the agent files, for the installed version
npx nuxt-backend init --no-agents   # skip AGENTS.md, .mcp.json and the agent skills
npx nuxt-backend init --json        # what it wrote, as one JSON document
```

<!-- generated:cli-init (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** writes project files. **`--json`:** `{ created, agentsMd, mcpJson, skills, appComponent, devScript, convexDependency, mcpSdkDependency, nuxtConfig, next }`, or `{ agentsMd, mcpJson, skills, mcpSdkDependency }` with `--agents`, where `skills` is `{ installed, refreshed, removed, stale }`, each a list of skill names; progress goes to stderr. **Exit codes:** `0` done: every file written, or already in place; `1` a file could not be written, or AGENTS.md was refused: its nuxt-backend markers don't pair up.

<!-- /generated:cli-init -->

| Flag | Effect |
|---|---|
| `--force` | Overwrite existing scaffold files (and `.env.example`), replace the `nuxt-backend` section of `AGENTS.md`, and replace the agent skill copies another version wrote, as `--agents` does. |
| `--agents` | Rewrite only the agent files, for the version the app has installed: the `nuxt-backend` section of `AGENTS.md` (the text around it stays), the `nuxt-backend` server in `.mcp.json`, and the agent skills in `.agents/skills/`, each replaced whole. Nothing else is scaffolded, and `--json` prints `{ agentsMd, mcpJson, skills }` alone. Run it after [`upgrade`](#upgrade), whose `next` lists `init --agents` when the agent files name another version; `doctor`'s [`agent-files`](/docs/reference/cli/diagnostics#agent-files) finding says when. |
| `--no-agents` | Skip `AGENTS.md`, `.mcp.json` and the agent skills. |
| `--json` | Print the outcome as one JSON document; progress goes to stderr. |

What it writes, each file only when it needs it:

- **The scaffold**, every missing file, into the Convex functions directory: `convex.json`'s `functions`, else an existing `backend/` or `convex/`, else `backend/`. With SIMPLIFY the scaffold holds only the files the package calls into: no empty `aggregates.ts`, `search.ts`, `crons.ts` or `migrations.ts`, and no demo functions. [Project files](/docs/reference/configuration/project-files) lists each file.
- **`.env.example`**, grouped by capability.
- **`nuxt.config.{ts,js,mjs}`**: `'nuxt-backend'` added to `modules` with magicast, or a message that tells you to add it.
- **`app/app.vue`** (or `app.vue`): its `<NuxtWelcome />` replaced with `<NuxtPage />` while it is still the `create nuxt` starter. A root component that already renders `<NuxtPage />` stays as it is.
- **`package.json`**: `convex` added to `dependencies` when neither `dependencies` nor `devDependencies` lists it, as a caret range on the installed copy, else this package's peer range. `npx convex dev` refuses to run until the app declares it, so install once more to link it. A plain `nuxt dev` script, or the `convex dev --start "nuxt dev"` script `nuxt-convex-module` can write, now runs [`nuxt-backend dev`](#dev) with its arguments kept. A `dev` script you wrote yourself stays as it is.
- **The agent files**: a `nuxt-backend` section in `AGENTS.md`, between markers so a second run never duplicates it; one `nuxt-backend` server in `.mcp.json`, which runs [`nuxt-backend mcp`](#mcp), beside the servers the file already holds; and a copy of the package's agent skills in `.agents/skills/`, linked from `.claude/skills/` in a project that uses Claude Code.

The `AGENTS.md` section names the version the app has installed, and points the agent at the package's skills, the core first: `node_modules/nuxt-backend/skills/nuxt-backend/`. A skill copy another version wrote, or one of a skill the installed version no longer ships, stays until `init --agents` or `init --force` replaces or removes it. A skill the project's `skills-lock.json` lists belongs to the [skills CLI](https://skills.sh), and `init` leaves it there. `skills` in `--json` lists, by name, the skills it `installed`, `refreshed` and `removed`, and the `stale` ones it left.

`init` never rewrites an `AGENTS.md` whose markers don't pair up (a start marker without its end, or two sections): it says so and exits with `1`. It also says when a `CLAUDE.md` does not import `AGENTS.md`. [Agent files](/docs/develop/agents/agent-files) shows how it merges into files you already have.

It ends with the next steps:

```text
Next steps:
  npm run dev                # the first run sets up your Convex dev deployment (log in
                             # when asked) and provisions its env, then runs Convex and Nuxt
  Sign in at /login: in development, the sign-in code prints in the same terminal.
```

An `npm install` line comes first when this run added `convex`, and `npx nuxt-backend dev` replaces `npm run dev` when your `dev` script is one of your own.

The dev server no longer scaffolds on startup, and the `backend.scaffold` option is gone: `init` and [`dev`](#dev) own the scaffold.

## `dev`

Run Convex and Nuxt from one command, on your dev deployment and the providers' sandboxes. `init` points your `dev` script at it, so `npm run dev` runs it, and arguments after `dev` go to `nuxt dev`. On a dev deployment's first run it provisions the env with `env push`: `AUTH_SECRET`, `SITE_URL`, `BACKEND_ENVIRONMENT=development`, and `EMAIL_DEV_INBOX=1`, the opt-in that lets a page read the [dev inbox](/docs/develop/dev-inbox).

```bash
npx nuxt-backend dev
npx nuxt-backend dev --anonymous   # an account-free local deployment
npm run dev -- --port 3001         # through the dev script: arguments reach nuxt dev
```

<!-- generated:cli-dev (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** writes project files; writes the dev deployment. **`--json`:** none: it runs until stopped, with Convex and Nuxt printing to the terminal. **Exit codes:** `0` Convex and Nuxt stopped cleanly; `1` no deployment could be set up, or Convex failed (its own exit code is passed on); `130` stopped by Ctrl-C, SIGINT or SIGTERM.

<!-- /generated:cli-dev -->

| Flag | Effect |
|---|---|
| `--anonymous` | Start on an account-free local deployment, with no Convex login and no question, on macOS, Linux and Windows alike: it gives the Convex CLI `CONVEX_AGENT_MODE=anonymous` itself, so no shell syntax is needed. A deployment `.env.local` already names is kept, and `dev` says so. `npx convex login` later moves the deployment into your account. |
| `-- <args>` | Everything after `dev` that is not its own flag goes to `nuxt dev`. |

It writes project files only for the scaffold, when the functions directory is missing. On the dev deployment it writes only the env and the code `convex dev` pushes.

In order, it:

1. scaffolds `backend/` when the app has no functions directory yet, before Convex can create a `convex/` one;
2. runs `convex dev --once` when no deployment is configured. The login and project prompts happen here, and `CONVEX_DEPLOYMENT` lands in `.env.local`. On a new deployment this push fails on the env it has not been given yet, which is expected;
3. runs the [`env push`](#env-push) engine once per dev deployment: it generates `AUTH_SECRET`, defaults `SITE_URL`, and sets `BACKEND_ENVIRONMENT` to `development`, which keeps every provider in its test mode, trusts the local origins and logs sign-in codes;
4. hands over to `convex dev --start "nuxt dev …"`: the push succeeds, codegen runs before Nuxt starts, Convex's function logs (sign-in codes among them) print beside Nuxt's, and Ctrl-C stops both.

It starts nothing beside Convex and Nuxt. Billing reads `missing` until you push a sandbox token, then bills in Polar's sandbox ([Billing on Polar's sandbox](/docs/develop/sandboxes#billing-on-polars-sandbox)).

To stop it from another process, as a coding agent or a task runner does, send SIGINT or SIGTERM to its process (`kill -INT <pid>` or `kill <pid>`). It passes either on to Convex as SIGINT, which stops Nuxt and a local backend before exiting. On Windows, `taskkill /PID <pid> /T /F` ends the whole tree.

`convex dev --start "nuxt dev"` on its own is not enough. The scaffold requires `AUTH_SECRET` and `SITE_URL` on the deployment, Convex starts the command only after a successful push, and the values come from this package's env provisioning, so on a new deployment it waits forever. `doctor` warns about that script (`dev-script`), and `doctor --fix` replaces it.

Two terminals still work if you prefer them: `npx convex dev` in one, `nuxt dev` in the other, in either order.

## `doctor`

Check the project and the deployment's configuration. It exits with `1` when any finding fails.

```bash
npx nuxt-backend doctor
npx nuxt-backend doctor --prod     # production posture, and live probes of its site
npx nuxt-backend doctor --fix      # restore missing scaffold files, push env, apply the provider settings
npx nuxt-backend doctor --fix --yes   # the same, unattended: provider changes without asking
npx nuxt-backend doctor --json     # machine-readable { $schema, findings, summary }
npx nuxt-backend doctor --only billing,email   # some capabilities' checks
```

<!-- generated:cli-doctor (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** reads only; --fix: writes project files, writes the dev deployment, writes provider accounts; --fix --prod: writes project files, writes production, writes provider accounts. **`--json`:** `{ $schema, findings, summary }`, described by https://nuxt-backend.dev/schemas/doctor.json; with `--fix`, the repair's progress goes to stderr. **Exit codes:** `0` no finding failed (warnings allowed); `1` a finding failed, or the flags were refused.

<!-- /generated:cli-doctor -->

[Its JSON Schema](https://nuxt-backend.dev/schemas/doctor.json) describes the `--json` output, and each finding has an entry on [Diagnostics](/docs/reference/cli/diagnostics).

| Flag | Effect |
|---|---|
| `--prod` | Production posture: checks the project's **production** deployment (`convex … --prod`), and turns the designed degradations production cannot run with into failures. It also reads what production's env names alone cannot say, and probes the live site its `SITE_URL` names ([Under `--prod`](#under---prod)). Refuses a dev or preview `CONVEX_DEPLOY_KEY`, which would point the checks at that deployment. |
| `--fix` | Repair what `doctor` can: restore missing scaffold files (existing files untouched), point a `convex dev --start "nuxt dev"` dev script at `nuxt-backend dev`, run the `env push` engine (never with `--force`), at a terminal make the first administrator when the deployment has none ([Make the first administrator](/docs/build/auth/admin#make-the-first-administrator)), and run [`email sync`](#email-sync). Then the providers: it names each setting the billing findings recommend (trial abuse prevention, the trial reminder, Polar's customer emails back on), subscribes the billing endpoint to every event the package handles, and turns either provider's webhook endpoint back on once its route answers the probe. Each change is made only once you confirm it at a terminal, or with `--yes`; without either it is listed and left ([Let doctor fix them](/docs/services#let-doctor-fix-them)). It turns nothing off and never touches seat settings. |
| `--yes` | With `--fix`: apply the provider changes without asking, for a script or CI. |
| `--json` | Machine-readable output, described by [its JSON Schema](https://nuxt-backend.dev/schemas/doctor.json). With `--fix`, the repair's progress goes to stderr, so stdout stays one JSON document. |
| `--only <capabilities>` | Run only the checks of these [capabilities](/docs/reference/capabilities), comma-separated: `auth`, `data`, `jobs`, `billing`, `email`, `notifications`, `ai`, `protection`, `monitoring`, `flags`, `analytics` and `hosting`. The other checks never run, so their deployment reads, route probes, site probes and provider calls are skipped too. `agents` leaves with DEFER. |

### Findings

Each finding has an `id`, the `capability` it belongs to, a status (`pass`, `warn` or `fail`), a message, a fix hint, and a `docsUrl`: `https://nuxt-backend.dev/d/<id>`, which opens its entry on [Diagnostics](/docs/reference/cli/diagnostics). That page lists every finding with what it checks, when it fails, and its fix. In `0.x` a minor release may rename a finding or move it to another capability, and any release may change its wording ([Stability](/docs/ship/releases/stability)).

The route probes, `function-contract` and the path check need the deployment (and `nuxt.config`) to be reachable, and produce no finding otherwise. The `billing-*` catalog checks need a `billing.catalog.ts`, and run the provider half only with a token visible locally. The same preflight (`backend-site-url` … `billing-webhook-secret`) runs on every dev-server start and in the [DevTools tab](/docs/develop/devtools). Today those two also report an `mcp` finding for the agent endpoint, which leaves with DEFER.

### Under `--prod`

Production's env names say what is set, not to what. Under `--prod`, `doctor` also reads, side by side, only what a check needs:

- **Two values, neither of them secret** (`convex env get --prod`). `BACKEND_ENVIRONMENT` is compared and never printed: it fails when it is unset, `development` or `preview`, and warns when it is `sandbox`, a demo or staging app on purpose ([`deployment-backend-environment`](/docs/reference/cli/diagnostics#deployment-backend-environment)). The origin of `SITE_URL` ([`site-url-origin`](/docs/reference/cli/diagnostics#site-url-origin)) is the app's public origin, which every emailed link names, so the findings print it. A name production does not set is never read.
- **What production reports of its own email** (`convex run --prod --component backend posture:email`, an internal function only an admin key can run). The deployment asks the email provider with its own `EMAIL_API_KEY`, and only derived facts come back, never the key or an address: the sender domain's status ([`email-sender-domain`](/docs/reference/cli/diagnostics#email-sender-domain)), the last 7 days' bounce and complaint rates against the provider's limits ([`email-reputation`](/docs/reference/cli/diagnostics#email-reputation)), and the quota used ([`email-quota`](/docs/reference/cli/diagnostics#email-quota)). A deployment on a release without it warns once.
- **The catalog against its production ids** in `billing.generated.ts` ([`billing-catalog-production`](/docs/reference/cli/diagnostics#billing-catalog-production)).
- **The live site**, at the origin `SITE_URL` names, with anonymous requests a visitor or an uptime check could make: HTTPS and HSTS ([`site-https`](/docs/reference/cli/diagnostics#site-https)), the content security policy and the deployment the page talks to ([`site-csp`](/docs/reference/cli/diagnostics#site-csp), [`site-backend-url`](/docs/reference/cli/diagnostics#site-backend-url)), a gated page sending an anonymous visitor to sign in ([`site-gated-page`](/docs/reference/cli/diagnostics#site-gated-page)), the health endpoint's public shape ([`monitoring-health`](/docs/reference/cli/diagnostics#monitoring-health)), and `/llms.txt` where the app serves it ([`agent-docs`](/docs/reference/cli/diagnostics#agent-docs)). The agent endpoint's challenge and discovery probes leave with DEFER.

Nothing is probed when `SITE_URL` is unset, unreadable, local or plain HTTP (`site-url-origin` says so). A site that does not answer at all is one warning, on the first probe the run checks. A run scoped with `--only` to capabilities without auth, such as `--only hosting`, gets the same one warning when `SITE_URL` keeps the site from being probed, so it never looks clean.

The posture the other capabilities already report is not repeated here: bot protection, monitoring, the route to the models and the webhook secrets keep their own findings ([Prepare for launch](/docs/ship/checklist)).

## `status`

Show each [capability](/docs/reference/capabilities) and its state: `live`, `test`, `missing` or `failing`. A capability on its service's test mode, or on a deployment that is not production, reads `test`. `status` runs `doctor`'s checks once and reads the result per capability, so it probes nothing `doctor` does not. The one value it adds is `BACKEND_ENVIRONMENT`, read off the deployment, so a capability outside production never reads as live. Under `--prod` it reads it with the rest of [production's posture](#under---prod), once, and shows the same findings, the live site's among them.

```bash
npx nuxt-backend status          # the dev deployment's capabilities
npx nuxt-backend status --prod   # production's, under doctor's production posture
npx nuxt-backend status --json   # { deployment, status, capabilities, summary }
```

<!-- generated:cli-status (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** reads only. **`--json`:** `{ deployment, status, capabilities: [{ name, title, state, reason, providers, missingEnv, findings, top, docsUrl, devtools }], summary }`: `state` is `live`, `test`, `missing` or `failing`, `status` is `ok`, `degraded` or `failing`. **Exit codes:** `0` no capability is failing (missing and test capabilities allowed); `1` a capability is failing, or --prod was refused.

<!-- /generated:cli-status -->

| Flag | Effect |
|---|---|
| `--prod` | The production deployment's capabilities. An env name counts as set only on the deployment (none does when its names cannot be read), the mode follows the `BACKEND_ENVIRONMENT` read off it, and `doctor`'s production posture turns a warning production cannot run with into a failure, so the capability fails. Refuses a dev or preview `CONVEX_DEPLOY_KEY`, as `doctor --prod` does. |
| `--json` | Print the capabilities as one JSON document. `status` is `ok` while every capability is live or test, `degraded` once one is missing, and `failing` once one fails. |

Each line is one capability: its light, its state, what it is built on and why it is in that state. Under it come the env names the capability lacks and its most pressing finding, and the last line names the `doctor --only` run that shows their fixes. The code prints these twelve today:

```text
nuxt-backend status · dev:happy-otter-123 (cloud dev deployment)

◐ auth          test       Better Auth: sign-in codes print in the dev console, or reach the email provider's test addresses
◐ data          test       Convex: runs on the cloud dev deployment
◐ jobs          test       Convex: runs on the cloud dev deployment
○ billing       missing    Polar: BILLING_ACCESS_TOKEN is not set
    unset: BILLING_ACCESS_TOKEN, BILLING_WEBHOOK_SECRET
    ⚠ Billing access: BILLING_ACCESS_TOKEN is not set (optional): billing queries return empty and checkout actions fail on invocation.
◐ email         test       Resend: BACKEND_ENVIRONMENT is development: only the provider's test addresses receive mail
◐ notifications test       Web Push: runs on the cloud dev deployment
○ ai            missing    AI SDK, Vercel AI Gateway, Convex persistent text streaming, Polar: its credits need billing: BILLING_ACCESS_TOKEN is not set
◐ protection    test       Vercel BotID, Cloudflare Turnstile: test mode: the dev server's bot check answers human, as BotID does in development
◐ monitoring    test       Sentry: no DSN is set, so errors go to the dev server's local error log (DevTools › Monitoring)
    unset: MONITORING_DSN
● flags         live       Convex: flags are evaluated in your own functions: their defaults from code, and the overrides stored on the deployment
○ analytics     missing    Polar: its metrics need billing: BILLING_ACCESS_TOKEN is not set
○ hosting       missing    Vercel: no production deployment yet

1 live · 7 test · 4 missing — fixes: npx nuxt-backend doctor --only billing
```

In `0.2.0`, on the same cloud dev deployment with no billing token yet, it prints twelve capabilities:

```text
nuxt-backend status · dev:happy-otter-123 (cloud dev deployment)

◐ auth          test     Better Auth: sign-in codes print in the dev console, or reach the email provider's test addresses
◐ data          test     Convex: runs on the cloud dev deployment
◐ jobs          test     Convex: runs on the cloud dev deployment
○ billing       missing  Polar: BILLING_ACCESS_TOKEN is not set
    unset: BILLING_ACCESS_TOKEN, BILLING_WEBHOOK_SECRET
    ⚠ Billing access: BILLING_ACCESS_TOKEN is not set (optional): billing queries return empty and checkout actions fail on invocation.
◐ email         test     Resend: BACKEND_ENVIRONMENT is development: only the provider's test addresses receive mail
○ notifications missing  Web Push: PUSH_PUBLIC_KEY is not set: the in-app inbox works, web push does not
    unset: PUSH_PUBLIC_KEY, PUSH_PRIVATE_KEY
○ ai            missing  AI SDK, Convex AI Gateway, Polar: its credits need billing: BILLING_ACCESS_TOKEN is not set
◐ protection    test     Vercel BotID, Cloudflare Turnstile: the dev server's bot check answers human, as BotID does in development
◐ monitoring    test     Sentry: no DSN is set, so errors go to the dev server's local error log (DevTools › Monitoring)
    unset: MONITORING_DSN
● flags         live     Convex: flags are evaluated in your own functions: their defaults from code, and the overrides stored on the deployment
○ analytics     missing  Polar: its metrics need billing: BILLING_ACCESS_TOKEN is not set
○ hosting       missing  Vercel: no production deployment yet

1 live · 6 test · 5 missing — fixes: npx nuxt-backend doctor --only billing
```

The lights are the console's: `●` live, `◐` test, `○` missing and `✗` failing, in green, amber, grey and red on a terminal that shows colour.

## `env push`

Sync the backend env contract from `.env(.local)` onto the Convex deployment. On dev deployments (`dev:`, `local:` and `anonymous:`) it also fills the required gaps, so onboarding needs no manual `convex env set`.

```bash
npx nuxt-backend env push
npx nuxt-backend env push --dry-run
npx nuxt-backend env push --prod
npx nuxt-backend env push --json
npx nuxt-backend env push --force BILLING_WEBHOOK_SECRET   # replace a value already set
npx nuxt-backend env push --defaults preview --site-url https://preview.example.com
npx nuxt-backend env push --preview my-branch --site-url https://my-branch.example.app
```

<!-- generated:cli-env-push (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** writes the dev deployment; --prod: writes production; --preview: writes a preview deployment; --defaults: writes project env defaults; --dry-run: reads only. **`--json`:** `{ deployment, dev, results: [{ name, action, detail, outcome, error }], missingRequired }`: `deployment` names what was written (`dev:<slug>`, `production`, `preview:<name>`, `defaults:<type>`); values never appear. **Exit codes:** `0` every value set, or nothing to set; `1` refused, no deployment (or project defaults) reachable, a set failed, or required env is missing.

<!-- /generated:cli-env-push -->

| Flag | Effect |
|---|---|
| `--prod` | Acts on the project's **production** deployment (`convex env set --prod`), whichever deployment `.env.local` names. It invents no value but `BACKEND_ENVIRONMENT`, which it derives, and fails (exit 1) on missing required env. Refuses to run when `CONVEX_DEPLOY_KEY` is a dev or preview key: the Convex CLI follows the key and ignores `--prod`, so the push would land there. |
| `--preview [name]` | Acts on the preview deployment of that name (`convex env set --preview-name`). Without a name, the branch the CI build names, read as `convex deploy` reads it (`VERCEL_GIT_COMMIT_REF` on Vercel, `HEAD` on Netlify, …). Generates `AUTH_SECRET` and sets `BACKEND_ENVIRONMENT` to `preview` when nothing else sets them; `SITE_URL` comes from `--site-url` only. Refuses a deploy key that is not a preview key. |
| `--defaults preview\|dev` | Writes the project's env defaults for new deployments of that type (`convex env default set --type`) instead of a deployment: a generated `AUTH_SECRET`, `SITE_URL`, and `BACKEND_ENVIRONMENT` as `preview` or `development`; dev defaults add `EMAIL_DEV_INBOX=1`. A default already set is kept unless `--force` names it. `prod` is refused, and so is a production deploy key. |
| `--site-url <url>` | The `SITE_URL` to write, replacing the one already set: giving it is asking for it. A preview's only source of one, and required for `--defaults preview` until the project has that default. |
| `--dry-run` | Print the plan without setting anything. |
| `--force [names]` | Replace values already set on the deployment with the local ones: the names given, a comma-separated list (case-insensitive). Bare, or `all`, for every variable of the contract but `BACKEND_ENVIRONMENT`, which is replaced only when named. `--prod` refuses a bare one: `.env.local` holds the dev deployment's values, so name what production takes from it. Rotation has to be asked for: the plan reads deployment **names**, never values, so it cannot tell a rotated secret from an identical one. [`env rotate`](#env-rotate) rotates the secrets that must not sign anyone out. |
| `--json` | Machine-readable output. |

The plan, per variable of the contract (`AUTH_SECRET`, `SITE_URL`, `BACKEND_ENVIRONMENT`, `EMAIL_*`, `BILLING_*`, `AI_GATEWAY_API_KEY`, `PROTECTION_*`, `PUSH_*` and `MONITORING_DSN`):

| Action | When |
|---|---|
| `skipped` | Already set on the deployment: left alone unless the name is in `--force`. A forced name with no local value is skipped too |
| `set` (forward) | Present in `.env(.local)`: forwarded |
| `set` (update, `--force` only) | Already set and named in `--force`: replaced with the value from `.env(.local)` |
| `set` (provision, dev only) | Required and missing: `AUTH_SECRET` is generated (32 random bytes, base64), and `SITE_URL` defaults to `http://localhost:3000`. `EMAIL_DEV_INBOX` missing is set to `1`, which publishes the [dev inbox](/docs/develop/dev-inbox) to pages |
| `set` (derive) | `BACKEND_ENVIRONMENT` missing: set from the deployment's kind, `development` for a dev deployment, `preview` for a preview and `production` for production. A value already set stays, so a `sandbox` you set by hand is never replaced |
| `MISSING` | Required and missing on a non-dev push: blocks with exit 1 |
| `unset` | Optional and absent: informational, with the designed degradation. `EMAIL_DEV_INBOX` on a preview or production push too: it goes to dev deployments only, never from `.env.local` elsewhere |

`BACKEND_ENVIRONMENT` replaces five variables of earlier previews that `env push` pushed or provisioned: `EMAIL_TEST_MODE`, `BILLING_ENVIRONMENT`, `MONITORING_ENVIRONMENT`, `AUTH_TRUST_LOCAL_ORIGINS` and `NUXT_BACKEND_LOG_OTP`. It sets `BACKEND_ENVIRONMENT` only where the deployment holds none, and never from `.env.local`: its value there is the dev deployment's. [Environments and deployments](/docs/start/concepts/environments) says what each value decides.

Each value reaches `npx convex env set NAME` on its stdin: never as an argument, where every process on the machine could read it (`ps`), and never through a shell. A set that fails is reported as the command, its exit code and the last lines of its stderr, never with the value. The deployment is whatever the Convex CLI targets: `CONVEX_DEPLOYMENT` from `.env.local` in dev, or a `CONVEX_DEPLOY_KEY` in the environment for production. The Convex CLI follows a deploy key whatever the flags say, so a push without `--prod` or `--preview` is refused (exit 1) while the key in the shell, `.env.local` or `.env` is anything but a dev key: the dev values above would land on production, a preview or the deployment a project key picks. `doctor --fix` refuses the same, and `nuxt-backend dev` skips the push and says why. Without a reachable deployment the command exits 1 (`run npx convex dev once, then push again`).

### Preview deployments

`npx convex deploy` with a preview deploy key creates the branch's preview deployment, runs your `--cmd`, then pushes the backend to it. That push fails unless `AUTH_SECRET` and `SITE_URL` are already there, and a new preview starts with nothing but the project's preview env defaults. Two ways put them there, and they work together:

- **In the build, exactly.** `--cmd` runs once the preview exists and before the push, so `env push --preview` can fill its env there, with the branch's own origin as `SITE_URL`. On Vercel, where `VERCEL_BRANCH_URL` is the branch's stable URL and the same build command also runs for production:

  ```bash
  npx convex deploy --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL \
    --cmd 'if [ "$VERCEL_ENV" = preview ]; then npx nuxt-backend env push --preview --site-url "https://$VERCEL_BRANCH_URL"; fi && npm run build'
  ```

- **Project env defaults, once.** Convex copies them into every preview it creates, so a preview built without that step can still push:

  ```bash
  npx nuxt-backend env push --defaults preview --site-url https://preview.example.com
  ```

`SITE_URL` is the one value neither will make up. Auth trusts only that origin, and a preview's origin is its own (one per branch on most hosts), so it has to come from the build, which knows it, or from you. A default cannot be exact for every preview: name a stable preview domain if your host gives you one, and let the build step replace it per branch. `doctor` reports the defaults as [`env-defaults`](#findings).

`--defaults dev` writes the same three values for new dev deployments, with `SITE_URL` at `http://localhost:3000` unless `--site-url` names another. That helps when teammates start with a bare `npx convex dev`, which `nuxt-backend dev` makes unnecessary. Every deployment created from the defaults shares their one `AUTH_SECRET`.

`nuxt-backend dev` runs this same engine once per dev deployment, so nobody runs `env push` to get started. The `backend.autoEnv` option, which ran it on dev-server startup, is gone.

## `env rotate`

Rotate a secret the package reads without signing anyone out or refusing a webhook delivery. The new value goes in beside the old, both are accepted for a window, and then the old one is retired. No value is printed: each reaches `convex env set` on its stdin. [Rotate secrets](/docs/ship/security/secrets) walks through each secret.

```bash
npx nuxt-backend env rotate AUTH_SECRET
npx nuxt-backend env rotate EMAIL_WEBHOOK_SECRET --prod
npx nuxt-backend env rotate BILLING_WEBHOOK_SECRET --prod --dry-run
```

<!-- generated:cli-env-rotate (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** writes the dev deployment; writes provider accounts; --prod: writes production; --dry-run: reads only. **`--json`:** `{ name, deployment, dryRun, steps: [{ step, outcome, note? }], state, retiresAt? }`: the steps it took and the secret's new state; values never appear. **Exit codes:** `0` rotated, or a dry run; `1` refused, or a step failed.

<!-- /generated:cli-env-rotate -->

| Flag | Effect |
|---|---|
| `<name>` | The secret to rotate: `AUTH_SECRET`, `EMAIL_WEBHOOK_SECRET` or `BILLING_WEBHOOK_SECRET`. |
| `--prod` | Rotate production's secret. Refuses a dev or preview `CONVEX_DEPLOY_KEY`, as `env push --prod` does. |
| `--dry-run` | Print each step it would take, and change nothing. |
| `--retire` | `AUTH_SECRET` only: retire the old value now, not after the 30-day window. After a leak: sessions, links and codes it signed stop working. |
| `--json` | Print the outcome as one JSON document; progress goes to stderr. |

How each secret rotates:

- **`AUTH_SECRET`** is versioned. The new value signs everything from then on, and the old one still verifies sessions, codes in flight and unsubscribe links for 30 days. The session signing keys rotate with it, with no downtime. Run the command again once the window passed to retire the old value: before then it refuses and says when.
- **`EMAIL_WEBHOOK_SECRET`** rotates at the email provider, which signs with both secrets for 24 hours while the deployment accepts both.
- **`BILLING_WEBHOOK_SECRET`** is reset through the billing provider's API, with the `BILLING_ACCESS_TOKEN` visible here (the process env alone under `--prod`). The command writes the `new,old` accept list at once, then the new value alone.

`PROTECTION_PROOF_SECRET` and the push keys keep steps of their own, which the command names when asked to rotate them ([What rotates, and how](/docs/ship/security/secrets#what-rotates-and-how)). A provider token (`BILLING_ACCESS_TOKEN`, `EMAIL_API_KEY`, `AI_GATEWAY_API_KEY`) needs no command: set the new one by name, with `env push --force BILLING_ACCESS_TOKEN` (and `--prod` for production), then revoke the old one.

## `billing sync`

Push `backend/billing.catalog.ts` to the billing provider and write `backend/billing.generated.ts`. It finds or creates each object, and never deletes one. It provisions the `/billing/events` webhook endpoint of the deployment it writes, stores the endpoint's secret there as `BILLING_WEBHOOK_SECRET` (never printed), and runs `billing:syncProducts` on that deployment so pricing renders at once. A sandbox sync writes the deployment `.env.local` names; `--env production` writes the production deployment.

<!-- generated:cli-billing-sync (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** writes provider accounts; writes project files; writes the dev deployment; writes production. **`--json`:** `{ environment, dryRun, deployment, log: [{ action, kind, key, id?, note? }], generated, webhook: { url, action: "created" | "exists" | "would-create" | "skipped", secret: "stored" | "kept" | "not-stored" | "none", note? }, products: { status: "synced" | "failed" | "skipped", note? } }`. **Exit codes:** `0` synced, or a dry run. A webhook or product step that could not run is reported, not fatal; `1` refused or failed: unknown environment, no access token or catalog, a catalog plan still in the 0.1 shape (`interval` and `price`) or priced at no interval, an id map (`billing.generated.ts`) that does not load, a deploy key for the other kind of deployment, a production webhook URL that cannot be derived, a webhook URL on a deployment other than the one written, a provider error, or a webhook secret that belongs on the deployment and could not be stored.

<!-- /generated:cli-billing-sync -->

The project file it writes is `backend/billing.generated.ts`, and the deployment it writes is the dev or production one: the one `.env.local` names for the sandbox, production with `--env production`.

```bash
npx nuxt-backend billing sync
npx nuxt-backend billing sync --env production
npx nuxt-backend billing sync --dry-run
npx nuxt-backend billing sync --webhook off
npx nuxt-backend billing sync --adopt pro=prod_123,credits=meter_456
```

| Flag | Effect |
|---|---|
| `--env sandbox\|production` | The target environment: `sandbox`, Polar's sandbox, or `production`. Default: the environment the deployment bills in, read from its `BACKEND_ENVIRONMENT` (`production` bills live, every other value in the sandbox), else `sandbox`. |
| `--dry-run` | Print the plan without creating anything. |
| `--webhook <url>` | Provision the webhook endpoint at this URL (default: `<site>/billing/events` of the deployment written; `off` to leave the webhook alone). |
| `--force` | Store the endpoint's secret even over a `BILLING_WEBHOOK_SECRET` the deployment already holds, and create a missing endpoint in that case. |
| `--adopt key=<id>[,…]` | Record existing provider objects under catalog keys, as they are: their benefits stay untouched. |
| `--json` | Print the outcome as one JSON document (`{ environment, dryRun, deployment, log, generated, webhook, products }`, the secret never in it); progress goes to stderr. |

Before it writes anything, it reads the deployment the Convex CLI will write (`npx convex function-spec` and `npx convex env list`, with `--prod` under production) and works from there:

- **Which deployment.** A deploy key decides it, whatever the flags say, so a key for the other kind of deployment is refused: a dev or preview `CONVEX_DEPLOY_KEY` under `--env production`, and a production key (a legacy key without a type is one) or a project key under the sandbox. The output and `--json`'s `deployment` name the deployment written.
- **The webhook URL.** `--webhook <url>` as given; otherwise `<site>/billing/events`, where the site is the deployment's own `.convex.site` origin. An endpoint on one deployment whose secret would land on another is refused. When the URL cannot be had (the deployment is unreadable, or it runs on this machine, where the provider cannot deliver), a sandbox sync leaves the webhook alone and says why, and a production sync stops and asks for `--webhook`.
- **The secret.** A new endpoint's secret is stored on the deployment. An endpoint that already exists has its secret stored when the deployment has none: the provider reports it on every read, so a secret one run could not store is stored by the next. A `BILLING_WEBHOOK_SECRET` the deployment already holds is kept unless `--force`. Without it, an endpoint missing at the URL is not created, since its secret would replace that one. To set the secret by hand, run `npx convex env set BILLING_WEBHOOK_SECRET` (with `--prod` for production), which asks for it: never put it on the command line.
- **The products.** `billing:syncProducts` runs only when the deployment can load the catalog synced: it holds `BILLING_ACCESS_TOKEN`, and its `BACKEND_ENVIRONMENT` bills in the environment synced. Otherwise it is skipped with the command to run once that is set, and a run that fails reports the deployment's error.

It needs `BILLING_ACCESS_TOKEN` (in the env or `.env.local`) and a `billing.catalog.ts`. [Define and sync your catalog](/docs/build/billing/catalog) covers the full semantics: tagging, drift, adopted products and the generated map.

## `email sync`

Push what `backend/email.ts` declares to the email provider, as [`billing sync`](#billing-sync) does for the catalog. The deployment does the provider's side with its own `EMAIL_API_KEY` (`email:syncEmail`, which `backend/email.ts` re-exports from `setupEmail(…).api`), so the key never leaves it. It creates the topics under `topics`, the segment that holds your app's accounts, and the contact properties under `contactProperties`. It points the deployment's `/email/events` webhook at every event the package reads; a webhook it creates has its signing secret stored on the deployment as `EMAIL_WEBHOOK_SECRET`, never printed. It reads each sender's domain for its region and DMARC policy. The ids it creates stay on the deployment, so no provider id sits in your code.

<!-- generated:cli-email-sync (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** writes provider accounts; writes the dev deployment; writes production. **`--json`:** `{ deployment, dryRun, log: [{ action, kind, key, id?, note? }], webhook: { url, action, secret: "stored" | "not-stored" | "none" }, senders, region, inbound: { support, inbox, domain, webhook, todo } | null }`, the secret never in it. **Exit codes:** `0` synced, or a dry run; `1` refused or failed: no `EMAIL_API_KEY`, a key restricted to sending, a deploy key for the other kind of deployment, no `email:syncEmail` on the deployment, a provider error, a webhook secret that could not be stored, or a support inbox sync that failed.

<!-- /generated:cli-email-sync -->

```bash
npx nuxt-backend email sync
npx nuxt-backend email sync --prod
npx nuxt-backend email sync --dry-run
npx nuxt-backend email sync --webhook off
```

| Flag | Effect |
|---|---|
| `--prod` | Sync production's email account and write the production deployment. Refuses a dev or preview `CONVEX_DEPLOY_KEY`, as every command that writes production does. |
| `--dry-run` | Print each step it would take, and change nothing. |
| `--webhook <url>` | Point the webhook at this URL (default: `<site>/email/events` of the deployment written; `off` to leave the webhook alone). |
| `--json` | Print the outcome as one JSON document; progress goes to stderr. |

- **Finds before it creates.** A second run changes nothing that is already right, and it never deletes a topic, a segment or a property.
- **A topic's default is set once.** The provider can't change `subscribedByDefault` after it creates the topic, so a changed default is reported as `drift`, not applied.
- **A full-access key.** A key restricted to sending can't manage topics, segments or webhooks.
- **The senders.** Each of `EMAIL_FROM` and `EMAIL_MARKETING_FROM` is listed with its domain's sending region and DMARC policy, and a region that differs from `EMAIL_REGION` is reported.
- **One email account per app and stage.** The provider sends every event of an account to each of its webhooks, so a dev or demo app syncs to an account of its own ([Develop with real sandboxes](/docs/develop/sandboxes#email-on-resends-test-addresses)).

`doctor` reports what the provider lacks (`email-topics`, `email-webhook-events`, `email-key-permission`), and `doctor --fix` runs `email sync`. [Let people choose their emails](/docs/build/email/preferences) covers the topics it creates.

## `inbox`

Print the sign-in codes a dev deployment sent to one of Resend's test addresses. A coding agent or a script uses it to finish an email-code sign-in with no mailbox and no terminal to read. It reads the sent messages back through Resend's emails API, with the dev deployment's own `EMAIL_API_KEY`: the backend component's `email:inbox` action makes the calls (`npx convex run --component backend email:inbox`), so the key never leaves the deployment and the deployment stores no copy ([Dev inbox](/docs/develop/dev-inbox)).

```bash
npx nuxt-backend inbox                               # delivered@resend.dev
npx nuxt-backend inbox delivered+agent@resend.dev --json
```

<!-- generated:cli-inbox (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** reads only. **`--json`:** `{ address, deployment, messages: [{ from, subject, receivedAt, code }], code }`: newest first, `code` the newest message's; bodies are never printed. **Exit codes:** `0` the inbox was read; it may be empty (`code` null); `1` refused — `--prod`, a deploy key for anything but a dev deployment, a deployment that is not dev-class, an address with no dev inbox — or the read failed.

<!-- /generated:cli-inbox -->

| Flag | Effect |
|---|---|
| `[address]` | The test address to read: `delivered@resend.dev` (the default), or `delivered+<label>@resend.dev`. Any other address is refused. |
| `--json` | Print the inbox as one JSON document. |
| `--prod` | Refused: the inbox is read on dev deployments only. |

It reads dev-class deployments only (`dev:`, `local:` and `anonymous:`) and refuses everything else: `--prod`, a `CONVEX_DEPLOY_KEY` for anything but a dev deployment (the Convex CLI would follow it), a `CONVEX_DEPLOYMENT` of another kind, and a self-hosted deployment, which does not say what it is. Only a test address receives mail outside `production`, and with no `EMAIL_API_KEY` nothing is sent: the sign-in code prints in the `convex dev` console instead, since `BACKEND_ENVIRONMENT` is `development` there.

## `upgrade`

Move the app to the version installed. It does two things: it repairs the scaffold, as `doctor --fix` does, and it runs the package's own data migrations on the deployment. It rewrites no code: a release's renamed names are in the [changelog](/docs/ship/releases/changelog) and, for the previews of `main`, on the [Upgrade page](/docs/ship/releases/upgrade), and `0.2.0` ships no codemods. Run it after installing a new version, and again whenever it says so: every step is safe to repeat, and a second run changes nothing the first one finished.

```bash
npx nuxt-backend upgrade --dry-run      # each scaffold change as a diff, and where the migrations stand; writes nothing
npx nuxt-backend upgrade                # the scaffold and the dev deployment's data
npx nuxt-backend upgrade --prod --yes   # production's data, after its deploy
npx nuxt-backend upgrade --json         # the report as one JSON document
```

<!-- generated:cli-upgrade (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** writes project files; writes the dev deployment; --dry-run: reads only; --diff: reads only; --prod --yes: writes project files, writes production. **`--json`:** `{ to, dryRun, scaffold: { written, changes, diffs }, ejected: [{ target, file, from, to, changes }], data: { deployment, state, reason, migrations }, next }`: `data.state` is `done`, `running`, `pending`, `none`, `skipped`, `needs-push` or `failed`; `scaffold.diffs` comes with `--dry-run` only; with `--diff`, `[{ target, file, from, to, changes, diff }]` alone; progress goes to stderr. **Exit codes:** `0` done: the scaffold repaired; the data migrated, still migrating, waiting for a push, or skipped with no dev deployment; `1` refused, a data migration failed, or with `--prod`, production could not be migrated.

<!-- /generated:cli-upgrade -->

| Flag | Effect |
|---|---|
| `--dry-run` | Plan every step and write nothing: each scaffold file it would change, as a unified diff, the files it would write, and where each data migration stands on the deployment. |
| `--diff [name]` | Print the upstream changes to each ejected file, or to the one named, as a unified diff between the version in its stamp and the installed one, and write nothing ([Eject a part, page or email](/docs/build/ui/customize/eject#upgrade-an-ejected-file)). |
| `--prod` | Run the data migrations on the production deployment instead of the dev one. Needs `--yes`, except with `--dry-run`, and refuses a dev or preview `CONVEX_DEPLOY_KEY`. Without `--prod`, a deploy key for anything but a dev deployment is refused: the Convex CLI follows the key whatever the flags say. |
| `--yes` | Confirm `--prod`. No command asks a question, so this flag is the confirmation. |
| `--json` | Print the report as one JSON document; progress goes to stderr. |

In order, it:

1. **repairs the scaffold**, exactly as [`doctor --fix`](#doctor) does before it pushes env: the scaffold files this version adds, the mounts, forwarded env names and route groups `convex.config.ts` and `http.ts` lack, and a `dev` script that stalls. It pushes no env.
2. **lists the ejected files**: each file whose stamp names an older version, with a count of upstream changes and the `upgrade --diff <name>` command that shows them.
3. **migrates the data.** The package's own migrations run on the migrations component nested in `backend`, which records how far each one got. A finished one is skipped, one that stopped, failed or was canceled resumes where it stopped, and they run one after another. It follows them for up to two minutes; past that they go on in the deployment, and a later run reports them. A deployment runs the code it was last pushed, so one that predates this version has no migrations to run yet: the data step reports `needs-push`, and the run after `npx nuxt-backend dev` (or production's deploy) migrates it. With no dev deployment configured, the step is skipped.

It ends with the commands to run next: `init --agents` when the agent files are missing or name another version, `dev` and `upgrade` again while the dev data waits for a push (production's deploy, then `upgrade --prod --yes`, for production), then `doctor` and the app's type check.

| `data.state` | Means |
|---|---|
| `done` | Every package migration finished on the deployment. |
| `running` | Started, and still going on the deployment's scheduler. |
| `pending` | Not started: a dry run reads where they stand and starts none. |
| `none` | This version has no data migration. |
| `skipped` | No dev deployment is configured, it did not answer, or a file of the app could not be written. |
| `needs-push` | The deployment runs a backend older than this version. |
| `failed` | A migration stopped on an error (`migrations[].error`), or production did not answer. |

## `deploy`

Take production from nothing to a passing `doctor --prod` in one command. Each step looks before it writes, so a second run changes nothing that is already right, and a run that stopped halfway picks up where it stopped. [One-command production](/docs/ship/deploy/one-command) walks through it.

```bash
npx nuxt-backend deploy --dry-run   # every step it would take; writes nothing
npx nuxt-backend deploy             # production
npx nuxt-backend deploy --sandbox   # a demo or staging app on the test modes
```

<!-- generated:cli-deploy (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** writes production; writes provider accounts; writes project files; --dry-run: reads only; --build: writes production, writes a preview deployment. **`--json`:** `{ dryRun, environment, host, steps: [{ id, capability, title, outcome, detail }], doctor }`: `outcome` is `done`, `unchanged`, `planned`, `skipped` or `failed`, `doctor` is `{ pass, warn, fail, failing }` or null; values never appear. **Exit codes:** `0` production passes `doctor --prod`, or a dry run; a step that waits on a key only you hold is skipped, not failed; `1` refused, a step failed, or `doctor --prod` fails.

<!-- /generated:cli-deploy -->

The project file it writes is `backend/billing.generated.ts`, as `billing sync` does.

| Flag | Effect |
|---|---|
| `--dry-run` | Print every step it would take, and change nothing. |
| `--sandbox` | Set `BACKEND_ENVIRONMENT=sandbox` instead of `production`, publish the [dev inbox](/docs/develop/dev-inbox) (`EMAIL_DEV_INBOX=1`), and sync to the providers' test modes ([Deploy a demo or staging app](/docs/ship/deploy/staging)). |
| `--build` | Run as the host's build command, as the [deploy template](/docs/ship/deploy/template) does: put what the first push needs on production where it lacks it (a generated `AUTH_SECRET`, and `SITE_URL` from the host's production URL), then run `convex deploy --cmd 'npm run build'`, the backend first and the app against it. With a preview deploy key it fills the preview's env as [`env push --preview`](#preview-deployments) does. It never sets `BACKEND_ENVIRONMENT`, so a new app stays on the test modes until `deploy` makes it live. |
| `--json` | Print the outcome as one JSON document; progress goes to stderr. |

In order, it:

1. links the project's production deployment, or creates it with your Convex login (`convex deployment create --type prod --default`);
2. sets `BACKEND_ENVIRONMENT` to `production`, unless the deployment already holds `sandbox`, which it keeps, or `--sandbox` is given. A value it cannot read stops the run: it never guesses;
3. pushes production's own env: a generated `AUTH_SECRET`, the app's public origin as `SITE_URL`, the billing token and the email key, and on Vercel a generated bot-check proof secret. On a sandbox it also sets `EMAIL_DEV_INBOX=1`, so the demo's visitors read their sign-in codes off the page. Nothing is copied from `.env.local`, which holds development's;
4. deploys the backend with `convex deploy`;
5. syncs the billing catalog to the environment production bills in, as [`billing sync`](#billing-sync) does, and registers both providers' webhooks, storing their signing secrets on production. The email topics and segments come with [`email sync`](#email-sync);
6. writes the env the Nuxt app needs into the Vercel project's production environment, through your own Vercel login: `NUXT_PUBLIC_BACKEND_URL`, a production `CONVEX_DEPLOY_KEY` it creates for the build, and the proof secret. It stores no token. On another host, it names what to set there;
7. runs [`doctor --prod`](#doctor), and prints what fails and what bot protection, monitoring and hosting still lack.

A key only you hold, such as the billing token, comes from the shell (`BILLING_ACCESS_TOKEN`, `EMAIL_API_KEY`, `SITE_URL`), or at a terminal `deploy` asks for it, without echoing a secret. In CI, without a terminal or with `--json`, it asks nothing: it names that step and skips it, and the next run picks it up. It refuses a dev or preview `CONVEX_DEPLOY_KEY`, as every command that writes production does.

## `analyze`

Measure the backend's Convex bundle and the Nuxt app's client and server bundles, with the share `nuxt-backend` and your own code take in each, and the insights that would shrink them. The Convex half runs [`@convex-dev/bundle-analyzer`](https://www.npmjs.com/package/@convex-dev/bundle-analyzer), which is in alpha, and the Nuxt half reads the build `nuxi analyze` makes ([See what is inside your bundles](/docs/develop/analyze)).

```bash
npx nuxt-backend analyze
npx nuxt-backend analyze --only convex --max-convex 8MB --json
```

<!-- generated:cli-analyze (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** reads only. **`--json`:** `{ version, ranAt, bundles: [{ id, title, bytes, gzipBytes, sourceMapBytes, parts, packages, shares, insights, notes }], budgets: [{ bundle, flag, limit, bytes, over, grew }], failures: [{ half, message }] }`: `id` is `convex`, `client` or `server`, and `bytes` is the code without source maps; progress goes to stderr. **Exit codes:** `0` measured, and within every budget given; `1` a bundle is over its budget, `backend/_generated/` is missing, a build failed, or a flag was refused.

<!-- /generated:cli-analyze -->

It bundles the backend and builds the Nuxt app locally and writes nothing to the deployment; the run is kept in `node_modules/.cache/nuxt-backend/analyze.json`, which the DevTools Bundles panel and `doctor`'s `bundle-duplicates` read. Each bundle's `bytes` is its code without source maps, the size a budget is held to: for Convex, your functions and each component added up; for Nuxt, the client's minified chunks and the server's modules before minification. A half that cannot run is listed under `failures` and the other half is still measured.

| Flag | Effect |
|---|---|
| `--only <convex\|nuxt>` | Measure one half. `convex` skips the Nuxt build. |
| `--max-convex <size>` | Fail when the Convex bundle's code (without source maps) is larger. A size is a number with a unit: `8MB`, `350kB`, `2MiB`, or bytes alone. |
| `--max-client <size>` | Fail when the Nuxt client bundle is larger. |
| `--max-server <size>` | Fail when the Nuxt server bundle is larger. |
| `--json` | Print the report as one JSON document; progress goes to stderr. |

A budget for a bundle the run doesn't measure is refused (`--max-client` with `--only convex`), as is a size that isn't one. Over a budget, it names the packages that grew most since the run before, or else the bundle's largest package.

## `eject`

Copy the source of a part, a packaged page or an email into the app, so you own it outright. It is the last rung of the [customization ladder](/docs/build/ui/customize): reach for it once tokens, labels, slots, swapping a part and the headless composables can't make the change ([Eject a part, page or email](/docs/build/ui/customize/eject)).

```bash
npx nuxt-backend eject AuthFormCode        # a part, by its registered name
npx nuxt-backend eject page:pricing        # a packaged page, by its page key
npx nuxt-backend eject email:invite        # an email template, by its name
npx nuxt-backend eject --list              # everything that can be ejected
```

<!-- generated:cli-eject (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** writes project files; --list: reads only. **`--json`:** `` each file it wrote, with the version stamped in it: `{ target, version, written, todo? }`; with `--list`, `[{ target, kind, ejected }]` ``. **Exit codes:** `0` the source was copied; `1` the name is unknown, or a file is in the way and `--force` was not given.

<!-- /generated:cli-eject -->

| Flag | Effect |
|---|---|
| `<target>` | A part's name from [Parts](/docs/reference/components/parts) or a packaged component's, such as `AuthForm`, `page:<key>` for a packaged page, or `email:<name>` for one of the [email templates](/docs/build/email/templates). |
| `--list` | Print every name it can eject, and change nothing. |
| `--force` | Overwrite a file of that name already in the app. |
| `--json` | Print what it wrote as one JSON document. |

What it writes:

- **A part** lands in `app/components/` as a `.vue` file with its CSS, under the part's own name. A same-named app component replaces the packaged one everywhere, packaged pages included, so the copy takes over at once.
- **A page** lands in `app/pages/` at its mounted path, where an app page always wins.
- **An email** lands in `backend/emails/` as a template function, and `eject` adds it to `setupEmail`'s `templates` in `backend/email.ts`, so it is sent in place of the packaged one.

Each file starts with a comment that names the package version it came from. [`upgrade`](#upgrade) diffs every ejected file against the new version's source and lists the changes you may want to carry over. It never rewrites an ejected file.

## `mcp`

Run the developer MCP server, one stdio server that gives your coding agent the project and the services it runs on. [`init`](#init) writes it into `.mcp.json`, so an agent that reads that file starts it on its own ([Developer MCP server](/docs/develop/agents/developer-mcp)).

```json [.mcp.json]
{
  "mcpServers": {
    "nuxt-backend": { "command": "npx", "args": ["nuxt-backend", "mcp"] }
  }
}
```

<!-- generated:cli-mcp (pnpm docs:lookups, from src/cli/contract.ts) -->

**Side effects:** writes the dev deployment; writes provider accounts; --prod: reads only. **`--json`:** none: it speaks MCP on stdin and stdout until the client closes it. **Exit codes:** `0` the client closed the connection; `1` it could not start: no such project directory, @modelcontextprotocol/sdk not installed, or --prod refused for a deploy key of another deployment.

<!-- /generated:cli-mcp -->

| Flag | Effect |
|---|---|
| `--prod` | Read production: the project, billing, email and hosting tools read it, the Convex tools read only its logs and insights, and no tool that writes is listed. Refused with a `CONVEX_DEPLOY_KEY` for a dev or preview deployment. |

Its tools:

- **Project state:** `doctor`'s findings, the capabilities, the env names (never their values), the billing catalog and the function contract.
- **Docs:** a search of these docs, and page reads.
- **Pass-through tools** for Convex, Polar, Resend and Vercel. They reuse the logins and keys your project and your own CLIs already hold, and store none. Polar's tools act on the sandbox unless the server runs with `--prod`.

Each tool that writes asks you to confirm first, through your agent's own prompt, and is refused by a client that cannot ask.
