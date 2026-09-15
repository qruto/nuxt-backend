---
navigation: true
---

# convex/integrations/functions

## Interfaces

### FunctionOrganization

Defined in: [src/convex/integrations/functions.ts:6](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L6)

The workspace context injected by the `org` tier.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | - | [src/convex/integrations/functions.ts:7](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L7) |
| <a id="role"></a> `role` | `string` | The caller's role within the workspace (owner/admin/member or custom). | [src/convex/integrations/functions.ts:9](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L9) |

***

### FunctionsRateLimiter

Defined in: [src/convex/integrations/functions.ts:13](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L13)

A rate limiter compatible with `setupRateLimiter(...)` from `nuxt-backend/rate-limit`.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="limit"></a> `limit` | (`ctx`, `name`, `options?`) => `Promise`\<`unknown`\> | [src/convex/integrations/functions.ts:14](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L14) |

***

### CreateFunctionsOptions

Defined in: [src/convex/integrations/functions.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L21)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="adminroles"></a> `adminRoles?` | `string`[] | App-wide roles that pass the `admin` tier. Default `['admin']`. | [src/convex/integrations/functions.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L23) |
| <a id="ratelimiter"></a> `rateLimiter?` | [`FunctionsRateLimiter`](#functionsratelimiter) | Rate limiter to guard write tiers (`setupRateLimiter(...)`). | [src/convex/integrations/functions.ts:25](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L25) |
| <a id="limits"></a> `limits?` | `Partial`\<`Record`\<`"admin"` \| `"authed"` \| `"org"`, `string`\>\> | Named rate limits per tier, consumed on **mutations and actions** (keyed by user id; queries are reads and can't consume a limit). E.g. `{ authed: 'apiWrites' }` with a matching limit in `setupRateLimiter`. | [src/convex/integrations/functions.ts:31](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L31) |

## Functions

### createFunctions()

```ts
function createFunctions<DM>(
   builders, 
   authorization, 
   options?): {
  authed: {
     query: CustomBuilder<"query", Record<string, never>, {
        user: AuthorizationUser;
     }, Record<string, never>, GenericQueryCtx<DM>, "public", Record<string, any>>;
     mutation: CustomBuilder<"mutation", Record<string, never>, {
        user: AuthorizationUser;
     }, Record<string, never>, GenericMutationCtx<DM>, "public", Record<string, any>>;
     action: CustomBuilder<"action", Record<string, never>, {
        user: AuthorizationUser;
     }, Record<string, never>, GenericActionCtx<DM>, "public", Record<string, any>>;
  };
  org: {
     query: CustomBuilder<"query", Record<string, never>, {
        user: AuthorizationUser;
        organization: {
           id: string;
           role: string;
        };
     }, Record<string, never>, GenericQueryCtx<DM>, "public", Record<string, any>>;
     mutation: CustomBuilder<"mutation", Record<string, never>, {
        user: AuthorizationUser;
        organization: {
           id: string;
           role: string;
        };
     }, Record<string, never>, GenericMutationCtx<DM>, "public", Record<string, any>>;
     action: CustomBuilder<"action", Record<string, never>, {
        user: AuthorizationUser;
        organization: {
           id: string;
           role: string;
        };
     }, Record<string, never>, GenericActionCtx<DM>, "public", Record<string, any>>;
  };
  admin: {
     query: CustomBuilder<"query", Record<string, never>, {
        user: AuthorizationUser;
     }, Record<string, never>, GenericQueryCtx<DM>, "public", Record<string, any>>;
     mutation: CustomBuilder<"mutation", Record<string, never>, {
        user: AuthorizationUser;
     }, Record<string, never>, GenericMutationCtx<DM>, "public", Record<string, any>>;
     action: CustomBuilder<"action", Record<string, never>, {
        user: AuthorizationUser;
     }, Record<string, never>, GenericActionCtx<DM>, "public", Record<string, any>>;
  };
  withRole: (role) => {
     query: CustomBuilder<"query", Record<string, never>, {
        user: AuthorizationUser;
     }, Record<string, never>, GenericQueryCtx<DM>, "public", Record<string, any>>;
     mutation: CustomBuilder<"mutation", Record<string, never>, {
        user: AuthorizationUser;
     }, Record<string, never>, GenericMutationCtx<DM>, "public", Record<string, any>>;
     action: CustomBuilder<"action", Record<string, never>, {
        user: AuthorizationUser;
     }, Record<string, never>, GenericActionCtx<DM>, "public", Record<string, any>>;
  };
};
```

Defined in: [src/convex/integrations/functions.ts:66](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L66)

Pre-authorized function builders over your `_generated/server` builders —
grouped by tier, each a drop-in `{ query, mutation, action }`:

```ts
const { authed, org, admin, withRole } = createFunctions({ query, mutation, action }, authorization)

export const me = authed.query({           // ctx.user (requireUser)
  args: {},
  handler: async (ctx) => ctx.user,
})
export const createProject = org.mutation({ // + ctx.organization (fresh membership)
  args: { name: v.string() },
  handler: async (ctx, { name }) =>
    ctx.db.insert('projects', { name, organizationId: ctx.organization.id }),
})
export const purge = admin.action({ ... })   // requireRole(adminRoles)
export const review = withRole('editor').query({ ... })
```

The `org` tier verifies membership with a fresh member-table read on every
call (a removed member is locked out immediately, not at JWT expiry).
`authed`/`admin`/`withRole` are claims-based — see `requireRole`'s `fresh`
option when you need stronger guarantees. Pass your `withTriggers`-wrapped
`mutation` to keep aggregate triggers composing.

#### Type Parameters

| Type Parameter |
| ------ |
| `DM` *extends* `GenericDataModel` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `builders` | `Builders`\<`DM`\> |
| `authorization` | [`Authorization`](/api-reference/reference/convex/integrations/authorization#authorization) |
| `options` | [`CreateFunctionsOptions`](#createfunctionsoptions) |

#### Returns

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `authed` | \{ `query`: `CustomBuilder`\<`"query"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericQueryCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; `mutation`: `CustomBuilder`\<`"mutation"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericMutationCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; `action`: `CustomBuilder`\<`"action"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericActionCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; \} | Signed-in (and not banned): injects `ctx.user`. | [src/convex/integrations/functions.ts:98](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L98) |
| `authed.query` | `CustomBuilder`\<`"query"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericQueryCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\> | - | [src/convex/integrations/functions.ts:83](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L83) |
| `authed.mutation` | `CustomBuilder`\<`"mutation"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericMutationCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\> | - | [src/convex/integrations/functions.ts:84](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L84) |
| `authed.action` | `CustomBuilder`\<`"action"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericActionCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\> | - | [src/convex/integrations/functions.ts:89](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L89) |
| `org` | \{ `query`: `CustomBuilder`\<`"query"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); `organization`: \{ `id`: `string`; `role`: `string`; \}; \}, `Record`\<`string`, `never`\>, `GenericQueryCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; `mutation`: `CustomBuilder`\<`"mutation"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); `organization`: \{ `id`: `string`; `role`: `string`; \}; \}, `Record`\<`string`, `never`\>, `GenericMutationCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; `action`: `CustomBuilder`\<`"action"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); `organization`: \{ `id`: `string`; `role`: `string`; \}; \}, `Record`\<`string`, `never`\>, `GenericActionCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; \} | Workspace member (fresh check): injects `ctx.user` + `ctx.organization`. | [src/convex/integrations/functions.ts:100](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L100) |
| `org.query` | `CustomBuilder`\<`"query"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); `organization`: \{ `id`: `string`; `role`: `string`; \}; \}, `Record`\<`string`, `never`\>, `GenericQueryCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\> | - | [src/convex/integrations/functions.ts:83](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L83) |
| `org.mutation` | `CustomBuilder`\<`"mutation"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); `organization`: \{ `id`: `string`; `role`: `string`; \}; \}, `Record`\<`string`, `never`\>, `GenericMutationCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\> | - | [src/convex/integrations/functions.ts:84](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L84) |
| `org.action` | `CustomBuilder`\<`"action"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); `organization`: \{ `id`: `string`; `role`: `string`; \}; \}, `Record`\<`string`, `never`\>, `GenericActionCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\> | - | [src/convex/integrations/functions.ts:89](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L89) |
| `admin` | \{ `query`: `CustomBuilder`\<`"query"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericQueryCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; `mutation`: `CustomBuilder`\<`"mutation"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericMutationCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; `action`: `CustomBuilder`\<`"action"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericActionCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; \} | App-wide admin (`adminRoles`): injects `ctx.user`. | [src/convex/integrations/functions.ts:105](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L105) |
| `admin.query` | `CustomBuilder`\<`"query"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericQueryCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\> | - | [src/convex/integrations/functions.ts:83](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L83) |
| `admin.mutation` | `CustomBuilder`\<`"mutation"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericMutationCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\> | - | [src/convex/integrations/functions.ts:84](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L84) |
| `admin.action` | `CustomBuilder`\<`"action"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericActionCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\> | - | [src/convex/integrations/functions.ts:89](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L89) |
| `withRole()` | (`role`) => \{ `query`: `CustomBuilder`\<`"query"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericQueryCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; `mutation`: `CustomBuilder`\<`"mutation"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericMutationCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; `action`: `CustomBuilder`\<`"action"`, `Record`\<`string`, `never`\>, \{ `user`: [`AuthorizationUser`](/api-reference/reference/convex/integrations/authorization#authorizationuser); \}, `Record`\<`string`, `never`\>, `GenericActionCtx`\<`DM`\>, `"public"`, `Record`\<`string`, `any`\>\>; \} | Custom app-wide role tier: `withRole('editor').query(...)`. | [src/convex/integrations/functions.ts:107](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/functions.ts#L107) |
