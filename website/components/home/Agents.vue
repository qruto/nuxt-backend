<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

/**
 * "Your app, as tools" — the agent (MCP) surface.
 *
 * A recorded MCP session milled into a wide slot inside a plaque bezel: the
 * 401 discovery challenge, the token exchange, `tools/list` under a partial
 * grant, and one call that runs as the signed-in user. Beside it, the consent
 * plaque — what the human actually approves, and the one guarantee that keeps
 * money out of an agent's hands.
 *
 * Everything here is transcribed from the code, not imagined:
 *  - the challenge line is `mcp/gate.ts`'s `challenge()` response;
 *  - the exchange, its 5-minute JWT and the claims are `convex/integrations/mcp.ts`;
 *  - the nine tools and their scopes are `server/mcp/tools/*.ts`;
 *  - the scope catalogue is `BACKEND_MCP_SCOPES` in `convex/constants.ts`;
 *  - hidden-then-403 double enforcement is `defineBackendMcpTool` in `server/mcp/index.ts`;
 *  - `workspace-list`'s shape is the scaffolded `listWorkspaces` query.
 *
 * Static by design: this is a document, not a live console — no data is read,
 * so nothing here can disagree with the page it is prerendered into. The one
 * moving part is the copy button, a convex control seated in the command well
 * (the section's single seated control).
 *
 * Signals: green = the scope was granted, amber = it was not. Nothing else on
 * the section carries colour.
 */

/** The scopes this recorded session was granted (a partial, realistic grant). */
const GRANTED = ['openid', 'profile', 'email', 'billing:read', 'workspace:read']

/** The nine built-in tools, with the scope each one declares. */
const TOOLS = [
  { name: 'profile-get', scope: 'profile' },
  { name: 'profile-update', scope: 'profile:write' },
  { name: 'billing-plans', scope: 'billing:read' },
  { name: 'billing-subscription', scope: 'billing:read' },
  { name: 'credits-balance', scope: 'billing:read' },
  { name: 'billing-checkout-link', scope: 'billing:checkout' },
  { name: 'billing-portal-link', scope: 'billing:checkout' },
  { name: 'workspace-list', scope: 'workspace:read' },
  { name: 'workspace-members', scope: 'workspace:read' },
].map(tool => ({ ...tool, listed: GRANTED.includes(tool.scope) }))

const listedCount = TOOLS.filter(tool => tool.listed).length

/** The consent screen's rows — the fixed `BACKEND_MCP_SCOPES` catalogue. */
const CONSENT = [
  { scope: 'openid · profile · email', grants: 'Identity — always granted by the provider', granted: true },
  { scope: 'billing:read', grants: 'Plans, the current subscription, credit balances', granted: true },
  { scope: 'workspace:read', grants: 'The workspace list and member lists', granted: true },
  { scope: 'profile:write', grants: 'The display name only — email stays in the verified web flow', granted: false },
  { scope: 'billing:checkout', grants: 'Checkout and portal links — never a payment', granted: false },
]

