<script setup lang="ts">
/**
 * "Your app, as tools": the agent (MCP) surface, built from the parts.
 *
 * A recorded MCP session milled into a `slot` on a `plaque`: the 401
 * discovery challenge, the token exchange, `tools/list` under a partial
 * grant, and one call that runs as the signed-in user. Beside it, the
 * consent plaque (what the human approves, and the one guarantee that
 * keeps money out of an agent's hands) over the connect line.
 *
 * Everything here is transcribed from the code, not imagined:
 *  - the challenge line is `mcp/gate.ts`'s `challenge()` response;
 *  - the exchange, its 5-minute JWT and the claims are `convex/integrations/mcp.ts`;
 *  - the nine tools and their scopes are `server/mcp/tools/*.ts`;
 *  - the scope catalogue is `BACKEND_MCP_SCOPES` in `convex/constants.ts`;
 *  - hidden-then-403 double enforcement is `defineBackendMcpTool` in `server/mcp/index.ts`;
 *  - `workspace-list`'s shape is the scaffolded `listWorkspaces` query.
 *
 * Static by design: this is a document, not a live console. No data is
 * read, so nothing here can disagree with the page it is prerendered
 * into; the one moving part is the connect line's copy key.
 *
 * Signals: an LED or a mark per row, green when the scope was granted and
 * amber when it was not, with the state in words beside it. Nothing else
 * on the section carries colour but the session's one live light.
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

/** The consent screen's rows: the fixed `BACKEND_MCP_SCOPES` catalogue. */
const CONSENT = [
  { scope: 'openid · profile · email', grants: 'Identity — always granted by the provider', granted: true },
  { scope: 'billing:read', grants: 'Plans, the current subscription, credit balances', granted: true },
  { scope: 'workspace:read', grants: 'The workspace list and member lists', granted: true },
  { scope: 'profile:write', grants: 'The display name only — email stays in the verified web flow', granted: false },
  { scope: 'billing:checkout', grants: 'Checkout and portal links — never a payment', granted: false },
]

const CONNECT = 'claude mcp add --transport http nuxt-backend https://your-app.com/mcp'
</script>

