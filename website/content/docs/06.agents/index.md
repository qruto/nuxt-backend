---
title: "Agents"
description: "Let agents use your app through its OAuth-protected MCP endpoint, give coding agents the package's rules, and read these docs as Markdown."
kind: landing
playground: /playground/platform/agents
api: /docs/reference/api/mcp
source: src/convex/integrations/mcp.ts
navigation:
  title: Overview
  icon: i-lucide-compass
---

Agents meet a `nuxt-backend` app through three doors. An agent can **use your app** as one of your users, through the MCP endpoint the module mounts at `/mcp`. A coding agent can **build your app** with the package's skill and the agent files `init` writes. And any agent can **read these docs** as Markdown, starting from [`/llms.txt`](/llms.txt).

## Your app as tools

The MCP endpoint lives at `/mcp` on your app origin and is always there, in dev and in production. An agent that connects gets a `401` challenge, follows two discovery documents, registers itself and sends a person to your login page. The person approves a set of scopes, and from then on every tool call runs as that person, through a Convex JWT that lives five minutes. There is no API key to issue.

Nine built-in tools cover the profile, billing, credits and workspaces, each behind a scope. Your own tools go in `server/mcp/tools/` and get the same session. The agent surface is experimental and may change shape in a minor release.

::card-group
  :::card{icon="i-lucide-server" title="MCP Server" to="/docs/agents/mcp"}
  What an agent connects to, what the module mounts, and the options that move the endpoint.
  :::

  :::card{icon="i-lucide-wrench" title="Built-in Tools" to="/docs/agents/mcp/built-in-tools"}
  The nine tools, their scopes and return values, and how to repoint them.
  :::

  :::card{icon="i-lucide-puzzle" title="Custom Tools" to="/docs/agents/mcp/custom-tools"}
  Write a tool with `defineBackendMcpTool` and call Convex as the signed-in user with `useBackendMcp`.
  :::

  :::card{icon="i-lucide-shield-check" title="OAuth & Consent" to="/docs/agents/mcp/oauth-and-consent"}
  How an agent becomes a signed-in user: the challenge, the consent screen, the token exchange and scopes.
  :::

  :::card{icon="i-lucide-plug" title="Connect a Client" to="/docs/agents/mcp/connect-a-client"}
  Point Claude Code, a claude.ai connector or any MCP client at your app, including a tunnel in local dev.
  :::
::

## Coding agents

The `nuxt-backend` skill gives a coding agent such as Claude Code, Codex or Cursor the rules of an app built on the package: the neutral names, the scaffold contract, the CLI and the env contract. `npx nuxt-backend init` writes an `AGENTS.md` section and a `.mcp.json` with the Convex MCP server, so the agent can query your deployment instead of guessing. To hand the install itself to an agent, paste the prompt from [Installation](/docs/start/installation#with-an-ai-agent).

::card-group
  :::card{icon="i-lucide-sparkles" title="Skills & Agent Files" to="/docs/agents/coding"}
  Install the agent skill, and see what `init` writes to `AGENTS.md` and `.mcp.json`.
  :::
::

## Docs for agents

Every docs page has a Markdown twin: add `.md` to its URL, as in `/docs/agents/mcp.md`. [`/llms.txt`](/llms.txt) indexes the docs with one section per tab and links the skill beside them; `/llms-full.txt` holds the full docs in one file.

## Not covered here

- **Metering the model calls your own app makes.** That is [Metered actions](/docs/ai/metered-actions), in AI.
- **Payments made by an agent.** The checkout tools return a link for the person to open; no tool in the package takes a payment.
