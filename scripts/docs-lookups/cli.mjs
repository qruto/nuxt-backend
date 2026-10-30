/**
 * Reference › CLI: each command's contract line (COMMAND_CONTRACTS, which
 * every command declares beside itself in src/cli/), and Diagnostics: one
 * entry per `doctor` finding (src/findings/), under its app capability, at the
 * anchor `/d/<id>` lands on, with the report's JSON Schema. The finding ids also go into the docs
 * route table, which turns each into a short link.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { main } from '../../src/cli/main.ts'
import { COMMAND_CONTRACTS, describeSideEffects } from '../../src/cli/contract.ts'
import { FINDINGS } from '../../src/findings/index.ts'
import { CAPABILITY_NAMES } from '../../src/capabilities/index.ts'
import { PROPER_NOUNS } from '../docs-style.mjs'
import { blocks, code, table } from './markdown.mjs'
import { root } from './source.mjs'

// --- Command contracts -------------------------------------------------------

/** Every command of the CLI by its path (`env push`), however deep. */
export function commandPaths(command = main, path = []) {
  const subCommands = command.subCommands ?? {}
  if (Object.keys(subCommands).length === 0) return [path.join(' ')]
  return Object.entries(subCommands).flatMap(([name, sub]) => commandPaths(sub, [...path, name]))
}

/** Text that starts a clause after a code span: its first letter lowered, unless its first word is a name (`Convex`). */
export function clause(text) {
  const trimmed = text.replace(/\.$/, '')
  return PROPER_NOUNS.some(noun => trimmed.startsWith(noun)) ? trimmed : trimmed.replace(/^([A-Z])(?=[a-z])/, first => first.toLowerCase())
}

