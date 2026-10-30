---
title: Develop
description: "Build day to day: the dev loop on real sandboxes, the dev inbox, DevTools, doctor and analyze, tests from functions to end to end, and a coding agent."
kind: landing
capability: tools
navigation:
  title: Overview
  icon: i-lucide-compass
---

Everything you use while building, in the order you meet it: the dev loop on the providers' real test modes, the tools that check your work, tests at every level, and a coding agent that knows the package.

Start with [Run the dev loop](/docs/develop/dev-loop). Connect each provider once on its [Services](/docs/services) page; the pages here cover what its test mode does while you build.

::card-group
  :::card{icon="i-lucide-laptop" title="Run the dev loop" to="/docs/develop/dev-loop"}
  The daily loop with npx nuxt-backend dev, on a cloud, local or account-free deployment, and what it keeps in step for you, from codegen and the deployment's env to BACKEND_ENVIRONMENT and sign-in codes in the terminal.
  :::

  :::card{icon="i-lucide-flask-conical" title="Develop on real sandboxes" to="/docs/develop/sandboxes"}
  Develop every flow on the providers' own test modes, with nothing simulated.
  :::

  :::card{icon="i-lucide-inbox" title="Read test mail in the dev inbox" to="/docs/develop/dev-inbox"}
  Read the mail a deployment outside production sent to Resend's test addresses, back through Resend's own emails API: in a page with useSandboxInbox or from the CLI, so a demo, a preview or an end-to-end test can sign in by code.
  :::

  :::card{icon="i-lucide-panel-right-open" title="DevTools" to="/docs/develop/devtools"}
  The Backend tab in Nuxt DevTools, with the deployment and its env, live checks and doctor on demand, the signed-in account, billing, email, webhook deliveries, monitoring and an activity log.
  :::

  :::card{icon="i-lucide-stethoscope" title="Diagnose your setup with doctor" to="/docs/develop/doctor"}
  Find what is missing or misconfigured with doctor and status, narrow the checks to one capability, let doctor fix what it can, and gate CI and a launch on its JSON and production posture.
  :::

  :::card{icon="i-lucide-chart-pie" title="See what is inside your bundles" to="/docs/develop/analyze"}
  Measure the backend's Convex bundle and the Nuxt app's bundles with one command, see how much of each the package brings, act on its insights, and hold both to a budget in CI.
  :::

  :::card{icon="i-lucide-flask-conical" title="Test your app" to="/docs/develop/testing"}
  Which test fits which change: functions in convex-test, pages over a mock backend, the real app end to end with Playwright, all of it in CI, and a load test before launch.
  :::

  :::card{icon="i-lucide-sparkles" title="Build with a coding agent" to="/docs/develop/agents"}
  Hand a nuxt-backend app to a coding agent: the one-paste install, the skills it reads first, the agent files and docs it uses, and how it checks its own work.
  :::
::
