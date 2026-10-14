---
title: "Reference"
description: "How the reference is organized: configuration, the Nuxt app surface, package entrypoints, the CLI, and the generated API reference."
kind: landing
navigation:
  title: Overview
  icon: i-lucide-compass
---

The reference follows the shape of the package. Configuration covers the `backend` module options, runtime config and every environment variable, and the Nuxt app pages give full signatures for what the module registers in your app: composables and components, server utilities, the imperative client and the `#backend` import aliases. Entrypoints maps every `nuxt-backend/…` import path, Ecosystem says where each community package stands, and the CLI page lists every command, flag and `doctor` finding. The [API reference](/docs/reference/api) is generated from the package's TypeScript source and covers every public import path and auto-imported composable.

The hand-written pages below are grouped by the part of the package they describe: the package as a whole, its configuration, the Nuxt app and the CLI. The generated pages follow the exports map instead, with one page per TypeScript import path plus pages for the auto-imported composables.

## Package and ecosystem

::card-group
  :::card{icon="i-lucide-layers" title="Ecosystem" to="/docs/reference/ecosystem"}
  Which Nuxt modules, Convex components and agent tools the package ships, supports or leaves out, and why.
  :::

  :::card{icon="i-lucide-package" title="Package Entrypoints" to="/docs/reference/entrypoints"}
  The exports map and the import tree: what you import explicitly, what the module auto-imports, and where each one runs.
  :::
::

## Configuration

::card-group
  :::card{icon="i-lucide-settings-2" title="Configuration" to="/docs/reference/configuration"}
  Where each setting lives: module options, environment variables, the app config.
  :::

  :::card{icon="i-lucide-settings" title="Module options" to="/docs/reference/configuration/module-options"}
  Every `backend` option with its default, the runtime config, and the `ModuleOptions` interface.
  :::

  :::card{icon="i-lucide-key-round" title="Environment variables" to="/docs/reference/configuration/environment-variables"}
  What `.env.local` holds, the variables the deployment declares, and how to set them.
  :::
::

## Nuxt app

::card-group
  :::card{icon="i-lucide-function-square" title="Composables" to="/docs/reference/nuxt/composables"}
  Full signatures for every composable the package registers, and the props, emits and slots of its components.
  :::

  :::card{icon="i-lucide-terminal" title="Server Utilities" to="/docs/reference/nuxt/server-utilities"}
  The auto-imported Nitro helpers: fetch and preload, `backendAuth`, and the agent-tool utilities.
  :::

  :::card{icon="i-lucide-plug-zap" title="ConvexVueClient" to="/docs/reference/nuxt/client"}
  The imperative client behind `useConvex()` and `$convex`, for one-off calls outside the composables.
  :::

  :::card{icon="i-lucide-folder-symlink" title="Import Aliases" to="/docs/reference/nuxt/import-aliases"}
  The `#backend` aliases for your Convex functions directory and its generated files, in Vite and Nitro.
  :::
::

## Backend component

::card-group
  :::card{icon="i-lucide-box" title="Component API" to="/docs/reference/backend/component"}
  The functions `components.backend` exposes, module by module, and the helper that wraps each.
  :::
::

## CLI

::card-group
  :::card{icon="i-lucide-square-terminal" title="CLI" to="/docs/reference/cli"}
  `init`, `dev`, `doctor`, `env push` and `billing sync`, with every flag and every `doctor` finding.
  :::
::

## API (generated)

::card-group
  :::card{icon="i-lucide-boxes" title="API reference" to="/docs/reference/api"}
  Generated TypeScript reference for every public import path and auto-imported composable.
  :::
::