/** A command's contract on one line: what it may change, what `--json` prints, what each exit code means. */
export function contractLine(path) {
  const contract = COMMAND_CONTRACTS.get(path)
  if (!contract) throw new Error(`\`${path}\` declares no contract (withContract in src/cli/)`)
  const json = /^[`n]/.test(contract.json) ? contract.json : code(contract.json)
  const exits = Object.entries(contract.exitCodes).map(([exit, meaning]) => `${code(exit)} ${clause(meaning)}`).join('; ')
  return `**Side effects:** ${describeSideEffects(contract)}. **\`--json\`:** ${clause(json)}. **Exit codes:** ${exits}.`
}

/** The region name of a command's contract line: `env push` → `cli-env-push`. */
export const contractRegion = path => `cli-${path.replace(/ /g, '-')}`

// --- Diagnostics -------------------------------------------------------------

/**
 * What each finding checks, when it fails rather than warns, and how to fix
 * it. A finding added to the registry needs its entry here: the lookup
 * throws without one. `fails` is when it fails in any mode; `prodFails`,
 * when it fails under `--prod` only; `prodOnly` marks a finding only
 * `doctor --prod` reports.
 */
export const FINDING_DOCS = {
  'backend-site-url': {
    checks: 'A backend site URL is configured: the site origin derived from `NUXT_PUBLIC_BACKEND_URL` (or the `url` module option, or `CONVEX_DEPLOYMENT`), or `NUXT_PUBLIC_CONVEX_SITE_URL`, the base module\'s own variable, for a custom domain.',
    why: 'Without it the `/api/auth` proxy has no target, so nobody can sign in.',
    fix: 'Normally derived for you; set `NUXT_PUBLIC_BACKEND_URL` to point at another deployment, or `NUXT_PUBLIC_CONVEX_SITE_URL` for a custom domain or a self-hosted backend.',
  },
  'deployment-env': {
    checks: 'The deployment env could be read at all (`npx convex env list`).',
    why: 'Every `deployment-*` check reads it; without it they cannot run.',
    fix: 'Run `npx convex dev` once to provision a deployment, then run `doctor` again.',
  },
  'deployment-backend-environment': {
    checks: '`BACKEND_ENVIRONMENT` is set on the deployment: the kind of deployment, which decides email\'s test mode, the billing sandbox, the local origins auth trusts, the sign-in codes in the logs and the environment reports name. Under `--prod` its value is read (`convex env get`, compared and never printed): `production` passes; unset, `development` and `preview` fail; `sandbox`, a demo or staging app on purpose, warns, and so does a value that is none of the four.',
    prodFails: 'it is not set, or says `development` or `preview`',
    why: 'Without it every provider stays in its test mode: mail reaches only the email provider\'s test addresses, checkout takes test cards, and nobody pays. A `development` value on production also trusts local origins and logs sign-in codes.',
    fix: 'Run `npx nuxt-backend env push` (`--prod` for production): it derives the value from the deployment\'s kind, and `doctor --fix` does the same. A demo or staging app sets `sandbox` by hand (`npx convex env set --prod BACKEND_ENVIRONMENT sandbox`).',
  },
  'deployment-removed-env': {
    checks: 'None of the variables `0.2.0` removed is still set on the deployment: `EMAIL_TEST_MODE`, `BILLING_ENVIRONMENT`, `MONITORING_ENVIRONMENT`, `AUTH_TRUST_LOCAL_ORIGINS`, `NUXT_BACKEND_LOG_OTP`, `BILLING_SIMULATOR_URL` and `NUXT_BACKEND_SIMULATE_MODELS`. It warns and names each one it finds.',
    why: 'Nothing reads them any more, and they still say something the deployment no longer does: `BACKEND_ENVIRONMENT` decides the modes they once set.',
    fix: 'Remove each one: `npx convex env remove NAME` (`--prod` for production).',
  },
  'env-defaults': {
    checks: 'The project\'s preview env defaults hold `AUTH_SECRET` and `SITE_URL`, so a new preview deployment\'s first push goes through. Not checked with `--prod`, or when the defaults cannot be read.',
    why: 'A preview deployment starts with nothing but those defaults, and the push fails without the required pair.',
    fix: 'Run `npx nuxt-backend env push --defaults preview --site-url <url>`, or fill the preview\'s env in its build ([Preview deployments](/docs/reference/cli#preview-deployments)).',
  },
  'auth-secret': {
    checks: '`AUTH_SECRET` is set on the deployment, or visible locally, at least 32 characters and not a placeholder.',
    fails: 'it is too short or a placeholder',
    why: 'It signs sessions and encrypts the keys the session tokens are signed with; a weak one makes them guessable.',
    fix: 'Generate one (`openssl rand -base64 32`) and push it: `npx nuxt-backend env push`, or `doctor --fix` on a dev deployment.',
  },
  'site-url': {
    checks: '`SITE_URL` is a valid http(s) URL.',
    fails: 'it is malformed',
    why: 'Auth trusts it as the app origin, and invitation and gift emails link to it.',
    fix: 'Set `SITE_URL` to the app\'s origin, such as `https://app.example.com`.',
  },
  'deployment-auth-secret': {
    checks: '`AUTH_SECRET` is set on the deployment.',
    fails: 'it is not set',
    why: 'A deploy fails without it.',
    fix: '`npx nuxt-backend env push` provisions it on a dev deployment; set it yourself everywhere else.',
  },
  'deployment-site-url': {
    checks: '`SITE_URL` is set on the deployment.',
    fails: 'it is not set',
    why: 'A deploy fails without it.',
    fix: '`npx nuxt-backend env push` defaults it on a dev deployment; pass `--site-url` everywhere else.',
  },
  'page-paths': {
    checks: 'The paths the deployment serves on and links to (`paths` from the deployed `auth:authConfig`: the auth route, and the invitation, keep-account, security, waitlist, login, unsubscribe, report, settings and privacy pages) against the ones `nuxt.config` declares (`backend.authRoute` and `backend.pages`). They differ when the deployed code predates the generated `paths.generated.ts`, or does not pass its `paths` to `defineBackendAuthConfig`, `setupAuth` and `setupAccount`. No finding when the deployment or `nuxt.config` cannot be read.',
    fails: 'any path differs',
    why: 'A different auth route sends the proxy to routes the deployment does not serve, so nobody signs in; a different page path sends the email that links to it to a 404.',
    fix: 'Pass the generated `paths` on as the scaffold does, then let `npx convex dev` push, or deploy.',
  },
  'email-transport': {
    checks: '`EMAIL_API_KEY` is visible locally or set on the deployment.',
    why: 'Without it, email sends no-op and sign-in codes to real addresses are refused.',
    fix: 'Add the provider key to `.env.local` and push it (`npx nuxt-backend env push`, or `doctor --fix`).',
  },
  'email-webhook-secret': {
    checks: '`EMAIL_WEBHOOK_SECRET` is visible locally or set on the deployment.',
    why: 'Without it, delivery events are refused and `useEmailStatus` stays at `sent`.',
    fix: 'Add the endpoint\'s signing secret to `.env.local` and push it.',
  },
  'deployment-email-api-key': {
    checks: '`EMAIL_API_KEY` is set on the deployment.',
    why: 'Without it, email sends no-op and sign-in codes to real addresses are refused.',
    fix: 'Push it from `.env.local`: `npx nuxt-backend env push`, or `doctor --fix`.',
  },
  'deployment-email-from': {
    checks: '`EMAIL_FROM` is set on the deployment. Under `--prod`, unset fails, unless production is a deliberate sandbox (`BACKEND_ENVIRONMENT=sandbox`), where it warns.',
    prodFails: 'it is not set and the deployment is not a deliberate sandbox',
    why: 'Without it, the provider\'s onboarding sender is used, which delivers only to its test addresses and the account owner: sign-in codes, invitations and gifts to anyone else are refused.',
    fix: 'Set a sender on your verified domain, such as `Acme <hello@acme.com>`, and push it (`npx convex env set --prod EMAIL_FROM` on production).',
  },
  'deployment-email-webhook-secret': {
    checks: '`EMAIL_WEBHOOK_SECRET` is set on the deployment.',
    why: 'Without it, delivery events are refused and `useEmailStatus` stays at `sent`.',
    fix: 'Push it from `.env.local`: `npx nuxt-backend env push`, or `doctor --fix`.',
  },
  'email-webhook-route': {
    checks: 'An unsigned empty POST to `/email/events` on the site URL: `404` is not mounted and fails; `503` is mounted but fail-closed, its secret unset, and warns; any other 4xx is mounted and passes; any other status warns as unexpected, and an unreachable site warns.',
    fails: 'the route answers `404`',
    why: 'The provider delivers events there; unmounted, every delivery is lost.',
    fix: 'Mount it with `registerBackendRoutes` in `backend/http.ts`, and set `EMAIL_WEBHOOK_SECRET`.',
  },
  'billing-access': {
    checks: '`BILLING_ACCESS_TOKEN` is visible locally or set on the deployment.',
    why: 'Without it, billing queries return empty and checkout fails when called.',
    fix: 'Add an organization access token to `.env.local` and push it.',
  },
  'billing-webhook-secret': {
    checks: '`BILLING_WEBHOOK_SECRET` is visible locally or set on the deployment.',
    why: 'Without it, billing events are refused and entitlements refresh only on demand.',
    fix: '`npx nuxt-backend billing sync` creates the endpoint and stores its secret on the deployment.',
  },
  'deployment-billing-access-token': {
    checks: '`BILLING_ACCESS_TOKEN` is set on the deployment.',
    why: 'Without it, billing queries return empty and checkout fails when called.',
    fix: 'Push it from `.env.local`: `npx nuxt-backend env push`, or `doctor --fix`.',
  },
  'deployment-billing-webhook-secret': {
    checks: '`BILLING_WEBHOOK_SECRET` is set on the deployment.',
    why: 'Without it, billing events are refused and entitlements refresh only on demand.',
    fix: 'Run `npx nuxt-backend billing sync`, which stores the endpoint\'s secret there.',
  },
  'billing-webhook-route': {
    checks: 'An unsigned empty POST to `/billing/events` on the site URL: `404` is not mounted and fails; `503` is mounted but fail-closed, its secret unset, and warns; any other 4xx is mounted and passes; any other status warns as unexpected, and an unreachable site warns.',
    fails: 'the route answers `404`',
    why: 'The provider delivers events there; unmounted, entitlements never refresh on their own.',
    fix: 'Mount it with `registerBackendRoutes` in `backend/http.ts`, and run `billing sync`.',
  },
  'billing-webhook-enabled': {
    checks: 'Whether the billing provider still delivers to the deployment\'s `/billing/events` endpoint, read with the token visible here. Polar turns an endpoint off after 10 failed deliveries in a row. No finding without a token, or before `billing sync` made the endpoint.',
    why: 'An endpoint that is off receives nothing: subscriptions, orders and refunds never reach the deployment, and entitlements go stale.',
    fix: 'Fix what made the deliveries fail (`billing-webhook-route` says whether the route answers), then run `npx nuxt-backend doctor --fix`: once the route answers the probe, it turns the endpoint back on after you confirm, and you can [replay](/docs/ship/operate/replay) what Polar held back.',
  },
  'billing-webhook-events': {
    checks: 'Whether the deployment\'s billing endpoint is subscribed to every event the package handles (checkouts, customers, members, orders, subscriptions, refunds, products and benefits).',
    why: 'An event the endpoint is not subscribed to never reaches the deployment: a refund or a cancellation it misses leaves the app\'s copy wrong.',
    fix: 'Run `npx nuxt-backend doctor --fix`: it subscribes the endpoint to the missing events after you confirm.',
  },
  'billing-meter-usage': {
    checks: 'Every meter in `billing.catalog.ts` is funded by a plan or pack credit grant, or billed by a usage price.',
    why: 'An orphan meter records spends nobody pays for.',
    fix: 'Grant the meter\'s credits from a plan or a pack, bill it with a usage price, or drop it.',
  },
  'billing-organization': {
    checks: '`BILLING_ACCESS_TOKEN` is visible locally and the provider answers with it for the billing environment `BACKEND_ENVIRONMENT` names (the provider\'s sandbox unless it is `production`).',
    why: 'The cross-checks of the provider\'s settings below need it; they are skipped without it.',
    fix: 'Create a token for the environment you sync (an expired one, or one from the other environment, is refused).',
  },
  'billing-multiple-subscriptions': {
    checks: 'The provider allows one active subscription per customer when the catalog has several plans, or a free plan beside a paid one.',
    why: 'With several allowed, a customer can hold two plans at once and the plan-change flow cannot tell which to change. Every billing entity holds the free plan, so with one in the catalog a checkout outside the package leaves a customer on two.',
    fix: 'Turn off multiple subscriptions in the provider\'s organization settings, or set `multipleSubscriptions` on purpose.',
  },
  'billing-proration': {
    checks: 'How the provider settles a plan change (its proration setting).',
    why: 'It decides what a customer pays the moment they switch plans.',
    fix: 'Pick the proration behaviour you mean in the provider\'s organization settings.',
  },
  'billing-benefit-grace': {
    checks: 'The benefit revocation grace period, when the catalog grants features or credits.',
    why: 'With a grace period, a customer keeps features and credits after a subscription ends.',
    fix: 'Set the grace period to zero, or keep it on purpose.',
  },
  'billing-trial-abuse': {
    checks: 'Trial abuse prevention is on when a plan has a trial.',
    why: 'Without it, one customer can start the same trial again and again.',
    fix: 'Run `npx nuxt-backend doctor --fix`: it turns trial abuse prevention on at the provider after you confirm, or turn it on in the provider\'s organization settings.',
  },
  'billing-customer-emails': {
    checks: 'The provider\'s own customer emails for a confirmed order, a subscription, a renewal, a failed payment and a cancelled or ended subscription, and its renewal and trial reminders, are on.',
    why: 'Billing, gift and referral events reach people in the app only, and the app never sends a copy of the provider\'s emails. With these off, a renewal charge or a failed payment would reach no inbox at all while the person is away, and a yearly renewal or a trial\'s end would come without a reminder.',
    fix: 'Run `npx nuxt-backend doctor --fix`: it turns the emails back on at the provider after you confirm (never off), or turn them on in its dashboard, under Settings, Customer notifications.',
  },
  'billing-portal': {
    checks: 'The customer portal offers plan changes when the catalog has several plans.',
    why: 'Without it, `<BillingPortalLink>` opens a portal where the customer cannot switch plans.',
    fix: 'Turn on plan changes in the provider\'s customer portal settings.',
  },
  'billing-team-customers': {
    checks: 'Workspaces bill as team customers with members, and the token reads them (it also needs `members:write` and `customer_sessions:write`, which a read cannot check).',
    why: 'A workspace\'s owner and admins manage its billing through the customer\'s members.',
    fix: 'Turn on team customers, and give the token the member and customer-session scopes.',
  },
  'billing-gift-twins': {
    checks: 'Every pack has a private gift product with no benefits, at its pack\'s live prices in every currency. A pack or twin with no live fixed price warns too.',
    why: 'A gift buys the pack\'s twin; without one, gifts of that pack are refused, sold at the wrong price or in the wrong currency, or grant a benefit twice.',
    fix: 'Run `npx nuxt-backend billing sync`: it creates a missing gift product at the pack\'s live prices, moves one to the pack\'s prices in every currency, and detaches any benefit.',
  },
  'billing-pass-products': {
    checks: 'Every plan offered as a gift (`gift: { months }`) has a free, private pass product that carries the plan\'s benefits, and a private one-time purchase product per length with none.',
    why: 'A pass gift buys the purchase product and is claimed onto the pass product; without them gifts of that plan are refused, charge the recipient\'s card, grant the plan to its purchaser, or grant the recipient nothing.',
    fix: 'Run `npx nuxt-backend billing sync`: it creates the missing products. Make a public one private in the provider\'s dashboard.',
  },
  'billing-feature-benefits': {
    checks: 'Every catalog feature is the provider\'s native feature-flag benefit.',
    why: '`useFeatures().has(key)` matches the feature benefit\'s metadata; another benefit type never matches.',
    fix: 'Run `npx nuxt-backend billing sync` to create the feature benefits.',
  },
  'billing-promotion-limits': {
    checks: 'Every catalog discount with a `code` (a public promotion) has a `perCustomer` limit, a `maxRedemptions` cap and an `endsAt`. No finding when the catalog has no discounts.',
    why: 'Coupon sites list codes: a public one is redeemed by whoever finds it, as often as nothing stops them, for as long as it runs.',
    fix: 'Add the missing limits to the discount in `billing.catalog.ts`, then run `npx nuxt-backend billing sync`.',
  },
  'billing-promotion-portal': {
    checks: 'No `forever` discount is limited to some plans while the customer portal changes plans. No finding when the catalog has no discounts, or when the provider can\'t be read.',
    why: 'The provider keeps a subscription\'s discount across any plan change, so a customer who switches plans in the portal takes a discount meant for one plan onto another.',
    fix: 'Turn off plan changes in the provider\'s customer portal settings and switch plans through your own checkout, or give the discount a `once` or `{ months }` duration.',
  },
  'billing-provider-sdk': {
    checks: 'The provider SDK the billing component resolves (its peer, from `@convex-dev/polar`\'s own location, else the app\'s) is the 0.x line it is built on. No finding when it does not resolve.',
    why: 'The 1.0 SDK is a rewrite, and the billing component (`@convex-dev/polar` 0.9) breaks on it: its checkout, portal and webhook parsing.',
    fix: 'Pin `"@polar-sh/sdk": "^0.49.0"` in the app\'s `package.json` and reinstall, until a release of nuxt-backend supports the 1.x SDK.',
  },
  'agent-files': {
    checks: '`AGENTS.md` holds the `nuxt-backend` section the app\'s installed version writes (or the version-free one the templates ship), with its markers paired, `.mcp.json` has the `nuxt-backend` server (the developer MCP server), and every skill copy in `.agents/skills/` (and every copy of its own in `.claude/skills/`) is one the installed version ships, as it ships it: line endings and dotfiles aside. A project with no `AGENTS.md`, or with none or only some of the skills, passes with a note.',
    why: 'The section points coding agents at the skills in `node_modules`, which match the installed version, and agents read the copies in `.agents/skills/` on their own; a stale copy, or one of a skill the version no longer ships, sends them to names another version had.',
    fix: 'Run `npx nuxt-backend init --agents`: it rewrites only the section, adds the developer MCP server, and replaces the stale skill copies or removes them. A skill the project\'s `skills-lock.json` lists belongs to the skills CLI, which `init` leaves it to: `npx skills add ./node_modules/nuxt-backend/skills --skill \'*\' -y` reinstalls the installed version\'s. When the markers don\'t pair up, keep one start and one end marker around the section, or delete every marker, first.',
  },
  'name-collisions': {
    checks: 'The app\'s own components (`app/components/`, named as Nuxt names them) and composables (the top level of `app/composables/` and `app/utils/`), against the names the installed package and the Convex module under it register. It always passes: the message names each shared name and the file it is in.',
    why: 'A same-named component is how an app swaps a [part](/docs/reference/components/parts), so sharing a name is often meant. One shared by accident hides the package\'s from that app.',
    fix: 'Nothing, when you meant it. Otherwise rename yours.',
  },
  'bundle-duplicates': {
    checks: 'The last `npx nuxt-backend analyze` run, kept in `node_modules/.cache/nuxt-backend/analyze.json`: a package the Convex bundle holds more than once (the analyzer\'s `duplicate-package` insight) warns, and names each package with what removing the extra copies would save. A package that every component bundles again is not one, since Convex bundles each component on its own. `doctor` never runs the analyzer: there is no finding until a run exists, nor once a lockfile is newer than the run, since the install it measured has changed.',
    why: 'Each copy is code the deployment pushes and loads: two versions of one package, installed under different dependencies, are bundled twice.',
    fix: 'Dedupe the install (`pnpm dedupe`), or align the version your code asks for with the one a dependency uses, then run `npx nuxt-backend analyze --only convex` again: it names each copy and what imports it ([See what is inside your bundles](/docs/develop/analyze)).',
  },
  'ai-stream-route': {
    checks: 'An unsigned empty POST to `/ai/stream` on the site URL: `404` is not mounted and fails; any 4xx is mounted and passes; any other status warns as unexpected, and an unreachable site warns. Checked once `backend/ai.ts` exists.',
    fails: 'the route answers `404`',
    why: '`useAiStream` starts its streams there.',
    fix: 'Mount it with `registerBackendRoutes` in `backend/http.ts`.',
  },
  'ai-components': {
    checks: 'Whether the components `ai.chat` and `ai.knowledge` run on are mounted: a backend file that declares a chat needs `app.use(agent)` of `@convex-dev/agent/convex.config`, and one that declares a knowledge store `app.use(rag)` of `@convex-dev/rag/convex.config`, in `convex.config.ts`. Read from the source.',
    why: 'The app mounts the Agent and RAG components itself; without the mount, every chat message and every knowledge call is refused (`unavailable`).',
    fix: '`pnpm add @convex-dev/agent` (or `@convex-dev/rag`), then import its `convex.config` and `app.use` it in `backend/convex.config.ts`.',
  },
  'ai-spend-limit': {
    checks: 'On a production whose `BACKEND_ENVIRONMENT` is `sandbox`, a public demo, whether `setupAi` sets a `spendLimit`. Read from the source; no finding off a sandbox, or for a backend without `setupAi`. It runs under `--prod` only.',
    prodOnly: true,
    why: 'Anyone may sign up to a demo, and its model calls are real: a sandbox refuses every metered call, stream, job and chat reply (`not_ready`, reason `no_budget`) until a daily ceiling caps what they cost.',
    fix: 'Pass `spendLimit: { usdPerDay }` to `setupAi` in `backend/ai.ts` ([Cap the daily spend](/docs/build/ai/models#cap-the-daily-spend)).',
  },
  'deployment-ai-gateway-api-key': {
    checks: '`AI_GATEWAY_API_KEY` is set on the deployment, once a backend file names a `provider/model` id (in a `model` option or a `ctx.model()` call, as a string). With no model named, nothing needs it; on Convex Cloud with `@convex-dev/ai-sdk-provider` installed, the Convex AI Gateway answers on a paid plan, so it is optional there. An id built at run time is not read.',
    why: 'Convex runs actions on its own servers, never on Vercel, so the AI Gateway\'s keyless sign-in never reaches them: without the key, every call to a named model is refused.',
    fix: 'Create a key in the AI Gateway dashboard, add it to `.env.local`, then push it: `npx nuxt-backend env push` (`--prod` for production), or `doctor --fix`. See [Choose a model](/docs/build/ai/models).',
  },
  'deployment-provenance-private-key': {
    checks: '`PROVENANCE_PRIVATE_KEY` is set on the deployment, once a backend file turns provenance on (`setupAi({ provenance })` with anything but `false`, or a `ctx.storeImage` call). With provenance off, nothing needs it.',
    why: 'It signs the C2PA manifest `ctx.storeImage` writes into every generated image. Without it, images carry the IPTC source type only, with no signed manifest (`ai.provenance_unsigned`), which the EU AI Act\'s machine-readable marking expects from production.',
    fix: 'Run `npx nuxt-backend env push` (`--prod` for production), or `doctor --fix`: when `.env.local` has no key, it generates one with its certificate, keeps both there and sets them on the deployment. See [Label AI-generated content](/docs/build/ai/provenance#the-signing-key).',
  },
  'deployment-provenance-certificate': {
    checks: '`PROVENANCE_CERTIFICATE` is set on the deployment, once a backend file turns provenance on, as for `deployment-provenance-private-key`.',
    why: 'Each manifest carries the certificate chain its signature is checked with: without it, nothing is signed.',
    fix: 'Run `npx nuxt-backend env push` (`--prod` for production): it generates the key and the certificate together. For a named signer, put a certificate from a CA on the C2PA trust list and its key in the two variables. See [Label AI-generated content](/docs/build/ai/provenance#the-signing-key).',
  },
  'bot-protection': {
    checks: 'Whether the deployment checks for bots: it takes proofs (`PROTECTION_PROOF_SECRET`), challenge answers (`PROTECTION_CHALLENGE_SECRET_KEY`), or both. On a local deployment it passes as test mode, on a cloud dev deployment as development; under `--prod` it warns when neither is set, when production\'s env names cannot be read, or when production takes proofs only and nothing links the project to Vercel (no `.vercel/project.json`, no `VERCEL` in the env), where alone they are signed.',
    why: 'Without a bot check, a script can request sign-in codes and create accounts as fast as the rate limits allow, each code an email in your sending reputation. Off Vercel no proof is signed, so a deployment that takes proofs only refuses everyone.',
    fix: 'On Vercel, set production\'s own `PROTECTION_PROOF_SECRET` in the app\'s env and on the deployment (`npx convex env set --prod PROTECTION_PROOF_SECRET`), and link the project (`vercel link`) so doctor sees it. Elsewhere, set `NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY` for the app and `PROTECTION_CHALLENGE_SECRET_KEY` on the deployment. See [Turn on bot protection](/docs/build/auth/sign-in/bots).',
  },
  'protection-proof': {
    checks: 'The proof secret both sides hold: present on each, at least 32 characters, and the same value. With the secret here and on the deployment, doctor signs a proof for an empty sign-in code request with it, for the site URL it probes, and sends that: the deployment refuses it (`forbidden`, `bot_check`) when the secrets differ or that site URL is not its own `CONVEX_SITE_URL`, and answers anything else when they match. The request sends nothing and spends no limit, and the value never leaves this machine. Under `--prod` only the process env speaks for the app (`vercel env pull`), never `.env.local`, and it warns when production\'s secret shares a key with `.env.local`\'s.',
    fails: 'the deployment refuses the proof signed here, or, outside production, it takes proofs while the dev server has no secret to sign them with and no challenge stands in',
    why: 'The deployment refuses every protected request without a proof that passes: two different secrets refuse everyone, and a secret only on the app\'s side leaves the deployment\'s own URL open to anyone who skips the app. A proof names its deployment, so development\'s never passes on production; production holds its own secret all the same, so a leaked `.env.local` leaks nothing of it.',
    fix: 'In development, one value in `.env.local` and on the dev deployment: `npx nuxt-backend env push --force PROTECTION_PROOF_SECRET`. On production, its own value, generated with `openssl rand -base64 32` and set on the deployment (`npx convex env set --prod PROTECTION_PROOF_SECRET`) and in the app host\'s production env, never pushed from `.env.local`.',
  },
  'protection-challenge-keys': {
    checks: 'The challenge\'s two keys: the site key the app shows (`NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY`) and the secret key the deployment verifies with (`PROTECTION_CHALLENGE_SECRET_KEY`), both or neither. A site key alone warns; the secret key alone refuses every code request without a proof. Under `--prod` it reads the app\'s keys from the shell\'s env only (`vercel env pull`): the provider\'s test keys found there fail, and a deployment that verifies answers while no site key is visible warns, since doctor cannot check it.',
    fails: 'the deployment asks for answers the app never gives (and no proof stands in), or production runs on the provider\'s test keys',
    why: 'A widget nothing verifies protects nothing; a deployment that wants an answer the app never sends refuses everyone; the test keys answer the same for every caller.',
    fix: 'Create a widget in the provider\'s dashboard, set its site key for the app and its secret key on the deployment (`npx nuxt-backend env push`), or remove both.',
  },
  'waitlist-bot-check': {
    checks: 'Whether a waitlist\'s join is checked for bots. An app with `backend/waitlist.ts` passes the join through `verifyHuman`, which lets everyone in while the deployment holds neither `PROTECTION_PROOF_SECRET` nor `PROTECTION_CHALLENGE_SECRET_KEY`. It runs under `--prod` only; development answers human and says so.',
    prodOnly: true,
    why: 'Each join asks for a sign-in code, so an unchecked form is a way to send mail to any address and to fill the list with addresses nobody owns.',
    fix: 'On Vercel, set production\'s own `PROTECTION_PROOF_SECRET` in the app\'s env and on the deployment; elsewhere set the challenge\'s site key for the app and its secret key on the deployment ([Block bots](/docs/build/auth/sign-in/bots)).',
  },
  'contact-bot-check': {
    checks: 'Whether the contact form can be used. An app whose `backend/email.ts` re-exports `submitContactMessage` passes each message through `verifyHuman`, and on production the form is refused while the deployment holds neither `PROTECTION_PROOF_SECRET` nor `PROTECTION_CHALLENGE_SECRET_KEY`. It runs under `--prod` only; development answers human and says so.',
    prodOnly: true,
    why: 'A public form nothing checks is a way to fill your team\'s inbox, so production refuses it until the bot check is set up.',
    fix: 'On Vercel, set production\'s own `PROTECTION_PROOF_SECRET` in the app\'s env and on the deployment; elsewhere set the challenge\'s site key for the app and its secret key on the deployment ([Block bots](/docs/build/auth/sign-in/bots)).',
  },
  'protection-guest-jobs': {
    checks: 'Whether a job queue open to signed-out visitors (`guest` on `defineJobQueue` or a kind) has `PROTECTION_PROOF_SECRET` on the deployment. No finding when no visitor may start a job.',
    why: 'A guest job needs a proof that names its visitor, signed with `PROTECTION_PROOF_SECRET` like the visitor cookie: without it, every guest job is refused.',
    fix: 'Add `PROTECTION_PROOF_SECRET` to `.env.local` and run `npx nuxt-backend env push` (`--prod` for production); the Nuxt server needs the same value ([Let guests generate](/docs/build/ai/jobs/guests)).',
  },
  'deployment-protection-proof-secret': {
    checks: '`PROTECTION_PROOF_SECRET` is set on the deployment. Unset passes: the deployment then takes no proof. It warns when `.env.local` holds one the deployment lacks.',
    why: 'The deployment checks a proof only with the secret the app\'s server signs it with.',
    fix: 'Add it to `.env.local` and run `npx nuxt-backend env push` (`--prod` for production), or `doctor --fix`.',
  },
  'deployment-protection-challenge-secret-key': {
    checks: '`PROTECTION_CHALLENGE_SECRET_KEY` is set on the deployment. Unset passes: the deployment then takes no challenge answer. It warns when `.env.local` holds one the deployment lacks.',
    why: 'The deployment verifies a challenge answer with the provider under this key.',
    fix: 'Add it to `.env.local` and run `npx nuxt-backend env push` (`--prod` for production), or `doctor --fix`.',
  },
  'consent-urls': {
    checks: 'Whether each required consent that `setupAccount({ consents })` declares in `backend/account.ts` has a `url`. It reads the declaration from the source, so a `consents` that is not an object literal in the call is left alone. It runs under `--prod` only.',
    prodOnly: true,
    why: 'The agreement line on the sign-up form and the prompt that asks again after a change link each kind to its `url`: a required kind without one points nowhere, and a person cannot read what they agree to.',
    fix: 'Add the page of the document as the kind\'s `url`, such as `/terms` ([Record consents](/docs/build/auth/accounts/consents#declare-your-consents)).',
  },
  'site-url-origin': {
    checks: 'Production\'s `SITE_URL`, its origin read off the deployment (`convex env get --prod SITE_URL`; the app\'s public origin, no secret, so the findings print it): an `https` origin passes; one on this machine (`localhost`, a `.localhost` name, a loopback address), a plain `http` one or no URL at all fails. An `https` origin of its own is the site the live probes below check; nothing is probed over plain HTTP, so this finding alone reports it. No finding when `SITE_URL` is not set (`deployment-site-url` fails).',
    prodFails: 'it is a local origin, plain HTTP, or not a URL',
    prodOnly: true,
    why: 'Auth trusts it as the one browser origin, and every emailed link starts with it: left at the dev default, links point at the developer\'s machine; over plain HTTP, browsers keep passkeys and secure cookies away.',
    fix: 'Set the app\'s public origin on production: `npx convex env set --prod SITE_URL https://app.example.com`.',
  },
  'site-gated-page': {
    checks: 'An anonymous request to a page behind the sign-in gate (`backend.pages.settings`, `/settings` by default) on production\'s site: a redirect to the sign-in page (`backend.pages.login`) passes; a `200` that carries a cache\'s mark (`x-vercel-cache` `HIT`, `STALE` or `PRERENDER`, `cf-cache-status: HIT`, `x-nitro-prerender`, an `age`) fails; any other `200`, a redirect elsewhere, a `404` or no answer warns.',
    prodFails: 'the page is served to an anonymous visitor from a cache',
    prodOnly: true,
    why: 'A private page rendered once and cached is served to everyone, with the data of whoever it was rendered for; one rendered only in the browser sends its shell before the gate runs.',
    fix: 'Drop the `swr`, `isr`, `cache` or `prerender` route rule that reaches the page (the module exempts private pages at their exact paths only), and keep server rendering on for it.',
  },
  'site-auth-proxy': {
    checks: 'An anonymous `GET <authRoute>/ok` (`/api/auth/ok` by default) on production\'s site, Better Auth\'s own health answer through the sign-in proxy: `{ ok: true }` passes; a `5xx` fails; a `404`, another answer or none warns.',
    prodFails: 'the proxy answers `5xx`: it cannot reach the deployment',
    prodOnly: true,
    why: 'The proxy forwards to the HTTP routes\' origin the build baked in, derived from the backend URL the build knew. A build that knew none (`NUXT_PUBLIC_BACKEND_URL` set for the runtime only) leaves it empty, and every sign-in request fails.',
    fix: 'Set `NUXT_PUBLIC_BACKEND_URL` where the app builds, or set `NUXT_PUBLIC_CONVEX_SITE_URL` on the app\'s host to the deployment\'s `https://<name>.convex.site` URL, then redeploy ([Deploy to Vercel](/docs/ship/deploy/vercel#the-backends-url-at-build)).',
  },
  'admin-bootstrap': {
    checks: 'Whether an account on the deployment holds the `admin` role, read off the auth tables of the `backend` component (`convex run --component backend --inline-query`, which answers `true` or `false` and reads no address). An account whose roles include `admin` passes (`admin,support` too); none warns. Only the `admin` role itself is looked for: administrators who hold only a role of the app\'s own read as none, so give them `admin` as well. No finding when the deployment cannot be read, or when it holds more than 8,000 accounts and none of the first 8,000 is an administrator.',
    why: 'Until an account holds the role, nobody can open the admin console at `/admin`, ban an account, sign its devices out or act as it to help.',
    fix: 'Sign in once with your address, then run `npx nuxt-backend doctor --fix` at a terminal and enter it: the scaffold\'s `setUserRole` makes that account an administrator and records the change on the activity trail. Without a terminal: `npx convex run functions:setUserRole \'{"email":"you@example.com","role":"admin"}\'` ([Run the admin console](/docs/build/auth/admin)).',
  },
  'deployment-email-dev-inbox': {
    checks: '`EMAIL_DEV_INBOX`, the dev inbox\'s page reader, once it is set (unset, `getSandboxInbox` answers nothing and there is usually no finding). Set outside production passes. Set on a deployment whose `BACKEND_ENVIRONMENT` is `production` warns, and under `--prod` so does a production that is not a deliberate `sandbox`. Under `--prod`, a deliberate `sandbox` whose `backend/email.ts` re-exports `getSandboxInbox` warns while it is unset: the demo publishes an inbox that answers nothing.',
    why: 'The reader is opt-in and never answers on production: left set there, the variable says the inbox is published when it is not.',
    fix: 'On production, remove it: `npx convex env remove --prod EMAIL_DEV_INBOX`. `npx nuxt-backend dev` sets it on dev deployments and `npx nuxt-backend deploy --sandbox` on a sandbox; set it by hand on a preview that publishes the inbox.',
  },
  'email-sender-domain': {
    checks: 'What production reports of its own email (`posture:email`, run with production\'s admin key; the deployment asks the email provider with its own `EMAIL_API_KEY`, and only derived facts come back): the domain of `EMAIL_FROM` is verified in the provider account that key belongs to, with sending on. Verified passes; partly verified, or verified with a record the provider no longer finds (`temporary_failure`), warns; not verified, not in the account, sending off, or an `EMAIL_FROM` that holds no address fails. A key the provider refuses (deleted, inactive, suspended) fails too; a key that may only send, a provider that does not answer, and a deployment that does not report (a release before `posture:email`, or a Convex CLI that cannot reach production or times out) warn. No finding without `EMAIL_FROM` or `EMAIL_API_KEY`: their `deployment-*` findings report those.',
    prodFails: 'the domain is not verified, not in the key\'s account, or not sending; the key is refused; or `EMAIL_FROM` holds no address',
    prodOnly: true,
    why: 'The provider refuses mail from a domain its account has not verified, so every sign-in code would be refused on the day of launch.',
    fix: 'Add the domain in the email provider\'s dashboard, publish the DNS records it lists and wait for it to verify, or set `EMAIL_FROM` to an address on a verified domain ([Get email into inboxes](/docs/build/email/delivery/deliverability)). For a refused key, create one and set it: `npx convex env set --prod EMAIL_API_KEY`.',
  },
  'email-reputation': {
    checks: 'The last 7 days of production\'s sending, as the email provider counts them (read with a full-access key): the bounce rate (bounced over sent) against the provider\'s limit of 4%, and the complaint rate (marked as spam over delivered) against 0.08%. Under half of each passes, and so does a week with nothing sent; from half the limit it warns; above it, it fails once 100 or more were sent, and warns on fewer, where one bounce moves the rate too far.',
    prodFails: 'a rate is above the provider\'s limit, on 100 sends or more',
    prodOnly: true,
    why: 'Above either limit, the provider may pause the account\'s sending until the rate falls, and sign-in codes stop with everything else.',
    fix: 'Find the cause in the email provider\'s dashboard: addresses that no longer exist, or sign-ups by bots ([Turn on bot protection](/docs/build/auth/sign-in/bots)), then send less until the rates fall.',
  },
  'email-key-permission': {
    checks: 'The reach of the deployment\'s `EMAIL_API_KEY`, as its own email sync reads it (a dry run of `email:syncEmail`): a full-access key passes, a key that may only send warns. No finding without a key, or without `syncEmail` re-exported from `backend/email.ts`.',
    why: 'Topics, contacts, segments and the webhook need a full-access key: with a sending key, nobody\'s choices reach the provider and `email sync` can create nothing.',
    fix: 'Create a full-access key at the email provider, put it in .env.local and run `npx nuxt-backend env push --force`.',
  },
  'email-topics': {
    checks: 'Whether every topic `setupEmail({ topics })` declares exists at the email provider, with the same name, description and default subscription. Only when topics are declared.',
    why: 'A topic missing at the provider has no id on the deployment: a person\'s choice stays on the deployment and never reaches the provider\'s contact, so a broadcast to the topic misses them.',
    fix: 'Run `npx nuxt-backend email sync`, or `doctor --fix`. A topic whose default differs was made by the provider with the other default, which it cannot change: rename the topic to make a new one.',
  },
  'email-flows': {
    checks: 'Whether every lifecycle flow `setupEmail({ lifecycle })` turns on runs on the deployment as the code declares it, and has its template and its automation at the email provider. Only when flows are declared.',
    why: 'A flow `email sync` has not caught up with starts nothing: the deployment runs the flows from the settings the last sync kept, and an email whose automation is missing at the provider is never sent.',
    fix: 'Run `npx nuxt-backend email sync`, or `doctor --fix`. A template the provider has already is left as it is, so an edit made in its editor stays.',
  },
  'email-webhook-events': {
    checks: 'Whether the email provider has a webhook at the deployment\'s `/email/events` that sends every event the package reads: delivery status, `email.clicked`, `contact.topics.updated` and `suppression.*`.',
    why: 'Without `contact.topics.updated`, a choice made on the provider\'s own page never reaches the deployment, and a send under a topic would still go to a person who left it. Without `email.clicked`, the sunset rule sees no clicks.',
    fix: 'Run `npx nuxt-backend email sync`, or `doctor --fix`: it adds the events, or creates the webhook and stores its secret as `EMAIL_WEBHOOK_SECRET`.',
  },
  'email-webhook-enabled': {
    checks: 'Whether the email provider still delivers to the deployment\'s webhook, read by the deployment\'s own email sync as a dry run. Resend turns off a webhook whose deliveries keep failing.',
    why: 'A webhook that is off receives nothing: bounces, complaints and topic changes never reach the deployment, so a send may go to an address that bounced or a person who left the topic.',
    fix: 'Fix what made the deliveries fail (`email-webhook-route` says whether the route answers), then run `npx nuxt-backend doctor --fix`: once the route answers the probe, it turns the webhook back on after you confirm, and you can [replay](/docs/ship/operate/replay) what was held back.',
  },
  'email-region': {
    checks: '`EMAIL_REGION` against the region the email provider sends the sending domain\'s mail from (`EMAIL_FROM`\'s domain), read by the deployment\'s own `email sync` dry run. A mismatch warns, naming the region to set; unset with a known region passes and says so. No finding while the domain\'s region is unknown.',
    why: 'The provider sets the region per domain. `EMAIL_REGION` records it for the privacy pages and the data map, so a stale value names the wrong place your mail goes through.',
    fix: 'Set `EMAIL_REGION` to the region the finding names in `.env.local` and run `npx nuxt-backend env push` (`--prod` for production).',
  },
  'email-postal-address': {
    checks: 'Under `--prod`, whether the brand has a postal address when topics are declared: `brand.address` on setupEmail or in app config.',
    prodOnly: true,
    why: 'CAN-SPAM asks every commercial email for the sender\'s valid postal address, and every email under a topic carries it in its footer.',
    fix: 'Set `brand.address` in `appConfig.backend.brand` (or on setupEmail) to a real, current postal address.',
  },
  'email-marketing-from': {
    checks: 'Under `--prod`, whether `EMAIL_MARKETING_FROM` is set when topics are declared.',
    prodOnly: true,
    why: 'Without it, marketing mail goes from `EMAIL_FROM`: a spam complaint about a newsletter then counts against the address that sends sign-in codes.',
    fix: 'Set `EMAIL_MARKETING_FROM` to an address on a subdomain of its own, and run `npx nuxt-backend env push --prod`.',
  },
  'email-quota': {
    checks: 'The sending quota production\'s account has used, as the email provider\'s response headers report it: a daily quota (the free plan\'s) warns, with what it has used today and this month; a monthly quota alone passes. No finding when no header carries it.',
    prodOnly: true,
    why: 'Once a daily quota is reached, every send stops until midnight UTC, sign-in codes included: a launch day\'s sign-ups can reach it by noon.',
    fix: 'Move the account to a paid plan before launch: it has a monthly quota only.',
  },
  'billing-catalog-production': {
    checks: 'Every price of a plan still sold (`pro`, `pro:year`), every pack and every meter of `billing.catalog.ts` has its production id in `billing.generated.ts`, which `billing sync --env production` writes. A retired plan is not asked for. A gap fails once production bills in the production environment, and warns while it bills in the sandbox, on purpose or by default. No finding without a catalog, or when the id map does not load.',
    prodFails: 'production bills in the production environment and an id is missing',
    prodOnly: true,
    why: 'The backend looks a product up by its catalog key in the production ids: one without its id cannot be checked out, and a meter without its id records no spend.',
    fix: 'Run `npx nuxt-backend billing sync --env production`, and commit the `billing.generated.ts` it writes.',
  },
  'site-https': {
    checks: 'An anonymous request to the root of production\'s site, at the `https` origin its `SITE_URL` names, following its redirects: answered at that origin, with `Strict-Transport-Security` for a day or more. A redirect to plain HTTP fails; a redirect to another origin, no HSTS, a shorter one or a `5xx` warns. A site that was not probed at all is one warning, on the first probe the run checks (this one, else `site-gated-page`, `mcp-challenge` or `monitoring-health`), and no other probe runs: a site that does not answer, or, in a run without the auth capability, whose `site-url-origin` would say so, a `SITE_URL` that names no `https` origin of its own.',
    prodFails: 'the root redirects to plain HTTP',
    prodOnly: true,
    why: 'Without HTTPS, sessions and sign-in codes cross the network in the clear; without HSTS, a browser may try plain HTTP first; on another origin, the browser holds sessions and passkeys for an origin auth does not trust.',
    fix: 'Serve the app over HTTPS at the origin `SITE_URL` names, and keep the security headers on (nuxt-security, which the module registers, sends HSTS for 180 days).',
  },
  'site-csp': {
    checks: 'The root\'s `Content-Security-Policy`: in every policy it holds (a header sent twice, by the app and by the host or a proxy, is two, and browsers enforce each), `connect-src` (else `default-src`) lets the browser reach the deployment the page talks to and its WebSocket twin (`https://<slug>.convex.cloud` and `wss://<slug>.convex.cloud`), as browsers match sources: an exact origin, a `*.` host, a scheme, `*`. A gap fails; a WebSocket let through only by its `https` origin\'s source warns (current browsers connect, some older engines do not); no policy at all warns. A page that names no deployment URL (a custom domain for the deployment) leaves the policy unjudged, and `site-backend-url` warns.',
    prodFails: 'the policy blocks the deployment or its WebSocket',
    prodOnly: true,
    why: 'A policy that blocks the deployment blocks every query, mutation and realtime update in the browser; with no policy, an injected script may send data anywhere.',
    fix: 'The module adds the deployment the page talks to (its runtime config) to `connect-src` of the security headers\' `/**` rule, so a gap comes from elsewhere: a policy the app host or a proxy adds, a route rule more specific than `/**` that sets its own `connect-src`, or the module\'s policy turned off (`contentSecurityPolicy: false`) with one set elsewhere. Add the deployment\'s `https://` and `wss://` origins there ([Security](/docs/ship/security)).',
  },
  'site-backend-url': {
    checks: 'The deployment the root page names in its inlined runtime config is production\'s (the URL `convex function-spec --prod` reports). Another deployment\'s URL (dev\'s, after a build with `.env.local`) fails; no deployment URL at all (a custom domain for the deployment) warns.',
    prodFails: 'the page talks to another deployment',
    prodOnly: true,
    why: 'An app built against dev serves production\'s visitors dev\'s data, signs them in there, and bills them nowhere.',
    fix: 'Build the app against production: set `NUXT_PUBLIC_BACKEND_URL` in the app host\'s production env to production\'s deployment, or build with `npx convex deploy --cmd \'npm run build\' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL`; then redeploy the app ([Deployment](/docs/ship/deploy)).',
  },
  'agent-docs': {
    checks: 'Production\'s `/llms.txt`, where the app serves docs for agents (nuxt-llms configured, as Docus does, or listed as a module): a text document that starts with a heading passes; anything else warns. An app that neither declares nor serves it gets no finding.',
    prodOnly: true,
    why: 'Coding agents read `/llms.txt` to learn the app\'s docs; a declared one that is missing points them at nothing.',
    fix: 'Check the `llms` options in nuxt.config, and that the build ran its module.',
  },
  'convex-codegen': {
    checks: '`<functions dir>/_generated` exists.',
    why: 'Without codegen, the app has no typed API and the platform features no-op.',
    fix: 'Run `npx convex dev` (or `npx nuxt-backend dev`).',
  },
  'paths-file': {
    checks: '`<functions dir>/paths.generated.ts` exists and holds the paths `nuxt.config` declares (`backend.authRoute`, and `backend.pages` for the invitation, keep-account, security, waitlist, login, unsubscribe, report, settings and privacy pages), read as the module reads them: options written inline in `modules` over the `backend` key. Missing or out of date warns, naming each path that differs. So does a backend file that does not import it while `nuxt.config` moves a path its helper reads: `auth.config.ts` (the auth route), `auth.ts`, `account.ts` (the keep-account page), `waitlist.ts` (the sign-in page) or `access.ts` (the sign-in and privacy pages). No finding before there is a functions directory, or when `nuxt.config` cannot be loaded.',
    why: 'The backend reads its paths from that file: without it, with an old one, or in a file that does not pass it on, the auth routes and the links in its emails point at the default paths, or at pages that moved. An `auth.config.ts` kept from `0.1` serves the token keys under `/api/auth` while the proxy moves, and nobody signs in.',
    fix: 'Run `npx nuxt-backend doctor --fix` (any `nuxt prepare`, `dev` or `build` writes it too), commit the file and push the functions. In a file that does not pass it on, import `paths` from `./paths.generated` and pass it as the scaffold does.',
  },
  'brand-file': {
    checks: '`<functions dir>/brand.generated.ts` exists and holds the brand `app.config` declares (`backend.brand`: `name`, `logo` and `address`, each written as a literal), the app\'s own over a layer\'s. Missing or out of date warns. No finding before there is a functions directory, or when `nuxt.config` cannot be loaded.',
    why: 'The backend never reads app config: its emails and passkey prompts read the brand from that file. Without it, or with an old one, the emails name the app otherwise than its pages, and marketing email lacks the postal address.',
    fix: 'Run `npx nuxt-backend doctor --fix` (any `nuxt prepare`, `dev` or `build` writes it too), commit the file and push the functions.',
  },
  'dev-script': {
    checks: 'Reported only when `scripts.dev` is `convex dev --start "nuxt dev"`, which never starts Nuxt on a new deployment.',
    why: 'Convex starts the command only after a successful push, and a new deployment lacks the env that push needs.',
    fix: '`doctor --fix` points it at `nuxt-backend dev`.',
  },
  'convex-config': {
    checks: '`convex.config.ts` mounts every component the scaffold\'s own mounts, plus each component the scaffold leaves out once a file of the functions directory imports it directly (the action cache, an aggregate, migrations, or `Crons` from `@convex-dev/crons`), and forwards every env name the scaffold forwards to the `backend` component (`MONITORING_DSN` among them) when it forwards an `env` object at all, and forwards none of the names `0.2.0` removed (`EMAIL_TEST_MODE`, `MONITORING_ENVIRONMENT` and the rest), and `http.ts` passes every route group the scaffold\'s passes to `registerBackendRoutes`. Both lists are read from the scaffold of the installed version. A mount anywhere in the file counts, a branch included; a component marked `// nuxt-backend-unmounted: <name>` is left out on purpose. A file that does not parse warns.',
    fails: 'a missing component is already needed by a backend file (`components.<name>`, a helper that reads it such as `setupRateLimiter`, or a direct import of one the scaffold leaves out), or the mount forwards a name `0.2.0` removed, which the deployment no longer declares, so the push fails',
    why: 'A project scaffolded by an earlier release lacks what later ones added, and the features that need it stay off; a component the code needs but nothing mounts fails the push.',
    fix: '`doctor --fix` adds each missing import and `app.use(…)`, each missing forwarded env name, and each missing route group with its import after the ones the scaffold lists before it, and deletes a forward `0.2.0` removed when it is the scaffold\'s own line (`NAME: app.env.NAME`, a comment ending the line going with it; one written another way stays, and it says so), keeping a BOM, CRLF line ends and comments. It mounts only on a top-level `defineApp()` variable, re-parses the result before writing it, and leaves alone, saying why: a file that does not parse, an app built in a function, an import it cannot match to a mount, a scaffold name mounted from another file, and an optional mount while its package is not installed.',
  },
  'function-contract': {
    checks: 'Every function the composables bind to (`auth:getAuthUser`, `billing:getCredits`, `email:getEmailStatus` and the rest) exists in `npx convex function-spec`.',
    fails: 'any is missing',
    why: 'A composable whose function is gone reads `undefined` without an error.',
    fix: '`doctor --fix` restores a missing scaffold file; restore a removed export by hand ([Project files](/docs/reference/configuration/project-files)).',
  },
  'deployment-push-public-key': {
    checks: '`PUSH_PUBLIC_KEY` is set on the deployment: the public half of the web push key pair.',
    why: 'Without it the in-app inbox and email notifications work, but web push does not: `usePushSubscription` reads unsupported, and no push goes out.',
    fix: 'Run `npx nuxt-backend env push` (`--prod` for production), or `doctor --fix`: it generates the pair when the deployment has none, keeps the dev deployment\'s in `.env.local`, and gives production a pair of its own. See [Send web push notifications](/docs/build/email/notifications/web-push#create-the-keys).',
  },
  'deployment-push-private-key': {
    checks: '`PUSH_PRIVATE_KEY` is set on the deployment, as for `deployment-push-public-key`.',
    why: 'It signs every push and stays on the deployment. Without it web push is off, as without the public key.',
    fix: 'Run `npx nuxt-backend env push` (`--prod` for production). Never replace a pair a deployment has: browsers bind their subscriptions to its public key.',
  },
  'installable': {
    checks: 'The app is installable: `public/icon-192.png` and `public/icon-512.png` exist and app.config names the brand (`backend.brand.name`), so the module serves `/manifest.webmanifest`. A missing icon or brand name warns once the app reaches for it, with one icon in place; before that it passes and says what is missing. No finding for an app with a manifest of its own (a PWA module, or a manifest in `public/`).',
    why: 'iPhone and iPad take web push only from an app added to the Home Screen, and a browser offers the install only with a manifest and its icons.',
    fix: 'Add two square PNG icons with a solid background to `public/`, and set `backend.brand.name` in app.config. See [Make the app installable](/docs/build/email/notifications/installable).',
  },
  'deployment-monitoring-dsn': {
    checks: '`MONITORING_DSN` is set on the deployment. Unset on a dev deployment passes: the dev server\'s local error log stands in.',
    why: 'Without it the backend reports nothing: errors in its actions and its cron check-ins go nowhere.',
    fix: 'Add the DSN to `.env.local` and push it: `npx nuxt-backend env push --prod`, or `doctor --fix` on a dev deployment.',
  },
  'monitoring-app': {
    checks: 'Where a DSN is visible to the app (`MONITORING_DSN`, or the `NEXT_PUBLIC_SENTRY_DSN` Sentry\'s Vercel integration sets), that `@sentry/nuxt` is installed for the module to wire it. Without a DSN it passes in dev; under `--prod` it warns, unless the app deploys to Vercel and its env is not here to read.',
    why: 'A DSN without the SDK, or no DSN at all, reports nothing from the browser or the Nuxt server.',
    fix: 'Install it: `npm install @sentry/nuxt`, and set the DSN where the app runs. The module wires it at the next build ([Monitoring](/docs/ship/operate/monitoring)).',
  },
  'monitoring-source-maps': {
    checks: 'Reported only for an app that deploys to Vercel (a Vercel build, or a project linked with `vercel link`) with a DSN and the SDK: that `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are visible, the names Sentry\'s Vercel integration sets.',
    why: 'A build without them uploads no source maps, so stack traces stay minified, and no release is named.',
    fix: 'Install Sentry\'s Vercel integration; `vercel env pull .env.local` brings its names here to check.',
  },
  'monitoring-health': {
    checks: 'An anonymous request to production\'s health endpoint (`/api/backend/health`): its public shape, `{ status, capabilities }` with every capability in a known state and no `detail`, passes for `ok` and `degraded` and warns for `failing`. The detail shown to an anonymous caller fails; a `404`, another shape or no answer warns.',
    prodFails: 'it shows the capabilities\' detail to an anonymous caller',
    prodOnly: true,
    why: 'Uptime checks read the public shape; the detail names env names and findings, which only admins should see.',
    fix: 'Production shows the detail to everyone only when its `BACKEND_ENVIRONMENT` says `development`: name it `production` with `npx nuxt-backend env push --prod --force BACKEND_ENVIRONMENT` (`env push` leaves a value already set unless forced).',
  },
  'monitoring-usage-alerts': {
    checks: 'Production\'s usage limits, as `npx convex deployment usage-limits list --prod --json` prints them: an active `warning` limit on some metric, and on `aiGatewayCostDollars` too when models go through the Convex AI Gateway (`@convex-dev/ai-sdk-provider` installed). A limit past its threshold warns. Limits that cannot be read pass, saying so.',
    prodOnly: true,
    why: 'The deployment cannot read its own usage, so the backend raises no alert for it: Convex\'s `warning` usage limit is the alert, an email to the team on a production deployment, before a bill or a `disable` limit that pauses the whole app.',
    fix: 'Set one with `npx convex deployment usage-limits set --prod --metric functionCalls --window month --type warning --limit <calls>`, and `--metric aiGatewayCostDollars` in dollars for the gateway ([Alerts](/docs/ship/operate/monitoring#alerts)).',
  },
  'analytics-metrics': {
    checks: 'The billing access token visible here reads the provider\'s metrics: a read of their date limits, which takes the `metrics:read` scope. No token here is `billing-access`\'s finding, so this one is not reported then.',
    why: 'The admin console\'s Revenue view reads the provider\'s metrics each time it opens. Without the scope, every read is refused as `unavailable` ([Read revenue and usage](/docs/build/growth/measure/revenue)).',
    fix: 'Issue an organization access token with the `metrics:read` scope besides the ones it has, put it in `.env.local`, and run `npx nuxt-backend env push`.',
  },
  'analytics-activation': {
    checks: 'The event kind of the app\'s own (`app.…`) that `setupAudit({ activation })` names in `backend/audit.ts` is recorded by another backend file. No activation named (an account\'s first `app.*` event counts) and a package kind say nothing.',
    why: 'The growth funnel counts a person\'s activation when that event is recorded for them. A kind nothing records leaves the activation step at zero ([Measure growth](/docs/build/growth/measure#name-your-activation-event)).',
    fix: 'Record the kind where a person first gets value, with `audit.recordBackendEvent(ctx, { type })`, or name the kind you already record.',
  },
  'monitoring-backend-exceptions': {
    checks: 'A reminder, never a failure: reported under `--prod`, or once `MONITORING_DSN` is on the deployment. Queries and mutations cannot post a report, so their errors are reported where they are called.',
    why: 'Only the backend\'s own exception reporting sees every exception of a query or a mutation, with its real message.',
    fix: 'Turn it on in the deployment\'s dashboard (a Pro plan setting); nothing to change in the app.',
  },
}

/** Every finding id, in report order: by capability, then as its group's file lists them. */
export const findingIds = () => Object.keys(FINDINGS)

/** When a finding fails, in dev and under `--prod`, as its entry's table says it. */
function severities(entry, docs) {
  const dev = docs.prodOnly ? 'Not checked' : docs.fails ? `Fails when ${docs.fails}; otherwise warns` : 'Warns, never fails'
  if (entry.prod === 'fail') return { dev, prod: 'A warning fails' }
  if (docs.prodFails) return { dev, prod: `Fails when ${docs.prodFails}; otherwise warns` }
  return { dev, prod: docs.fails ? 'As in dev' : docs.prodOnly ? 'Warns, never fails' : 'Still a warning' }
}

/**
 * A finding's entry: what it checks, its severity in dev and under `--prod`,
 * why it matters and its fix. The docs MCP's `get-diagnostic` answers with it
 * (docs-mcp.mjs).
 */
export function findingEntry(id) {
  const entry = FINDINGS[id]
  const docs = FINDING_DOCS[id]
  if (!docs) throw new Error(`finding ${id} has no entry in FINDING_DOCS (scripts/docs-lookups/cli.mjs)`)
  const { dev, prod } = severities(entry, docs)
  return blocks(
    `### \`${id}\``,
    docs.checks,
    table(['Capability', 'Title', 'In dev', 'Under `--prod`', '`--fix`'], [[
      code(entry.capability),
      entry.title,
      dev,
      prod,
      entry.fixable ? 'Applies the fix' : 'No',
    ]]),
    `**Why it matters:** ${docs.why} **Fix:** ${docs.fix} ${docs.verify ?? `Check it again with \`npx nuxt-backend doctor --only ${entry.capability}${docs.prodOnly || docs.prodFails ? ' --prod' : ''}\`.`}`,
  )
}

/** Every finding, grouped under its capability; a capability with no finding of its own is left out. */
export function diagnostics() {
  const extra = Object.keys(FINDING_DOCS).filter(id => !FINDINGS[id])
  if (extra.length) throw new Error(`FINDING_DOCS describes findings the registry lacks: ${extra.join(', ')}`)
  return blocks(CAPABILITY_NAMES.flatMap((capability) => {
    const ids = findingIds().filter(id => FINDINGS[id].capability === capability)
    return ids.length ? [blocks(`## \`${capability}\``, ids.map(findingEntry))] : []
  }))
}

/** The report's fields, from its published JSON Schema. */
export function reportSchema() {
  const schema = JSON.parse(readFileSync(join(root, 'website/public/schemas/doctor.json'), 'utf8'))
  const rows = (properties, prefix) => Object.entries(properties).map(([name, property]) => [code(`${prefix}${name}`), property.description])
  return table(['Field', 'What it is'], [...rows(schema.properties, ''), ...rows(schema.$defs.finding.properties, 'findings[].')])
}

/** The finding ids as the docs route table spells them, one per line, for its `/d/<id>` short links. */
export function findingIdsSource() {
  return [
    '/**',
    ' * The ids of the findings registry (src/findings/), in report order,',
    ' * written here by `pnpm docs:lookups` because this file imports nothing.',
    ' */',
    'export const FINDING_IDS = [',
    ...findingIds().map(id => `  '${id}',`),
    '] as const',
  ].join('\n')
}
