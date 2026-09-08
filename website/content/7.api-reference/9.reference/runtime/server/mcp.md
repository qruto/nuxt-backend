---
navigation: true
---

# runtime/server/mcp

**`Experimental`**

The agent (MCP) surface's Nitro utilities — `nuxt-backend/mcp`, also
auto-imported in `server/`: [useBackendMcp](#usebackendmcp) for the signed-in agent
session behind a tool call, [defineBackendMcpTool](#definebackendmcptool) for your own tools.

Experimental: the MCP authorization profile it implements (OAuth 2.1 +
protected-resource metadata) and `@nuxtjs/mcp-toolkit` are both still
moving, so this entry's shape may change in a minor release — the rest of
the package holds the STABILITY.md promise.

## Interfaces

### ExchangeCache

Defined in: [nuxt-backend/src/runtime/server/mcp/cache.ts:9](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/cache.ts#L9)

**`Experimental`**

In-memory TTL + LRU cache for resolved agent sessions, keyed by the opaque
OAuth Bearer. One exchange round trip per token per JWT lifetime: entries
expire with the minted Convex JWT (minus a safety margin so a cached JWT is
never handed out moments before it lapses), which also bounds how long a
revoked agent token keeps working. Pure and clock-injectable for tests.

#### Type Parameters

| Type Parameter |
| ------ |
| `Value` |

#### Properties

| Property | Modifier | Type | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="get"></a> `get` | `public` | (`key`) => `Value` \| `null` | **`Experimental`** | [nuxt-backend/src/runtime/server/mcp/cache.ts:10](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/cache.ts#L10) |
| <a id="set"></a> `set` | `public` | (`key`, `value`, `ttlMs`) => `void` | **`Experimental`** | [nuxt-backend/src/runtime/server/mcp/cache.ts:11](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/cache.ts#L11) |
| <a id="size"></a> `size` | `readonly` | `number` | **`Experimental`** | [nuxt-backend/src/runtime/server/mcp/cache.ts:12](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/cache.ts#L12) |

***

### BackendMcp

Defined in: [nuxt-backend/src/runtime/server/mcp/index.ts:34](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/index.ts#L34)

**`Experimental`**

The per-request agent context [useBackendMcp](#usebackendmcp) returns.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="session"></a> `session` | [`BackendMcpSession`](#backendmcpsession-1) | **`Experimental`** | [nuxt-backend/src/runtime/server/mcp/index.ts:35](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/index.ts#L35) |
| <a id="hasscope"></a> `hasScope` | (`scope`) => `boolean` | **`Experimental`** | [nuxt-backend/src/runtime/server/mcp/index.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/index.ts#L36) |
| <a id="fetchquery"></a> `fetchQuery` | \<`Query`\>(`query`, `args?`) => `Promise`\<`FunctionReturnType`\<`Query`\>\> | **`Experimental`** Convex fetchers bound to the agent's short-lived user JWT. | [nuxt-backend/src/runtime/server/mcp/index.ts:38](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/index.ts#L38) |
| <a id="fetchmutation"></a> `fetchMutation` | \<`Mutation`\>(`mutation`, `args?`) => `Promise`\<`FunctionReturnType`\<`Mutation`\>\> | **`Experimental`** | [nuxt-backend/src/runtime/server/mcp/index.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/index.ts#L39) |
| <a id="fetchaction"></a> `fetchAction` | \<`Action`\>(`action`, `args?`) => `Promise`\<`FunctionReturnType`\<`Action`\>\> | **`Experimental`** | [nuxt-backend/src/runtime/server/mcp/index.ts:40](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/index.ts#L40) |

***

### BackendMcpSession

Defined in: [nuxt-backend/src/runtime/server/mcp/session.ts:6](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/session.ts#L6)

**`Experimental`**

The authenticated agent behind the current MCP request.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="userid"></a> `userId` | `string` | **`Experimental`** The signed-in user the agent acts as. | [nuxt-backend/src/runtime/server/mcp/session.ts:8](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/session.ts#L8) |
| <a id="clientid"></a> `clientId` | `string` | **`Experimental`** The OAuth client (agent) id. | [nuxt-backend/src/runtime/server/mcp/session.ts:10](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/session.ts#L10) |
| <a id="scopes"></a> `scopes` | `string`[] | **`Experimental`** Scopes the user consented to. | [nuxt-backend/src/runtime/server/mcp/session.ts:12](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/session.ts#L12) |
| <a id="convextoken"></a> `convexToken` | `string` | **`Experimental`** Short-lived Convex JWT for calling deployment functions as the user. | [nuxt-backend/src/runtime/server/mcp/session.ts:14](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/session.ts#L14) |

## Type Aliases

### BackendMcpFunctionKey

```ts
type BackendMcpFunctionKey = keyof typeof BACKEND_MCP_FUNCTION_DEFAULTS;
```

Defined in: [nuxt-backend/src/runtime/server/mcp/builtin.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L21)

**`Experimental`**

***

### BackendMcpToolName

```ts
type BackendMcpToolName = 
  | "profile-get"
  | "profile-update"
  | "billing-plans"
  | "billing-subscription"
  | "credits-balance"
  | "billing-checkout-link"
  | "billing-portal-link"
  | "workspace-list"
  | "workspace-members";
```

Defined in: [nuxt-backend/src/runtime/server/mcp/builtin.ts:24](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L24)

**`Experimental`**

The built-in agent tools, by MCP tool name.

***

### BackendMcpToolDefinition

```ts
type BackendMcpToolDefinition<InputSchema, OutputSchema> = McpToolDefinition<InputSchema, OutputSchema> & {
  scope?: string;
};
```

Defined in: [nuxt-backend/src/runtime/server/mcp/index.ts:71](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/index.ts#L71)

**`Experimental`**

#### Type Declaration

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `scope?` | `string` | OAuth scope required for this tool. Agents without it never see the tool in `tools/list`, and a direct call is refused — the handler-side check matters because list-time hiding is only advisory. | [nuxt-backend/src/runtime/server/mcp/index.ts:80](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/index.ts#L80) |

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `InputSchema` *extends* `ZodRawShape` \| `undefined` | `ZodRawShape` |
| `OutputSchema` *extends* `ZodRawShape` | `ZodRawShape` |

## Variables

### BACKEND\_MCP\_FUNCTION\_DEFAULTS

```ts
const BACKEND_MCP_FUNCTION_DEFAULTS: {
  getAuthUser: "auth:getAuthUser";
  updateProfile: "auth:updateProfile";
  getConfiguredProducts: "billing:getConfiguredProducts";
  getCurrentSubscription: "billing:getCurrentSubscription";
  getCredits: "billing:getCredits";
  generateCheckoutLink: "billing:generateCheckoutLink";
  generateCustomerPortalUrl: "billing:generateCustomerPortalUrl";
  listWorkspaces: "auth:listWorkspaces";
  listWorkspaceMembers: "auth:listWorkspaceMembers";
};
```

Defined in: [nuxt-backend/src/runtime/server/mcp/builtin.ts:9](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L9)

**`Experimental`**

The scaffold-named Convex functions the built-in tools call. Keys are the
override map's vocabulary (`backend.mcp.functions`); values assume the
scaffolded `auth.ts` / `billing.ts` module names.

#### Type Declaration

| Name | Type | Default value | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="property-getauthuser"></a> `getAuthUser` | `"auth:getAuthUser"` | `'auth:getAuthUser'` | [nuxt-backend/src/runtime/server/mcp/builtin.ts:10](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L10) |
| <a id="property-updateprofile"></a> `updateProfile` | `"auth:updateProfile"` | `'auth:updateProfile'` | [nuxt-backend/src/runtime/server/mcp/builtin.ts:11](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L11) |
| <a id="property-getconfiguredproducts"></a> `getConfiguredProducts` | `"billing:getConfiguredProducts"` | `'billing:getConfiguredProducts'` | [nuxt-backend/src/runtime/server/mcp/builtin.ts:12](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L12) |
| <a id="property-getcurrentsubscription"></a> `getCurrentSubscription` | `"billing:getCurrentSubscription"` | `'billing:getCurrentSubscription'` | [nuxt-backend/src/runtime/server/mcp/builtin.ts:13](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L13) |
| <a id="property-getcredits"></a> `getCredits` | `"billing:getCredits"` | `'billing:getCredits'` | [nuxt-backend/src/runtime/server/mcp/builtin.ts:14](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L14) |
| <a id="property-generatecheckoutlink"></a> `generateCheckoutLink` | `"billing:generateCheckoutLink"` | `'billing:generateCheckoutLink'` | [nuxt-backend/src/runtime/server/mcp/builtin.ts:15](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L15) |
| <a id="property-generatecustomerportalurl"></a> `generateCustomerPortalUrl` | `"billing:generateCustomerPortalUrl"` | `'billing:generateCustomerPortalUrl'` | [nuxt-backend/src/runtime/server/mcp/builtin.ts:16](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L16) |
| <a id="property-listworkspaces"></a> `listWorkspaces` | `"auth:listWorkspaces"` | `'auth:listWorkspaces'` | [nuxt-backend/src/runtime/server/mcp/builtin.ts:17](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L17) |
| <a id="property-listworkspacemembers"></a> `listWorkspaceMembers` | `"auth:listWorkspaceMembers"` | `'auth:listWorkspaceMembers'` | [nuxt-backend/src/runtime/server/mcp/builtin.ts:18](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L18) |

***

### EXCHANGE\_CACHE\_MARGIN\_MS

```ts
const EXCHANGE_CACHE_MARGIN_MS: 30000 = 30_000;
```

Defined in: [nuxt-backend/src/runtime/server/mcp/cache.ts:16](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/cache.ts#L16)

**`Experimental`**

Marginal safety window between cache expiry and JWT expiry.

## Functions

### backendMcpFunction()

```ts
function backendMcpFunction(key, event?): string;
```

Defined in: [nuxt-backend/src/runtime/server/mcp/builtin.ts:31](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L31)

**`Experimental`**

Resolve a built-in tool's Convex function ref (`backend.mcp.functions` wins).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | \| `"getAuthUser"` \| `"listWorkspaces"` \| `"listWorkspaceMembers"` \| `"updateProfile"` \| `"getConfiguredProducts"` \| `"generateCheckoutLink"` \| `"generateCustomerPortalUrl"` \| `"getCurrentSubscription"` \| `"getCredits"` |
| `event?` | `H3Event`\<`EventHandlerRequest`\> |

#### Returns

`string`

***

### builtinToolEnabled()

```ts
function builtinToolEnabled(name, event): boolean;
```

Defined in: [nuxt-backend/src/runtime/server/mcp/builtin.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/builtin.ts#L36)

**`Experimental`**

Whether a built-in tool survived `backend.mcp.tools.builtin` config.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | [`BackendMcpToolName`](#backendmcptoolname) |
| `event` | `H3Event` |

#### Returns

`boolean`

***

### createExchangeCache()

```ts
function createExchangeCache<Value>(options?): ExchangeCache<Value>;
```

Defined in: [nuxt-backend/src/runtime/server/mcp/cache.ts:20](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/cache.ts#L20)

**`Experimental`**

#### Type Parameters

| Type Parameter |
| ------ |
| `Value` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | \{ `capacity?`: `number`; `now?`: () => `number`; \} |
| `options.capacity?` | `number` |
| `options.now?` | () => `number` |

#### Returns

[`ExchangeCache`](#exchangecache)\<`Value`\>

***

### useBackendMcp()

```ts
function useBackendMcp(event?): BackendMcp;
```

Defined in: [nuxt-backend/src/runtime/server/mcp/index.ts:55](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/index.ts#L55)

**`Experimental`**

The authenticated agent session behind the current MCP request, with
Convex fetchers bound to the user's short-lived JWT — so tool handlers
call deployment functions exactly as that signed-in user (`ctx.auth`,
workspace and billing entity resolution all behave like a web session).

Pass the H3 event where you have it; without one the current request is
read from Nitro's async context (enabled by the module). Throws a 401
H3Error when the request carries no agent session (the MCP gate answers
unauthenticated requests before tools run, so this only trips when called
outside a gated route).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event?` | `H3Event`\<`EventHandlerRequest`\> |

#### Returns

[`BackendMcp`](#backendmcp)

***

### defineBackendMcpTool()

```ts
function defineBackendMcpTool<InputSchema, OutputSchema>(definition): McpToolDefinition<InputSchema, OutputSchema>;
```

Defined in: [nuxt-backend/src/runtime/server/mcp/index.ts:89](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/server/mcp/index.ts#L89)

**`Experimental`**

`defineMcpTool` with the agent-session contract: the tool is hidden from
unauthenticated requests, hidden without the required `scope`, and the
scope is re-checked when the handler runs. Compose extra visibility rules
via the standard `enabled` guard — it runs after the session/scope gate.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `InputSchema` *extends* \| `Readonly`\<\{ \[`k`: `string`\]: `$ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>; \}\> \| `undefined` | `Readonly`\<\{ \[`k`: `string`\]: `$ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>; \}\> |
| `OutputSchema` *extends* `Readonly`\<\{ \[`k`: `string`\]: `$ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>; \}\> | `Readonly`\<\{ \[`k`: `string`\]: `$ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>; \}\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `definition` | [`BackendMcpToolDefinition`](#backendmcptooldefinition)\<`InputSchema`, `OutputSchema`\> |

#### Returns

`McpToolDefinition`\<`InputSchema`, `OutputSchema`\>
