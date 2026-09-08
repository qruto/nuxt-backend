<script setup lang="ts">
/**
 * The closing argument — cost and ownership, milled as a bill of materials.
 *
 * A plaque bezel wrapping a slot display (the BackendBoot grammar), holding
 * three service rows and one answer line. Everything here is a fact read out
 * of the package, not a promise: the licence is `package.json`'s `"license":
 * "MIT"`, the three providers are its real dependencies (`convex` peer,
 * `@convex-dev/polar` + `@polar-sh/*`, `@convex-dev/resend` + `resend`), and
 * each row's unconfigured behaviour is the wording from
 * `OPTIONAL_DEPLOYMENT_ENV` in `src/preflight.ts` — the same strings the
 * `doctor` command prints.
 *
 * Signal vocabulary is BackendBoot's, so the two sections say the same thing
 * with the same colours: green `ready` = works with nothing configured, amber
 * `idle until configured` = a graceful no-op until you set a key. No provider
 * prices are quoted — they move and we don't control them; each row links out
 * to the provider's own page instead.
 *
 * Static by construction: no live reads, so it prerenders whole.
 */
interface Service {
  name: string
  role: string
  /** Who owns the account, and the one key that turns it on. */
  account: string
  status: 'ready' | 'idle'
  /** The status word on the pill. */
  tag: string
  /** What happens with nothing configured — from `src/preflight.ts`. */
  note: string
  href: string
  hrefLabel: string
}

const SERVICES: Service[] = [
  {
    name: 'Convex',
    role: 'The deployment everything runs on — database, functions, real-time subscriptions and file storage.',
    account: 'Your deployment — `npx convex dev` creates one, and `AUTH_SECRET` + `SITE_URL` are provisioned for you on dev.',
    status: 'ready',
    tag: 'ready',
    note: 'Nothing to configure.',
    href: 'https://www.convex.dev/pricing',
    hrefLabel: 'Convex pricing',
  },
  {
    name: 'Polar',
    role: 'Payments — checkout, subscriptions, prepaid credits and gift purchases.',
    account: 'Your organization — one key, `BILLING_ACCESS_TOKEN`.',
    status: 'idle',
    tag: 'idle until configured',
    note: 'Unset: billing queries return empty, checkout fails on invocation.',
    href: 'https://docs.polar.sh/merchant-of-record/fees',
    hrefLabel: 'Polar fees',
  },
  {
    name: 'Resend',
    role: 'Transactional email — OTP codes, invitations, gifts, and live delivery status.',
    account: 'Your API key — `EMAIL_API_KEY`.',
    status: 'idle',
    tag: 'idle until configured',
    note: 'Unset: sends no-op; in dev, OTP codes print in the `convex dev` console.',
    href: 'https://resend.com/pricing',
    hrefLabel: 'Resend pricing',
  },
]

