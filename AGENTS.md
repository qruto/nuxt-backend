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

**A stale nested store under `node_modules/nuxt-convex-module/node_modules`.**
`nuxt-convex-module` now installs from npm. Before that it was a `link:` to the
sibling checkout, and pnpm's hoisted linker moved that checkout's own isolated
store (`.pnpm/`, a second `vue`, a second `convex`, its devDependencies) under
the package directory when the protocol changed. `.modules.yaml` only sanctions
`@nuxt/kit`, `@nuxt/devtools-kit` and `verkit` there. A second Vue copy breaks
reactivity across the boundary (a `computed` from one Vue read inside a
`watchEffect` of the other is never tracked — `useSearch`'s debounce test is
the canary). Fix: delete everything else in that nested directory, then
`pnpm install --frozen-lockfile` to re-verify.

**Environment naming.** This package names its own variables after what they do
(`NUXT_PUBLIC_BACKEND_URL`, `EMAIL_*`, `BILLING_*`, `AUTH_SECRET`, `SITE_URL`).
`CONVEX_DEPLOYMENT`, `CONVEX_SITE_URL` and `CONVEX_SELF_HOSTED_URL` belong to the
platform CLI and runtime — read them, never ask a user to author them, and never
rename them. `.env.local` and the generated `.env.example` group by purpose:
Backend, Email, Billing, Dev only, then the platform's own group last.
