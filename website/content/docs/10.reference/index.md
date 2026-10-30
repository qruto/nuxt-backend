---
title: "Reference"
description: "How the reference is organized: configuration, the Nuxt app surface, components, the backend, the CLI and the generated API, with what each page says about 0.2.0 and what is generated from the code."
kind: landing
navigation:
  title: Overview
  icon: i-lucide-compass
---

The reference lists every name the package gives you, exactly, so you can look one up while you build. It follows the shape of the package: its configuration, what it adds to the Nuxt app, its components, the backend it mounts, and its CLI. The [API reference](/docs/reference/api) under it is TypeDoc's, one page per import path and per composable.

The pages describe `0.2.0`. A page whose names differ from the code today wears a **Changing** chip and names the unit that brings the code to it. Each such page opens with what changes, then the lookups. Those lookups are generated from the code by `pnpm docs:lookups`, and a test fails when a lookup and its code drift apart, so a generated table is always the code as it stands. A name a unit adds says so beside it, and the [Feature map](/docs/start/feature-map) shows what each unit builds. A name that leaves with the end-user MCP endpoint, or waits with the other service-app features, says so too, and the [Roadmap](/docs/start/roadmap) says why it waits.

A page header's keys lead to the code: **Source** opens the registry the page is generated from, **API** the generated page of what it documents. A name marked experimental may change shape in a minor release ([Stability](/docs/ship/releases/stability)).

## What you get

How much of each kind the package ships, in all:

::what-you-get{area="reference"}
::

## Package

::card-group
  :::card{icon="i-lucide-layers" title="Capabilities" to="/docs/reference/capabilities"}
  The twelve capabilities: what powers each, and the env, findings, docs and playground pages it owns.
  :::

  :::card{icon="i-lucide-book-a" title="Glossary" to="/docs/reference/glossary"}
  Each of the package's words, with the name its provider uses for the same thing.
  :::

  :::card{icon="i-lucide-scroll-text" title="Cheat sheet" to="/docs/reference/cheat-sheet"}
  Every composable, component, setup helper, command and variable on one page, by area.
  :::

  :::card{icon="i-lucide-package" title="Package entrypoints" to="/docs/reference/entrypoints"}
  The exports map and the import tree: what each subpath exports and where it runs.
  :::

  :::card{icon="i-lucide-layers" title="Ecosystem" to="/docs/reference/ecosystem"}
  Which Nuxt modules, Convex components and agent tools the package ships, supports or leaves out.
  :::
::

## Configuration

::card-group
  :::card{icon="i-lucide-settings-2" title="Configuration" to="/docs/reference/configuration"}
  Where each setting lives: to change one thing, which file to edit.
  :::

  :::card{icon="i-lucide-settings" title="Module options" to="/docs/reference/configuration/module-options"}
  The five `backend` options with their defaults, the removed ones, and the runtime config.
  :::

  :::card{icon="i-lucide-key-round" title="Environment variables" to="/docs/reference/configuration/environment-variables"}
  Every variable by group, `BACKEND_ENVIRONMENT`, and the variables that leave.
  :::

  :::card{icon="i-lucide-palette" title="App config" to="/docs/reference/configuration/app-config"}
  Every `appConfig.backend` key with its type and default.
  :::

  :::card{icon="i-lucide-type" title="Labels" to="/docs/reference/configuration/labels"}
  Every label group and key, with its English default and its params.
  :::

  :::card{icon="i-lucide-folder-tree" title="Project files" to="/docs/reference/configuration/project-files"}
  Every scaffolded file, the files you add for new features, and what each must export.
  :::

  :::card{icon="i-lucide-book-marked" title="Catalog files" to="/docs/reference/configuration/catalogs"}
  The fields of the billing catalog and the id map `billing sync` writes.
  :::
::

## Nuxt app

