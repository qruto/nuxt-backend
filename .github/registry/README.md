# The nuxt/modules registry entry

What goes to [nuxt/modules](https://github.com/nuxt/modules) after a release (see
[RELEASE.md → After a release](../../RELEASE.md#after-a-release)). Kept here so the text is reviewed
with the code it describes, not written in a browser on release day.

- `backend.yml` — the listing. Copy it to `modules/backend.yml` in that repository. The registry
  re-reads `description`, `compatibility` and the docs URL from `package.json` / `dist/module.json`
  weekly, so those must agree with the published package (the docs contract test checks the
  Nuxt floor). `icon` names a file to add under that repository's `icons/` — the house mark from
  `website/public/logo.svg`, exported square.
- `PULL_REQUEST.md` — the pull request body. That repository closes pull requests it takes for
  machine-written; read it once more before opening the PR and say what changed since it was written.
