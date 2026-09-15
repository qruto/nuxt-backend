---
navigation: true
---

# convex/integrations/authorization

## Interfaces

### AuthorizationUser

Defined in: [src/convex/integrations/authorization.ts:17](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L17)

The signed-in user, as read from identity claims.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | Better Auth user id (the component's `user` document id). | [src/convex/integrations/authorization.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L19) |
| <a id="email"></a> `email` | `string` | - | [src/convex/integrations/authorization.ts:20](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L20) |
| <a id="name"></a> `name` | `string` | - | [src/convex/integrations/authorization.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L21) |
| <a id="role"></a> `role` | `string` | App-wide role from the admin plugin; `'user'` when unset. | [src/convex/integrations/authorization.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L23) |
| <a id="banned"></a> `banned` | `boolean` | - | [src/convex/integrations/authorization.ts:24](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L24) |
| <a id="activeorganizationid"></a> `activeOrganizationId` | `string` \| `null` | The session's active workspace, or `null` when none. | [src/convex/integrations/authorization.ts:26](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L26) |
| <a id="claims"></a> `claims` | `Record`\<`string`, `unknown`\> | All identity claims, for anything not surfaced above. | [src/convex/integrations/authorization.ts:28](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L28) |

***

### AuthorizationMember

Defined in: [src/convex/integrations/authorization.ts:32](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L32)

A workspace membership, as returned by [Authorization.requireMember](#requiremember).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="user"></a> `user` | [`AuthorizationUser`](#authorizationuser) | - | [src/convex/integrations/authorization.ts:33](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L33) |
| <a id="organizationid"></a> `organizationId` | `string` | - | [src/convex/integrations/authorization.ts:34](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L34) |
| <a id="role-1"></a> `role` | `string` | The member's role *within the workspace* (owner/admin/member or custom). | [src/convex/integrations/authorization.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L36) |

***

### AuthorizationCtx

Defined in: [src/convex/integrations/authorization.ts:40](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L40)

Any Convex ctx that can read identity and run component queries.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="auth"></a> `auth` | `Auth` | [src/convex/integrations/authorization.ts:41](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L41) |
| <a id="runquery"></a> `runQuery` | \<`Query`\>(`query`, ...`args`) => `Promise`\<`FunctionReturnType`\<`Query`\>\> | [src/convex/integrations/authorization.ts:42](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L42) |

***

### StatementRole

Defined in: [src/convex/integrations/authorization.ts:46](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L46)

A role with a Better Auth access-control statement check.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="authorize"></a> `authorize` | (`permissions`) => \{ `success`: `boolean`; `error?`: `string`; \} | [src/convex/integrations/authorization.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L47) |

***

### AuthorizationComponents

Defined in: [src/convex/integrations/authorization.ts:56](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L56)

The component handle [setupAuthorization](#setupauthorization) reads from your generated
`components` object: the package's all-in-one `backend` component, whose
auth adapter functions it queries through. Pass the whole `components`
object — the key is picked structurally.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="backend"></a> `backend` | \{ `adapter`: \{ `findOne`: `unknown`; `updateOne`: `unknown`; \}; \} | [src/convex/integrations/authorization.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L57) |
| `backend.adapter` | \{ `findOne`: `unknown`; `updateOne`: `unknown`; \} | [src/convex/integrations/authorization.ts:58](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L58) |
| `backend.adapter.findOne` | `unknown` | [src/convex/integrations/authorization.ts:59](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L59) |
| `backend.adapter.updateOne` | `unknown` | [src/convex/integrations/authorization.ts:60](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L60) |

***

### SetupAuthorizationOptions

Defined in: [src/convex/integrations/authorization.ts:71](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L71)

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | `GenericDataModel` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="roles"></a> `roles?` | `Record`\<`string`, [`StatementRole`](#statementrole)\> | Statement roles for [Authorization.requirePermission](#requirepermission) — pass the same `roles` map you gave the admin plugin (`createAccessControl` roles). Defaults to the admin plugin's built-in `admin`/`user` roles. | [src/convex/integrations/authorization.ts:77](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L77) |
| <a id="internalmutation"></a> `internalMutation?` | `MutationBuilder`\<`DM`, `"internal"`\> | Your `internalMutation` builder — supplying it adds the `setUserRole` bootstrap mutation (run `npx convex run functions:setUserRole '{"email":"you@example.com","role":"admin"}'` to mint the first admin). | [src/convex/integrations/authorization.ts:83](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L83) |

***

### Authorization

Defined in: [src/convex/integrations/authorization.ts:86](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L86)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="getuser"></a> `getUser` | (`ctx`) => `Promise`\<[`AuthorizationUser`](#authorizationuser) \| `null`\> | The signed-in user from identity claims, or `null` when signed out. | [src/convex/integrations/authorization.ts:88](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L88) |
| <a id="requireuser"></a> `requireUser` | (`ctx`) => `Promise`\<[`AuthorizationUser`](#authorizationuser)\> | The signed-in user; throws `Unauthenticated` when signed out, `Forbidden` when banned. | [src/convex/integrations/authorization.ts:90](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L90) |
| <a id="requirerole"></a> `requireRole` | (`ctx`, `role`, `options?`) => `Promise`\<[`AuthorizationUser`](#authorizationuser)\> | Require an app-wide role. `fresh: true` re-reads the user document past JWT staleness — use it for sensitive checks right after role changes. | [src/convex/integrations/authorization.ts:95](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L95) |
| <a id="requirepermission"></a> `requirePermission` | (`ctx`, `permissions`, `options?`) => `Promise`\<[`AuthorizationUser`](#authorizationuser)\> | Require permission statements (e.g. `{ user: ['ban'] }`) against the user's role. `fresh: true` re-reads the user document past JWT staleness — use it for permission-gated destructive operations right after role changes. | [src/convex/integrations/authorization.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L101) |
| <a id="requireorganization"></a> `requireOrganization` | (`ctx`) => `Promise`\<\{ `user`: [`AuthorizationUser`](#authorizationuser); `organizationId`: `string`; \}\> | Require an active workspace on the session; returns its id. | [src/convex/integrations/authorization.ts:103](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L103) |
| <a id="requiremember"></a> `requireMember` | (`ctx`, `options?`) => `Promise`\<[`AuthorizationMember`](#authorizationmember)\> | Require workspace membership (always a fresh member-table read). Defaults to the active workspace; pass `role` to also require a workspace role. | [src/convex/integrations/authorization.ts:108](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L108) |
| <a id="setuserrole"></a> `setUserRole?` | `RegisteredMutation`\<`"internal"`, \{ `email`: `string`; `role`: `string`; \}, `Promise`\<`null`\>\> | Bootstrap role assignment — present when `internalMutation` was supplied. | [src/convex/integrations/authorization.ts:110](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L110) |

## Variables

### defaultStatements

```ts
const defaultStatements: {
  user: readonly ["create", "list", "set-role", "ban", "impersonate", "impersonate-admins", "delete", "set-password", "set-email", "get", "update"];
  session: readonly ["list", "revoke", "delete"];
};
```

Defined in: node\_modules/better-auth/dist/plugins/admin/access/statement.d.mts:4

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-user"></a> `user` | readonly \[`"create"`, `"list"`, `"set-role"`, `"ban"`, `"impersonate"`, `"impersonate-admins"`, `"delete"`, `"set-password"`, `"set-email"`, `"get"`, `"update"`\] | node\_modules/better-auth/dist/plugins/admin/access/statement.d.mts:5 |
| <a id="property-session"></a> `session` | readonly \[`"list"`, `"revoke"`, `"delete"`\] | node\_modules/better-auth/dist/plugins/admin/access/statement.d.mts:6 |

***

### adminAc

```ts
const adminAc: Role<ExactRoleStatements<{
  user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "set-email", "get", "update"];
  session: ["list", "revoke", "delete"];
}>, {
  user: readonly ["create", "list", "set-role", "ban", "impersonate", "impersonate-admins", "delete", "set-password", "set-email", "get", "update"];
  session: readonly ["list", "revoke", "delete"];
}>;
```

Defined in: node\_modules/better-auth/dist/plugins/admin/access/statement.d.mts:21

***

### userAc

```ts
const userAc: Role<ExactRoleStatements<{
  user: [];
  session: [];
}>, {
  user: readonly ["create", "list", "set-role", "ban", "impersonate", "impersonate-admins", "delete", "set-password", "set-email", "get", "update"];
  session: readonly ["list", "revoke", "delete"];
}>;
```

Defined in: node\_modules/better-auth/dist/plugins/admin/access/statement.d.mts:28

## Functions

### createAccessControl()

```ts
function createAccessControl<TStatements>(s): {
  newRole: Role<ExactRoleStatements<TRoleStatements>, TStatements>;
  statements: TStatements;
};
```

Defined in: node\_modules/better-auth/dist/plugins/access/access.d.mts:11

#### Type Parameters

| Type Parameter |
| ------ |
| `TStatements` *extends* `Statements` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `TStatements` |

#### Returns

```ts
{
  newRole: Role<ExactRoleStatements<TRoleStatements>, TStatements>;
  statements: TStatements;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `newRole()` | (`statements`) => `Role`\<`ExactRoleStatements`\<`TRoleStatements`\>, `TStatements`\> | node\_modules/better-auth/dist/plugins/access/access.d.mts:12 |
| `statements` | `TStatements` | node\_modules/better-auth/dist/plugins/access/access.d.mts:13 |

***

### setupAuthorization()

```ts
function setupAuthorization<DM>(components, options?): Authorization;
```

Defined in: [src/convex/integrations/authorization.ts:127](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/authorization.ts#L127)

Build the authorization helpers over the `backend` component's auth adapter.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | `GenericDataModel` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `components` | [`AuthorizationComponents`](#authorizationcomponents) |
| `options` | [`SetupAuthorizationOptions`](#setupauthorizationoptions)\<`DM`\> |

#### Returns

[`Authorization`](#authorization)

#### Example

```ts
// convex/functions.ts
import { setupAuthorization } from 'nuxt-backend/authorization'
import { components } from './_generated/api'
import { internalMutation } from './_generated/server'

export const authorization = setupAuthorization(components, { internalMutation })
export const { requireUser, requireRole, requireOrganization, setUserRole } = authorization
```