const CONNECT = 'claude mcp add --transport http nuxt-backend https://your-app.com/mcp'

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
async function copyConnect() {
  if (!import.meta.client || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(CONNECT)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 1600)
  }
  catch { /* clipboard blocked — no-op */ }
}
onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <section class="agents">
    <div class="agents__inner">
      <header class="agents__head">
        <p class="eyebrow engraved-sm">
          The agent surface
        </p>
        <h2 class="agents__title engraved">
          Your app, as tools.
        </h2>
        <p class="agents__lead">
          Every app built on this package serves an OAuth-protected
          <code>/mcp</code> endpoint. An agent connects, your user signs in on
          your own login page and approves scopes — and from then on every tool
          call runs <strong>as that user</strong>, through a Convex JWT that
          lives five minutes. Nine account, billing and workspace tools ship
          built in.
        </p>
      </header>

      <div class="agents__grid">
        <!-- The recorded session: a plaque bezel around a milled tape. -->
        <article class="wire plaque noise">
          <header class="wire__chrome">
            <h3 class="wire__ttl engraved-sm">
              MCP session
            </h3>
            <span class="wire__state">
              <span
                class="wire__led"
                aria-hidden="true"
              />
              authenticated · 5 min JWT
            </span>
          </header>

          <div class="tape slot">
            <p class="line">
              <span
                class="dir out"
                aria-hidden="true"
              >→</span>
              <span class="vh">Sent: </span>
              <code>POST /mcp</code>
              <span class="cmt">no Bearer</span>
            </p>
            <p class="line">
              <span
                class="dir in"
                aria-hidden="true"
              >←</span>
              <span class="vh">Received: </span>
              <code><b>401</b> WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"</code>
            </p>
            <p class="trace">
              <span aria-hidden="true">↳</span>
              discovery · dynamic client registration · your login page · consent
            </p>

            <p class="line">
              <span
                class="dir out"
                aria-hidden="true"
              >→</span>
              <span class="vh">Sent: </span>
              <code>initialize</code>
              <span class="cmt">Authorization: Bearer &lt;opaque&gt;</span>
            </p>
            <p class="trace">
              <span aria-hidden="true">↳</span>
              gate exchanges it at <code>POST /mcp/exchange</code> → a Convex JWT with the
              user's claims, <code>exp</code> 5 min
            </p>

            <p class="line">
              <span
                class="dir out"
                aria-hidden="true"
              >→</span>
              <span class="vh">Sent: </span>
              <code>tools/list</code>
            </p>
            <p class="line">
              <span
                class="dir in"
                aria-hidden="true"
              >←</span>
              <span class="vh">Received: </span>
              <code>{{ listedCount }} of {{ TOOLS.length }} tools</code>
              <span class="cmt">{{ TOOLS.length - listedCount }} hidden — scope not granted</span>
            </p>

            <ul class="tools">
              <li
                v-for="tool in TOOLS"
                :key="tool.name"
                class="tool"
                :class="tool.listed ? 'ok' : 'no'"
              >
                <span class="tool__name">{{ tool.name }}</span>
                <span class="tool__scope">{{ tool.scope }}</span>
                <span class="tool__state">
                  <span
                    class="tool__led"
                    aria-hidden="true"
                  />
                  {{ tool.listed ? 'listed' : 'hidden' }}
                </span>
              </li>
            </ul>

            <p class="line">
              <span
                class="dir out"
                aria-hidden="true"
              >→</span>
              <span class="vh">Sent: </span>
              <code>tools/call workspace-list</code>
            </p>
            <p class="line">
              <span
                class="dir in"
                aria-hidden="true"
              >←</span>
              <span class="vh">Received: </span>
              <code>{ "workspaces": [ { "id": "n57k…", "name": "Acme", "slug": "acme", "role": "owner", "active": true } ] }</code>
            </p>
            <p class="trace">
              <span aria-hidden="true">↳</span>
              ran as the user — <code>ctx.auth</code>, workspace and billing-entity
              resolution behave exactly as they do for a web session
            </p>
          </div>

          <p class="wire__foot">
            A tool whose scope is missing is hidden from <code>tools/list</code> <em>and</em> refused with <code>403</code> when called
            directly — list-time hiding is only advisory, so the handler
            re-checks.
          </p>
        </article>

        <div class="agents__side">
          <!-- What the human approves, once, in a browser. -->
          <aside class="consent plaque">
            <h3 class="consent__ttl engraved-sm">
              Consent
            </h3>
            <dl class="consent__meta">
              <dt>Client</dt>
              <dd>Claude Code <span class="cmt">registered on the fly</span></dd>
              <dt>Resource</dt>
              <dd>https://your-app.com</dd>
            </dl>

            <ul class="scopes">
              <li
                v-for="row in CONSENT"
                :key="row.scope"
                class="scope"
                :class="row.granted ? 'ok' : 'no'"
              >
                <span class="scope__mark">
                  <UIcon :name="row.granted ? 'i-lucide-check' : 'i-lucide-minus'" />
                </span>
                <span class="scope__body">
                  <span class="scope__name">{{ row.scope }}</span>
                  <span class="scope__grants">{{ row.grants }}</span>
                </span>
              </li>
            </ul>

            <p class="guarantee">
              <UIcon
                name="i-lucide-lock"
                aria-hidden="true"
              />
              <span>
                <strong>The checkout tools return links, never payments.</strong> <code>billing-checkout-link</code> hands back a URL for the
                human to open — no tool in this package executes a payment, and
                success paths must be app-relative, so a prompt-injected agent
                cannot bounce a paying user to another origin.
              </span>
            </p>
          </aside>

          <!-- The one line that connects a client. -->
          <div class="connect">
            <p class="connect__label engraved-sm">
              Connect a client
            </p>
            <div class="cmd slot">
              <code class="cmd__line"><span
                class="cmd__prompt"
                aria-hidden="true"
              >$</span> {{ CONNECT }}</code>
              <button
                type="button"
                class="cmd__copy"
                :aria-label="copied ? 'Copied' : 'Copy the connect command'"
                @click="copyConnect"
              >
                <UIcon
                  :name="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                  :class="{ ok: copied }"
                />
              </button>
            </div>
            <p class="connect__links">
              <NuxtLink
                to="/agents/mcp-server"
                class="alink"
              >
                <UIcon name="i-lucide-server" />
                How the endpoint works
              </NuxtLink>
              <NuxtLink
                to="/agents/built-in-tools"
                class="alink"
              >
                <UIcon name="i-lucide-wrench" />
                All nine built-in tools
              </NuxtLink>
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.agents { padding: clamp(3rem, 8vw, 7rem) 1.25rem; background: var(--bg); }
.agents__inner { max-width: 74rem; margin: 0 auto; }
.agents__head { max-width: 46rem; margin: 0 auto clamp(2rem, 5vw, 3rem); text-align: center; }

