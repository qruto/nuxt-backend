---
name: nuxt-backend-upgrade
description: Upgrading a Nuxt app to a new version of nuxt-backend, including from a preview build of main to 0.2. The steps in order (install, nuxt-backend upgrade to repair the scaffold and migrate the data, refresh the agent files and skills, read the changelog, type check), and the rename map, every composable, component, factory, option, type and constant the previews of main renamed, reshaped or removed, each with what replaces it and the Upgrade page section that explains it. Use when bumping nuxt-backend, when code written for an earlier version fails on a name that no longer exists, or when doctor or the type check reports what an upgrade changed. Read the nuxt-backend core skill first.
---

# nuxt-backend: upgrade

An upgrade changes the package in `node_modules`, the guidance that ships with it, and sometimes
the scaffold. The `nuxt-backend` core skill holds the rules every change follows; this one walks
an upgrade, and [references/upgrade.md](references/upgrade.md) has every renamed name;
[references/api.md](references/api.md) has `nuxt-backend upgrade`'s flags and its `--json` shape.

`nuxt-backend upgrade` repairs the scaffold and runs the package's data migrations. It rewrites
none of the app's code: a release that renames or removes a public name says so in the changelog,
with the edit to make, and you make it.

## The steps, in order

1. **Install the new version** with the project's package manager, and nothing else at the same
   time. Read `version` in `node_modules/nuxt-backend/package.json` to confirm it.
2. **Run `npx nuxt-backend upgrade --dry-run --json`**, then `npx nuxt-backend upgrade --json`.
   It makes the repairs `doctor --fix` makes (`scaffold`: the files, mounts, forwarded env names
   and route groups the new version adds; with `--dry-run`, each as a diff) and runs the
   package's own data migrations on the dev deployment (`data`). It writes only project files and
   the dev deployment; it never touches production without `--prod --yes`.
3. **Follow `next`**, in order. `data.state` `needs-push` means the dev deployment still runs the
   old backend: start `npx nuxt-backend dev` once (it pushes), stop it, and run
   `npx nuxt-backend upgrade` again. `npx nuxt-backend init --agents` rewrites the `nuxt-backend`
   section of `AGENTS.md` for the installed version, adds the developer server to `.mcp.json`, and
   copies the installed version's skills into `.agents/skills/`. Read the refreshed skills, this
   one included, before the edits by hand: they describe the new version.
4. **Read the [changelog](https://nuxt-backend.dev/docs/ship/releases/changelog)** for the
   releases between the old version and the new one, oldest first, and make each edit it names in
   the app's code. A name that was renamed or removed is in [references/upgrade.md](references/upgrade.md)
   too. Then run `npx nuxt-backend doctor`, and follow each finding's fix line until none fails.
5. **Run the app's type check.** Each error on a package name is a rename: look it up in
   [references/upgrade.md](references/upgrade.md).
6. **Tell the user** what changed in their code, and anything left for them: a provider setting,
   a production env push, a redeploy, and production's data migrations, which run after its
   deploy with `npx nuxt-backend upgrade --prod --yes`. That command writes production: run it
   only when the user says so.

## From a preview build

`0.1.0` on npm was a test publish, so most apps start on 0.2 directly. An app built on a preview
of `main` (`https://pkg.pr.new/qruto/nuxt-backend@main`) meets every section of the
[Upgrade page](https://nuxt-backend.dev/docs/ship/releases/upgrade) newer than its build.
Make their edits oldest first: start at the bottom of the page, at the first section newer than the
build, and go up, since a later change can build on an earlier one (the page lists sections
newest first). Some need an
edit nothing finds in code, such as a provider setting or a label.

## Reading the rename map

[references/upgrade.md](references/upgrade.md) lists each entry under the Upgrade page section
that explains it, in the page's order, newest first. A one-for-one rename always leads to a name
the installed version has, so a name renamed twice leads straight to the current one:

- **renamed**: the same thing under a new name; write the **Now** column.
- **reshaped**: the same name, called or read differently; the note and the section say how.
- **removed**: gone; **Now** names what to use instead, and a — means nothing replaces it.

The table "Renamed one for one" at its top is the quick lookup. The core skill's
`references/renames.json` holds the same entries as data, each with its section's link, and its
`references/surface.json` every name the installed version has: check a name there before writing
it.

## Tasks

<!-- generated:tasks -->
- [Verify a release](https://nuxt-backend.dev/docs/ship/releases/verify): Before you upgrade, check that the nuxt-backend tarball npm serves was built by this repository's release workflow from a tagged commit: npm's provenance, the GitHub attestation of the tarball and its SBOM, and the immutable GitHub Release.
- [Upgrade to a new version](https://nuxt-backend.dev/docs/ship/releases/upgrade): Move your app to a new release: install it, let `nuxt-backend upgrade` repair the scaffold and run the package's data migrations, then read the changelog. 0.2.0 is the first release, so no codemod rewrites your code.
<!-- /generated:tasks -->
