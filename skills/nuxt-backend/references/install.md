# Install nuxt-backend

Follow these steps in order. Every command runs without prompts, so you can run them yourself.
Three things need the user, and you ask before doing any of them: logging in to Convex, anything
that creates or changes resources in their Convex, email or billing accounts, and putting a
provider key into the project.

Never print, copy or replace the value of `AUTH_SECRET`. It signs every session, and a new one
signs everybody out. `npx nuxt-backend dev` generates it on a dev deployment; leave it to that.

## 0. Look at the project first

1. **Package manager.** `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm, `yarn.lock` → yarn,
   `bun.lock` or `bun.lockb` → bun. No lockfile → npm. Use it for every command below:

   | | install | run a package | run the project's `nuxt-backend` | run a script |
   |---|---|---|---|---|
   | pnpm | `pnpm add` | `pnpm dlx` | `pnpm exec nuxt-backend` | `pnpm <script>` |
   | npm | `npm i` | `npx` | `npx nuxt-backend` | `npm run <script>` |
   | yarn | `yarn add` | `yarn dlx` (`npx` on Yarn 1) | `yarn nuxt-backend` | `yarn <script>` |
   | bun | `bun add` | `bunx` | `bunx nuxt-backend` | `bun run <script>` |

   `npx nuxt-backend` below is the project's own copy. Run it as that column says, not with
   `dlx`, which fetches a separate one.

2. **Versions.** The package needs Nuxt 4 from 4.1.0 (not Nuxt 5 yet) and Node ≥ 24.11.0. Check
   `node -v` and the `nuxt` version in `package.json`. If either is out of range, stop and tell
   the user; don't upgrade or downgrade Nuxt on your own.

3. **What is already there.**
   - `nuxt-backend` in `package.json` and in `modules` in `nuxt.config.ts`: already installed, go
     to step 2.
   - `nuxt-convex-module` in `modules`: that is the Convex integration nuxt-backend installs and
     configures itself. Leave the entry and its options alone.
   - A `convex/` or `backend/` folder, or a `convex.json`: the project already has Convex
     functions. nuxt-backend writes its files into that folder and never replaces one that
     exists, so keep them. Tell the user which files were added, and see "Existing Convex files"
     in step 1b.
   - `CONVEX_DEPLOYMENT` in `.env.local`: a deployment is already configured. Use it.
   - No `package.json` with `nuxt` at all: there is no Nuxt app here, go to step 1a.

## 1a. No Nuxt app yet: create one from the starter

The starter is a Nuxt app with nuxt-backend installed and its backend files written: sign-in,
workspaces, pricing and settings pages work, and there is no custom backend code yet.
`create nuxt` needs these flags when it has no terminal to ask in:

```bash
pnpm create nuxt@latest my-app -t gh:qruto/nuxt-backend/templates/starter --packageManager pnpm --gitInit
npm create nuxt@latest my-app -- -t gh:qruto/nuxt-backend/templates/starter --packageManager npm --gitInit
yarn create nuxt my-app -t gh:qruto/nuxt-backend/templates/starter --packageManager yarn --gitInit
bun create nuxt@latest my-app --template=gh:qruto/nuxt-backend/templates/starter --packageManager bun --gitInit
```

Use the user's name for the app instead of `my-app`, and pass `--gitInit=false` when the folder
is already inside a git repository. npm needs the `--` before `-t`; Bun rejects `-t`, so it takes
`--template=`. Then `cd` into the new folder and run the `npx -y skills@1.7.0 add` command from the prompt
there too: it installed the skill in the folder you started in, and the app needs its own copy
for later tasks. Go to step 2.

## 1b. An existing Nuxt app: add the package

```bash
npm i nuxt-backend convex
npx nuxt-backend init
```

(With the project's install command.) `convex` is the package the backend functions import from
and the CLI that runs them. `init` writes the backend files (`backend/`, or into the existing
functions folder), `convex.json` when that folder is not `convex/`, `.env.example`, an
`AGENTS.md` section and `.mcp.json` for agents, adds `'nuxt-backend'` to `modules`, points the
`dev` script at `nuxt-backend dev`, and swaps `<NuxtWelcome />` for `<NuxtPage />` in an untouched
`app/app.vue` so the module's pages render. It never replaces a file that exists.

Check what `init` printed:

- `nuxt.config.ts` lists `'nuxt-backend'` in `modules`.
- `package.json`'s `dev` script is `nuxt-backend dev`. A `dev` script that was not plain
  `nuxt dev` (one that chains commands, say) is left alone: tell the user. The commands below
  run `npx nuxt-backend dev` directly, so they work either way.
- When it says it added `convex` to the dependencies, run the install once more.
- When it says `CLAUDE.md does not mention AGENTS.md`, tell the user; don't edit `CLAUDE.md`
  yourself.

Existing Convex files: `init` keeps a `convex.config.ts`, `http.ts`, `schema.ts` or
`auth.config.ts` that was already in the functions folder, and says nothing about it. The backend
does not run until those four carry its parts: `app.use(backend)` and `env: backendEnv` in
`convex.config.ts`, `registerBackendRoutes` in `http.ts`, the auth tables in `schema.ts` and the
auth provider in `auth.config.ts`. Compare each kept file with the
[scaffolded files](https://nuxt-backend.dev/raw/platform/auth/setup.md) and propose the merge to
the user before editing it; don't overwrite their code.

pnpm notes:

- pnpm 11 stops an install on dependency build scripts it has not been told about. Show the user
  the list and let them choose: approve or deny with `pnpm approve-builds`, or in `allowBuilds` in
  `pnpm-workspace.yaml`. `esbuild` works without its script. Don't turn off `strictDepBuilds`.
- pnpm's default layout hides the Convex components nuxt-backend brings, and Convex needs to
  resolve them: add `publicHoistPattern: ['@convex-dev/*']` to `pnpm-workspace.yaml`, then install
  again. (Apps made from the starter carry both settings in `.pnpmfile.mjs`.)

## 2. Start it: the deployment, its env, the generated code

`npx nuxt-backend dev` (what the `dev` script runs once `init` has set it). On its first run it sets up a Convex deployment when
none is configured (writing `CONVEX_DEPLOYMENT` to `.env.local`), provisions that deployment's
required env (`AUTH_SECRET` is generated, `SITE_URL` defaults to `http://localhost:3000`), then
runs Convex and Nuxt together: Convex pushes `backend/` and generates `backend/_generated/`
before Nuxt starts. Start it in the background; it keeps running.

