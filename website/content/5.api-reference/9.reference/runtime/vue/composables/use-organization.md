---
navigation: true
---

# runtime/vue/composables/use-organization

## Interfaces

### Workspace

Defined in: [nuxt-backend/src/runtime/vue/composables/use-organization.ts:6](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L6)

A workspace (Better Auth organization).

#### Extended by

- [`ActiveWorkspace`](#activeworkspace)

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:7](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L7) |
| <a id="name"></a> `name` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:8](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L8) |
| <a id="slug"></a> `slug` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:9](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L9) |
| <a id="logo"></a> `logo?` | `string` \| `null` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:10](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L10) |
| <a id="createdat"></a> `createdAt` | `number` \| `Date` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:11](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L11) |
| <a id="metadata"></a> `metadata?` | `unknown` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:12](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L12) |

***

### WorkspaceMember

Defined in: [nuxt-backend/src/runtime/vue/composables/use-organization.ts:16](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L16)

A workspace member row.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="id-1"></a> `id` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:17](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L17) |
| <a id="organizationid"></a> `organizationId` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:18](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L18) |
| <a id="userid"></a> `userId` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:19](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L19) |
| <a id="role"></a> `role` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:20](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L20) |
| <a id="user"></a> `user?` | \{ `email?`: `string`; `name?`: `string`; `image?`: `string` \| `null`; \} | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:21](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L21) |
| `user.email?` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:21](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L21) |
| `user.name?` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:21](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L21) |
| `user.image?` | `string` \| `null` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:21](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L21) |

***

### ActiveWorkspace

Defined in: [nuxt-backend/src/runtime/vue/composables/use-organization.ts:25](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L25)

The active workspace with its members and pending invitations.

#### Extends

- [`Workspace`](#workspace)

#### Properties

| Property | Type | Inherited from | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-2"></a> `id` | `string` | [`Workspace`](#workspace).[`id`](#id) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:7](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L7) |
| <a id="name-1"></a> `name` | `string` | [`Workspace`](#workspace).[`name`](#name) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:8](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L8) |
| <a id="slug-1"></a> `slug` | `string` | [`Workspace`](#workspace).[`slug`](#slug) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:9](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L9) |
| <a id="logo-1"></a> `logo?` | `string` \| `null` | [`Workspace`](#workspace).[`logo`](#logo) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:10](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L10) |
| <a id="createdat-1"></a> `createdAt` | `number` \| `Date` | [`Workspace`](#workspace).[`createdAt`](#createdat) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:11](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L11) |
| <a id="metadata-1"></a> `metadata?` | `unknown` | [`Workspace`](#workspace).[`metadata`](#metadata) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:12](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L12) |
| <a id="members"></a> `members` | [`WorkspaceMember`](#workspacemember)[] | - | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:26](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L26) |
| <a id="invitations"></a> `invitations` | \{ `id`: `string`; `email`: `string`; `role?`: `string` \| `null`; `status`: `string`; \}[] | - | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:27](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L27) |

***

### ReceivedInvitation

Defined in: [nuxt-backend/src/runtime/vue/composables/use-organization.ts:33](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L33)

An invitation the signed-in user has received.

#### Extended by

- [`InvitationDetails`](#invitationdetails)

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="id-3"></a> `id` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:34](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L34) |
| <a id="email"></a> `email` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:35](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L35) |
| <a id="role-1"></a> `role?` | `string` \| `null` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:36](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L36) |
| <a id="status"></a> `status` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:37](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L37) |
| <a id="organizationid-1"></a> `organizationId` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:38](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L38) |
| <a id="inviterid"></a> `inviterId` | `string` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:39](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L39) |
| <a id="expiresat"></a> `expiresAt` | `string` \| `number` \| `Date` | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:40](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L40) |

***

### InvitationDetails

Defined in: [nuxt-backend/src/runtime/vue/composables/use-organization.ts:44](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L44)

A single invitation with its workspace/inviter context (accept-page data).

#### Extends