::card-group
  :::card{icon="i-lucide-function-square" title="Composables" to="/docs/reference/nuxt/composables"}
  Every composable the module registers, by area, with its signature.
  :::

  :::card{icon="i-lucide-list-checks" title="Composable conventions" to="/docs/reference/nuxt/conventions"}
  The shape every composable returns: loading, pending and errors.
  :::

  :::card{icon="i-lucide-terminal" title="Server utilities" to="/docs/reference/nuxt/server-utilities"}
  The auto-imported server helpers: fetch and preload, and `backendAuth`.
  :::

  :::card{icon="i-lucide-plug-zap" title="Backend client" to="/docs/reference/nuxt/client"}
  The imperative client behind `useBackendClient()`, for one-off calls.
  :::

  :::card{icon="i-lucide-folder-symlink" title="Import aliases" to="/docs/reference/nuxt/import-aliases"}
  The `#backend` aliases for your functions directory and its generated files.
  :::
::

## Components

::card-group
  :::card{icon="i-lucide-component" title="Components" to="/docs/reference/components"}
  Every component by area with its status, the contract each keeps, and what leaves.
  :::

  :::card{icon="i-lucide-circle-user" title="Account components" to="/docs/reference/components/account"}
  The sign-in form, the waitlist form, the consent prompt, the profile and security settings, and the account's data.
  :::

  :::card{icon="i-lucide-users" title="Workspace and admin components" to="/docs/reference/components/workspaces"}
  The workspace settings, the invitation page, the activity trail and the admin console.
  :::

  :::card{icon="i-lucide-credit-card" title="Billing components" to="/docs/reference/components/billing"}
  The pricing table, checkout and portal links, billing and usage history, and the upgrade prompt.
  :::

  :::card{icon="i-lucide-shield" title="Shell, gates and notices" to="/docs/reference/components/shell"}
  The gate, the notice region, the app shell, the notification inbox, the 403 and the connection status.
  :::

  :::card{icon="i-lucide-file-up" title="Upload and contact forms" to="/docs/reference/components/forms"}
  The checked upload field and the contact and feedback form.
  :::

  :::card{icon="i-lucide-palette" title="Theme tokens" to="/docs/reference/components/theme-tokens"}
  Every `--bk-*` token and `data-*` family.
  :::
::

## Backend

::card-group
  :::card{icon="i-lucide-blocks" title="Setup helpers" to="/docs/reference/backend"}
  Every Convex-side helper, the file that calls it, and what it gives you.
  :::

  :::card{icon="i-lucide-box" title="Component API" to="/docs/reference/backend/component"}
  The functions and tables of the `backend` component.
  :::

  :::card{icon="i-lucide-route" title="HTTP routes" to="/docs/reference/backend/http-routes"}
  Every route the package mounts, on the deployment and in the app.
  :::

  :::card{icon="i-lucide-radio" title="Events" to="/docs/reference/backend/events"}
  The backend's own events, the provider events, and what the package does with each.
  :::

  :::card{icon="i-lucide-octagon-alert" title="Errors" to="/docs/reference/backend/errors"}
  Every code the package refuses with, its fields, label and status.
  :::

  :::card{icon="i-lucide-anchor" title="Hooks and guarantees" to="/docs/reference/backend/hooks"}
  Every hook the setup helpers call, and what the package promises about each call.
  :::

  :::card{icon="i-lucide-gauge" title="Limits and retention" to="/docs/reference/backend/limits"}
  Every rate limit, window and lifetime, read from the code that enforces it.
  :::
::

## CLI

::card-group
  :::card{icon="i-lucide-square-terminal" title="CLI" to="/docs/reference/cli"}
  Every command with its flags, side effects, JSON and exit codes, the new ones included.
  :::

  :::card{icon="i-lucide-stethoscope" title="Diagnostics" to="/docs/reference/cli/diagnostics"}
  Every `doctor` finding: what it checks, when it fails, and its fix.
  :::
::

## API (generated)

::card-group
  :::card{icon="i-lucide-boxes" title="API reference" to="/docs/reference/api"}
  The TypeScript reference for every public import path and auto-imported composable.
  :::
::
