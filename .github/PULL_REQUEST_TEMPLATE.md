Fixes #

## What changed

<!-- What this does and why. A paragraph is usually enough. -->

## Checklist

- [ ] `pnpm lint && pnpm test && pnpm test:quality && pnpm test:security && pnpm build` passes
- [ ] Tests cover the change
- [ ] Docs updated, if the public API changed — [STABILITY.md](../STABILITY.md) names every public surface
- [ ] Docs pages, the README inventory and the agent skills ([skills/](../skills/nuxt-backend/SKILL.md): the core and the task skill that covers the change) say what the code now does; `pnpm test:docs` passes
- [ ] A change to what the package promises is a `!` commit, with the migration in its body
