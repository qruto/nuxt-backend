---
title: Build with a coding agent
description: "Hand a nuxt-backend app to a coding agent: the one-paste install, the skills it reads first, keeping them on the installed version, and how the agent checks its own work."
kind: how-to
capability: tools
related:
  - /docs/develop/agents/skills
  - /docs/develop/agents/agent-files
  - /docs/develop/agents/docs-for-agents
navigation:
  title: Overview
  icon: i-lucide-sparkles
---

A coding agent such as Claude Code, Codex, Cursor or Copilot builds a `nuxt-backend` app well once it knows the app's rules: the neutral names, the scaffold contract, the CLI and the env. The package hands it those rules, and the tools to check its own work.

- **What powers it natively:** the [skills CLI](https://skills.sh), which installs skills where most agents read them (`.agents/skills/`), and the [Model Context Protocol](https://modelcontextprotocol.io) (MCP), which any agent client speaks.
- **What the package adds:** agent skills shipped inside the package and generated from its code, the agent files `init` writes, their checks in `doctor`, and these docs as Markdown and over MCP.

## What an agent gets

| Piece | What it gives the agent | How it arrives | Page |
|---|---|---|---|
| Agent skills | A core skill with the ground rules, and a task skill per part of the app | Inside the package, copied into the project by `init` | [Agent skills](/docs/develop/agents/skills) |
| Agent files | An `AGENTS.md` section, an MCP server in `.mcp.json`, and the skill copies | `npx nuxt-backend init` | [Agent files](/docs/develop/agents/agent-files) |
| Docs as Markdown | Every page as a Markdown twin, `/llms.txt`, `/sitemap.md`, the public names and the rename map | This site | [Docs for agents](/docs/develop/agents/docs-for-agents) |
| Docs MCP | Search, every page, and lookups of findings, env names, composables and components | `https://mcp.nuxt-backend.dev/mcp`, with no sign-in | [Docs MCP](/docs/develop/agents/docs-mcp) |
| Developer MCP server | `doctor`, the capabilities, the env, the catalog and the functions, the docs, and the Convex, Polar, Resend and Vercel consoles | A command of the CLI, which `init` wires into `.mcp.json` | [Developer MCP server](/docs/develop/agents/developer-mcp) |
| Agent plugin | The skills and both MCP servers in one install | Claude Code's plugin manager | [Agent plugin](/docs/develop/agents/plugin) |

The [Feature map](/docs/start/feature-map#developer-tools) lists each piece with its status.

## Install through the agent

The [Installation](/docs/start/installation#install) page holds the prompt: paste it into your agent, or open it in one from the links under it. The agent installs the package's core skill with the skills CLI, then follows the skill's install guide:

- it adds the package to the app you have, or creates one from the [starter](/docs/start/templates#starter);
- it starts the app on a local deployment that needs no account, and checks that the app serves `/login`;
- it asks before it logs in to Convex, changes anything in your accounts or puts a provider key in the project, and it never prints or replaces `AUTH_SECRET`;
- `init` then adds the task skills of the installed version beside the core, and the other [agent files](/docs/develop/agents/agent-files).

## The agent skills

The guidance comes as one small core skill and a task skill per feature. The core holds the rules every task follows and routes to the task skill a change needs; each task skill lists its docs pages and the API each one uses. They ship in the package, so every app already has them at `node_modules/nuxt-backend/skills/`, for exactly the version installed.

[Agent skills](/docs/develop/agents/skills) lists every skill, what each holds in `references/`, and how to install them outside an app.

## Keep them on your version

An app's skills should describe the version it runs, not the newest one:

- The `AGENTS.md` section `init` writes points agents at the skills inside `node_modules`, the core first, and names the installed version.
- After [`npx nuxt-backend upgrade`](/docs/reference/cli#upgrade), run `npx nuxt-backend init --agents`: it rewrites the section for the new version and refreshes the skill copies. The upgrade's own next steps list it.
- `doctor` warns with [`agent-files`](/docs/reference/cli/diagnostics#agent-files) while the section names another version, or a skill copy differs from the installed one.
- Skills you installed with the skills CLI are recorded in the project's `skills-lock.json` and left to that CLI: reinstall the installed version's with `npx skills add ./node_modules/nuxt-backend/skills --skill '*' -y`.

## Let the agent check its work

- **`npx nuxt-backend doctor --json`** prints every finding with its fix, as one JSON document ([its schema](/schemas/doctor.json)). Each finding's short link, `/d/<id>`, opens its entry on [Diagnostics](/docs/reference/cli/diagnostics).
- **Sign in without a mailbox.** On a dev deployment, an agent requests a code for `delivered+agent@resend.dev` and reads it with `npx nuxt-backend inbox delivered+agent@resend.dev --json` ([Read test mail in the dev inbox](/docs/develop/dev-inbox)).
- **Run the tests.** The function and page tests need no deployment, so an agent runs them after every change ([Test your app](/docs/develop/testing)).
- **Read the deployment, not a guess.** The [developer MCP server](/docs/develop/agents/developer-mcp) `init` adds to `.mcp.json` answers `doctor`, each capability's state and the env names, reads the tables, functions and logs through Convex's own tools, and reads your billing, email and hosting accounts.
- **Read the docs as Markdown**: [`/llms.txt`](/llms.txt), a twin of every page, or the [docs MCP](/docs/develop/agents/docs-mcp).

The [agent plugin](/docs/develop/agents/plugin) installs the developer MCP server, the docs MCP and the skills in Claude Code in one step.

## How an agent builds an app

1. **It installs the package from one prompt**, and runs the app on a dev deployment.
2. **It reads the rules first.** The `AGENTS.md` section points it at the core skill inside `node_modules`, and the core names the task skill each change needs.
3. **It looks things up instead of guessing.** A page's Markdown twin, the docs MCP, or the public-surface manifest tells it whether a name exists before it writes one.
4. **It checks its own work** with `doctor --json`, the tests and the dev inbox.
5. **It asks before it touches your accounts.** The skills and the developer server confirm with you before anything logs in to a provider, writes to it, or puts a key in the project.

## In this section

::card-group
  :::card{icon="i-lucide-book-open" title="Agent skills" to="/docs/develop/agents/skills"}
  The core skill and the task skills it routes to, what each holds, and how to install them outside an app.
  :::

  :::card{icon="i-lucide-file-cog" title="Agent files" to="/docs/develop/agents/agent-files"}
  What `init` writes for agents: the `AGENTS.md` section, `.mcp.json` and the skill copies.
  :::

  :::card{icon="i-lucide-terminal" title="Developer MCP server" to="/docs/develop/agents/developer-mcp"}
  Planned: one server for your project's state, the docs, and the Convex, Polar, Resend and Vercel consoles, with writes confirmed by you.
  :::

  :::card{icon="i-lucide-file-text" title="Docs for agents" to="/docs/develop/agents/docs-for-agents"}
  Every page as Markdown, `/llms.txt`, `/sitemap.md`, the skills, the public-surface manifest and the rename map.
  :::

  :::card{icon="i-lucide-search" title="Docs MCP" to="/docs/develop/agents/docs-mcp"}
  These docs as read-only MCP tools at `mcp.nuxt-backend.dev`, with no sign-in.
  :::

  :::card{icon="i-lucide-package" title="Agent plugin" to="/docs/develop/agents/plugin"}
  Planned: the skills and both MCP servers in one install for Claude Code.
  :::

  :::card{icon="i-lucide-milestone" title="MCP endpoint for your users' agents" to="/docs/develop/agents/mcp"}
  Why `0.2.0` ships no `/mcp` for your users' agents, and what replaces it until the next release.
  :::
::

## Not covered here

- **AI features your app sells.** Metered model calls, jobs and chat are in [AI](/docs/build/ai).
- **Agents that use your app as a person.** An MCP endpoint your users' agents sign in to waits for the next release: see the [Roadmap](/docs/start/roadmap#service-app-features).
- **API keys.** The package issues none ([Principles](/docs/start/concepts/principles)).
- **The docs site's Ask AI.** It answers readers of these docs from the docs MCP, and shares no key, model or credits with your app.

## Related

- [Agent skills](/docs/develop/agents/skills): every skill and what it holds.
- [Agent files](/docs/develop/agents/agent-files): what `init` writes for agents, and how it merges into files you have.
- [Docs for agents](/docs/develop/agents/docs-for-agents): everything this site serves to agents.
- [Diagnose your setup with doctor](/docs/develop/doctor): the checks the agent runs.
- [Upgrade to a new version](/docs/ship/releases/upgrade): every renamed and removed name, which the upgrade skill carries.
