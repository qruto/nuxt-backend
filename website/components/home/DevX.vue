<script setup lang="ts">
/**
 * "It tells you what's wrong." — the developer-experience section.
 *
 * Three machined panels, each a plaque bezel over a slot display (the same
 * grammar as BackendBoot): the `doctor` transcript, the DevTools Backend tab
 * drawn in CSS, and the file tree the first dev run writes.
 *
 * Everything here is copy taken verbatim from the code it describes:
 * finding titles/messages/fix hints from `src/preflight.ts` + `src/cli/main.ts`,
 * the summary line from `formatPreflightSummary`, the panel/card labels from
 * `devtools-client-app/app/pages/*.vue`, and the scaffold tree from
 * `BACKEND_FILE_TEMPLATES` in `src/templates.ts`. Static and prerender-safe —
 * no live reads, so there is nothing to degrade.
 *
 * Depth budget: canvas → plaque → slot is spent on all three panels; the one
 * seated control in the section is the DevTools rail's active tab, a raised
 * pill lifted out of the slot track.
 */

type Status = 'pass' | 'warn'

interface Finding {
  status: Status
  /** `PreflightFinding.title`, verbatim. */
  title: string
  /** `PreflightFinding.message`, verbatim. */
  message: string
  /** `PreflightFinding.fixHint`, verbatim (backticks included — the CLI prints them raw). */
  fix?: string
}

/**
 * A real excerpt of one run against a wired dev deployment: email transport and
 * webhooks are on, billing is on, and the last optional var — EMAIL_TEST_MODE —
 * is still unset, so sends stay in test mode. Every string below is the exact
 * output of `src/preflight.ts` / `src/cli/main.ts` for that state.
 */
const FINDINGS: Finding[] = [
  { status: 'pass', title: 'Convex site URL', message: 'Site URL configured — the auth proxy can reach Convex HTTP actions.' },
  { status: 'pass', title: 'Auth secret', message: 'AUTH_SECRET present and strong.' },
  { status: 'pass', title: 'App site URL', message: 'SITE_URL is a valid URL.' },
  { status: 'pass', title: 'Email transport', message: 'EMAIL_API_KEY visible — transactional email is on.' },
  { status: 'pass', title: 'Convex codegen', message: 'backend/_generated present.' },
  { status: 'pass', title: 'Deployment AUTH_SECRET', message: 'AUTH_SECRET is set on the deployment.' },
  {
    status: 'warn',
    title: 'Deployment EMAIL_TEST_MODE',
    message: 'EMAIL_TEST_MODE is not set (optional): test mode stays ON (set to "false" to deliver for real).',
    fix: 'Add EMAIL_TEST_MODE to .env.local and run `npx nuxt-backend env push`.',
  },
  { status: 'pass', title: 'Billing webhook route', message: '/billing/events is mounted (the unsigned probe was rejected, as expected).' },
  { status: 'pass', title: 'Function contract', message: 'All functions the composables bind to are deployed.' },
  { status: 'pass', title: 'Invitation route', message: 'Invitation emails and the mounted page agree on /accept-invitation.' },
]

/** `const icon = { pass: '✓', warn: '⚠', fail: '✗' }` — src/cli/main.ts. */
const GLYPH: Record<Status, string> = { pass: '✓', warn: '⚠' }

/** `formatPreflightSummary` output for the run above. */
const SUMMARY = '1 finding: deployment-email-test-mode'

/**
 * `BACKEND_FILE_TEMPLATES` (src/templates.ts) in write order, plus the
 * `convex.json` the scaffolder writes when the functions dir isn't `convex/`.
 */
const TREE: { file: string, note?: string }[] = [
  { file: 'convex.config.ts', note: 'app + components, env contract' },
  { file: 'auth.config.ts' },
  { file: 'auth.ts', note: 'roles, workspaces, invitations' },
  { file: 'http.ts', note: 'registerBackendRoutes' },
  { file: 'billing.catalog.ts', note: 'your catalog, as code' },
  { file: 'billing.generated.ts' },
  { file: 'ai.ts' },
  { file: 'functions.ts' },
  { file: 'billing.ts' },
  { file: 'email.ts' },
  { file: 'rateLimiter.ts' },
  { file: 'workflows.ts' },
  { file: 'migrations.ts' },
  { file: 'aggregates.ts' },
  { file: 'search.ts' },
]