- [`ReceivedInvitation`](#receivedinvitation)

#### Properties

| Property | Type | Inherited from | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-4"></a> `id` | `string` | [`ReceivedInvitation`](#receivedinvitation).[`id`](#id-3) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:34](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L34) |
| <a id="email-1"></a> `email` | `string` | [`ReceivedInvitation`](#receivedinvitation).[`email`](#email) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:35](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L35) |
| <a id="role-2"></a> `role?` | `string` \| `null` | [`ReceivedInvitation`](#receivedinvitation).[`role`](#role-1) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:36](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L36) |
| <a id="status-1"></a> `status` | `string` | [`ReceivedInvitation`](#receivedinvitation).[`status`](#status) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:37](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L37) |
| <a id="organizationid-2"></a> `organizationId` | `string` | [`ReceivedInvitation`](#receivedinvitation).[`organizationId`](#organizationid-1) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:38](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L38) |
| <a id="inviterid-1"></a> `inviterId` | `string` | [`ReceivedInvitation`](#receivedinvitation).[`inviterId`](#inviterid) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:39](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L39) |
| <a id="expiresat-1"></a> `expiresAt` | `string` \| `number` \| `Date` | [`ReceivedInvitation`](#receivedinvitation).[`expiresAt`](#expiresat) | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:40](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L40) |
| <a id="organizationname"></a> `organizationName` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:45](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L45) |
| <a id="organizationslug"></a> `organizationSlug` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:46](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L46) |
| <a id="inviteremail"></a> `inviterEmail` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:47](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L47) |

***

### UseOrganizationReturn

Defined in: [nuxt-backend/src/runtime/vue/composables/use-organization.ts:68](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L68)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="organizations"></a> `organizations` | `ComputedRef`\<[`Workspace`](#workspace)[]\> | Every workspace the user belongs to. | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:70](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L70) |
| <a id="current"></a> `current` | `ComputedRef`\<[`ActiveWorkspace`](#activeworkspace) \| `null`\> | The active workspace (with members + invitations), `null` when none. | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:72](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L72) |
| <a id="member"></a> `member` | `ComputedRef`\<[`WorkspaceMember`](#workspacemember) \| `null`\> | The user's membership in the active workspace. | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:74](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L74) |
| <a id="role-3"></a> `role` | `ComputedRef`\<`string` \| `null`\> | The user's role *within the active workspace* (owner/admin/member or custom). | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:76](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L76) |
| <a id="members-1"></a> `members` | `ComputedRef`\<[`WorkspaceMember`](#workspacemember)[]\> | Members of the active workspace. | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:78](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L78) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` while workspace state is loading. | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:80](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L80) |
| <a id="setactive"></a> `setActive` | (`organizationId`) => `Promise`\<`void`\> | Switch the active workspace. Refreshes the Convex token (the active workspace rides on JWT claims) and re-authenticates the live connection, so all workspace-scoped queries re-run against the new workspace. | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:86](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L86) |
| <a id="create"></a> `create` | (`args`) => `Promise`\<`unknown`\> | Create a workspace (users can own several). | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:88](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L88) |
| <a id="invite"></a> `invite` | (`args`) => `Promise`\<`unknown`\> | Invite someone to the active workspace (they receive an accept-link email). | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:90](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L90) |
| <a id="leave"></a> `leave` | (`organizationId?`) => `Promise`\<`unknown`\> | Leave a workspace (defaults to the active one). | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:92](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L92) |
| <a id="acceptinvitation"></a> `acceptInvitation` | (`invitationId`, `options?`) => `Promise`\<`unknown`\> | Accept a received invitation. Refreshes the workspace claim; with `activate: true` the joined workspace also becomes the active one. | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:97](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L97) |
| <a id="declineinvitation"></a> `declineInvitation` | (`invitationId`) => `Promise`\<`unknown`\> | Decline a received invitation. | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:99](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L99) |
| <a id="cancelinvitation"></a> `cancelInvitation` | (`invitationId`) => `Promise`\<`unknown`\> | Cancel a pending invitation you (or a teammate) sent — inviter side. | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:101](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L101) |
| <a id="getinvitation"></a> `getInvitation` | (`invitationId`) => `Promise`\<[`InvitationDetails`](#invitationdetails) \| `null`\> | A single invitation with workspace/inviter context (for the accept page). | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:103](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L103) |
| <a id="listreceivedinvitations"></a> `listReceivedInvitations` | () => `Promise`\<[`ReceivedInvitation`](#receivedinvitation)[]\> | Invitations the signed-in user has received (across workspaces). | [nuxt-backend/src/runtime/vue/composables/use-organization.ts:105](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L105) |

## Functions

### useOrganization()

```ts
function useOrganization(): UseOrganizationReturn;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-organization.ts:129](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-organization.ts#L129)

Workspace (organization) state and actions, including the full invitation
flow (invite / accept / decline / cancel — the packaged `AcceptInvitation`
component and `/accept-invitation` page build on these). Anything beyond —
member removal, role updates — lives on the fully-typed client:
`useAuth().client.organization.*`.

#### Returns

[`UseOrganizationReturn`](#useorganizationreturn)

#### Example

```vue
<script setup lang="ts">
const { organizations, current, setActive, create } = useOrganization()
</script>
<template>
  <select :value="current?.id" @change="setActive(($event.target as HTMLSelectElement).value)">
    <option v-for="workspace in organizations" :key="workspace.id" :value="workspace.id">
      {{ workspace.name }}
    </option>
  </select>
</template>
```
