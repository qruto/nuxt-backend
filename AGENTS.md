# Agent Rules

## File Operations

Use Node scripts instead of Python for file operations.

## Agent tooling

Skills and MCP servers are checked into the repo, so a fresh clone gets the same
setup every agent here runs with.

| Where | What |
|---|---|
| [`.agents/skills/`](./.agents/skills/) | The skills themselves — canonical, agent-neutral, committed |
| [`.claude/skills/`](./.claude/skills/) | Symlinks into `.agents/skills/`, so Claude Code sees them |
| [`skills-lock.json`](./skills-lock.json) | Upstream source + content hash for every skill |
| [`.mcp.json`](./.mcp.json) | MCP servers for this project |

Managed with the [`skills`](https://skills.sh) CLI:

```bash
pnpm skills:install   # restore every skill from skills-lock.json (fresh clone)
pnpm skills:update    # pull latest upstream, refresh the lock
pnpm skills add <owner/repo> -s <skill> -a claude-code   # add one
```

Two rules keep the layout coherent, because the CLI copies into `.claude/skills/`
rather than symlinking:

- After any `add` or `update`, move new folders from `.claude/skills/` into
  `.agents/skills/` and replace them with symlinks. Only `.agents/skills/` is
  committed as content.
- `skills-lock.json` must list every folder in `.agents/skills/` and nothing else.
  `depth-design` and `test-nuxt-backend` are `sourceType: "local"` — they have no
  upstream, so they live and die with this repo.

MCP servers `github` and `vercel` need an interactive OAuth sign-in (`/mcp`) before
their tools work.

Third-party servers that `.mcp.json` runs through `npx` — `chrome-devtools-mcp`, and
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) for `polar` — are pinned to an
exact version. `npx` would otherwise fetch and execute whatever is newest at every
agent start, on every contributor's machine — outside pnpm's cooldown and
Dependabot's reach, since neither reads `.mcp.json`. Bump them by hand:
`npm view <package> version`, then edit the pin. (`convex` floats: it is
first-party, the same package the project already depends on.)

## Verification

Run the full gate before opening a PR. It is what CI's `static` and `test` jobs
run; `.githooks/` splits the same list between `pre-commit` and `pre-push`:

```bash
pnpm lint
pnpm test                    # vitest, every project but e2e
pnpm test:types              # vue-tsc + tsc: module, Convex component, website
pnpm test:docs               # the docs contract — hand-written docs against the code
pnpm docs:reference:check    # TypeDoc regenerated with no diff
pnpm templates:generate && git diff --exit-code -- src/templates.generated.ts
pnpm test:quality            # fallow: dead code, duplication, complexity
pnpm test:security           # fallow security candidates, kept out of the run above
```

`test:types` runs `dev:prepare:lib` first, so it also proves the stub, the types
and the Convex component still build. What stays in CI: the e2e project, the
tarball gate (`pnpm pack && pnpm check:tarball` — run it when the change touches
what the package ships), the Windows leg and the coverage thresholds.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`website/backend/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Local development gotchas

**One Vue copy, always.** `nuxt-convex-module` installs from npm and the
hoisted linker keeps a single `vue` at the top level. If a nested copy ever
appears (e.g. `node_modules/nuxt-convex-module/node_modules/vue` — `.modules.yaml`
only sanctions `@nuxt/*` and `verkit` there), reactivity breaks across the
boundary: a `computed` from one Vue read inside a `watchEffect` of the other is
never tracked, and `useSearch`'s debounce test is the canary. Fix: delete the
nested copy, `pnpm dedupe`, then `pnpm install --frozen-lockfile` to re-verify.

**Environment naming.** This package names its own variables after what they do
(`NUXT_PUBLIC_BACKEND_URL`, `EMAIL_*`, `BILLING_*`, `AUTH_SECRET`, `SITE_URL`).
`CONVEX_DEPLOYMENT`, `CONVEX_SITE_URL` and `CONVEX_SELF_HOSTED_URL` belong to the
platform CLI and runtime — read them, never ask a user to author them, and never
rename them. `.env.local` and the generated `.env.example` group by purpose:
Backend, Email, Billing, Dev only, then the platform's own group last.
