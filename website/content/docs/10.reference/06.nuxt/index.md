---
title: Nuxt
description: "What the module adds to the Nuxt app: composables, conventions, server utilities, the typed client and the import aliases, each with its reference page."
kind: landing
capability: tools
navigation:
  title: Overview
  icon: i-lucide-compass
---

The Nuxt side of the package, by kind.

::card-group
  :::card{icon="i-lucide-function-square" title="Composables" to="/docs/reference/nuxt/composables"}
  Signatures for every composable nuxt-backend registers in 0.2.0, by area, with the unit that brings each one the code does not have yet.
  :::

  :::card{icon="i-lucide-list-checks" title="Composable conventions" to="/docs/reference/nuxt/conventions"}
  The shape every nuxt-backend composable follows: an options object, refs you can destructure, isLoading, isPending and a typed error, reads that never throw and actions that reject.
  :::

  :::card{icon="i-lucide-terminal" title="Server utilities" to="/docs/reference/nuxt/server-utilities"}
  Full signatures for the auto-imported server helpers: the base module's fetch and preload helpers, and backendAuth for a signed-in caller's calls.
  :::

  :::card{icon="i-lucide-plug-zap" title="Backend client" to="/docs/reference/nuxt/client"}
  The imperative client returned by useBackendClient() and injected as $convex.
  :::

  :::card{icon="i-lucide-folder-symlink" title="Import aliases" to="/docs/reference/nuxt/import-aliases"}
  The #backend aliases that point at your Convex functions directory and its generated files.
  :::
::