.eyebrow {
  margin: 0 0 1.2rem;
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.agents__title {
  margin: 0; font-family: var(--display); font-weight: 600;
  font-size: clamp(1.9rem, 4.5vw, 3rem); letter-spacing: -0.005em; line-height: 1.1;
}
.agents__lead {
  margin: 1rem auto 0; max-width: 54ch; font-size: 1.04rem; line-height: 1.6;
  color: var(--ink-dim);
}
.agents__lead strong { color: var(--ink); font-weight: 600; }

/* Inline code — one recipe for the whole section. The lead keeps the site's
   inline-code chip; inside the tape and on the plaque faces the chip is
   cancelled (a milled well inside a milled well reads as damage) and the
   signal colour carries the code instead. */
code { font-family: var(--mono); font-size: 0.88em; }
.agents__lead code { color: var(--ok-soft); }
.tape code, .wire__foot code, .guarantee code {
  padding: 0; border-radius: 0; background: none; box-shadow: none;
  font-size: 1em; color: inherit;
}
.wire__foot code, .guarantee code, .trace code { color: var(--ok-soft); }

/* ── Layout: the session tape beside the consent plaque ──
   The tape is the tall element; the side column stacks the consent plaque
   over the connect command so the shorter column carries two objects instead
   of one floating card with a hole beneath it. */
.agents__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: clamp(0.85rem, 2vw, 1.35rem);
}
.agents__side {
  display: flex; flex-direction: column;
  gap: clamp(0.85rem, 2vw, 1.35rem);
  min-width: 0;
  /* Natural height: stretching the plaque to the tape's height only moves the
     hole inside the card, which reads as a milling error rather than air. */
  align-self: start;
}
@media (max-width: 1000px) { .agents__grid { grid-template-columns: 1fr; } }

