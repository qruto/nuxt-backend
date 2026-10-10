# The nuxt/modules registry entry

What goes to [nuxt/modules](https://github.com/nuxt/modules) after a release (see
[RELEASE.md → After a release](../../RELEASE.md#after-a-release)). Kept here so the text is reviewed
with the code it describes, not written in a browser on release day.

- `ISSUE.md` — the listing request. That repository takes new modules through its "Module Listing
  Request" issue form (Description, Repository, npm, Nuxt Compatibility) and keeps pull requests
  for updates; the file follows the form field by field. Read it once more before opening the issue
  and say what changed since it was written.
- `backend.yml` — the entry itself, for `modules/backend.yml` in that repository, offered in the
  issue in case a pull request suits the maintainers better. The registry re-reads `description`,
  `compatibility` and the docs URL from `package.json` / `dist/module.json` weekly, so those must
  agree with the published package (the docs contract test checks the Nuxt range). `type` is
  `3rd-party`: the sync sets it for every repository outside the nuxt and nuxt-modules
  organizations. `icon` names a file to add under that repository's `icons/` — the house mark from
  `website/public/logo.svg`, exported square.