- **A deployment is already configured** (`CONVEX_DEPLOYMENT` in `.env.local`). A `local:` or
  `anonymous:` one lives on this machine; start right away. A `dev:` one is a cloud deployment in
  the user's account, possibly shared with a team: the first run pushes the backend's tables and
  functions to it and sets `AUTH_SECRET` and `SITE_URL` there, so ask before starting it.

  ```bash
  npx nuxt-backend dev
  ```

- **No deployment yet.** Create a local one. It needs no account, runs on this machine, and
  creates nothing in the cloud:

  ```bash
  CONVEX_AGENT_MODE=anonymous npx nuxt-backend dev
  ```

  In PowerShell: `$env:CONVEX_AGENT_MODE='anonymous'; npx nuxt-backend dev`.

- **The user wants a cloud deployment.** That needs their Convex login in a browser. Ask them to
  run the `dev` script in their own terminal and pick or create a project, then continue once
  `.env.local` has `CONVEX_DEPLOYMENT`. Never run `npx convex login` for them.

Don't start Convex with `npx convex dev --once` or `convex dev --start "nuxt dev"` here: the first
push of a new deployment fails until `AUTH_SECRET` and `SITE_URL` are on it, and
`nuxt-backend dev` is what puts them there. A local deployment runs only while `dev` runs, so the
`dev` script is the command the user starts.

## 3. Verify

1. `backend/_generated/api.d.ts` exists (in the app's functions folder, when that is another
   one).
2. Wait for the Nuxt URL in the output. Just before it the module logs one line that names the
   deployment, such as `Backend URLs derived from anonymous:anonymous-agent`, and one that sums
   up the checks: `backend preflight: …`. The email and billing findings in it are expected until
   the user connects those services. Anything about `AUTH_SECRET`, `SITE_URL` or the backend URL
   is not: run `npx nuxt-backend doctor` and follow its fix lines.
3. Request `/login` with `curl` and check for HTTP 200. With no email provider connected, sign-in
   codes are printed in the `dev` output instead of being emailed. Sign-in works on the origin
   `SITE_URL` names, `http://localhost:3000` on a dev deployment. When Nuxt started on another
   port (3000 was taken), sign-in answers "Invalid origin": tell the user, and suggest
   `AUTH_TRUST_LOCAL_ORIGINS=1` in `.env.local` followed by `npx nuxt-backend env push`, which
   trusts every `localhost` port on a dev deployment.
4. Stop the dev process when you are done, with Ctrl-C or `kill -INT <pid>` on macOS and Linux.
   It stops Convex, Nuxt and a local backend together. On Windows, `taskkill /PID <pid> /T /F`
   ends it with the processes it started.

If something fails, every message the package prints is listed with its fix in
[Troubleshooting](https://nuxt-backend.dev/raw/production/troubleshooting.md), and the CLI's
findings in [CLI](https://nuxt-backend.dev/raw/tooling/cli.md).

## 4. Tell the user

- What changed: the packages added, `nuxt.config.ts`, the `dev` script, the backend files,
  `.env.example`, `.env.local`, `AGENTS.md` and `.mcp.json`.
- How to run it: the `dev` script starts Convex and Nuxt together, and `/login` signs in.
- If you created a local deployment: it lives on their machine. To move to a Convex account, they
  run `npx convex login` in their own terminal; it offers to link the existing deployment.
- What turns on the rest: an email provider key (`EMAIL_API_KEY`, then `EMAIL_FROM`) and a
  billing token (`BILLING_ACCESS_TOKEN`), each put into `.env.local` by the user and pushed with
  `npx nuxt-backend env push`. [Configuration](https://nuxt-backend.dev/getting-started/configuration)
  lists every value and what its absence does.
- For production: `npx nuxt-backend doctor --prod` checks the production deployment, and
  [Deployment](https://nuxt-backend.dev/production/deployment) covers the build.
- Convex's own guidelines for writing backend functions: `npx convex ai-files install` writes
  them and points `AGENTS.md` and `CLAUDE.md` at them. Offer it; it edits those two files.
