# Contributing to nuxt-backend

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Reporting Security Issues](#reporting-security-issues)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Submitting Changes](#submitting-changes)
- [Commit Convention](#commit-convention)
- [Releasing](#releasing)

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating.

## Reporting Security Issues

Security vulnerabilities never go in a public issue, discussion, or pull request. Report them
privately through GitHub's
[private vulnerability reporting](https://github.com/qruto/nuxt-backend/security/advisories/new)
(**Security** tab → **Report a vulnerability**), which opens a draft advisory visible only to you
and the maintainers. [SECURITY.md](SECURITY.md) covers scope, response times, and what happens
after you report.

## Development Setup

**Prerequisites:** Node.js 20+, pnpm 11+ (Git 2.54+ optional — enables the local commit-message
hook; CI enforces it either way)

```bash
# Clone the repository
git clone https://github.com/qruto/nuxt-backend.git
cd nuxt-backend

# Install dependencies
pnpm install

# Run the test suite
pnpm test

# Build the package
pnpm build
```

The `website/` directory is a full Nuxt app (product homepage · docs · interactive playground) wired to the local package. Start it with:

```bash
pnpm dev
```

Both serve through [portless](https://portless.sh): `pnpm dev` publishes the app
at `https://nuxt-backend.localhost`, and `pnpm dev:lan` runs the same stack with
the proxy in LAN mode, advertising `https://nuxt-backend.local` over mDNS so
phones and other devices on the same network can open it. For auth to work from
a device, the LAN origin must be trusted by Better Auth on the Convex
deployment:

```bash
npx convex env set BETTER_AUTH_TRUSTED_ORIGINS https://nuxt-backend.local
```

Devices also need the portless CA trusted (or they'll see a certificate
warning); `portless trust` covers this machine only.

## Project Structure

```
src/        # Module source (Nuxt module + Convex component)
test/       # Vitest unit & integration tests
website/    # Nuxt app: product homepage · docs (Docus) · interactive playground
```

## Submitting Changes

1. **Open an issue first** for non-trivial changes so we can discuss the approach.
2. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b fix/my-bug-fix
   ```
3. Make your changes, add tests where appropriate.
4. Ensure all checks pass:
   ```bash
   pnpm lint && pnpm test && pnpm build
   ```
5. Open a pull request against `main`.

Pull requests that include tests and follow the commit convention below are reviewed fastest.

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for X
fix: correct Y behavior
docs: update contributing guide
chore: bump dependencies
```

Breaking changes must include `BREAKING CHANGE:` in the commit footer or use `!` after the type:

```
feat!: rename createBackend to defineBackend
```

Allowed types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
`style`, `revert`, and `ai` (AI-instruction / agent metadata updates).

**This is enforced, not just documented.** `pnpm install` registers a native Git
[config-based hook](https://git-scm.com/docs/githooks) (`hook.commitlint.*` in your local
`.git/config`) that runs [commitlint](https://commitlint.js.org/) on `commit-msg` and rejects
non-conforming messages locally — no hook-manager dependency. This requires **Git 2.54+**; on
older Git the local hook is silently skipped. Either way, CI re-checks every commit on a pull
request, so the gate holds. The local hook can be bypassed with `git commit --no-verify`; CI
cannot — non-conventional commits will not merge.

## Releasing

Releases are automated via CI. See [RELEASING.md](RELEASING.md) for details.
