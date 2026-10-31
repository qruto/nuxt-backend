---
title: Create and switch workspaces
description: "Workspaces are how people share an app: a personal workspace for everyone, more on demand, the active one carried on the session, one composable for the list, the switch and the members, <WorkspaceSettings> on /settings and the workspace function tier."
kind: how-to
capability: auth
playground: /playground/settings
source: src/runtime/vue/composables/use-workspace.ts
navigation:
  title: Workspaces
  icon: i-lucide-users
---

A workspace is where people work together. It holds members, owns data and pays for the plan. Every account gets a **personal workspace** on its first sign-in, so the session always has an active workspace. A person working alone runs the same code as a team. Workspaces are one level deep: there are no teams inside one ([Workspaces, everywhere](/docs/start/concepts/principles#workspaces-everywhere)).

Better Auth's organization plugin keeps the workspaces, members and invitations, inside your Convex deployment. The package adds the personal workspace, the active workspace on the session token, `useWorkspace()`, the settings page and the `workspace` function tier.

## The active workspace is a claim

The active workspace rides on the session token, so a function reads it without a database read. Switching sets it on the session, refreshes the token and re-authenticates the live connection. Every query that reads the workspace runs again for the new one, and every page shows the new workspace's data.

Billing follows the workspace too: the active workspace owns the subscription and the credits a person spends ([Bill users or workspaces](/docs/build/billing/setup#bill-each-person)).

## `useWorkspace()`

The auto-imported composable holds the workspace state and its actions:

```vue [app/components/WorkspaceSwitcher.vue]
<script setup lang="ts">
const { workspaces, current, role, setActive, create } = useWorkspace()
</script>

<template>
  <select :value="current?.id" @change="setActive(($event.target as HTMLSelectElement).value)">
    <option v-for="workspace in workspaces" :key="workspace.id" :value="workspace.id">
      {{ workspace.name }}
    </option>
  </select>
  <p>You are {{ role }} of {{ current?.name }}.</p>
  <button type="button" @click="create({ name: 'Picture books', slug: 'picture-books' })">New workspace</button>
</template>
```

::field-group
  :::field{name="workspaces" type="ComputedRef<Workspace[]>"}
  Every workspace the person belongs to: `id`, `name`, `slug`, `logo`, `createdAt`.
  :::

  :::field{name="current" type="ComputedRef<Workspace | null>"}
  The active workspace.
  :::

  :::field{name="role" type="ComputedRef<'owner' | 'admin' | 'member' | null>"}
  The person's role in the active workspace.
  :::

  :::field{name="members · invitations" type="ComputedRef<WorkspaceMember[]> · ComputedRef<WorkspaceInvitation[]>"}
  The active workspace's members, and its pending invitations, live.
  :::

  :::field{name="setActive(workspaceId)" type="Promise<void>"}
  Switches the active workspace, then refreshes the token and the live connection.
  :::

  :::field{name="create({ name, slug, logo? })" type="Promise<Workspace>"}
  Creates a workspace and makes it active. Every workspace is a billing entity, so creating one spends the per-person `workspaceCreate` limit.
  :::

  :::field{name="leave(workspaceId?)" type="Promise<void>"}
  Leaves a workspace, the active one by default. The last owner can't leave.
  :::

  :::field{name="invite · cancelInvitation · removeMember · updateMemberRole"}
  Manage the active workspace's people: [Invite people](/docs/build/auth/workspaces/invitations) and [Manage members](/docs/build/auth/workspaces/members).
  :::

  :::field{name="acceptInvitation · declineInvitation · getInvitation · listReceivedInvitations"}
  The invitee's side of an invitation.
  :::
::

Each action resolves with its data, or rejects with an `Error` that carries the server's message, such as a taken slug. `isPending` is `true` while one runs, and `error` holds the last failure as `{ code, data, message }`:

```ts
const { create } = useWorkspace()

try {
  const workspace = await create({ name: 'Picture books', slug: 'picture-books' })
  await navigateTo(`/w/${workspace.slug}`)
}
catch {
  // `error` already says why, such as a taken slug.
}
```

## `<WorkspaceSettings>`

The module mounts `/settings` (module option `pages.settings`) for signed-in people. It opens on `<WorkspaceSettings>`, in three sections you pick with `sections`:

- `workspaces`: the list, create and switch;
- `billing`: the plan;
- `credits`: the balance and the packs that top it up.

Below it come the workspace's charges for its billing managers, its usage for every member, and its activity for its owners and admins.

```vue [app/pages/settings.vue]
<script setup lang="ts">
definePageMeta({ auth: true })
</script>

<template>
  <WorkspaceSettings :sections="['workspaces', 'credits']">
    <template #create="{ createWorkspace, pending }">
      <NewWorkspaceForm :busy="pending === 'create'" @submit="createWorkspace" />
    </template>
  </WorkspaceSettings>
</template>
```

Every region is a slot that receives the full state ([Workspace components](/docs/reference/components/workspaces#workspacesettings)).

Deleting a workspace (Better Auth's `/organization/delete`, for its owners, after a recent sign-in) is refused with `forbidden`, reason `paid_subscription`, while the workspace holds a paid plan set to renew: cancel the plan first, and the workspace can go.

## Show a part only inside a workspace

`<Gate workspace>` renders its default slot when the person has an active workspace, and `#fallback` otherwise. Every new session gets a workspace, so the fallback shows only for someone who left every workspace during this session:

```vue [app/pages/studio.vue]
<template>
  <Gate workspace>
    <StripList />
    <template #fallback>
      <NewWorkspaceForm />
    </template>
  </Gate>
</template>
```

## Workspace functions

The `workspace` tier checks membership with a fresh read on every call, and adds `ctx.workspace` (`{ id, slug, name, role }`):

```ts [backend/strips.ts]
import { v } from 'convex/values'
import { workspace } from './functions'

export const create = workspace.mutation({
  args: { title: v.string() },
  handler: (ctx, { title }) =>
    ctx.db.insert('strips', { title, workspaceId: ctx.workspace.id }),
})
```

A removed member's next call is refused. [Protect backend functions](/docs/build/auth/access/functions) has every tier.

## Related

- [Invite people to a workspace](/docs/build/auth/workspaces/invitations): the invitation flow, from the email to `/accept-invitation`.
- [Manage members](/docs/build/auth/workspaces/members): the members list, roles and removal.
- [Protect backend functions](/docs/build/auth/access/functions): the `workspace` tier.
- [Workspace components](/docs/reference/components/workspaces#workspacesettings): `<WorkspaceSettings>` in full.