/** The panel's three tabs — devtools-client-app/app/app.vue. */
const TABS = [
  { label: 'Overview', icon: 'i-lucide-layout-dashboard', active: true },
  { label: 'Billing', icon: 'i-lucide-credit-card', active: false },
  { label: 'Workspace', icon: 'i-lucide-users', active: false },
]

/** What each tab holds — devtools-client-app/app/pages/*.vue. */
const PANELS = [
  {
    name: 'Overview',
    body: 'Preflight findings with a copyable fix, deployment env presence, every ready-made page (mounted or shadowed), the agent endpoint, and the last 25 webhook deliveries.',
  },
  {
    name: 'Billing',
    body: 'Subscription status, product and plan ids, every credit meter with balance · credited · consumed, and the catalog declared in app.config.ts.',
  },
  {
    name: 'Workspace',
    body: 'Identity, the active workspace with member and pending-invitation counts, and the granted feature keys useFeatures().has() will match.',
  },
]

/** Rows of the panel's delivery-log table; outcomes from `vDeliveryOutcome`. */
const DELIVERIES = [
  { service: 'billing', type: 'order.paid', outcome: 'ok', at: '14:22:07' },
  { service: 'email', type: 'email.delivered', outcome: 'ok', at: '14:21:58' },
  { service: 'billing', type: 'order.paid', outcome: 'duplicate', at: '14:21:44' },
]
</script>

