<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { BackendMcpToolName } from 'nuxt-backend'

definePageMeta({ middleware: 'auth' })

// The module publishes the endpoint route to the server only
// (runtimeConfig.backendMcp); this site keeps the toolkit default, and the
// absolute URL is built from the request origin so a preview deployment
// advertises itself, not production.
const MCP_ROUTE = '/mcp'
const origin = useRequestURL({ xForwardedHost: true, xForwardedProto: true }).origin
const mcpUrl = computed(() => `${origin}${MCP_ROUTE}`)

// Nothing here impersonates an agent: the page sends exactly what an MCP
// client sends first — an unauthenticated `initialize` — and shows the
// challenge that comes back, plus the two discovery documents the challenge
// points at. No token, no tool call.
interface Probe {
  status: number | null
  headers: Record<string, string>
  body: unknown
  error: string | null
}

const EXPOSED_HEADERS = ['www-authenticate', 'content-type', 'cache-control', 'access-control-allow-origin', 'access-control-expose-headers']

async function probe(input: string, init?: RequestInit): Promise<Probe> {
  try {
    // fallow-ignore-next-line security-sink -- same-origin paths, each a literal in runProbes below, never the request or the visitor; verified 2026-09-22
    const response = await fetch(input, init)
    const headers: Record<string, string> = {}
    for (const name of EXPOSED_HEADERS) {
      const value = response.headers.get(name)
      if (value) headers[name] = value
    }
    const text = await response.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    }
    catch {
      // Not JSON (a 404 page, an HTML redirect) — the raw text is the honest readout.
    }
    return { status: response.status, headers, body, error: null }
  }
  catch (cause) {
    return { status: null, headers: {}, body: null, error: cause instanceof Error ? cause.message : String(cause) }
  }
}

const challenge = ref<Probe | null>(null)
const resourceMetadata = ref<Probe | null>(null)
const authorizationServer = ref<Probe | null>(null)
const probing = ref(false)

async function runProbes() {
  probing.value = true
  try {
    ;[challenge.value, resourceMetadata.value, authorizationServer.value] = await Promise.all([
      probe(MCP_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'nuxt-backend playground', version: '0' } },
        }),
      }),
      probe('/.well-known/oauth-protected-resource'),
      probe('/.well-known/oauth-authorization-server'),
    ])
  }
  finally { probing.value = false }
}
onMounted(runProbes)

// A probe reads green only when it answered exactly what the spec expects;
// the pill and the readout spell "not yet" differently (muted vs neutral).
function tone(result: Probe | null, expected: number): 'ok' | 'err' | 'muted' {
  if (!result) return 'muted'
  return result.status === expected ? 'ok' : 'err'
}
function readoutTone(result: Probe | null, expected: number): 'ok' | 'err' | 'neutral' {
  const signal = tone(result, expected)
  return signal === 'muted' ? 'neutral' : signal
}

// The scopes the site advertises, straight from its own metadata document.
const scopes = computed(() => {
  const body = resourceMetadata.value?.body as { scopes_supported?: string[] } | null
  return Array.isArray(body?.scopes_supported) ? body.scopes_supported : []
})

// The built-in tool vocabulary. `tools/list` without a session is empty by
// design, so the list cannot be fetched live; it is pinned to the exported
// `BackendMcpToolName` union instead, so a tool added to or removed from the
// package fails `typecheck-website` on this page rather than going stale.
const BUILTIN_TOOLS = {
  'profile-get': { scope: 'profile', does: 'The signed-in user\'s profile: name, email, verification state.' },
  'profile-update': { scope: 'profile:write', does: 'Change the display name — name only; email stays in the verified web flow.' },
  'billing-plans': { scope: 'billing:read', does: 'The configured plans and credit packs with live pricing.' },
  'billing-subscription': { scope: 'billing:read', does: 'The billing entity\'s current subscription, or null.' },
  'credits-balance': { scope: 'billing:read', does: 'Prepaid credit balances per meter.' },
  'billing-checkout-link': { scope: 'billing:checkout', does: 'A checkout link for the human to open — never a payment.' },
  'billing-portal-link': { scope: 'billing:checkout', does: 'A customer-portal link for the human to open.' },
  'workspace-list': { scope: 'workspace:read', does: 'The user\'s workspaces, their role, and which one is active.' },
  'workspace-members': { scope: 'workspace:read', does: 'A workspace\'s members (the active one by default).' },
} satisfies Record<BackendMcpToolName, { scope: string, does: string }>
const builtinTools = Object.entries(BUILTIN_TOOLS) as Array<[BackendMcpToolName, { scope: string, does: string }]>