/* ── The session: a plaque bezel wrapping a milled tape ── */
.wire { padding: 0.9rem 1rem 1rem; }
.wire__chrome {
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.15rem 0.15rem 0.75rem;
}
.wire__ttl {
  flex: 1; margin: 0;
  font-family: var(--mono); font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.wire__state {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-family: var(--mono); font-size: 0.66rem; font-weight: 600;
  color: var(--ok);
}
.wire__led {
  width: 7px; height: 7px; border-radius: 999px;
  background: currentColor; box-shadow: var(--glow-ok);
}

.tape {
  padding: 1.05rem 1.15rem 1.15rem;
  font-family: var(--mono); font-size: 0.78rem; line-height: 1.55;
  overflow-wrap: anywhere;
}
.line {
  position: relative;
  display: grid; grid-template-columns: 1.1rem 1fr;
  margin: 0 0 0.3rem; color: var(--ink);
}
.line + .line { margin-top: 0.1rem; }
.line > code, .line > .cmt { grid-column: 2; }
.dir { user-select: none; font-weight: 700; }
.dir.out { color: var(--ink-faint); }
.dir.in { color: var(--ink-dim); }
.line code b { font-weight: 700; color: var(--warn); }
.cmt { display: block; color: var(--ink-faint); font-size: 0.94em; }
.trace {
  margin: 0.15rem 0 0.9rem 1.1rem; color: var(--ink-faint);
  font-size: 0.94em; line-height: 1.5;
}
.trace code { font-size: 1em; }

/* Visually hidden: gives each line a spoken "sent/received" the arrow only
   shows. Scoped on purpose — never depend on a utility class for this. */
.vh {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}

/* The tools/list result — nine rows, one signal each. */
.tools {
  list-style: none; margin: 0.55rem 0 1rem; padding: 0.15rem 0 0;
  border-top: 1px dashed var(--edge);
}
.tool {
  display: grid; grid-template-columns: minmax(0, 1fr) 8.5rem 5.2rem;
  align-items: center; gap: 0.5rem;
  padding: 0.26rem 0 0.26rem 1.1rem;
  border-bottom: 1px dashed var(--edge);
}
.tool:last-child { border-bottom: 0; }
.tool__name { color: var(--ink); font-weight: 500; }
.tool__scope { color: var(--ink-dim); font-size: 0.94em; }
.tool__state {
  display: inline-flex; align-items: center; gap: 0.35rem; justify-self: start;
  padding: 0.1rem 0.45rem; border-radius: 999px;
  font-size: 0.86em; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
}
.tool__led { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.tool.ok .tool__state { color: var(--ok-soft); background: var(--ok-dim); }
.tool.ok .tool__led { background: var(--ok); box-shadow: var(--glow-ok); }
.tool.no .tool__state { color: var(--warn-soft); background: var(--warn-dim); }
.tool.no .tool__led { background: var(--warn); box-shadow: var(--glow-warn); }

.wire__foot {
  margin: 0.85rem 0.25rem 0.15rem; font-size: 0.8rem; line-height: 1.55;
  color: var(--ink-dim);
}
.wire__foot em { font-style: normal; color: var(--ink); font-weight: 600; }

/* ── The consent plaque ── */
.consent { padding: 1.15rem 1.2rem 1.25rem; }
.consent__ttl {
  margin: 0 0 0.85rem;
  font-family: var(--mono); font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.consent__meta {
  display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.7rem;
  margin: 0 0 1rem; padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--edge);
  font-family: var(--mono); font-size: 0.74rem;
}
.consent__meta dt { color: var(--ink-faint); }
.consent__meta dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
.consent__meta .cmt { display: inline; color: var(--ink-faint); }

.scopes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.scope { display: grid; grid-template-columns: 1.35rem 1fr; gap: 0.55rem; align-items: start; }
.scope__mark {
  display: grid; place-items: center;
  width: 1.35rem; height: 1.35rem; border-radius: 999px;
}
.scope__mark :deep(svg) { width: 0.8rem; height: 0.8rem; }
.scope.ok .scope__mark { color: var(--ok-soft); background: var(--ok-dim); }
.scope.no .scope__mark { color: var(--warn-soft); background: var(--warn-dim); }
.scope__body { display: block; min-width: 0; }
.scope__name {
  display: block; font-family: var(--mono); font-size: 0.76rem; font-weight: 600;
  color: var(--ink); overflow-wrap: anywhere;
}
.scope.no .scope__name { color: var(--ink-dim); }
.scope__grants { display: block; font-size: 0.82rem; line-height: 1.45; color: var(--ink-dim); }

.guarantee {
  display: grid; grid-template-columns: 1rem 1fr; gap: 0.55rem;
  margin: 1.15rem 0 0; padding-top: 1.05rem;
  border-top: 1px solid var(--edge);
  font-size: 0.82rem; line-height: 1.55; color: var(--ink-dim);
}
.guarantee :deep(svg) { width: 0.9rem; height: 0.9rem; margin-top: 0.2rem; color: var(--ink-faint); }
.guarantee strong { color: var(--ink); font-weight: 600; }

/* ── The connect command, milled straight into the canvas ── */
.connect { min-width: 0; }
.connect__label {
  margin: 0 0 0.7rem;
  font-family: var(--mono); font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.cmd {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.55rem 0.55rem 0.55rem 1rem;
}
.cmd__line {
  font-family: var(--mono); font-size: 0.86rem; font-weight: 500;
  color: var(--ink); min-width: 0; overflow-wrap: anywhere;
}
.cmd__prompt { color: var(--ink-faint); user-select: none; }
/* The one convex control of this section, seated in the well. */
.cmd__copy {
  display: grid; place-items: center; flex: none;
  width: 2.1rem; height: 2.1rem; border: 0; border-radius: 999px; cursor: pointer;
  color: var(--ink-dim); background: var(--grad-surface); box-shadow: var(--elev-1);
  /* Transform + colour only; the elevation token is SWAPPED for the state,
     never animated (design.md §7 — box-shadow is not a motion property). */
  transition: color var(--transition), transform var(--press) var(--ease-out);
}
.cmd__copy:hover { color: var(--ink); box-shadow: var(--elev-2); }
.cmd__copy:active { box-shadow: var(--inset-1); transform: translateY(0.5px); }
.cmd__copy :deep(svg) { width: 0.95rem; height: 0.95rem; }
.cmd__copy .ok { color: var(--ok); }

.connect__links {
  display: flex; flex-wrap: wrap; gap: 0.6rem;
  margin: 0.85rem 0 0;
}
.alink {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 0.95rem; border-radius: 999px;
  font-family: var(--display); font-size: 0.8rem; font-weight: 600;
  color: var(--ink-dim); background: var(--grad-surface); box-shadow: var(--elev-1);
  transition: color var(--transition), transform var(--press) var(--ease-out);
}
.alink:hover { color: var(--ok); box-shadow: var(--elev-2); transform: translateY(-1px); }
.alink:active { box-shadow: var(--inset-1); transform: translateY(0.5px); }
.alink :deep(svg) { width: 14px; height: 14px; }

/* Depth never carries a focus state — the ring sits on top of it. app.css's
   token ring is scoped to `.pg-shell`, so the homepage declares its own. */
.cmd__copy:focus-visible,
.alink:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@media (max-width: 620px) {
  .tape { font-size: 0.72rem; }
  .tool { grid-template-columns: minmax(0, 1fr) 4.8rem; row-gap: 0.1rem; }
  .tool__scope { grid-column: 1; color: var(--ink-faint); }
  .tool__state { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
  .cmd { gap: 0.5rem; padding: 0.5rem 0.5rem 0.5rem 0.8rem; }
  .cmd__line { font-size: 0.76rem; }
}

/* Nothing here animates on its own; the only motion is the 1px lift on the
   two controls, and that is what reduced motion takes away. */
@media (prefers-reduced-motion: reduce) {
  .alink, .cmd__copy { transition: color var(--transition); }
  .alink:hover, .alink:active, .cmd__copy:active { transform: none; }
}
</style>