<template>
  <section class="mx-auto grid w-full max-w-(--ui-container) gap-8 px-4 py-12 sm:px-6 lg:px-8">
    <div class="grid max-w-[62ch] gap-3">
      <p class="stamp">
        The agent surface
      </p>
      <EngravedTitle
        text="Your app, as tools."
        size="sm"
        class="font-display text-3xl font-bold [font-stretch:112%] sm:text-4xl"
      />
      <p class="text-(--ink-dim) text-pretty">
        Every app built on this package serves an OAuth-protected
        <code>/mcp</code> endpoint. An agent connects, your user signs in on
        your own login page and approves scopes — and from then on every tool
        call runs <strong class="font-semibold text-(--ink)">as that user</strong>, through a Convex JWT that
        lives five minutes. Nine account, billing and workspace tools ship
        built in.
      </p>
    </div>

    <!-- The session is the tall column; the side stacks the consent plaque
         over the connect line at their natural height. -->
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
      <!-- The recorded session: a plaque around a milled tape. -->
      <article class="plaque grid min-w-0 gap-4 p-4 sm:p-5">
        <header class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="stamp">
            MCP session
          </h3>
          <span class="inline-flex items-center gap-2 font-mono text-xs font-semibold text-(--ok)">
            <Led />
            authenticated · 5 min JWT
          </span>
        </header>

        <!-- Inside the well a code span is plain type: a chip would be a well
             cut into a well. -->
        <div class="slot p-4 font-mono text-xs leading-relaxed wrap-anywhere sm:p-5 sm:text-[0.8rem] [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0 [&_code]:shadow-none">
          <p class="relative grid grid-cols-[1.1rem_minmax(0,1fr)] text-(--ink)">
            <span
              class="font-bold text-(--ink-faint) select-none"
              aria-hidden="true"
            >→</span>
            <span class="sr-only">Sent: </span>
            <code>POST /mcp</code>
            <span class="col-start-2 text-(--ink-faint)">no Bearer</span>
          </p>
          <p class="relative mt-1 grid grid-cols-[1.1rem_minmax(0,1fr)] text-(--ink)">
            <span
              class="font-bold text-(--ink-dim) select-none"
              aria-hidden="true"
            >←</span>
            <span class="sr-only">Received: </span>
            <code><b class="font-bold text-(--warn)">401</b> WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"</code>
          </p>
          <p class="ms-[1.1rem] mt-1 mb-4 text-(--ink-faint)">
            <span aria-hidden="true">↳</span>
            discovery · dynamic client registration · your login page · consent
          </p>

          <p class="relative grid grid-cols-[1.1rem_minmax(0,1fr)] text-(--ink)">
            <span
              class="font-bold text-(--ink-faint) select-none"
              aria-hidden="true"
            >→</span>
            <span class="sr-only">Sent: </span>
            <code>initialize</code>
            <span class="col-start-2 text-(--ink-faint)">Authorization: Bearer &lt;opaque&gt;</span>
          </p>
          <p class="ms-[1.1rem] mt-1 mb-4 text-(--ink-faint)">
            <span aria-hidden="true">↳</span>
            gate exchanges it at <code>POST /mcp/exchange</code> → a Convex JWT with the
            user's claims, <code>exp</code> 5 min
          </p>

          <p class="relative grid grid-cols-[1.1rem_minmax(0,1fr)] text-(--ink)">
            <span
              class="font-bold text-(--ink-faint) select-none"
              aria-hidden="true"
            >→</span>
            <span class="sr-only">Sent: </span>
            <code>tools/list</code>
          </p>
          <p class="relative mt-1 grid grid-cols-[1.1rem_minmax(0,1fr)] text-(--ink)">
            <span
              class="font-bold text-(--ink-dim) select-none"
              aria-hidden="true"
            >←</span>
            <span class="sr-only">Received: </span>
            <code>{{ listedCount }} of {{ TOOLS.length }} tools</code>
            <span class="col-start-2 text-(--ink-faint)">{{ TOOLS.length - listedCount }} hidden — scope not granted</span>
          </p>

          <!-- The tools/list result: nine rows, one light each. -->
          <ul class="mt-2 mb-4 divide-y divide-dashed divide-(--edge) border-y border-dashed border-(--edge)">
            <li
              v-for="tool in TOOLS"
              :key="tool.name"
              class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 ps-[1.1rem] sm:grid-cols-[minmax(0,1fr)_9rem_5.5rem]"
            >
              <span class="font-medium text-(--ink)">{{ tool.name }}</span>
              <span class="text-(--ink-faint) sm:text-(--ink-dim)">{{ tool.scope }}</span>
              <span class="col-start-2 row-span-2 row-start-1 inline-flex items-center gap-2 sm:col-start-3 sm:row-span-1">
                <Led :tone="tool.listed ? 'ok' : 'warn'" />
                <span class="stamp">{{ tool.listed ? 'listed' : 'hidden' }}</span>
              </span>
            </li>
          </ul>

          <p class="relative grid grid-cols-[1.1rem_minmax(0,1fr)] text-(--ink)">
            <span
              class="font-bold text-(--ink-faint) select-none"
              aria-hidden="true"
            >→</span>
            <span class="sr-only">Sent: </span>
            <code>tools/call workspace-list</code>
          </p>
          <p class="relative mt-1 grid grid-cols-[1.1rem_minmax(0,1fr)] text-(--ink)">
            <span
              class="font-bold text-(--ink-dim) select-none"
              aria-hidden="true"
            >←</span>
            <span class="sr-only">Received: </span>
            <code>{ "workspaces": [ { "id": "n57k…", "name": "Acme", "slug": "acme", "role": "owner", "active": true } ] }</code>
          </p>
          <p class="ms-[1.1rem] mt-1 text-(--ink-faint)">
            <span aria-hidden="true">↳</span>
            ran as the user — <code>ctx.auth</code>, workspace and billing-entity
            resolution behave exactly as they do for a web session
          </p>
        </div>

        <p class="px-1 text-sm text-(--ink-dim) text-pretty">
          A tool whose scope is missing is hidden from <code>tools/list</code> <em class="font-semibold text-(--ink) not-italic">and</em> refused with <code>403</code> when called
          directly — list-time hiding is only advisory, so the handler
          re-checks.
        </p>
      </article>

      <div class="grid min-w-0 gap-6">
        <!-- What the human approves, once, in a browser. -->
        <aside class="plaque grid gap-4 p-5">
          <h3 class="stamp">
            Consent
          </h3>
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-xs">
            <dt class="text-(--ink-faint)">
              Client
            </dt>
            <dd class="text-(--ink) wrap-anywhere">
              Claude Code <span class="text-(--ink-faint)">registered on the fly</span>
            </dd>
            <dt class="text-(--ink-faint)">
              Resource
            </dt>
            <dd class="text-(--ink) wrap-anywhere">
              https://your-app.com
            </dd>
          </dl>

          <ul class="seam grid gap-3 pt-4">
            <li
              v-for="row in CONSENT"
              :key="row.scope"
              class="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3"
            >
              <span
                class="slot slot-pill grid size-6 place-items-center"
                :class="row.granted ? 'text-(--ok)' : 'text-(--warn)'"
              >
                <UIcon
                  :name="row.granted ? 'i-lucide-check' : 'i-lucide-minus'"
                  class="size-3.5"
                  aria-hidden="true"
                />
              </span>
              <span class="grid min-w-0">
                <span class="sr-only">{{ row.granted ? 'Granted:' : 'Not granted:' }}</span>
                <span
                  class="font-mono text-xs font-semibold wrap-anywhere"
                  :class="row.granted ? 'text-(--ink)' : 'text-(--ink-dim)'"
                >{{ row.scope }}</span>
                <span class="text-sm text-(--ink-dim)">{{ row.grants }}</span>
              </span>
            </li>
          </ul>

          <p class="seam grid grid-cols-[1rem_minmax(0,1fr)] gap-2 pt-4 text-sm text-(--ink-dim)">
            <UIcon
              name="i-lucide-lock"
              class="mt-0.5 size-3.5 text-(--ink-faint)"
              aria-hidden="true"
            />
            <span>
              <strong class="font-semibold text-(--ink)">The checkout tools return links, never payments.</strong> <code>billing-checkout-link</code> hands back a URL for the
              human to open — no tool in this package executes a payment, and
              success paths must be app-relative, so a prompt-injected agent
              cannot bounce a paying user to another origin.
            </span>
          </p>
        </aside>

        <!-- The one line that connects a client. -->
        <div class="grid min-w-0 gap-3">
          <p class="stamp">
            Connect a client
          </p>
          <HomeCommandSlot
            :command="CONNECT"
            name="connect command"
          />
          <div class="mt-1 flex flex-wrap gap-3">
            <Key to="/docs/agents/mcp">
              <UIcon
                name="i-lucide-server"
                class="size-3.5"
              />
              How the endpoint works
            </Key>
            <Key to="/docs/agents/mcp/built-in-tools">
              <UIcon
                name="i-lucide-wrench"
                class="size-3.5"
              />
              All nine built-in tools
            </Key>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