<template>
  <section class="dx">
    <div class="dx__inner">
      <header class="dx__head">
        <p class="dx__eyebrow engraved-sm">
          Developer experience
        </p>
        <h2 class="dx__title engraved">
          It tells you what's wrong.
        </h2>
        <p class="dx__lead">
          One command checks the project <em>and</em> the deployment and prints
          every finding with the fix beside it. The same checks stay live in a
          DevTools tab next to your app's real state. And the first dev run
          writes the Convex files, so there is no README to copy from.
        </p>
      </header>

      <div class="dx__grid">
        <!-- ── 1. doctor ─────────────────────────────────────────── -->
        <article class="dx__card dx__card--doctor plaque noise">
          <header class="dx__chrome">
            <UIcon
              class="dx__chrome-icon"
              name="i-lucide-stethoscope"
              aria-hidden="true"
            />
            <h3 class="dx__chrome-ttl engraved-sm">
              doctor
            </h3>
            <span class="dx__state warn">
              <span
                class="dx__led"
                aria-hidden="true"
              />
              1 finding
            </span>
          </header>

          <div class="dx__slot slot">
            <p class="dx__cmd">
              <span
                class="dx__prompt"
                aria-hidden="true"
              >$</span> npx nuxt-backend doctor
            </p>

            <ul class="dx__findings">
              <li
                v-for="f in FINDINGS"
                :key="f.title"
                class="dx__row"
                :class="f.status"
              >
                <span class="dx__line">
                  <span
                    class="dx__glyph"
                    aria-hidden="true"
                  >{{ GLYPH[f.status] }}</span>
                  <span class="dx__sr">{{ f.status }}</span>
                  <span class="dx__msg"><b class="dx__name">{{ f.title }}:</b> {{ f.message }}</span>
                </span>
                <span
                  v-if="f.fix"
                  class="dx__hint"
                >
                  <span
                    class="dx__arrow"
                    aria-hidden="true"
                  >↳</span>
                  {{ f.fix }}
                </span>
              </li>
            </ul>

            <p class="dx__summary">
              {{ SUMMARY }}
            </p>
          </div>

          <p class="dx__note">
            Excerpt — one run checks the project, the deployment env, the
            mounted webhook routes, the composable-to-function contract and the
            invitation path.
            <code>--prod</code> turns each optional degradation into a failure,
            <code>--fix</code> restores missing files and pushes env,
            <code>--json</code> returns <code>{ findings, summary }</code>. Any
            failure exits <code>1</code>.
          </p>
        </article>

        <!-- ── 2. zero-config scaffold ───────────────────────────── -->
        <article class="dx__card dx__card--tree plaque noise">
          <header class="dx__chrome">
            <UIcon
              class="dx__chrome-icon"
              name="i-lucide-folder-tree"
              aria-hidden="true"
            />
            <h3 class="dx__chrome-ttl engraved-sm">
              First dev run
            </h3>
            <span class="dx__state ok">
              <span
                class="dx__led"
                aria-hidden="true"
              />
              16 files
            </span>
          </header>

          <div class="dx__slot slot">
            <p class="dx__cmd">
              <span
                class="dx__prompt"
                aria-hidden="true"
              >$</span> npm run dev
            </p>
            <ul class="dx__tree">
              <li class="dx__dir">
                backend/
              </li>
              <li
                v-for="(entry, i) in TREE"
                :key="entry.file"
                class="dx__file"
              >
                <span
                  class="dx__branch"
                  aria-hidden="true"
                >{{ i === TREE.length - 1 ? '└─' : '├─' }}</span>
                <span class="dx__fname">{{ entry.file }}</span>
                <span
                  v-if="entry.note"
                  class="dx__fnote"
                >{{ entry.note }}</span>
              </li>
              <li class="dx__dir dx__dir--last">
                convex.json
              </li>
            </ul>
          </div>

          <p class="dx__note">
            Nothing here is copied by hand. The dev server scaffolds what is
            missing and never touches a file you already own —
            <code>npx nuxt-backend init</code> does the same on demand, plus
            <code>.env.example</code> and the <code>nuxt.config</code> entry.
          </p>
        </article>

        <!-- ── 3. the DevTools Backend tab ───────────────────────── -->
        <article class="dx__card dx__card--dt plaque noise">
          <header class="dx__chrome">
            <UIcon
              class="dx__chrome-icon"
              name="i-lucide-panel-right-open"
              aria-hidden="true"
            />
            <h3 class="dx__chrome-ttl engraved-sm">
              Nuxt DevTools · Backend
            </h3>
            <span class="dx__state ok">
              <span
                class="dx__led"
                aria-hidden="true"
              />
              live
            </span>
          </header>

          <div class="dx__dt">
            <!-- A drawing, not a screenshot: the panel milled into a slot. -->
            <div
              class="dx__screen slot"
              role="img"
              aria-label="The Backend tab: a rail of Overview, Billing and Workspace tabs beside the Overview pane's preflight, deployment env and webhook delivery cards."
            >
              <nav
                class="dx__rail"
                aria-hidden="true"
              >
                <span
                  v-for="tab in TABS"
                  :key="tab.label"
                  class="dx__tab"
                  :class="{ 'is-active': tab.active }"
                >
                  <UIcon :name="tab.icon" />
                  {{ tab.label }}
                </span>
              </nav>

              <div
                class="dx__pane"
                aria-hidden="true"
              >
                <section class="dx__cardlet">
                  <p class="dx__cardlet-ttl">
                    Preflight
                  </p>
                  <p class="dx__finding">
                    <span class="dx__badge warn">warn</span>
                    <span class="dx__finding-ttl">Billing webhooks</span>
                    <span class="dx__finding-msg">BILLING_WEBHOOK_SECRET is not set (optional)</span>
                  </p>
                  <p class="dx__fixchip">
                    <code>npx nuxt-backend env push</code>
                    <span class="dx__copy"><UIcon name="i-lucide-copy" /></span>
                  </p>
                  <p class="dx__badges">
                    <span class="dx__badge ok">Convex site URL ✓</span>
                    <span class="dx__badge ok">Auth secret ✓</span>
                    <span class="dx__badge ok">Email transport ✓</span>
                  </p>
                </section>

                <section class="dx__cardlet">
                  <p class="dx__cardlet-ttl">
                    Deployment env
                    <span class="dx__cardlet-sub">presence only — values never leave the dev server</span>
                  </p>
                  <p class="dx__tier">
                    Required on the deployment
                  </p>
                  <p class="dx__badges">
                    <span class="dx__badge ok"><code>AUTH_SECRET</code> set</span>
                    <span class="dx__badge ok"><code>SITE_URL</code> set</span>
                  </p>
                  <p class="dx__tier">
                    Optional (designed degradation)
                  </p>
                  <p class="dx__badges">
                    <span class="dx__badge ok"><code>EMAIL_API_KEY</code> set</span>
                    <span class="dx__badge mute"><code>BILLING_WEBHOOK_SECRET</code> unset</span>
                  </p>
                </section>

                <section class="dx__cardlet">
                  <p class="dx__cardlet-ttl">
                    Recent webhook deliveries
                  </p>
                  <table class="dx__log">
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Type</th>
                        <th>Outcome</th>
                        <th>Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in DELIVERIES"
                        :key="`${row.type}-${row.at}`"
                      >
                        <td>{{ row.service }}</td>
                        <td class="dx__mono">
                          {{ row.type }}
                        </td>
                        <td>
                          <span
                            class="dx__badge"
                            :class="row.outcome === 'ok' ? 'ok' : 'mute'"
                          >{{ row.outcome }}</span>
                        </td>
                        <td class="dx__mono dx__at">
                          {{ row.at }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              </div>
            </div>

            <div class="dx__panels">
              <dl class="dx__panel-list">
                <div
                  v-for="panel in PANELS"
                  :key="panel.name"
                >
                  <dt class="dx__panel-name embossed-sm">
                    {{ panel.name }}
                  </dt>
                  <dd class="dx__panel-body">
                    {{ panel.body }}
                  </dd>
                </div>
              </dl>
              <p class="dx__panels-note">
                Build-time facts arrive over the DevTools RPC, re-collected per
                request; live state comes from the inspected page through the
                module's own composables. Only presence booleans cross for env
                vars — secrets stay in the Node process.
              </p>
            </div>
          </div>
        </article>
      </div>

      <div class="dx__links">
        <NuxtLink
          to="/tooling/cli"
          class="hbtn"
        >
          <UIcon name="i-lucide-terminal" />
          CLI reference
        </NuxtLink>
        <NuxtLink
          to="/tooling/devtools"
          class="hbtn"
        >
          <UIcon name="i-lucide-panel-right-open" />
          The DevTools tab
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dx { padding: clamp(3rem, 8vw, 7rem) 1.25rem; background: var(--bg); }
.dx__inner { max-width: 74rem; margin: 0 auto; }

/* ── Head ───────────────────────────────────────────────────── */
.dx__head { max-width: 44rem; margin: 0 auto clamp(2rem, 5vw, 3rem); text-align: center; }
.dx__eyebrow {
  margin: 0 0 1.2rem;
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.dx__title {
  margin: 0; font-family: var(--display); font-weight: 600;
  font-size: clamp(1.9rem, 4.5vw, 3rem); letter-spacing: -0.005em; line-height: 1.1;
}
.dx__lead {
  margin: 1rem auto 0; max-width: 50ch;
  font-size: 1.04rem; line-height: 1.6; color: var(--ink-dim);
}
.dx__lead em { font-style: italic; color: var(--ink); }

/* ── Panels ─────────────────────────────────────────────────── */
.dx__grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: clamp(0.85rem, 1.8vw, 1.35rem);
}
.dx__card {
  display: flex; flex-direction: column;
  padding: 0.9rem 1rem 1.1rem;
  transition: box-shadow var(--transition), transform var(--press);
}
.dx__card:hover { transform: translateY(-2px); box-shadow: var(--plaque-hi); }
.dx__card--doctor { grid-column: span 7; }
/* The tree card is the query container for its own annotations: its width is
   set by the grid, not by the viewport, so the note's breakpoint has to read
   the card. It is narrowest just above the 900px stack point, not at 390. */
.dx__card--tree { grid-column: span 5; container: dx-tree / inline-size; }
.dx__card--dt { grid-column: span 12; }

@media (max-width: 900px) {
  .dx__card--doctor, .dx__card--tree, .dx__card--dt { grid-column: span 12; }
}

/* Bezel chrome — the same row BackendBoot's console wears. */
.dx__chrome {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.15rem 0.15rem 0.75rem;
}
.dx__chrome-icon { width: 0.95rem; height: 0.95rem; color: var(--ink-faint); flex: none; }
.dx__chrome-ttl {
  flex: 1; margin: 0;
  font-family: var(--mono); font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.dx__state {
  display: inline-flex; align-items: center; gap: 0.4rem; flex: none;
  font-family: var(--mono); font-size: 0.66rem; font-weight: 600;
}
.dx__led { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
.dx__state.ok { color: var(--ok); }
.dx__state.ok .dx__led { box-shadow: var(--glow-ok); }
.dx__state.warn { color: var(--warn); }
.dx__state.warn .dx__led { box-shadow: var(--glow-warn); animation: dx-beat 2.4s ease-in-out infinite; }

/* The recessed display every panel reads out of. */
.dx__slot { padding: 1rem 1.05rem 1.1rem; font-family: var(--mono); }
.dx__cmd {
  margin: 0 0 0.85rem; padding-bottom: 0.7rem;
  border-bottom: 1px solid var(--edge);
  font-size: 0.8rem; color: var(--ink);
}
.dx__prompt { color: var(--ok); }

/* ── 1. doctor transcript ───────────────────────────────────── */
.dx__findings { list-style: none; margin: 0; padding: 0; }
.dx__row { display: flex; flex-direction: column; gap: 0.16rem; padding: 0.2rem 0; }
.dx__line { display: grid; grid-template-columns: 1rem 1fr; gap: 0.5rem; align-items: start; }
.dx__glyph { font-size: 0.82rem; line-height: 1.45; }
.dx__row.pass .dx__glyph { color: var(--ok); }
.dx__row.warn .dx__glyph { color: var(--warn); }
.dx__msg { font-size: 0.755rem; line-height: 1.45; color: var(--ink-dim); }
.dx__name { font-weight: 600; color: var(--ink); }
.dx__hint {
  display: grid; grid-template-columns: 1rem 1fr; gap: 0.5rem;
  margin-left: 1.5rem;
  font-size: 0.735rem; line-height: 1.45; color: var(--ink-dim);
}
.dx__arrow { color: var(--warn); text-align: center; }
.dx__summary {
  margin: 0.85rem 0 0; padding-top: 0.75rem;
  border-top: 1px solid var(--edge);
  font-size: 0.755rem; color: var(--warn-soft);
}

/* ── 2. scaffold tree ───────────────────────────────────────── */
.dx__tree { list-style: none; margin: 0; padding: 0; font-size: 0.755rem; line-height: 1.72; }
.dx__dir { color: var(--ink); font-weight: 600; }
.dx__dir--last { margin-top: 0.5rem; }
.dx__file { display: flex; align-items: baseline; gap: 0.45rem; }
.dx__branch { color: var(--ink-faint); flex: none; }
.dx__fname { color: var(--ink-dim); }
/* `padding-left` is the gutter guarantee: the note is right-aligned in the
   space the filename leaves, so on the longest pairs its text would otherwise
   land one character off the name. The padding reserves that separation. */
.dx__fnote {
  flex: 1; min-width: 0; padding-left: 0.8rem;
  color: var(--ink-faint); font-size: 0.7rem;
  text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* The right-aligned annotation column only exists while the card can hold one.
   Below that the note butted against the filename and truncated mid-phrase, so
   it drops onto its own line indented under the name — the same continuation
   shape `.dx__hint` uses in the doctor transcript — and wraps instead of
   clipping. The note is content; it never gets cut. */
@container dx-tree (max-width: 420px) {
  .dx__file {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0 0.45rem;
  }
  /* Proximity: the note hugs the filename it annotates and the space goes
     below it, so a wrapped entry reads as one thing. */
  .dx__fnote {
    grid-column: 2;
    text-align: left; white-space: normal; overflow: visible;
    line-height: 1.45; padding-left: 0; padding-bottom: 0.45rem;
  }
}

/* ── 3. DevTools drawing ────────────────────────────────────── */
.dx__dt {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: clamp(1rem, 2.2vw, 1.7rem);
  align-items: start;
}
@media (max-width: 860px) { .dx__dt { grid-template-columns: minmax(0, 1fr); } }

.dx__screen {
  display: grid; grid-template-columns: 7.5rem minmax(0, 1fr);
  min-height: 100%;
}
@media (max-width: 560px) { .dx__screen { grid-template-columns: minmax(0, 1fr); } }

/* Tab rail: the slot is the track, the active tab is the one seated
   control on this page — a raised pill lifted out of the well. */
.dx__rail {
  display: flex; flex-direction: column; gap: 0.25rem;
  padding: 0.7rem 0.55rem;
  border-right: 1px solid var(--edge);
}
@media (max-width: 560px) {
  .dx__rail { flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid var(--edge); }
}
.dx__tab {
  display: flex; align-items: center; gap: 0.42rem;
  padding: 0.36rem 0.5rem; border-radius: var(--r-sm);
  font-family: var(--display); font-size: 0.78rem; font-weight: 600;
  color: var(--ink-faint);
}
.dx__tab :deep(svg) { width: 0.9rem; height: 0.9rem; flex: none; }
.dx__tab.is-active {
  color: var(--ink);
  background: var(--grad-surface);
  box-shadow: var(--elev-1);
}

.dx__pane { padding: 0.7rem 0.85rem 0.85rem; min-width: 0; }
.dx__cardlet { padding: 0.55rem 0 0.7rem; border-bottom: 1px solid var(--edge); }
.dx__cardlet:last-child { border-bottom: 0; padding-bottom: 0.1rem; }
.dx__cardlet-ttl {
  margin: 0 0 0.45rem;
  font-family: var(--mono); font-size: 0.63rem; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint);
}
.dx__cardlet-sub {
  display: block; margin-top: 0.16rem;
  font-weight: 500; letter-spacing: 0.04em; text-transform: none;
  font-size: 0.66rem;
}

.dx__finding {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem;
  margin: 0 0 0.35rem;
}
.dx__finding-ttl { font-size: 0.78rem; color: var(--ink); }
.dx__finding-msg { font-size: 0.72rem; color: var(--ink-dim); }

.dx__fixchip {
  display: inline-flex; align-items: center; gap: 0.4rem;
  margin: 0 0 0.55rem; padding: 0.22rem 0.3rem 0.22rem 0.45rem;
  border-radius: var(--r-xs); border: 1px solid var(--edge);
}
.dx__fixchip code { font-family: var(--mono); font-size: 0.68rem; color: var(--ink-dim); }
.dx__copy { display: inline-flex; color: var(--ink-faint); }
.dx__copy :deep(svg) { width: 0.78rem; height: 0.78rem; }

.dx__badges { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0 0 0.35rem; }
.dx__badges:last-child { margin-bottom: 0; }
.dx__badge {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.12rem 0.42rem; border-radius: 999px;
  font-family: var(--display); font-size: 0.66rem; font-weight: 600; line-height: 1.5;
}
.dx__badge code { font-family: var(--mono); font-size: 0.94em; color: inherit; }
.dx__badge.ok { color: var(--ok-soft); background: var(--ok-dim); }
.dx__badge.warn { color: var(--warn-soft); background: var(--warn-dim); }
.dx__badge.mute { color: var(--ink-faint); border: 1px solid var(--edge); padding-block: 0.02rem; }

.dx__tier {
  margin: 0.5rem 0 0.28rem;
  font-size: 0.68rem; color: var(--ink-faint);
}
.dx__tier:first-of-type { margin-top: 0; }

.dx__log { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
.dx__log th {
  padding: 0 0.6rem 0.28rem 0; text-align: left;
  font-weight: 500; color: var(--ink-faint);
}
.dx__log td { padding: 0.16rem 0.6rem 0.16rem 0; color: var(--ink-dim); vertical-align: middle; }
.dx__log th:last-child, .dx__log td:last-child { padding-right: 0; }
.dx__mono { font-family: var(--mono); }
.dx__at { color: var(--ink-faint); }

/* The three panels, described beside the drawing. */
.dx__panel-list { margin: 0; }
.dx__panel-list > div + div { margin-top: 0.9rem; }
.dx__panel-name {
  margin: 0 0 0.2rem;
  font-family: var(--display); font-size: 0.95rem; font-weight: 600; color: var(--ink);
}
.dx__panel-body { margin: 0; font-size: 0.86rem; line-height: 1.55; color: var(--ink-dim); }
.dx__panels-note {
  margin: 1.15rem 0 0; padding-top: 0.9rem;
  border-top: 1px solid var(--edge);
  font-size: 0.78rem; line-height: 1.55; color: var(--ink-faint);
}

/* ── Notes + links ──────────────────────────────────────────── */
.dx__note {
  margin: 0.85rem 0.15rem 0;
  font-size: 0.8rem; line-height: 1.55; color: var(--ink-faint);
}
.dx__note code { font-family: var(--mono); font-size: 0.9em; color: var(--ink-dim); }

.dx__links {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 0.7rem;
  margin-top: clamp(1.5rem, 3vw, 2.2rem);
}
/* The homepage `.hbtn` inherits no focus ring from app.css (the token ring is
   scoped to `.pg-shell`), so this section carries its own — design.md §8: a
   2px `--focus` outline sitting above the depth. */
.dx__links .hbtn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.dx__sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}

@keyframes dx-beat { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) {
  .dx__state.warn .dx__led { animation: none; }
  .dx__card, .dx__card:hover { transition: none; transform: none; }
}
</style>