// Split a tiny markdown string into plain/code segments so inline `code` spans
// render without v-html (no XSS surface) — same helper as Capabilities.vue.
function segments(md: string) {
  return md.split(/`([^`]+)`/).map((text, i) => ({ text, code: i % 2 === 1 }))
}
</script>

<template>
  <section class="oss">
    <div class="oss__wrap">
      <p class="oss__eyebrow engraved-sm">
        Cost &amp; ownership
      </p>
      <h2 class="oss__title engraved">
        MIT. Your accounts.
      </h2>
      <p class="oss__lead">
        <code>nuxt-backend</code> is MIT-licensed and adds no fee of its own.
        Three services do the work underneath, and each one bills you directly,
        on an account in your own name. Each is optional until you configure it
        — auth and data run the moment <code>convex dev</code> hands you a
        deployment, and billing and email stay graceful no-ops until you set a
        key.
      </p>

      <!-- Plaque bezel → slot display: two levels of depth, no seated control. -->
      <div class="bom plaque noise">
        <header class="bom__chrome">
          <span class="bom__ttl engraved-sm">Bill of materials</span>
          <a
            class="bom__lic"
            href="https://github.com/qruto/nuxt-backend/blob/main/LICENSE"
            target="_blank"
            rel="noopener"
          >MIT license <UIcon
            name="i-lucide-arrow-up-right"
            aria-hidden="true"
          /></a>
        </header>

        <div class="bom__body slot">
          <ul class="bom__rows">
            <li
              v-for="s in SERVICES"
              :key="s.name"
              class="svc"
            >
              <span class="svc__id">
                <span class="svc__name embossed-sm">{{ s.name }}</span>
                <a
                  class="svc__out"
                  :href="s.href"
                  :aria-label="s.hrefLabel"
                  target="_blank"
                  rel="noopener"
                >pricing <UIcon
                  name="i-lucide-arrow-up-right"
                  aria-hidden="true"
                /></a>
              </span>

              <span class="svc__what">
                <span class="svc__role">{{ s.role }}</span>
                <span class="svc__acct">
                  <template
                    v-for="(seg, i) in segments(s.account)"
                    :key="i"
                  >
                    <code v-if="seg.code">{{ seg.text }}</code><template v-else>{{ seg.text }}</template>
                  </template>
                </span>
              </span>

              <span class="svc__state">
                <span
                  class="svc__pill"
                  :class="s.status"
                >
                  <span
                    class="svc__led"
                    aria-hidden="true"
                  />{{ s.tag }}
                </span>
                <span class="svc__note">
                  <template
                    v-for="(seg, i) in segments(s.note)"
                    :key="i"
                  >
                    <code v-if="seg.code">{{ seg.text }}</code><template v-else>{{ seg.text }}</template>
                  </template>
                </span>
              </span>
            </li>
          </ul>

          <p class="bom__answer">
            <span
              class="bom__arrow"
              aria-hidden="true"
            >▸</span>
            What <code>nuxt-backend</code> charges:
            <strong>nothing</strong>. MIT on npm — no account, no key, and no
            cut of the three bills above.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.oss { padding: clamp(3rem, 8vw, 6.5rem) 1.25rem; background: var(--bg); }
.oss__wrap { max-width: 54rem; margin: 0 auto; text-align: center; }

.oss__eyebrow {
  margin: 0 0 1.2rem;
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.oss__title {
  margin: 0 auto; max-width: 20ch; font-family: var(--display);
  font-size: clamp(1.9rem, 4.5vw, 3rem); font-weight: 600;
  letter-spacing: -0.005em; line-height: 1.1;
}
.oss__lead {
  margin: 1rem auto 0; max-width: 54ch; font-size: 1.04rem; line-height: 1.6;
  color: var(--ink-dim);
}
.oss__lead code { font-family: var(--mono); font-size: 0.9em; color: var(--ok-soft); }

/* ── Bill of materials — a plaque bezel holding a recessed slot ── */
.bom { margin: 2.5rem auto 0; text-align: left; padding: 0.9rem 1rem 1rem; }

.bom__chrome {
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.15rem 0.15rem 0.75rem;
}
.bom__ttl {
  flex: 1;
  font-family: var(--mono); font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
/* The licence chip is a fact, not a status — neutral ink, never a signal. */
.bom__lic {
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-family: var(--mono); font-size: 0.66rem; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ink-dim); text-decoration: none;
  transition: color var(--transition);
}
.bom__lic:hover { color: var(--ink); }
.bom__lic :deep(svg) { width: 0.85em; height: 0.85em; }

.bom__body { padding: 0.4rem 1.15rem 1.2rem; }

.bom__rows { list-style: none; margin: 0; padding: 0; }
.svc {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr) 12.5rem;
  gap: 0.35rem 1.1rem;
  align-items: start;
  padding: 1rem 0.2rem;
  border-bottom: 1px dashed var(--edge);
}
.svc:last-child { border-bottom: 0; }

.svc__id { display: flex; flex-direction: column; gap: 0.2rem; }
.svc__name {
  font-family: var(--display); font-size: 1.02rem; font-weight: 600;
  color: var(--ink); letter-spacing: 0.005em;
  /* raised via `.embossed-sm` */
}
.svc__out {
  display: inline-flex; align-items: center; gap: 0.2rem;
  font-family: var(--mono); font-size: 0.66rem; font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--ink-dim); text-decoration: none;
  transition: color var(--transition);
}
.svc__out:hover { color: var(--ink); }
.svc__out :deep(svg) { width: 0.85em; height: 0.85em; }

.svc__what { display: flex; flex-direction: column; gap: 0.3rem; overflow-wrap: break-word; }
.svc__role { font-size: 0.9rem; line-height: 1.5; color: var(--ink); }
.svc__acct {
  font-family: var(--mono); font-size: 0.72rem; line-height: 1.5;
  color: var(--ink-dim);
}
.svc__acct code, .svc__note code { font-family: inherit; color: var(--ok-soft); }

.svc__state { display: flex; flex-direction: column; align-items: flex-start; gap: 0.35rem; }
/* One signal per row: the tint sits behind, the `-soft` shade carries the
   text (4.9:1 light on the tinted slot), the LED is the signal itself. */
.svc__pill {
  display: inline-flex; align-items: center; gap: 0.36rem;
  padding: 0.2rem 0.55rem; border-radius: 999px;
  font-family: var(--mono); font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase;
}
.svc__led { width: 6px; height: 6px; border-radius: 999px; }
.svc__pill.ready { color: var(--ok-soft); background: var(--ok-dim); }
.svc__pill.ready .svc__led { background: var(--ok); box-shadow: var(--glow-ok); }
.svc__pill.idle { color: var(--warn-soft); background: var(--warn-dim); }
.svc__pill.idle .svc__led { background: var(--warn); box-shadow: var(--glow-warn); }
.svc__note {
  font-family: var(--mono); font-size: 0.66rem; line-height: 1.5;
  color: var(--ink-faint); overflow-wrap: break-word;
}

.bom__answer {
  margin: 1rem 0 0; padding-top: 0.9rem; border-top: 1px solid var(--edge);
  font-family: var(--mono); font-size: 0.74rem; line-height: 1.6;
  color: var(--ink-dim);
}
.bom__arrow { color: var(--ok); }
.bom__answer code { color: var(--ok-soft); }
.bom__answer strong { color: var(--ink); font-weight: 700; }

/* Depth never carries a focus state — the ring sits on top of it. */
.bom__lic:focus-visible, .svc__out:focus-visible {
  outline: 2px solid var(--focus); outline-offset: 3px; border-radius: 4px;
}

/* Narrow: the pill moves up beside the name and the two prose lines run the
   full width. `display: contents` promotes the pill and its note to grid
   items so the note keeps its place instead of being dropped — the
   unconfigured behaviour is the point of the row. */
@media (max-width: 760px) {
  .svc {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem 0.9rem;
  }
  .svc__id { flex-direction: row; align-items: baseline; gap: 0.6rem; }
  .svc__state { display: contents; }
  .svc__pill { grid-column: 2; grid-row: 1; justify-self: end; align-self: center; }
  .svc__what { grid-column: 1 / -1; }
  .svc__note { grid-column: 1 / -1; }
}
/* Phone: one column — name, pill, prose, note. */
@media (max-width: 460px) {
  .bom { padding-inline: 0.75rem; }
  .bom__body { padding-inline: 0.9rem; }
  .svc { grid-template-columns: minmax(0, 1fr); gap: 0.4rem; }
  .svc__id { grid-row: 1; }
  .svc__pill { grid-column: 1; grid-row: 2; justify-self: start; }
  .svc__what { grid-row: 3; }
  .svc__note { grid-row: 4; }
}

@media (prefers-reduced-motion: reduce) {
  .bom__lic, .svc__out { transition: none; }
}
</style>