const connectSnippet = computed(() => `claude mcp add --transport http nuxt-backend ${mcpUrl.value}`)
const copied = ref(false)
async function copySnippet() {
  try {
    await navigator.clipboard.writeText(connectSnippet.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  }
  catch {
    // Clipboard access denied (insecure context, permissions) — the snippet
    // is selectable text either way.
  }
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useBackendMcp · defineBackendMcpTool"
      title="Agents (MCP)"
      experimental
    >
      This site's own agent endpoint, shown honestly: a browser session is not
      an agent, so the panel below sends the one request every MCP client sends
      first and renders the OAuth challenge it gets back. A real agent follows
      that challenge, signs in as <em>you</em> through the OAuth flow, and only
      then sees the tools.
    </PageHeader>

    <LabPanel
      label="endpoint"
      :title="mcpUrl"
      tone="ok"
    >
      <template #actions>
        <LabButton
          variant="secondary"
          size="sm"
          :loading="probing"
          @click="runProbes"
        >
          Probe again
        </LabButton>
      </template>
      <div class="rows">
        <div class="probe-row">
          <StatusPill
            :tone="tone(challenge, 401)"
            dot
          >
            {{ challenge?.status ?? '…' }}
          </StatusPill>
          <span class="mono probe-url">POST {{ MCP_ROUTE }} · initialize, no token</span>
          <span class="hint">expects 401 + WWW-Authenticate</span>
        </div>
        <div class="probe-row">
          <StatusPill
            :tone="tone(resourceMetadata, 200)"
            dot
          >
            {{ resourceMetadata?.status ?? '…' }}
          </StatusPill>
          <span class="mono probe-url">GET /.well-known/oauth-protected-resource</span>
          <span class="hint">RFC 9728 · served by the module</span>
        </div>
        <div class="probe-row">
          <StatusPill
            :tone="tone(authorizationServer, 200)"
            dot
          >
            {{ authorizationServer?.status ?? '…' }}
          </StatusPill>
          <span class="mono probe-url">GET /.well-known/oauth-authorization-server</span>
          <span class="hint">RFC 8414 · proxied from the deployment</span>
        </div>
      </div>
      <p class="hint">
        A <code>401</code> here is the discovery handshake, not a failure: the
        <code>WWW-Authenticate</code> header names the resource-metadata
        document, which names the authorization server, which runs the
        authorization-code flow against this site's <code>/login</code>. The
        surface is on by default and removed whole with
        <code>backend: { mcp: false }</code>.
      </p>
    </LabPanel>

    <div class="grid-2">
      <LabPanel
        label="challenge"
        title="POST /mcp without a token"
        variant="well"
      >
        <StateReadout
          label="response headers"
          :value="challenge?.error ? { error: challenge.error } : challenge?.headers ?? 'probing…'"
          :tone="readoutTone(challenge, 401)"
        />
        <StateReadout
          class="readout-gap"
          label="body"
          :value="challenge?.body ?? 'probing…'"
          :tone="readoutTone(challenge, 401)"
        />
        <p class="hint readout-note">
          The JSON-RPC error body mirrors the auth provider's own MCP challenge,
          so clients built against either read it the same way.
        </p>
      </LabPanel>

      <LabPanel
        label="resource metadata"
        title="/.well-known/oauth-protected-resource"
        variant="well"
      >
        <StateReadout
          :value="resourceMetadata?.error ? { error: resourceMetadata.error } : resourceMetadata?.body ?? 'probing…'"
          :tone="readoutTone(resourceMetadata, 200)"
        />
        <div
          v-if="scopes.length"
          class="row scopes"
        >
          <span class="hint">scopes_supported</span>
          <StatusPill
            v-for="scope in scopes"
            :key="scope"
            tone="ok"
            :dot="false"
          >
            {{ scope }}
          </StatusPill>
        </div>
        <p class="hint readout-note">
          <code>resource</code> is the app origin, not the endpoint, so a client
          checking any path under it passes; <code>authorization_servers</code>
          points at the auth proxy on the same origin.
        </p>
      </LabPanel>
    </div>

    <LabPanel
      label="built-in tools"
      title="What an agent sees after consent"
    >
      <div class="tools">
        <div
          v-for="[name, tool] in builtinTools"
          :key="name"
          class="tool"
        >
          <span class="mono tool-name">{{ name }}</span>
          <StatusPill
            tone="muted"
            :dot="false"
          >
            {{ tool.scope }}
          </StatusPill>
          <span class="tool-does">{{ tool.does }}</span>
        </div>
      </div>
      <p class="hint">
        Each tool runs a scaffolded Convex function as the signed-in user
        through a short-lived JWT, so <code>ctx.auth</code>, the active
        workspace and the billing entity resolve exactly as in a web session.
        A tool whose scope the agent did not consent to is hidden from
        <code>tools/list</code>, and a direct call is refused — which is also
        why this page cannot list them live: without a session the list is
        empty by design. Your own tools go in <code>server/mcp/tools/</code>
        with <code>defineBackendMcpTool</code>.
      </p>
    </LabPanel>

    <LabPanel
      label="connect"
      title="Point a client at this site"
      tone="ok"
    >
      <div class="snippet-row">
        <pre class="snippet mono">{{ connectSnippet }}</pre>
        <LabButton
          variant="secondary"
          size="sm"
          @click="copySnippet"
        >
          {{ copied ? 'Copied' : 'Copy' }}
        </LabButton>
      </div>
      <p class="hint">
        Then <code>/mcp</code> inside Claude Code opens this site's login in a
        browser; you sign in, approve the scopes, and the tools appear. A
        claude.ai custom connector takes the same URL under Settings →
        Connectors. Any client that speaks streamable HTTP with OAuth 2.1 and
        dynamic registration works — the walkthrough, the tunnel local dev
        needs, and what a stubborn 401 means are in
        <NuxtLink to="/agents/connect-a-client">Connect a client</NuxtLink>;
        the flow itself is in
        <NuxtLink to="/agents/oauth-and-consent">OAuth &amp; consent</NuxtLink>.
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.rows { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.9rem; }
.probe-row {
  display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap;
  padding: 0.45rem 0.65rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
}
.probe-url { font-size: 0.76rem; color: var(--ink); flex: 1; min-width: 0; }

.readout-gap { margin-top: 0.6rem; }
.readout-note { margin-top: 0.8rem; }
.scopes { margin-top: 0.8rem; }

.tools { display: flex; flex-direction: column; gap: 0.45rem; }
.tool {
  display: grid; grid-template-columns: 12rem auto 1fr; align-items: center; gap: 0.7rem;
  padding: 0.5rem 0.7rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
  font-size: 0.8rem;
}
.tool-name { font-size: 0.76rem; color: var(--ink); }
.tool-does { color: var(--ink-dim); min-width: 0; }
@media (max-width: 720px) {
  .tool { grid-template-columns: 1fr auto; }
  .tool-does { grid-column: 1 / -1; }
}

.snippet-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
.snippet {
  flex: 1; min-width: 0; margin: 0; padding: 0.7rem 0.9rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
  font-size: 0.78rem; color: var(--ok-soft); overflow-x: auto; white-space: pre;
}
</style>
