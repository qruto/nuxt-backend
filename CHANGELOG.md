# Changelog

## v0.2.0

[compare changes](https://github.com/qruto/nuxt-backend/compare/v0.1.0...v0.2.0)

### 🚀 Enhancements

- Generated code aliases ([16c04b0](https://github.com/qruto/nuxt-backend/commit/16c04b0))
- Add `useUpload`, `useUploadQueue`, `useStorageUrl` composables for file handling ([de235d6](https://github.com/qruto/nuxt-backend/commit/de235d6))
- Add commitlint configuration for conventional commits ([d3dcd63](https://github.com/qruto/nuxt-backend/commit/d3dcd63))
- Enhance security module with Convex-aware CSP defaults ([b6978fb](https://github.com/qruto/nuxt-backend/commit/b6978fb))
- Add TypeScript tips skill documentation for best practices ([f44f48a](https://github.com/qruto/nuxt-backend/commit/f44f48a))
- Better reactivity support ([93ee6c4](https://github.com/qruto/nuxt-backend/commit/93ee6c4))
- Add Vue composables for credits, email status, features, search, and workflow management ([d3a8340](https://github.com/qruto/nuxt-backend/commit/d3a8340))
- Website created ([29eb1bb](https://github.com/qruto/nuxt-backend/commit/29eb1bb))
- ⚠️  Merge auth, email, billing and gifts into one backend component ([d3cf44e](https://github.com/qruto/nuxt-backend/commit/d3cf44e))
- Wip ([c4366bc](https://github.com/qruto/nuxt-backend/commit/c4366bc))
- ⚠️  Zero-config onboarding — env tiering, URL derivation, env push ([30455ab](https://github.com/qruto/nuxt-backend/commit/30455ab))
- ⚠️  Provider-native credits hardening and the metered ai rails ([ef45aea](https://github.com/qruto/nuxt-backend/commit/ef45aea))
- ⚠️  Complete, fail-closed webhook platform for billing and email ([e3a3a9c](https://github.com/qruto/nuxt-backend/commit/e3a3a9c))
- ⚠️  Oauth-protected mcp endpoint — agents act as signed-in users ([83fe030](https://github.com/qruto/nuxt-backend/commit/83fe030))
- Nuxt devtools tab — the backend panel ([f8d536c](https://github.com/qruto/nuxt-backend/commit/f8d536c))
- ⚠️  Live-verified agent surface and billing product sync ([a459a9b](https://github.com/qruto/nuxt-backend/commit/a459a9b))
- ⚠️  Explicit convex.config scaffold, generated local-install templates, dev loopback origins ([ea7dbbf](https://github.com/qruto/nuxt-backend/commit/ea7dbbf))
- ⚠️  Billing, credits and metered AI to the provider's ceiling ([3897fe9](https://github.com/qruto/nuxt-backend/commit/3897fe9))
- CanGift and an APIError export, and a playground that stays in the sandbox ([#66](https://github.com/qruto/nuxt-backend/pull/66))
- ⚠️  Complete DevTools support, module metadata, and a dev command that stops ([#83](https://github.com/qruto/nuxt-backend/pull/83))
- ⚠️  Root Convex entry points, typed component returns, agent-led install ([#84](https://github.com/qruto/nuxt-backend/pull/84))
- The Console palette, type and parts vocabulary ([#120](https://github.com/qruto/nuxt-backend/pull/120))
- Module splits, a theme bridge to @nuxt/ui, and the findings and env registries ([#124](https://github.com/qruto/nuxt-backend/pull/124))
- ⚠️  Typed error codes ([#131](https://github.com/qruto/nuxt-backend/pull/131))
- ⚠️  Nuxt-backend 0.2.0 ([#146](https://github.com/qruto/nuxt-backend/pull/146))

#### Agents

- A nuxt-backend skill for coding agents, and agent files from init ([#71](https://github.com/qruto/nuxt-backend/pull/71))

#### Auth

- Compose consumer databaseHooks with the package hooks ([b80ea00](https://github.com/qruto/nuxt-backend/commit/b80ea00))
- CanSignIn gate and onUserDeleted lifecycle hook ([c3c1788](https://github.com/qruto/nuxt-backend/commit/c3c1788))

#### Billing

- Catalog as code in the playground, lint-clean generated ids ([b2c44d1](https://github.com/qruto/nuxt-backend/commit/b2c44d1))
- Price currency follows the organization default, pinnable via catalog.currency ([c67423c](https://github.com/qruto/nuxt-backend/commit/c67423c))

#### CLI

- Let env push replace a rotated secret, deliberately ([80dcbd9](https://github.com/qruto/nuxt-backend/commit/80dcbd9))
- Nuxt-backend dev runs Convex and Nuxt together ([#64](https://github.com/qruto/nuxt-backend/pull/64))
- A coding-agent contract, env defaults for previews, a dev-only inbox ([#127](https://github.com/qruto/nuxt-backend/pull/127))

#### DevTools

- Six-page backend panel with live env, doctor and push updates ([#67](https://github.com/qruto/nuxt-backend/pull/67))

#### ESLint

- Nuxt-backend/eslint, the convex lint rules for the functions directory ([#68](https://github.com/qruto/nuxt-backend/pull/68))

#### Email

- Segments replace audiences on the marketing surface ([#54](https://github.com/qruto/nuxt-backend/pull/54))
- A sandbox inbox for test-mode mail ([#61](https://github.com/qruto/nuxt-backend/pull/61))

#### Examples

- The playground as a standalone app, synced from the website ([#69](https://github.com/qruto/nuxt-backend/pull/69))

#### Nuxt module

- Derive the backend site URL from a client-only cloud URL ([90a88db](https://github.com/qruto/nuxt-backend/commit/90a88db))
- Workspaces option keeps the devtools bridge off the organization endpoints ([d4dc2ae](https://github.com/qruto/nuxt-backend/commit/d4dc2ae))
- A workspace-less auth client when workspaces are off ([ea8e5f5](https://github.com/qruto/nuxt-backend/commit/ea8e5f5))
- Keep the private pages out of search indexes ([#65](https://github.com/qruto/nuxt-backend/pull/65))

#### Playground

- Metered ai demo, self-seeding, email gallery, webhook feed ([4d7d5be](https://github.com/qruto/nuxt-backend/commit/4d7d5be))

#### Rate limiting

- Global fixed-window backstop for OTP sends ([aedc6f0](https://github.com/qruto/nuxt-backend/commit/aedc6f0))

#### Website

- ⚠️  Engraved matte redesign with contrast-safe inks ([e00222c](https://github.com/qruto/nuxt-backend/commit/e00222c))
- ⚠️  Traffic-light palette, product-shaped docs, self-hosted brand ([62e96a6](https://github.com/qruto/nuxt-backend/commit/62e96a6))
- The landing page tells the whole story ([a0a7991](https://github.com/qruto/nuxt-backend/commit/a0a7991))
- The three-bar tritium mark replaces the coin ([#47](https://github.com/qruto/nuxt-backend/pull/47))
- The homepage's agents and closing sections on the parts ([#129](https://github.com/qruto/nuxt-backend/pull/129))
- The playground reads typed errors ([#132](https://github.com/qruto/nuxt-backend/pull/132))

#### Email,billing

- Cleanup and per-user erasure component functions ([1276b6a](https://github.com/qruto/nuxt-backend/commit/1276b6a))

### 🩹 Fixes

- Update migration helper references and adjust environment variable handling ([d157a39](https://github.com/qruto/nuxt-backend/commit/d157a39))
- Consistency sweep — css exports, login path option, doc truths ([30de1a2](https://github.com/qruto/nuxt-backend/commit/30de1a2))
- CodeQL follow-ups, and a lockfile with no open advisories ([#34](https://github.com/qruto/nuxt-backend/pull/34))
- ⚠️  Pre-release corrections before 0.2.0 ([#44](https://github.com/qruto/nuxt-backend/pull/44))
- Pre-release correctness — admin rate limits, page titles, brand wiring, drift gates ([#46](https://github.com/qruto/nuxt-backend/pull/46))
- Accessible components, honest rate-limit messages, and the playground pages the stable surface lacked ([#49](https://github.com/qruto/nuxt-backend/pull/49))
- Residue from the release audit, and the docs catch-up for #49 ([#53](https://github.com/qruto/nuxt-backend/pull/53), [#49](https://github.com/qruto/nuxt-backend/issues/49))

#### Auth

- Refuse gated and rate-limited OTP requests on the request itself ([b5ace7f](https://github.com/qruto/nuxt-backend/commit/b5ace7f))
- Keep the OTP request guard internal, type the workspaces flag ([fc69cdb](https://github.com/qruto/nuxt-backend/commit/fc69cdb))
- ⚠️  List and revoke sessions without a fresh sign-in ([#98](https://github.com/qruto/nuxt-backend/pull/98))
- ⚠️  Force agent consent, require PKCE, limit client registration ([#118](https://github.com/qruto/nuxt-backend/pull/118))
- GetAuthUser refuses with the catalog's unauthenticated code ([#134](https://github.com/qruto/nuxt-backend/pull/134))

#### Billing

- Polyfill Buffer so webhook signatures verify in the Convex isolate ([e891398](https://github.com/qruto/nuxt-backend/commit/e891398))
- Accept deliveries signed with standard webhooks semantics ([ba80732](https://github.com/qruto/nuxt-backend/commit/ba80732))
- ⚠️  Server-authoritative checkout, plan changes and gifts ([#137](https://github.com/qruto/nuxt-backend/pull/137))
- ⚠️  One billing customer per billing entity ([#138](https://github.com/qruto/nuxt-backend/pull/138))
- Pass-claim race and usage-price product sync, with the weekly checks green ([#157](https://github.com/qruto/nuxt-backend/pull/157))

#### CLI

- Declare citty and magicast as dependencies ([7507710](https://github.com/qruto/nuxt-backend/commit/7507710))
- Honour workspaces-off and skip the AI stream probe without an ai module ([c15b5a0](https://github.com/qruto/nuxt-backend/commit/c15b5a0))
- --prod acts on the production deployment ([#57](https://github.com/qruto/nuxt-backend/pull/57))

#### Email

- Sign-in codes reach the sandbox inbox without an email key ([#70](https://github.com/qruto/nuxt-backend/pull/70))

#### MCP

- The profile tool reads an agent's account ([#128](https://github.com/qruto/nuxt-backend/pull/128))

#### Nuxt module

- Resolve backendAuth from the base module's runtime file ([288e248](https://github.com/qruto/nuxt-backend/commit/288e248))
- Scaffold backend files on dev boots only ([e01c01e](https://github.com/qruto/nuxt-backend/commit/e01c01e))
- Keep the bundled auth client when convex.betterAuth is an object ([7acbda4](https://github.com/qruto/nuxt-backend/commit/7acbda4))

#### Release

- Release only Release Prepare's commit, and never rotate AUTH_SECRET on a failed read ([#62](https://github.com/qruto/nuxt-backend/pull/62))

#### Scaffold

- ⚠️  No public email relay ([#107](https://github.com/qruto/nuxt-backend/pull/107))

#### Templates

- Create apps with create nuxt, and keep the dev script working ([#63](https://github.com/qruto/nuxt-backend/pull/63))

#### Tests

- Adapt to nuxt-convex-module 0.9 ([961171b](https://github.com/qruto/nuxt-backend/commit/961171b))

#### UI

- Keep the invitation sentence on one line ([#100](https://github.com/qruto/nuxt-backend/pull/100))

#### Vue

- Import useBetterAuth from nuxt-convex-module 0.9 ([19362de](https://github.com/qruto/nuxt-backend/commit/19362de))

#### Website

- Only production builds deploy the backend, and they pass its url ([#56](https://github.com/qruto/nuxt-backend/pull/56))
- Redesign groundwork — house fonts on social cards, the full neutral ramp, a css gate ([#55](https://github.com/qruto/nuxt-backend/pull/55))
- Close the playground's open ends ([#102](https://github.com/qruto/nuxt-backend/pull/102))
- Reset and the idle sweep clear seeded and signed-out accounts ([#110](https://github.com/qruto/nuxt-backend/pull/110))

#### Types

- Runtime declarations no longer import a doubled .js.js path ([#136](https://github.com/qruto/nuxt-backend/pull/136))

### 💅 Refactors

- Migrate to just .js ext name ([0bc367e](https://github.com/qruto/nuxt-backend/commit/0bc367e))
- Reduced complexity ([af02eea](https://github.com/qruto/nuxt-backend/commit/af02eea))
- ⚠️  Name the environment after what it does, not the service underneath ([cc3272e](https://github.com/qruto/nuxt-backend/commit/cc3272e))
- ⚠️  Drop the local installation mode ([#116](https://github.com/qruto/nuxt-backend/pull/116))
- ⚠️  Workspaces, admin and the agent surface are always on ([#117](https://github.com/qruto/nuxt-backend/pull/117))
- ⚠️  Always-on pages, stylesheet, webhook log and sign-in methods, and the docs chrome ([#122](https://github.com/qruto/nuxt-backend/pull/122))
- ⚠️  One auth factory with codes instead of links, and the homepage console ([#125](https://github.com/qruto/nuxt-backend/pull/125))
- ⚠️  One email registry, refused undeliverable codes, a Convex test kit, and the review fixes ([#126](https://github.com/qruto/nuxt-backend/pull/126))
- ⚠️  A brand-neutral surface and one webhook edge ([#130](https://github.com/qruto/nuxt-backend/pull/130))
- ⚠️  Data composables in the VueUse style ([#133](https://github.com/qruto/nuxt-backend/pull/133))

#### Billing

- One user-row lookup for the features and credits queries ([#40](https://github.com/qruto/nuxt-backend/pull/40))

### 📖 Documentation

- Add project metadata, issue templates, contribution guidelines, and security policy ([f6c0038](https://github.com/qruto/nuxt-backend/commit/f6c0038))
- Typescript AI skill ([a67ae4b](https://github.com/qruto/nuxt-backend/commit/a67ae4b))
- Security issues reporting info ([c61031a](https://github.com/qruto/nuxt-backend/commit/c61031a))
- Normalize pnpm store paths in the generated api reference ([16deeaa](https://github.com/qruto/nuxt-backend/commit/16deeaa))
- Point nuxt-convex-module links at the real repository ([3b6137d](https://github.com/qruto/nuxt-backend/commit/3b6137d))
- Describe the explicit convex.config, cli, agents, devtools and ai surfaces ([719ecd9](https://github.com/qruto/nuxt-backend/commit/719ecd9))
- Cover the new billing surface and regenerate the api reference ([55cc191](https://github.com/qruto/nuxt-backend/commit/55cc191))
- Regenerate the api reference ([be12f6f](https://github.com/qruto/nuxt-backend/commit/be12f6f))
- Correct and complete the 47 pages the release audit flagged ([#48](https://github.com/qruto/nuxt-backend/pull/48))
- Own the docs collection, one route table, the reference by import path ([#112](https://github.com/qruto/nuxt-backend/pull/112))
- Move Start to Agents under /docs, one header tab each ([#113](https://github.com/qruto/nuxt-backend/pull/113))
- Move Data to Reference under /docs, and the reference with them ([#114](https://github.com/qruto/nuxt-backend/pull/114))
- Tab landings, one home per topic, final links everywhere ([#115](https://github.com/qruto/nuxt-backend/pull/115))
- One task per page, sentence case and the page contract ([#119](https://github.com/qruto/nuxt-backend/pull/119))

#### Docs

- Which modules and components ship, work beside it, or are planned ([#72](https://github.com/qruto/nuxt-backend/pull/72))

### 📦 Build

- Add bundle analysis support with Sonda and update README ([f292bef](https://github.com/qruto/nuxt-backend/commit/f292bef))
- Allow vue-demi builds ([6e2f708](https://github.com/qruto/nuxt-backend/commit/6e2f708))
- Use nuxt-convex-module as a new foundation of this package ([71cfe87](https://github.com/qruto/nuxt-backend/commit/71cfe87))
- Harden pnpm supply-chain gates, move deps to latest ([4e468bb](https://github.com/qruto/nuxt-backend/commit/4e468bb))
- Converge the dependabot non-major group across the workspace ([2319feb](https://github.com/qruto/nuxt-backend/commit/2319feb))
- Chunk-proof module dir, component ai/webhooks entries, css side effects, bounded ranges ([b68aa8c](https://github.com/qruto/nuxt-backend/commit/b68aa8c))
- Keep the linked base module built before a dev boot ([8d58f80](https://github.com/qruto/nuxt-backend/commit/8d58f80))
- ⚠️  Depend on nuxt-convex-module ~0.9.0 from npm ([1751aed](https://github.com/qruto/nuxt-backend/commit/1751aed))
- ⚠️  Release readiness — publishable package, component gates, CI parity, fallow at zero ([51f3bfa](https://github.com/qruto/nuxt-backend/commit/51f3bfa))

### 🏡 Chore

- Update Node.js version to >=24.11.0 and add .nvmrc for LTS tracking ([8f085d1](https://github.com/qruto/nuxt-backend/commit/8f085d1))
- Skills lock file ([0ca7dc0](https://github.com/qruto/nuxt-backend/commit/0ca7dc0))
- Supply-chain hardening, type tests, a strict API reference, and cleanup ([#50](https://github.com/qruto/nuxt-backend/pull/50))
- ⚠️  Nuxt-convex-module 0.11, convex 1.46, and the base module's repo practices ([#82](https://github.com/qruto/nuxt-backend/pull/82))
- Tidy the repo ([#97](https://github.com/qruto/nuxt-backend/pull/97))

#### Agent skill

- Move the live-testing origin to nuxt-backend.local ([033fa4b](https://github.com/qruto/nuxt-backend/commit/033fa4b))

#### CI

- Nuxt-backend.dev is live, lychee checks it again ([#42](https://github.com/qruto/nuxt-backend/pull/42))

#### DevTools

- Opt the panel app out of telemetry ([5ab8cf2](https://github.com/qruto/nuxt-backend/commit/5ab8cf2))

#### Release

- Ready the pipeline and the docs for 0.2.0 ([#60](https://github.com/qruto/nuxt-backend/pull/60))
- V0.2.0 ([#148](https://github.com/qruto/nuxt-backend/pull/148))

### ✅ Tests

- Improved coverage ([caa412a](https://github.com/qruto/nuxt-backend/commit/caa412a))
- Give the cold-start doctor test CI headroom ([c13a195](https://github.com/qruto/nuxt-backend/commit/c13a195))
- Rebaseline coverage thresholds under the merged component ([e96a7f1](https://github.com/qruto/nuxt-backend/commit/e96a7f1))
- Freeze the public surface and prove the module registers what it claims ([8f2ff14](https://github.com/qruto/nuxt-backend/commit/8f2ff14))
- Type the rate-limit and ctx mocks so the unit suite typechecks ([7ba2c3b](https://github.com/qruto/nuxt-backend/commit/7ba2c3b))
- Spread the billing components fixture as an object ([c474887](https://github.com/qruto/nuxt-backend/commit/c474887))

#### Nuxt module

- Mount-level coverage for the packaged page components ([6aea99b](https://github.com/qruto/nuxt-backend/commit/6aea99b))
- The public runtime config carries the workspaces flag ([50fba48](https://github.com/qruto/nuxt-backend/commit/50fba48))

### 🤖 CI

- Upload coverage for analytics ([53ebb5e](https://github.com/qruto/nuxt-backend/commit/53ebb5e))
- Adopt dependabot, dependency review, zizmor and the pnpm/setup action ([6d1901e](https://github.com/qruto/nuxt-backend/commit/6d1901e))
- Environment-gated release workflow and pkg.pr.new previews ([735b0ed](https://github.com/qruto/nuxt-backend/commit/735b0ed))
- Materialize the link:../nuxt-convex-module dependency on runners ([361cd60](https://github.com/qruto/nuxt-backend/commit/361cd60))
- Port the hardened check chain — one required gate, real hooks, supply-chain scans ([be3ddc3](https://github.com/qruto/nuxt-backend/commit/be3ddc3))
- Squash-only main, conventional pull request titles ([#59](https://github.com/qruto/nuxt-backend/pull/59))
- Check every pull request, stacked ones included ([#73](https://github.com/qruto/nuxt-backend/pull/73))
- One codegen script, no triple runs, an upstream watch ([#106](https://github.com/qruto/nuxt-backend/pull/106))
- Module-page screenshots ([#111](https://github.com/qruto/nuxt-backend/pull/111))
- Cut runner time and test the Node floor ([#152](https://github.com/qruto/nuxt-backend/pull/152))

#### CI

- Instructions that match the tree, two more generators excluded, the title checked ([#45](https://github.com/qruto/nuxt-backend/pull/45))
- Skip the API reference's source links, which github.com throttles ([#91](https://github.com/qruto/nuxt-backend/pull/91))

#### Coverage

- Let the project check absorb a quarter point of drift ([#108](https://github.com/qruto/nuxt-backend/pull/108))

#### Deps

- Bump zizmorcore/zizmor-action ([#22](https://github.com/qruto/nuxt-backend/pull/22))
- Bump the actions group across 1 directory with 4 updates ([#39](https://github.com/qruto/nuxt-backend/pull/39))
- Bump the actions group across 2 directories with 1 update ([#51](https://github.com/qruto/nuxt-backend/pull/51))
- Bump the actions group across 1 directory with 4 updates ([#88](https://github.com/qruto/nuxt-backend/pull/88))
- Bump the actions group across 2 directories with 2 updates ([#92](https://github.com/qruto/nuxt-backend/pull/92))

### ⏪ Reverts

- Chore(release): v0.2.0 ([#148](https://github.com/qruto/nuxt-backend/pull/148), [#158](https://github.com/qruto/nuxt-backend/pull/158))

#### ⚠️ Breaking Changes

- ⚠️  Merge auth, email, billing and gifts into one backend component ([d3cf44e](https://github.com/qruto/nuxt-backend/commit/d3cf44e))
- ⚠️  Zero-config onboarding — env tiering, URL derivation, env push ([30455ab](https://github.com/qruto/nuxt-backend/commit/30455ab))
- ⚠️  Provider-native credits hardening and the metered ai rails ([ef45aea](https://github.com/qruto/nuxt-backend/commit/ef45aea))
- ⚠️  Complete, fail-closed webhook platform for billing and email ([e3a3a9c](https://github.com/qruto/nuxt-backend/commit/e3a3a9c))
- ⚠️  Oauth-protected mcp endpoint — agents act as signed-in users ([83fe030](https://github.com/qruto/nuxt-backend/commit/83fe030))
- ⚠️  Live-verified agent surface and billing product sync ([a459a9b](https://github.com/qruto/nuxt-backend/commit/a459a9b))
- ⚠️  Explicit convex.config scaffold, generated local-install templates, dev loopback origins ([ea7dbbf](https://github.com/qruto/nuxt-backend/commit/ea7dbbf))
- **Website:** ⚠️  Engraved matte redesign with contrast-safe inks ([e00222c](https://github.com/qruto/nuxt-backend/commit/e00222c))
- **Website:** ⚠️  Traffic-light palette, product-shaped docs, self-hosted brand ([62e96a6](https://github.com/qruto/nuxt-backend/commit/62e96a6))
- ⚠️  Billing, credits and metered AI to the provider's ceiling ([3897fe9](https://github.com/qruto/nuxt-backend/commit/3897fe9))
- ⚠️  Complete DevTools support, module metadata, and a dev command that stops ([#83](https://github.com/qruto/nuxt-backend/pull/83))
- ⚠️  Root Convex entry points, typed component returns, agent-led install ([#84](https://github.com/qruto/nuxt-backend/pull/84))
- ⚠️  Typed error codes ([#131](https://github.com/qruto/nuxt-backend/pull/131))
- ⚠️  Nuxt-backend 0.2.0 ([#146](https://github.com/qruto/nuxt-backend/pull/146))
- ⚠️  Pre-release corrections before 0.2.0 ([#44](https://github.com/qruto/nuxt-backend/pull/44))
- **Auth:** ⚠️  List and revoke sessions without a fresh sign-in ([#98](https://github.com/qruto/nuxt-backend/pull/98))
- **Scaffold:** ⚠️  No public email relay ([#107](https://github.com/qruto/nuxt-backend/pull/107))
- **Auth:** ⚠️  Force agent consent, require PKCE, limit client registration ([#118](https://github.com/qruto/nuxt-backend/pull/118))
- **Billing:** ⚠️  Server-authoritative checkout, plan changes and gifts ([#137](https://github.com/qruto/nuxt-backend/pull/137))
- **Billing:** ⚠️  One billing customer per billing entity ([#138](https://github.com/qruto/nuxt-backend/pull/138))
- ⚠️  Name the environment after what it does, not the service underneath ([cc3272e](https://github.com/qruto/nuxt-backend/commit/cc3272e))
- ⚠️  Drop the local installation mode ([#116](https://github.com/qruto/nuxt-backend/pull/116))
- ⚠️  Workspaces, admin and the agent surface are always on ([#117](https://github.com/qruto/nuxt-backend/pull/117))
- ⚠️  Always-on pages, stylesheet, webhook log and sign-in methods, and the docs chrome ([#122](https://github.com/qruto/nuxt-backend/pull/122))
- ⚠️  One auth factory with codes instead of links, and the homepage console ([#125](https://github.com/qruto/nuxt-backend/pull/125))
- ⚠️  One email registry, refused undeliverable codes, a Convex test kit, and the review fixes ([#126](https://github.com/qruto/nuxt-backend/pull/126))
- ⚠️  A brand-neutral surface and one webhook edge ([#130](https://github.com/qruto/nuxt-backend/pull/130))
- ⚠️  Data composables in the VueUse style ([#133](https://github.com/qruto/nuxt-backend/pull/133))
- ⚠️  Depend on nuxt-convex-module ~0.9.0 from npm ([1751aed](https://github.com/qruto/nuxt-backend/commit/1751aed))
- ⚠️  Release readiness — publishable package, component gates, CI parity, fallow at zero ([51f3bfa](https://github.com/qruto/nuxt-backend/commit/51f3bfa))
- ⚠️  Nuxt-convex-module 0.11, convex 1.46, and the base module's repo practices ([#82](https://github.com/qruto/nuxt-backend/pull/82))

### ❤️ Contributors

- Slava Razum ([@slavarazum](https://github.com/slavarazum))

## v0.1.0

A throwaway test publish (2026-06-15). The first real release is `v0.2.0`; once it is live, `0.1.0` is deprecated on npm, so installing it warns to upgrade.
