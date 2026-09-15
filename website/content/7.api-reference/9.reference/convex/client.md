---
navigation: true
---

# convex/client

## Interfaces

### AuthMutationCtx

Defined in: [src/convex/client/index.ts:43](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L43)

A DataModel-independent Convex context that can run mutations / queries and
schedule work — what the auth email / rate-limit / lifecycle integrations
receive. Auth email flows execute inside a mutation/action, so the request
ctx is narrowed to one of these. Kept structural (rather than
`GenericMutationCtx<DM>`) so a context for *any* data model is assignable.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="runmutation"></a> `runMutation` | \<`Mutation`\>(`mutation`, ...`args`) => `Promise`\<`FunctionReturnType`\<`Mutation`\>\> | [src/convex/client/index.ts:44](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L44) |
| <a id="runquery"></a> `runQuery` | \<`Query`\>(`query`, ...`args`) => `Promise`\<`FunctionReturnType`\<`Query`\>\> | [src/convex/client/index.ts:45](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L45) |
| <a id="scheduler"></a> `scheduler` | `Scheduler` | [src/convex/client/index.ts:46](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L46) |

***

### AuthEmailMessage

Defined in: [src/convex/client/index.ts:50](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L50)

A single transactional email, as understood by the auth flows.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="to"></a> `to` | `string` | [src/convex/client/index.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L51) |
| <a id="subject"></a> `subject` | `string` | [src/convex/client/index.ts:52](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L52) |
| <a id="html"></a> `html?` | `string` | [src/convex/client/index.ts:53](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L53) |
| <a id="text"></a> `text?` | `string` | [src/convex/client/index.ts:54](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L54) |

***

### AuthRateLimiter

Defined in: [src/convex/client/index.ts:77](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L77)

Guards auth-sensitive flows. Satisfied by `setupRateLimiter(...)` from
`nuxt-backend/rate-limit` (which seeds these named limits).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="limit"></a> `limit` | (`ctx`, `name`, `options?`) => `Promise`\<\{ `ok`: `boolean`; `retryAfter?`: `number`; \}\> | [src/convex/client/index.ts:78](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L78) |

***

### AuthCreatedUser

Defined in: [src/convex/client/index.ts:86](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L86)

The newly-created user passed to [AuthIntegrations.onUserCreated](#onusercreated-1).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | [src/convex/client/index.ts:87](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L87) |
| <a id="email"></a> `email` | `string` | [src/convex/client/index.ts:88](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L88) |
| <a id="name"></a> `name` | `string` | [src/convex/client/index.ts:89](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L89) |

***

### AuthDeletedUser

Defined in: [src/convex/client/index.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L101)

The user just deleted, passed to [AuthIntegrations.onUserDeleted](#onuserdeleted-1).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="id-1"></a> `id` | `string` | [src/convex/client/index.ts:102](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L102) |
| <a id="email-1"></a> `email` | `string` | [src/convex/client/index.ts:103](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L103) |
| <a id="name-1"></a> `name` | `string` | [src/convex/client/index.ts:104](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L104) |

***

### CanSignInInput

Defined in: [src/convex/client/index.ts:129](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L129)

What [CanSignIn](#cansignin) is asked about.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="email-2"></a> `email` | `string` | The address, as Better Auth holds it (lower-cased). | [src/convex/client/index.ts:131](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L131) |
| <a id="isnewuser"></a> `isNewUser` | `boolean` | `true` when no account exists for the address yet. | [src/convex/client/index.ts:133](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L133) |
| <a id="purpose"></a> `purpose` | [`CanSignInPurpose`](#cansigninpurpose) | - | [src/convex/client/index.ts:134](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L134) |

***

### AuthIntegrations

Defined in: [src/convex/client/index.ts:163](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L163)

Cross-component wiring for Better Auth. All optional: with no `email`
transport, OTP requests fail loudly (set `NUXT_BACKEND_LOG_OTP=1` to echo
codes to the console during local dev instead). Provide an `email` transport
to deliver OTP / verification / reset emails, a `rateLimiter` to throttle
OTP sends, `canSignIn` to gate who may sign in or sign up, and
`onUserCreated` / `onUserDeleted` to run side effects (durable workflows,
analytics, erasure) around the account lifecycle.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | `GenericDataModel` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="email-3"></a> `email?` | [`AuthEmailSender`](#authemailsender) | - | [src/convex/client/index.ts:164](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L164) |
| <a id="ratelimiter"></a> `rateLimiter?` | [`AuthRateLimiter`](#authratelimiter) | - | [src/convex/client/index.ts:165](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L165) |
| <a id="onusercreated-1"></a> `onUserCreated?` | [`OnUserCreated`](#onusercreated)\<`DM`\> | - | [src/convex/client/index.ts:166](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L166) |
| <a id="cansignin-1"></a> `canSignIn?` | [`CanSignIn`](#cansignin)\<`DM`\> | Gate sign-in / sign-up (invite-only, allow-list, closed beta). See [CanSignIn](#cansignin). | [src/convex/client/index.ts:168](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L168) |
| <a id="onuserdeleted-1"></a> `onUserDeleted?` | [`OnUserDeleted`](#onuserdeleted)\<`DM`\> | Fired after an account is deleted, after any consumer `afterDelete`. See [OnUserDeleted](#onuserdeleted). | [src/convex/client/index.ts:170](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L170) |
| <a id="emailtemplates"></a> `emailTemplates?` | `Partial`\<[`AuthEmailTemplates`](#authemailtemplates)\> | Override any of the default auth-email templates (welcome/otp/verify/change/delete/invite). | [src/convex/client/index.ts:172](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L172) |
| <a id="welcomeemail"></a> `welcomeEmail?` | `boolean` | Send the packaged welcome email right after signup (default `true`). Set `false` when the app owns onboarding — e.g. a durable email sequence started from `onUserCreated` — so new users don't get two welcomes. | [src/convex/client/index.ts:178](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L178) |

***

### AuthEmailTemplates

Defined in: [src/convex/client/index.ts:254](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L254)

The default transactional auth-email templates, all delivered through the
nested Resend component. Override any of them via
`integrations.emailTemplates` to restyle without replacing the transport.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="otp"></a> `otp` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | OTP code email (sign-in / email-verification / change-email). | [src/convex/client/index.ts:256](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L256) |
| <a id="welcome"></a> `welcome` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | Welcome email sent once, right after a user is created. | [src/convex/client/index.ts:258](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L258) |
| <a id="verify"></a> `verify` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | Email-verification link (when verification is enabled). | [src/convex/client/index.ts:260](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L260) |
| <a id="changeemail"></a> `changeEmail` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | Confirmation sent to the current address when changing email. | [src/convex/client/index.ts:262](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L262) |
| <a id="deleteaccount"></a> `deleteAccount` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | Confirmation link for account deletion. | [src/convex/client/index.ts:264](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L264) |
| <a id="invite"></a> `invite` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | Workspace invitation with an accept link (organization plugin). | [src/convex/client/index.ts:266](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L266) |

***

### McpAuthOptions

Defined in: [src/convex/client/index.ts:421](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L421)

Options for the agent (MCP) OAuth provider — better-auth's `mcp` plugin,
enabled by default. Agents obtain access via dynamic client registration +
the OAuth authorization-code flow (passwordless sign-in resumes through the
`oidc_login_prompt` cookie), all mounted under the auth base path and
reachable on the app origin through the base module's auth proxy.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="scopes"></a> `scopes?` | `string`[] | Extra OAuth scopes on top of BACKEND\_MCP\_SCOPES (identity scopes plus the built-in tool scopes, always offered). | [src/convex/client/index.ts:426](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L426) |
| <a id="loginpage"></a> `loginPage?` | `string` | The app page agents' users sign in on mid-OAuth. Defaults to the built-in login page path; align with `backend.pages.login` / `backend.loginPath` when those are customized. | [src/convex/client/index.ts:432](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L432) |
| <a id="consentpage"></a> `consentPage?` | `string` | Your own consent page path; the plugin's built-in screen when unset. | [src/convex/client/index.ts:434](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L434) |
| <a id="trustedclients"></a> `trustedClients?` | `Client`[] | Pre-registered clients (e.g. first-party agents with `skipConsent`). | [src/convex/client/index.ts:436](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L436) |
| <a id="oidcconfig"></a> `oidcConfig?` | `OIDCOptions` | Advanced OIDC provider passthrough; the options above win over it. | [src/convex/client/index.ts:438](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L438) |

***

### CreateBetterAuthOptions

Defined in: [src/convex/client/index.ts:441](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L441)

#### Extended by

- [`SetupAuthOptions`](#setupauthoptions)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="authconfig"></a> `authConfig?` | `AuthConfig` | Override the default auth config (e.g. to add custom providers) | [src/convex/client/index.ts:443](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L443) |
| <a id="authoptions"></a> `authOptions?` | `BetterAuthOptions` | Override Better Auth options (merged with defaults) | [src/convex/client/index.ts:445](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L445) |
| <a id="basepath"></a> `basePath?` | `string` | Override Better Auth basePath and matching Convex auth route | [src/convex/client/index.ts:447](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L447) |
| <a id="admin"></a> `admin?` | `false` \| `AdminOptions` | Admin plugin options (roles via `adminRoles`/`ac`, ban, impersonation). Enabled by default; pass `false` to disable — a disabled plugin still leaves its (optional) schema fields in place. | [src/convex/client/index.ts:453](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L453) |
| <a id="organization"></a> `organization?` | \| `false` \| `OrganizationOptions` & \{ `personal?`: `boolean`; `invitationPath?`: `string`; \} | Organization (workspace) plugin options. Enabled by default with a personal workspace per user (`personal: true`); pass `false` to disable. | [src/convex/client/index.ts:458](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L458) |
| <a id="mcp"></a> `mcp?` | `false` \| [`McpAuthOptions`](#mcpauthoptions) | Agent (MCP) OAuth provider options. Enabled by default — apps built on this package expose an OAuth-protected MCP endpoint out of the box; pass `false` to disable the provider (and the `/mcp/exchange` token mint). | [src/convex/client/index.ts:464](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L464) |

***

### SetupAuthOptions

Defined in: [src/convex/client/index.ts:467](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L467)

#### Extends

- [`CreateBetterAuthOptions`](#createbetterauthoptions)

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | `GenericDataModel` |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `true`\> | `DefaultAuthSchema` |

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="authconfig-1"></a> `authConfig?` | `AuthConfig` | Override the default auth config (e.g. to add custom providers) | [`CreateBetterAuthOptions`](#createbetterauthoptions).[`authConfig`](#authconfig) | [src/convex/client/index.ts:443](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L443) |
| <a id="authoptions-1"></a> `authOptions?` | `BetterAuthOptions` | Override Better Auth options (merged with defaults) | [`CreateBetterAuthOptions`](#createbetterauthoptions).[`authOptions`](#authoptions) | [src/convex/client/index.ts:445](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L445) |
| <a id="basepath-1"></a> `basePath?` | `string` | Override Better Auth basePath and matching Convex auth route | [`CreateBetterAuthOptions`](#createbetterauthoptions).[`basePath`](#basepath) | [src/convex/client/index.ts:447](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L447) |
| <a id="admin-1"></a> `admin?` | `false` \| `AdminOptions` | Admin plugin options (roles via `adminRoles`/`ac`, ban, impersonation). Enabled by default; pass `false` to disable — a disabled plugin still leaves its (optional) schema fields in place. | [`CreateBetterAuthOptions`](#createbetterauthoptions).[`admin`](#admin) | [src/convex/client/index.ts:453](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L453) |
| <a id="organization-1"></a> `organization?` | \| `false` \| `OrganizationOptions` & \{ `personal?`: `boolean`; `invitationPath?`: `string`; \} | Organization (workspace) plugin options. Enabled by default with a personal workspace per user (`personal: true`); pass `false` to disable. | [`CreateBetterAuthOptions`](#createbetterauthoptions).[`organization`](#organization) | [src/convex/client/index.ts:458](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L458) |
| <a id="mcp-1"></a> `mcp?` | `false` \| [`McpAuthOptions`](#mcpauthoptions) | Agent (MCP) OAuth provider options. Enabled by default — apps built on this package expose an OAuth-protected MCP endpoint out of the box; pass `false` to disable the provider (and the `/mcp/exchange` token mint). | [`CreateBetterAuthOptions`](#createbetterauthoptions).[`mcp`](#mcp) | [src/convex/client/index.ts:464](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L464) |
| <a id="schema-1"></a> `schema?` | `Schema` | Local Better Auth schema for hybrid/local component installs | - | [src/convex/client/index.ts:472](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L472) |
| <a id="verbose"></a> `verbose?` | `boolean` | Enable verbose logs in the Better Auth Convex component client | - | [src/convex/client/index.ts:474](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L474) |
| <a id="integrations"></a> `integrations?` | [`AuthIntegrations`](#authintegrations)\<`DM`\> | Cross-component wiring: an email transport for auth emails, a rate limiter for OTP sends, a `canSignIn` gate, and the `onUserCreated` / `onUserDeleted` lifecycle hooks. See [AuthIntegrations](#authintegrations). | - | [src/convex/client/index.ts:480](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L480) |

***

### AuthSetupComponents

Defined in: [src/convex/client/index.ts:497](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L497)

The component handles the auth setup reads from your generated `components`
object. Pass the whole object — the `backend` key is picked structurally.

`backend` is the package's all-in-one component: its `adapter` module is the
Better Auth CRUD surface, and its `email` module (when present in the
component build) delivers auth OTP / verification / welcome / invitation
emails automatically via `components.backend.email.send`. Without an email
module, OTP delivery no-ops (see [AuthIntegrations](#authintegrations)).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="backend"></a> `backend` | `PublicAuthComponentRef` | [src/convex/client/index.ts:498](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L498) |

## Type Aliases

### AuthEmailSender

```ts
type AuthEmailSender = (ctx, message) => Promise<unknown>;
```

Defined in: [src/convex/client/index.ts:63](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L63)

Sends an auth-related email. By default this is wired automatically to the
`backend` component's email module (`components.backend.email.send`), so
auth OTP / verification / reset email works out of the box — but any
compatible function can be supplied via `integrations.email` to override it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`AuthMutationCtx`](#authmutationctx) |
| `message` | [`AuthEmailMessage`](#authemailmessage) |

#### Returns

`Promise`\<`unknown`\>

***

### AuthRateLimitName

```ts
type AuthRateLimitName = "emailOtp" | "emailOtpGlobal" | "mcp";
```

Defined in: [src/convex/client/index.ts:71](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L71)

The named rate limits the auth flows consult (a subset of the defaults):
OTP sends — per email (`emailOtp`, keyed by a SHA-256 of the address) and
deployment-wide (`emailOtpGlobal`, the backstop against mass probing) —
plus the agent token exchange `setupAuth` wires from the same integrations.

***

### OnUserCreated

```ts
type OnUserCreated<DM> = (ctx, user) => Promise<void>;
```

Defined in: [src/convex/client/index.ts:97](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L97)

Fired once after a user is created — e.g. to kick off a welcome workflow.
Receives the full request ctx (a mutation or action ctx for your data model),
so it can `runMutation`, schedule work, or start a Workflow.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | `GenericDataModel` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `GenericMutationCtx`\<`DM`\> \| `GenericActionCtx`\<`DM`\> |
| `user` | [`AuthCreatedUser`](#authcreateduser) |

#### Returns

`Promise`\<`void`\>

***

### OnUserDeleted

```ts
type OnUserDeleted<DM> = (ctx, user) => Promise<void>;
```

Defined in: [src/convex/client/index.ts:113](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L113)

Fired once after a user account is deleted (the `deleteUser` flow, confirmed
via email when a transport is wired) — e.g. to erase the app's own rows for
that user, or the billing cache via `billing.forgetEntity`. Runs after a
consumer-supplied `user.deleteUser.afterDelete`.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | `GenericDataModel` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `GenericMutationCtx`\<`DM`\> \| `GenericActionCtx`\<`DM`\> |
| `user` | [`AuthDeletedUser`](#authdeleteduser) |

#### Returns

`Promise`\<`void`\>

***

### CanSignInPurpose

```ts
type CanSignInPurpose = "sign-in" | "user-create" | "session";
```

Defined in: [src/convex/client/index.ts:126](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L126)

Where a [CanSignIn](#cansignin) verdict is being asked for:

- `'sign-in'` — an OTP sign-in code was requested for the address, before
  anything is sent. `isNewUser` says whether the address has an account.
- `'user-create'` — an account is about to be created (any path).
  `isNewUser` is always `true`.
- `'session'` — a session is about to be created for an existing account
  (OTP verification, passkey sign-in, …). `isNewUser` is always `false`.

***

### CanSignInVerdict

```ts
type CanSignInVerdict = 
  | true
  | {
  allowed: false;
  message?: string;
};
```

Defined in: [src/convex/client/index.ts:141](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L141)

A [CanSignIn](#cansignin) verdict: `true` to allow, or a refusal with an optional
message shown to the user (default: "Sign-in is by invitation right now.").

***

### CanSignIn

```ts
type CanSignIn<DM> = (ctx, input) => Promise<CanSignInVerdict>;
```

Defined in: [src/convex/client/index.ts:151](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L151)

Gate sign-in and account creation — e.g. an invite-only launch, an
allow-list, or a closed beta. Consulted (with the full request ctx, so it
can query the app's own tables) at three points: before an OTP is sent for
a sign-in request, before any account is created, and before a session is
created for an existing account. A refusal surfaces as a `FORBIDDEN`
`APIError` with the verdict's message — `useLoginFlow().error` shows it.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | `GenericDataModel` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `GenericMutationCtx`\<`DM`\> \| `GenericActionCtx`\<`DM`\> |
| `input` | [`CanSignInInput`](#cansignininput) |

#### Returns

`Promise`\<[`CanSignInVerdict`](#cansigninverdict)\>

***

### AdminPluginOptions

```ts
type AdminPluginOptions = Parameters<typeof admin>[0];
```

Defined in: [src/convex/client/index.ts:391](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L391)

Options for the bundled admin plugin (roles, permissions, ban, impersonation).

***

### OrganizationPluginOptions

```ts
type OrganizationPluginOptions = Parameters<typeof organization>[0] & {
  personal?: boolean;
  invitationPath?: string;
};
```

Defined in: [src/convex/client/index.ts:406](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L406)

Options for the bundled organization plugin (workspaces), plus:

- `personal` — when `true` (the default), a personal workspace is
  auto-created on a user's first sign-in and set active, so
  `activeOrganizationId` is never null.
- `invitationPath` — the app page invitation emails link to (default
  `/accept-invitation`, registered automatically by the Nuxt module). The
  emailed URL is `{SITE_URL}{invitationPath}?id=<invitationId>`.
  ⚠ Declared in two places by necessity: keep it aligned with the Nuxt
  side's `backend.pages.acceptInvitation` (nuxt.config) — a mismatch 404s
  invitees, and `nuxt-backend doctor` cross-checks both.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `personal?` | `boolean` | [src/convex/client/index.ts:407](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L407) |
| `invitationPath?` | `string` | [src/convex/client/index.ts:408](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L408) |

## Variables

### defaultEmailTemplates

```ts
const defaultEmailTemplates: AuthEmailTemplates;
```

Defined in: [src/convex/client/index.ts:283](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L283)

The packaged default auth-email templates (OTP, welcome, verify,
change-email, delete-account, invite) — minimal, dependency-free HTML/text.
Exported so apps can preview them (e.g. the playground's email-templates
page) or reuse individual builders inside `integrations.emailTemplates`
overrides.

## Functions

### createBetterAuthOptions()

```ts
function createBetterAuthOptions<DM>(
   database, 
   options?, 
   runtime?): {
  appName?: string;
  baseURL?: BaseURLConfig;
  secret?: string;
  secrets?: {
     version: number;
     value: string;
  }[];
  secondaryStorage?: SecondaryStorage;
  emailVerification?: {
     sendVerificationEmail?: (data, request?) => Promise<void>;
     sendOnSignUp?: boolean;
     sendOnSignIn?: boolean;
     autoSignInAfterVerification?: boolean;
     expiresIn?: number;
     beforeEmailVerification?: (user, request?) => Promise<void>;
     afterEmailVerification?: (user, request?) => Promise<void>;
  };
  socialProviders?: SocialProviders;
  session?: BetterAuthDBOptions<"session", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "id"
     | "expiresAt"
     | "token"
     | "ipAddress"
     | "userAgent"> & {
     expiresIn?: number;
     updateAge?: number;
     disableSessionRefresh?: boolean;
     deferSessionRefresh?: boolean;
     storeSessionInDatabase?: boolean;
     preserveSessionInDatabase?: boolean;
     cookieCache?: {
        maxAge?: number;
        enabled?: boolean;
        strategy?: "compact" | "jwt" | "jwe";
        refreshCache?:   | boolean
           | {
           updateAge?: number;
         };
        version?:   | string
           | ((session, user) => string)
           | ((session, user) => Promise<string>);
     };
     freshAge?: number;
  };
  account?: BetterAuthDBOptions<"account", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "id"
     | "password"
     | "accountId"
     | "providerId"
     | "accessToken"
     | "refreshToken"
     | "idToken"
     | "accessTokenExpiresAt"
     | "refreshTokenExpiresAt"
     | "scope"> & {
     updateAccountOnSignIn?: boolean;
     accountLinking?: {
        enabled?: boolean;
        disableImplicitLinking?: boolean;
        requireLocalEmailVerified?: boolean;
        trustedProviders?:   | LiteralUnion<
           | "github"
           | "apple"
           | "atlassian"
           | "cognito"
           | "discord"
           | "facebook"
           | "figma"
           | "microsoft"
           | "google"
           | "huggingface"
           | "slack"
           | "spotify"
           | "twitch"
           | "twitter"
           | "dropbox"
           | "kick"
           | "linear"
           | "linkedin"
           | "gitlab"
           | "tiktok"
           | "reddit"
           | "roblox"
           | "salesforce"
           | "vk"
           | "zoom"
           | "notion"
           | "kakao"
           | "naver"
           | "line"
           | "paybin"
           | "paypal"
           | "polar"
           | "railway"
           | "vercel"
           | "wechat"
           | "email-password", string>[]
           | ((request?) => Awaitable<LiteralUnion<..., ...>[]>);
        allowDifferentEmails?: boolean;
        allowUnlinkingAll?: boolean;
        updateUserInfoOnLink?: boolean;
     };
     encryptOAuthTokens?: boolean;
     skipStateCookieCheck?: boolean;
     storeStateStrategy?: "database" | "cookie";
     storeAccountCookie?: boolean;
  };
  verification?: BetterAuthDBOptions<"verification", "value" | "createdAt" | "updatedAt" | "id" | "expiresAt" | "identifier"> & {
     disableCleanup?: boolean;
     storeIdentifier?:   | StoreIdentifierOption
        | {
        default: StoreIdentifierOption;
        overrides?: Record<string, StoreIdentifierOption>;
      };
     storeInDatabase?: boolean;
  };
  trustedOrigins?:   | string[]
     | ((request?) => Awaitable<(string | null | undefined)[]>);
  rateLimit?: BetterAuthRateLimitOptions;
  advanced?: BetterAuthAdvancedOptions;
  logger?: Logger;
  databaseHooks?: {
     user?: {
        create?: {
           before?: (user, context) => Promise<... | ... | ... | ...>;
           after?: (user, context) => Promise<void>;
        };
        update?: {
           before?: (user, context) => Promise<... | ... | ... | ...>;
           after?: (user, context) => Promise<void>;
        };
        delete?: {
           before?: (user, context) => Promise<... | ... | ...>;
           after?: (user, context) => Promise<void>;
        };
     };
     session?: {
        create?: {
           before?: (session, context) => Promise<... | ... | ... | ...>;
           after?: (session, context) => Promise<void>;
        };
        update?: {
           before?: (session, context) => Promise<... | ... | ... | ...>;
           after?: (session, context) => Promise<void>;
        };
        delete?: {
           before?: (session, context) => Promise<... | ... | ...>;
           after?: (session, context) => Promise<void>;
        };
     };
     account?: {
        create?: {
           before?: (account, context) => Promise<... | ... | ... | ...>;
           after?: (account, context) => Promise<void>;
        };
        update?: {
           before?: (account, context) => Promise<... | ... | ... | ...>;
           after?: (account, context) => Promise<void>;
        };
        delete?: {
           before?: (account, context) => Promise<... | ... | ...>;
           after?: (account, context) => Promise<void>;
        };
     };
     verification?: {
        create?: {
           before?: (verification, context) => Promise<... | ... | ... | ...>;
           after?: (verification, context) => Promise<void>;
        };
        update?: {
           before?: (verification, context) => Promise<... | ... | ... | ...>;
           after?: (verification, context) => Promise<void>;
        };
        delete?: {
           before?: (verification, context) => Promise<... | ... | ...>;
           after?: (verification, context) => Promise<void>;
        };
     };
  };
  onAPIError?: {
     throw?: boolean;
     onError?: (error, ctx) => void | Promise<void>;
     errorURL?: string;
     customizeDefaultErrorPage?: {
        colors?: {
           background?: string;
           foreground?: string;
           primary?: string;
           primaryForeground?: string;
           mutedForeground?: string;
           border?: string;
           destructive?: string;
           titleBorder?: string;
           titleColor?: string;
           gridColor?: string;
           cardBackground?: string;
           cornerBorder?: string;
        };
        size?: {
           radiusSm?: string;
           radiusMd?: string;
           radiusLg?: string;
           textSm?: string;
           text2xl?: string;
           text4xl?: string;
           text6xl?: string;
        };
        font?: {
           defaultFamily?: string;
           monoFamily?: string;
        };
        disableTitleBorder?: boolean;
        disableCornerDecorations?: boolean;
        disableBackgroundGrid?: boolean;
     };
  };
  hooks?: {
     before?: (inputContext) => Promise<unknown>;
     after?: (inputContext) => Promise<unknown>;
  };
  disabledPaths?: string[];
  telemetry?: {
     enabled?: boolean;
     debug?: boolean;
  };
  experimental?: {
     joins?: boolean;
  };
  basePath: string;
  database: AdapterFactory<BetterAuthOptions>;
  emailAndPassword: {
     disableSignUp?: boolean;
     requireEmailVerification?: boolean;
     maxPasswordLength?: number;
     minPasswordLength?: number;
     sendResetPassword?: (data, request?) => Promise<void>;
     resetPasswordTokenExpiresIn?: number;
     onPasswordReset?: (data, request?) => Promise<void>;
     password?: {
        hash?: (password) => Promise<string>;
        verify?: (data) => Promise<boolean>;
     };
     autoSignIn?: boolean;
     revokeSessionsOnPasswordReset?: boolean;
     onExistingUserSignUp?: (data, request?) => Promise<void>;
     customSyntheticUser?: (params) => Record<string, unknown>;
     enabled: boolean;
  };
  user: {
     modelName?: "user" | LiteralString;
     fields?: Partial<Record<"createdAt" | "updatedAt" | "email" | "emailVerified" | "name" | "image", string>>;
     additionalFields?: {
      [key: string]: DBFieldAttribute;
     };
     changeEmail?: {
        enabled: boolean;
        sendChangeEmailConfirmation?: (data, request?) => Promise<void>;
        updateEmailWithoutVerification?: boolean;
     };
     deleteUser?: {
        enabled?: boolean;
        sendDeleteAccountVerification?: (data, request?) => Promise<void>;
        beforeDelete?: (user, request?) => Promise<void>;
        afterDelete?: (user, request?) => Promise<void>;
        deleteTokenExpiresIn?: number;
     };
  };
  plugins: [{
     id: "convex";
     version: string;
     init: (ctx) => void;
     hooks: {
        before: (
           | {
           matcher: boolean;
           handler: (inputContext) => Promise<
              | {
              context: ...;
            }
             | undefined>;
         }
           | {
           matcher: (ctx) => boolean;
           handler: (inputContext) => Promise<{
              context: MiddlewareContext<..., ...>;
           }>;
        })[];
        after: {
           matcher: (context) => boolean;
           handler: (inputContext) => Promise<unknown>;
        }[];
     };
     endpoints: {
        getOpenIdConfig: StrictEndpoint<"/convex/.well-known/openid-configuration", {
           method: "GET";
           metadata: {
              isAction: false;
           };
        }, OIDCMetadata>;
        getJwks: StrictEndpoint<"/convex/jwks", {
           method: "GET";
           metadata: {
              openapi: {
                 description: string;
                 responses: {
                    200: {
                       description: string;
                       content: {
                          application/json: ...;
                       };
                    };
                 };
              };
           };
        }, JSONWebKeySet>;
        getLatestJwks: StrictEndpoint<"/convex/latest-jwks", {
           isAction: boolean;
           method: "POST";
           metadata: {
              SERVER_ONLY: true;
              openapi: {
                 description: string;
              };
           };
        }, any[]>;
        rotateKeys: StrictEndpoint<"/convex/rotate-keys", {
           isAction: boolean;
           method: "POST";
           metadata: {
              SERVER_ONLY: true;
              openapi: {
                 description: string;
              };
           };
        }, any[]>;
        getToken: StrictEndpoint<"/convex/token", {
           method: "GET";
           requireHeaders: true;
           use: (inputContext) => Promise<{
              session: {
                 session: ...;
                 user: ...;
              };
           }>[];
           metadata: {
              openapi: {
                 description: string;
                 responses: {
                    200: {
                       description: string;
                       content: {
                          application/json: ...;
                       };
                    };
                 };
              };
           };
         }, {
           token: string;
        }>;
     };
     schema: {
        jwks: {
           fields: {
              publicKey: {
                 type: "string";
                 required: true;
              };
              privateKey: {
                 type: "string";
                 required: true;
              };
              createdAt: {
                 type: "date";
                 required: true;
              };
              expiresAt: {
                 type: "date";
                 required: false;
              };
           };
        };
        user: {
           fields: {
              userId: {
                 type: "string";
                 required: false;
                 input: false;
              };
           };
        };
     };
  }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void>)[]; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { status: boolean; token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> } | { status: boolean; token: null; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ZodString; otp: ZodString; name: ZodOptional<(...)>; image: ZodOptional<(...)> }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<ZodString> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ZodOptional<(...)>; name: ZodOptional<(...)>; context: ZodOptional<(...)> }, $strip>>; metadata: { openapi: { operationId: string; description: string; parameters: { name: ...; in: ...; required: ...; description: ...; schema: ... }[]; responses: { 200: { description: ...; content: ... } } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<ZodString> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... }; 400: { description: ... } } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<ZodAny, ZodAny> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } }; $Infer: { body: { response: AuthenticationResponseJSON } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>) | ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>))[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>) | ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>))[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined } | { id: "admin"; version: string; init: any; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<(...)[] | undefined> }[] }; endpoints: { setRole: StrictEndpoint<"/admin/set-role", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown>; role: ZodUnion<readonly [(...), (...)]> }, $strip>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } }; $Infer: { body: { userId: string; role: (...) | (...) | (...) } } } }, { user: UserWithRole }>; getUser: StrictEndpoint<"/admin/get-user", { method: "GET"; query: ZodObject<{ id: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, UserWithRole>; createUser: StrictEndpoint<"/admin/create-user", { method: "POST"; body: ZodObject<{ email: ZodString; password: ZodOptional<ZodString>; name: ZodString; role: ZodOptional<ZodUnion<(...)>>; data: ZodOptional<ZodRecord<(...), (...)>> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } }; $Infer: { body: { email: string; password?: (...) | (...); name: string; role?: (...) | (...) | (...) | (...); data?: (...) | (...) } } } }, { user: UserWithRole }>; adminUpdateUser: StrictEndpoint<"/admin/update-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown>; data: ZodRecord<ZodAny, ZodAny> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, UserWithRole>; listUsers: StrictEndpoint<"/admin/list-users", { method: "GET"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; query: ZodObject<{ searchValue: ZodOptional<ZodString>; searchField: ZodOptional<ZodEnum<(...)>>; searchOperator: ZodOptional<ZodEnum<(...)>>; limit: ZodOptional<ZodUnion<(...)>>; offset: ZodOptional<ZodUnion<(...)>>; sortBy: ZodOptional<ZodString>; sortDirection: ZodOptional<ZodEnum<(...)>>; filterField: ZodOptional<ZodString>; filterValue: ZodOptional<ZodUnion<(...)>>; filterOperator: ZodOptional<ZodEnum<(...)>> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { users: UserWithRole[]; total: number }>; listUserSessions: StrictEndpoint<"/admin/list-user-sessions", { method: "POST"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; body: ZodObject<{ userId: ZodCoercedString<unknown> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { sessions: SessionWithImpersonatedBy[] }>; unbanUser: StrictEndpoint<"/admin/unban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { user: UserWithRole }>; banUser: StrictEndpoint<"/admin/ban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown>; banReason: ZodOptional<ZodString>; banExpiresIn: ZodOptional<ZodNumber> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { user: UserWithRole }>; impersonateUser: StrictEndpoint<"/admin/impersonate-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: UserWithRole }>; stopImpersonating: StrictEndpoint<"/admin/stop-impersonating", { method: "POST"; requireHeaders: true }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null } & Record<string, any>; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } & Record<string, any> }>; revokeUserSession: StrictEndpoint<"/admin/revoke-user-session", { method: "POST"; body: ZodObject<{ sessionToken: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; revokeUserSessions: StrictEndpoint<"/admin/revoke-user-sessions", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; removeUser: StrictEndpoint<"/admin/remove-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; setUserPassword: StrictEndpoint<"/admin/set-user-password", { method: "POST"; body: ZodObject<{ newPassword: ZodString; userId: ZodCoercedString<unknown> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { status: boolean }>; userHasPermission: StrictEndpoint<"/admin/has-permission", { method: "POST"; body: ZodIntersection<ZodObject<{ userId: ZodOptional<(...)>; role: ZodOptional<(...)> }, $strip>, ZodXor<readonly [ZodObject<(...), (...)>, ZodObject<(...), (...)>]>>; metadata: { openapi: { description: string; requestBody: { content: { application/json: ... } }; responses: { 200: { description: ...; content: ... } } }; $Infer: { body: { permissions: ... } & { userId?: ...; role?: ... } } } }, { error: null; success: boolean }> }; $ERROR_CODES: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: RawError<"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL">; FAILED_TO_CREATE_USER: RawError<"FAILED_TO_CREATE_USER">; USER_ALREADY_EXISTS: RawError<"USER_ALREADY_EXISTS">; YOU_CANNOT_BAN_YOURSELF: RawError<"YOU_CANNOT_BAN_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: RawError<"YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE">; YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_BAN_USERS">; YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD">; BANNED_USER: RawError<"BANNED_USER">; YOU_ARE_NOT_ALLOWED_TO_GET_USER: RawError<"YOU_ARE_NOT_ALLOWED_TO_GET_USER">; NO_DATA_TO_UPDATE: RawError<"NO_DATA_TO_UPDATE">; YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS">; YOU_CANNOT_REMOVE_YOURSELF: RawError<"YOU_CANNOT_REMOVE_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE">; YOU_CANNOT_IMPERSONATE_ADMINS: RawError<"YOU_CANNOT_IMPERSONATE_ADMINS">; INVALID_ROLE_TYPE: RawError<"INVALID_ROLE_TYPE">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL">; PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: RawError<"PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER"> }; schema: { user: { fields: { role: { type: "string"; required: false; input: false }; banned: { type: "boolean"; defaultValue: false; required: false; input: false }; banReason: { type: "string"; required: false; input: false }; banExpires: { type: "date"; required: false; input: false } } }; session: { fields: { impersonatedBy: { type: "string"; required: false; input: false } } } }; options: NoInfer<AdminOptions> } | DefaultOrganizationPlugin<{ allowUserToCreateOrganization?: boolean | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } & Record<string, any>) => Awaitable<boolean>); organizationLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } & Record<string, any>) => Awaitable<boolean>); creatorRole?: string; membershipLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null }, organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: any; createdAt: Date }) => number | Promise<number>); ac?: AccessControl; roles?: { [key: string]: Role<any> | undefined }; dynamicAccessControl?: { enabled?: boolean; maximumRolesPerOrganization?: number | ((organizationId: string) => Awaitable<number>) }; teams?: { enabled: boolean; defaultTeam?: { enabled: boolean; customCreateDefaultTeam?: (organization: ..., ctx?: ...) => ... }; maximumTeams?: number | ((data: { organizationId: string; session: (...) | (...) }, ctx?: GenericEndpointContext) => Awaitable<number>); maximumMembersPerTeam?: number | ((data: { teamId: string; session: { user: ...; session: ... }; organizationId: string }) => Awaitable<number>); allowRemovingAllTeams?: boolean }; invitationExpiresIn?: number; invitationLimit?: number | ((data: { user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any>; organization: { id: string; name: string; slug: string; logo?: (...) | (...) | (...); metadata?: any; createdAt: Date } & Record<string, any>; member: { id: string; organizationId: string; userId: string; role: string; createdAt: Date } & Record<string, any> }, ctx: AuthContext) => Awaitable<number>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: { id: string; role: string; email: string; organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: any; createdAt: Date }; invitation: { id: string; organizationId: string; email: string; role: string; status: "pending" | "accepted" | "rejected" | "canceled"; teamId?: string | null; inviterId: string; expiresAt: Date; createdAt: Date }; inviter: { id: string; organizationId: string; userId: string; role: string; createdAt: Date } & { user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } } }, request?: Request) => Promise<void>; schema?: { session?: { fields?: { activeOrganizationId?: ...; activeTeamId?: ... } }; organization?: { modelName?: string; fields?: { name?: ...; slug?: ...; logo?: ...; metadata?: ...; createdAt?: ... }; additionalFields?: { [key: ...]: ... } }; member?: { modelName?: string; fields?: { organizationId?: ...; userId?: ...; role?: ...; createdAt?: ... }; additionalFields?: { [key: ...]: ... } }; invitation?: { modelName?: string; fields?: { organizationId?: ...; email?: ...; role?: ...; status?: ...; teamId?: ...; inviterId?: ...; expiresAt?: ...; createdAt?: ... }; additionalFields?: { [key: ...]: ... } }; team?: { modelName?: string; fields?: { name?: ...; organizationId?: ...; createdAt?: ...; updatedAt?: ... }; additionalFields?: { [key: ...]: ... } }; teamMember?: { modelName?: string; fields?: { teamId?: ...; userId?: ...; createdAt?: ... } }; organizationRole?: { modelName?: string; fields?: { organizationId?: ...; role?: ...; permission?: ...; createdAt?: ...; updatedAt?: ... }; additionalFields?: { [key: ...]: ... } } }; disableOrganizationDeletion?: boolean; organizationHooks?: { beforeCreateOrganization?: (data: { organization: { name?: ...; slug?: ...; logo?: ...; metadata?: ...; [key: ...]: ... }; user: (...) & (...) }) => Promise<(...) | (...)>; afterCreateOrganization?: (data: { organization: (...) & (...); member: (...) & (...); user: (...) & (...) }) => Promise<void>; beforeUpdateOrganization?: (data: { organization: { name?: ...; slug?: ...; logo?: ...; metadata?: ...; [key: ...]: ... }; user: (...) & (...); member: (...) & (...) }) => Promise<(...) | (...)>; afterUpdateOrganization?: (data: { organization: (...) | (...); user: (...) & (...); member: (...) & (...) }) => Promise<void>; beforeDeleteOrganization?: (data: { organization: (...) & (...); user: (...) & (...) }, ctx?: GenericEndpointContext) => Promise<void>; afterDeleteOrganization?: (data: { organization: (...) & (...); user: (...) & (...) }, ctx?: GenericEndpointContext) => Promise<void>; beforeAddMember?: (data: { member: { userId: ...; organizationId: ...; role: ...; [key: ...]: ... }; user: (...) & (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterAddMember?: (data: { member: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeRemoveMember?: (data: { member: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; afterRemoveMember?: (data: { member: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeUpdateMemberRole?: (data: { member: (...) & (...); newRole: string; user: (...) & (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterUpdateMemberRole?: (data: { member: (...) & (...); previousRole: string; user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeCreateInvitation?: (data: { invitation: { email: ...; role: ...; organizationId: ...; inviterId: ...; teamId?: ...; [key: ...]: ... }; inviter: (...) & (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterCreateInvitation?: (data: { invitation: (...) & (...); inviter: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeAcceptInvitation?: (data: { invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; afterAcceptInvitation?: (data: { invitation: (...) & (...); member: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeRejectInvitation?: (data: { invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; afterRejectInvitation?: (data: { invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeCancelInvitation?: (data: { invitation: (...) & (...); cancelledBy: (...) & (...); organization: (...) & (...) }) => Promise<void>; afterCancelInvitation?: (data: { invitation: (...) & (...); cancelledBy: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeCreateTeam?: (data: { team: { name: ...; organizationId: ...; [key: ...]: ... }; user?: (...) | (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterCreateTeam?: (data: { team: (...) & (...); user?: (...) | (...); organization: (...) & (...) }) => Promise<void>; beforeUpdateTeam?: (data: { team: (...) & (...); updates: { name?: ...; [key: ...]: ... }; user: (...) & (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterUpdateTeam?: (data: { team: (...) | (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeDeleteTeam?: (data: { team: (...) & (...); user?: (...) | (...); organization: (...) & (...) }) => Promise<void>; afterDeleteTeam?: (data: { team: (...) & (...); user?: (...) | (...); organization: (...) & (...) }) => Promise<void>; beforeAddTeamMember?: (data: { teamMember: { teamId: ...; userId: ...; [key: ...]: ... }; team: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterAddTeamMember?: (data: { teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeRemoveTeamMember?: (data: { teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; afterRemoveTeamMember?: (data: { teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void> } }>)[]];
};
```

Defined in: [src/convex/client/index.ts:698](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L698)

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | `GenericDataModel` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `database` | `AdapterFactory`\<`BetterAuthOptions`\> |
| `options` | [`CreateBetterAuthOptions`](#createbetterauthoptions) |
| `runtime?` | `AuthRuntime`\<`DM`\> |

#### Returns

| Name | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| `appName?` | `string` | - | The name of your application. Used as a display name in contexts where your app needs to be identified — for example, as the default issuer name in authenticator apps when users set up 2FA/TOTP. Can also be set via the `APP_NAME` environment variable. **Default** `"Better Auth"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:372 |
| `baseURL?` | `BaseURLConfig` | - | Base URL for the Better Auth. This is typically the root URL where your application server is hosted. Can be configured as: - A static string: `"https://myapp.com"` - A dynamic config with allowed hosts for multi-domain deployments If not explicitly set, the system will check environment variables: `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, etc. **Example** `// Static URL baseURL: "https://myapp.com" // Dynamic with allowed hosts (for Vercel, multi-domain, etc.) baseURL: { allowedHosts: ["myapp.com", "*.vercel.app", "preview-*.myapp.com"], fallback: "https://myapp.com" }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:396 |
| `secret?` | `string` | - | The secret to use for encryption, signing and hashing. By default Better Auth will look for the following environment variables: process.env.BETTER_AUTH_SECRET, process.env.AUTH_SECRET If none of these environment variables are set, it will default to "better-auth-secret-123456789". on production if it's not set it will throw an error. you can generate a good secret using the following command: **Example** `openssl rand -base64 32` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:428 |
| `secrets?` | \{ `version`: `number`; `value`: `string`; \}[] | - | Versioned secrets for non-destructive secret rotation. When set, encryption uses an envelope format with key IDs. First entry is the current key used for new encryption. Remaining entries are decryption-only (previous rotations). Can also be set via BETTER_AUTH_SECRETS env var: `BETTER_AUTH_SECRETS=2:base64secret,1:base64secret` When set, `secret` is only used as legacy fallback for decrypting bare-hex payloads that predate the envelope format. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:441 |
| `secondaryStorage?` | `SecondaryStorage` | - | Secondary storage configuration This is used to store session and rate limit data. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:506 |
| `emailVerification?` | \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \} | - | Email verification configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:510 |
| `emailVerification.sendVerificationEmail()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:516 |
| `emailVerification.sendOnSignUp?` | `boolean` | - | Send a verification email automatically after sign up. - `true`: Always send verification email on sign up - `false`: Never send verification email on sign up - `undefined`: Follows `requireEmailVerification` behavior **Default** `undefined` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:542 |
| `emailVerification.sendOnSignIn?` | `boolean` | - | Send a verification email automatically on sign in when the user's email is not verified **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:549 |
| `emailVerification.autoSignInAfterVerification?` | `boolean` | - | Auto signin the user after they verify their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:553 |
| `emailVerification.expiresIn?` | `number` | - | Number of seconds the verification token is valid for. **Default** `3600 seconds (1 hour)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:559 |
| `emailVerification.beforeEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user verifies their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:565 |
| `emailVerification.afterEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called when a user's email is updated to verified | node\_modules/@better-auth/core/dist/types/init-options.d.mts:571 |
| `socialProviders?` | `SocialProviders` | - | list of social providers | node\_modules/@better-auth/core/dist/types/init-options.d.mts:725 |
| `session?` | `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"compact"` \| `"jwt"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: `number`; \}; `version?`: \| `string` \| ((`session`, `user`) => `string`) \| ((`session`, `user`) => `Promise`\<`string`\>); \}; `freshAge?`: `number`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:800 |
| `account?` | `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: \| `LiteralUnion`\< \| `"github"` \| `"apple"` \| `"atlassian"` \| `"cognito"` \| `"discord"` \| `"facebook"` \| `"figma"` \| `"microsoft"` \| `"google"` \| `"huggingface"` \| `"slack"` \| `"spotify"` \| `"twitch"` \| `"twitter"` \| `"dropbox"` \| `"kick"` \| `"linear"` \| `"linkedin"` \| `"gitlab"` \| `"tiktok"` \| `"reddit"` \| `"roblox"` \| `"salesforce"` \| `"vk"` \| `"zoom"` \| `"notion"` \| `"kakao"` \| `"naver"` \| `"line"` \| `"paybin"` \| `"paypal"` \| `"polar"` \| `"railway"` \| `"vercel"` \| `"wechat"` \| `"email-password"`, `string`\>[] \| ((`request?`) => `Awaitable`\<`LiteralUnion`\<..., ...\>[]\>); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:928 |
| `verification?` | `BetterAuthDBOptions`\<`"verification"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>; \}; `storeInDatabase?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1068 |
| `trustedOrigins?` | \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>) | - | Additional trusted origins. By default, Better Auth trusts your app's [baseURL](#createbetterauthoptions-3). Use this option to allow additional origins (e.g. a separate frontend domain). Can be a static array, a function that returns origins dynamically, or use wildcard patterns (e.g. `"https://*.example.com"`). **Param** **request** The request object. It'll be undefined if no request was made. Like during a create context call or `auth.api` call. Trusted origins will be dynamically calculated based on the request. **Example** `trustedOrigins: async (request) => { return [ "https://better-auth.com", "https://*.better-auth.com", request.headers.get("x-custom-origin") ]; }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1119 |
| `rateLimit?` | `BetterAuthRateLimitOptions` | - | Rate limiting configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1123 |
| `advanced?` | `BetterAuthAdvancedOptions` | - | Advanced options | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1127 |
| `logger?` | `Logger` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1128 |
| `databaseHooks?` | \{ `user?`: \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; \}; `session?`: \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; \}; `account?`: \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; \}; `verification?`: \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; \}; \} | - | allows you to define custom hooks that can be executed during lifecycle of core database operations. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1134 |
| `databaseHooks.user?` | \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; \} | - | User hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1138 |
| `databaseHooks.user.create?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1139 |
| `databaseHooks.user.create.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is created. if the hook returns false, the user will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1145 |
| `databaseHooks.user.create.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1151 |
| `databaseHooks.user.update?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1153 |
| `databaseHooks.user.update.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is updated. if the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1159 |
| `databaseHooks.user.update.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1165 |
| `databaseHooks.user.delete?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1167 |
| `databaseHooks.user.delete.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a user is deleted. if the hook returns false, the user will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1172 |
| `databaseHooks.user.delete.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1176 |
| `databaseHooks.session?` | \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; \} | - | Session Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1182 |
| `databaseHooks.session.create?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1183 |
| `databaseHooks.session.create.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a session is created. if the hook returns false, the session will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1189 |
| `databaseHooks.session.create.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1195 |
| `databaseHooks.session.update?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1200 |
| `databaseHooks.session.update.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is updated. if the hook returns false, the session will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1206 |
| `databaseHooks.session.update.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1212 |
| `databaseHooks.session.delete?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1214 |
| `databaseHooks.session.delete.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a session is deleted. if the hook returns false, the session will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1219 |
| `databaseHooks.session.delete.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1223 |
| `databaseHooks.account?` | \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; \} | - | Account Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1229 |
| `databaseHooks.account.create?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1230 |
| `databaseHooks.account.create.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a account is created. If the hook returns false, the account will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1236 |
| `databaseHooks.account.create.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a account is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1242 |
| `databaseHooks.account.update?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1247 |
| `databaseHooks.account.update.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a account is update. If the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1253 |
| `databaseHooks.account.update.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a account is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1259 |
| `databaseHooks.account.delete?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1261 |
| `databaseHooks.account.delete.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before an account is deleted. if the hook returns false, the account will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1266 |
| `databaseHooks.account.delete.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after an account is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1270 |
| `databaseHooks.verification?` | \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; \} | - | Verification Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1276 |
| `databaseHooks.verification.create?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1277 |
| `databaseHooks.verification.create.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a verification is created. if the hook returns false, the verification will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1283 |
| `databaseHooks.verification.create.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1289 |
| `databaseHooks.verification.update?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1291 |
| `databaseHooks.verification.update.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a verification is updated. if the hook returns false, the verification will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1297 |
| `databaseHooks.verification.update.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1303 |
| `databaseHooks.verification.delete?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1305 |
| `databaseHooks.verification.delete.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a verification is deleted. if the hook returns false, the verification will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1310 |
| `databaseHooks.verification.delete.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1314 |
| `onAPIError?` | \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \} | - | API error handling | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1321 |
| `onAPIError.throw?` | `boolean` | - | Throw an error on API error **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1327 |
| `onAPIError.onError()?` | (`error`, `ctx`) => `void` \| `Promise`\<`void`\> | - | Custom error handler | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1334 |
| `onAPIError.errorURL?` | `string` | - | The URL to redirect to on error When errorURL is provided, the error will be added to the URL as a query parameter and the user will be redirected to the errorURL. **Default** `- "/api/auth/error"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1343 |
| `onAPIError.customizeDefaultErrorPage?` | \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \} | - | Configure the default error page provided by Better-Auth Start your dev server and go to /api/auth/error to see the error page. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1348 |
| `onAPIError.customizeDefaultErrorPage.colors?` | \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1349 |
| `onAPIError.customizeDefaultErrorPage.colors.background?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1350 |
| `onAPIError.customizeDefaultErrorPage.colors.foreground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1351 |
| `onAPIError.customizeDefaultErrorPage.colors.primary?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1352 |
| `onAPIError.customizeDefaultErrorPage.colors.primaryForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1353 |
| `onAPIError.customizeDefaultErrorPage.colors.mutedForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1354 |
| `onAPIError.customizeDefaultErrorPage.colors.border?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1355 |
| `onAPIError.customizeDefaultErrorPage.colors.destructive?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1356 |
| `onAPIError.customizeDefaultErrorPage.colors.titleBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1357 |
| `onAPIError.customizeDefaultErrorPage.colors.titleColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1358 |
| `onAPIError.customizeDefaultErrorPage.colors.gridColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1359 |
| `onAPIError.customizeDefaultErrorPage.colors.cardBackground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1360 |
| `onAPIError.customizeDefaultErrorPage.colors.cornerBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1361 |
| `onAPIError.customizeDefaultErrorPage.size?` | \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1363 |
| `onAPIError.customizeDefaultErrorPage.size.radiusSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1364 |
| `onAPIError.customizeDefaultErrorPage.size.radiusMd?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1365 |
| `onAPIError.customizeDefaultErrorPage.size.radiusLg?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1366 |
| `onAPIError.customizeDefaultErrorPage.size.textSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1367 |
| `onAPIError.customizeDefaultErrorPage.size.text2xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1368 |
| `onAPIError.customizeDefaultErrorPage.size.text4xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1369 |
| `onAPIError.customizeDefaultErrorPage.size.text6xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1370 |
| `onAPIError.customizeDefaultErrorPage.font?` | \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1372 |
| `onAPIError.customizeDefaultErrorPage.font.defaultFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1373 |
| `onAPIError.customizeDefaultErrorPage.font.monoFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1374 |
| `onAPIError.customizeDefaultErrorPage.disableTitleBorder?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1376 |
| `onAPIError.customizeDefaultErrorPage.disableCornerDecorations?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1377 |
| `onAPIError.customizeDefaultErrorPage.disableBackgroundGrid?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1378 |
| `hooks?` | \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \} | - | Hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1384 |
| `hooks.before()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | Before a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1388 |
| `hooks.after()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | After a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1392 |
| `disabledPaths?` | `string`[] | - | Disabled paths Paths you want to disable. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1399 |
| `telemetry?` | \{ `enabled?`: `boolean`; `debug?`: `boolean`; \} | - | Telemetry configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1403 |
| `telemetry.enabled?` | `boolean` | - | Enable telemetry collection **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1409 |
| `telemetry.debug?` | `boolean` | - | Enable debug mode **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1415 |
| `experimental?` | \{ `joins?`: `boolean`; \} | - | Experimental features | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1420 |
| `experimental.joins?` | `boolean` | - | Enable experimental joins for your database adapter. 	Please read the adapter documentation for more information regarding joins before enabling this. 	Not all adapters support joins. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1429 |
| `basePath` | `string` | `resolvedBasePath` | - | [src/convex/client/index.ts:913](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L913) |
| `database` | `AdapterFactory`\<`BetterAuthOptions`\> | - | - | [src/convex/client/index.ts:914](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L914) |
| `emailAndPassword` | \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \} | - | - | [src/convex/client/index.ts:916](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L916) |
| `emailAndPassword.disableSignUp?` | `boolean` | - | Disable email and password sign up **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:588 |
| `emailAndPassword.requireEmailVerification?` | `boolean` | - | Require email verification before a session can be created for the user. if the user is not verified, the user will not be able to sign in and on sign in attempts, the user will be prompted to verify their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:596 |
| `emailAndPassword.maxPasswordLength?` | `number` | - | The maximum length of the password. **Default** `128` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:602 |
| `emailAndPassword.minPasswordLength?` | `number` | - | The minimum length of the password. **Default** `8` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:608 |
| `emailAndPassword.sendResetPassword()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | send reset password | node\_modules/@better-auth/core/dist/types/init-options.d.mts:612 |
| `emailAndPassword.resetPasswordTokenExpiresIn?` | `number` | - | Number of seconds the reset password token is valid for. **Default** `1 hour (60 * 60)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:634 |
| `emailAndPassword.onPasswordReset()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user's password is changed successfully. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:639 |
| `emailAndPassword.password?` | \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \} | - | Password hashing and verification By default Scrypt is used for password hashing and verification. You can provide your own hashing and verification function. if you want to use a different algorithm. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:650 |
| `emailAndPassword.password.hash()?` | (`password`) => `Promise`\<`string`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:651 |
| `emailAndPassword.password.verify()?` | (`data`) => `Promise`\<`boolean`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:652 |
| `emailAndPassword.autoSignIn?` | `boolean` | - | Automatically sign in the user after sign up **Default** `true` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:662 |
| `emailAndPassword.revokeSessionsOnPasswordReset?` | `boolean` | - | Whether to revoke all other sessions when resetting password **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:667 |
| `emailAndPassword.onExistingUserSignUp()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user tries to sign up with an email that already exists. Useful for notifying the existing user that someone attempted to register with their email. This is only called when `requireEmailVerification: true` or `autoSignIn: false`. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:675 |
| `emailAndPassword.customSyntheticUser()?` | (`params`) => `Record`\<`string`, `unknown`\> | - | Build a custom synthetic user for email enumeration protection. When a sign-up attempt is made with an email that already exists, this function is called to build the fake user response. Use this when plugins add fields to the user table (e.g. admin plugin adds `role`, `banned`, etc.) to ensure the fake response is indistinguishable from a real sign-up. **Example** `customSyntheticUser: ({ coreFields, additionalFields, id }) => ({ ...coreFields, role: "user", banned: false, banReason: null, banExpires: null, ...additionalFields, id, })` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:706 |
| `emailAndPassword.enabled` | `boolean` | `false` | Enable email and password authentication **Default** `false` | [src/convex/client/index.ts:917](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L917) |
| `user` | \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \} | - | - | [src/convex/client/index.ts:922](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L922) |
| `user.modelName?` | `"user"` \| `LiteralString` | - | The name of the model. Defaults to the model name. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:125 |
| `user.fields?` | `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\> | - | Map fields to database columns | node\_modules/@better-auth/core/dist/types/init-options.d.mts:129 |
| `user.additionalFields?` | \{ \[`key`: `string`\]: `DBFieldAttribute`; \} | - | Additional fields for the model | node\_modules/@better-auth/core/dist/types/init-options.d.mts:133 |
| `user.changeEmail?` | \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \} | - | Changing email configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:737 |
| `user.changeEmail.enabled` | `boolean` | - | Enable changing email **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:742 |
| `user.changeEmail.sendChangeEmailConfirmation()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a confirmation email to the old email address when the user changes their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:748 |
| `user.changeEmail.updateEmailWithoutVerification?` | `boolean` | - | Update the email without verification if the user is not verified. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:758 |
| `user.deleteUser?` | \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \} | - | User deletion configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:763 |
| `user.deleteUser.enabled?` | `boolean` | - | Enable user deletion | node\_modules/@better-auth/core/dist/types/init-options.d.mts:767 |
| `user.deleteUser.sendDeleteAccountVerification()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email when the user deletes their account. if this is not set, the user will be deleted immediately. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:775 |
| `user.deleteUser.beforeDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user is deleted. to interrupt with error you can throw `APIError` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:785 |
| `user.deleteUser.afterDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called after a user is deleted. This is useful for cleaning up user data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:791 |
| `user.deleteUser.deleteTokenExpiresIn?` | `number` | - | The expiration time for the delete token. **Default** `1 day (60 * 60 * 24) in seconds` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:797 |
| `plugins` | \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => `Promise`\< \| \{ `context`: ...; \} \| `undefined`\>; \} \| \{ `matcher`: (`ctx`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<\{ `context`: `MiddlewareContext`\<..., ...\>; \}\>; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<`unknown`\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: `string`; `content`: \{ `application/json`: ...; \}; \}; \}; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => `Promise`\<\{ `session`: \{ `session`: ...; `user`: ...; \}; \}\>[]; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: `string`; `content`: \{ `application/json`: ...; \}; \}; \}; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\>)\[\]; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ status: boolean; token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \} \| \{ status: boolean; token: null; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ZodString; otp: ZodString; name: ZodOptional\<(...)\>; image: ZodOptional\<(...)\> \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<ZodString\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ZodOptional\<(...)\>; name: ZodOptional\<(...)\>; context: ZodOptional\<(...)\> \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; parameters: \{ name: ...; in: ...; required: ...; description: ...; schema: ... \}\[\]; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<ZodString\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \}; 400: \{ description: ... \} \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<ZodAny, ZodAny\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \}; $Infer: \{ body: \{ response: AuthenticationResponseJSON \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>) \| ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>) \| ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \} \| \{ id: "admin"; version: string; init: any; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<(...)\[\] \| undefined\> \}\[\] \}; endpoints: \{ setRole: StrictEndpoint\<"/admin/set-role", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\>; role: ZodUnion\<readonly \[(...), (...)\]\> \}, $strip\>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \}; $Infer: \{ body: \{ userId: string; role: (...) \| (...) \| (...) \} \} \} \}, \{ user: UserWithRole \}\>; getUser: StrictEndpoint\<"/admin/get-user", \{ method: "GET"; query: ZodObject\<\{ id: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, UserWithRole\>; createUser: StrictEndpoint\<"/admin/create-user", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; password: ZodOptional\<ZodString\>; name: ZodString; role: ZodOptional\<ZodUnion\<(...)\>\>; data: ZodOptional\<ZodRecord\<(...), (...)\>\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \}; $Infer: \{ body: \{ email: string; password?: (...) \| (...); name: string; role?: (...) \| (...) \| (...) \| (...); data?: (...) \| (...) \} \} \} \}, \{ user: UserWithRole \}\>; adminUpdateUser: StrictEndpoint\<"/admin/update-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\>; data: ZodRecord\<ZodAny, ZodAny\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, UserWithRole\>; listUsers: StrictEndpoint\<"/admin/list-users", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; query: ZodObject\<\{ searchValue: ZodOptional\<ZodString\>; searchField: ZodOptional\<ZodEnum\<(...)\>\>; searchOperator: ZodOptional\<ZodEnum\<(...)\>\>; limit: ZodOptional\<ZodUnion\<(...)\>\>; offset: ZodOptional\<ZodUnion\<(...)\>\>; sortBy: ZodOptional\<ZodString\>; sortDirection: ZodOptional\<ZodEnum\<(...)\>\>; filterField: ZodOptional\<ZodString\>; filterValue: ZodOptional\<ZodUnion\<(...)\>\>; filterOperator: ZodOptional\<ZodEnum\<(...)\>\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ users: UserWithRole\[\]; total: number \}\>; listUserSessions: StrictEndpoint\<"/admin/list-user-sessions", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ sessions: SessionWithImpersonatedBy\[\] \}\>; unbanUser: StrictEndpoint\<"/admin/unban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ user: UserWithRole \}\>; banUser: StrictEndpoint\<"/admin/ban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\>; banReason: ZodOptional\<ZodString\>; banExpiresIn: ZodOptional\<ZodNumber\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ user: UserWithRole \}\>; impersonateUser: StrictEndpoint\<"/admin/impersonate-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: UserWithRole \}\>; stopImpersonating: StrictEndpoint\<"/admin/stop-impersonating", \{ method: "POST"; requireHeaders: true \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \} & Record\<string, any\>; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} & Record\<string, any\> \}\>; revokeUserSession: StrictEndpoint\<"/admin/revoke-user-session", \{ method: "POST"; body: ZodObject\<\{ sessionToken: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; revokeUserSessions: StrictEndpoint\<"/admin/revoke-user-sessions", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; removeUser: StrictEndpoint\<"/admin/remove-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; setUserPassword: StrictEndpoint\<"/admin/set-user-password", \{ method: "POST"; body: ZodObject\<\{ newPassword: ZodString; userId: ZodCoercedString\<unknown\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ status: boolean \}\>; userHasPermission: StrictEndpoint\<"/admin/has-permission", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ userId: ZodOptional\<(...)\>; role: ZodOptional\<(...)\> \}, $strip\>, ZodXor\<readonly \[ZodObject\<(...), (...)\>, ZodObject\<(...), (...)\>\]\>\>; metadata: \{ openapi: \{ description: string; requestBody: \{ content: \{ application/json: ... \} \}; responses: \{ 200: \{ description: ...; content: ... \} \} \}; $Infer: \{ body: \{ permissions: ... \} & \{ userId?: ...; role?: ... \} \} \} \}, \{ error: null; success: boolean \}\> \}; $ERROR\_CODES: \{ USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL: RawError\<"USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL"\>; FAILED\_TO\_CREATE\_USER: RawError\<"FAILED\_TO\_CREATE\_USER"\>; USER\_ALREADY\_EXISTS: RawError\<"USER\_ALREADY\_EXISTS"\>; YOU\_CANNOT\_BAN\_YOURSELF: RawError\<"YOU\_CANNOT\_BAN\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD"\>; BANNED\_USER: RawError\<"BANNED\_USER"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER"\>; NO\_DATA\_TO\_UPDATE: RawError\<"NO\_DATA\_TO\_UPDATE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS"\>; YOU\_CANNOT\_REMOVE\_YOURSELF: RawError\<"YOU\_CANNOT\_REMOVE\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE"\>; YOU\_CANNOT\_IMPERSONATE\_ADMINS: RawError\<"YOU\_CANNOT\_IMPERSONATE\_ADMINS"\>; INVALID\_ROLE\_TYPE: RawError\<"INVALID\_ROLE\_TYPE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL"\>; PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER: RawError\<"PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER"\> \}; schema: \{ user: \{ fields: \{ role: \{ type: "string"; required: false; input: false \}; banned: \{ type: "boolean"; defaultValue: false; required: false; input: false \}; banReason: \{ type: "string"; required: false; input: false \}; banExpires: \{ type: "date"; required: false; input: false \} \} \}; session: \{ fields: \{ impersonatedBy: \{ type: "string"; required: false; input: false \} \} \} \}; options: NoInfer\<AdminOptions\> \} \| DefaultOrganizationPlugin\<\{ allowUserToCreateOrganization?: boolean \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} & Record\<string, any\>) =\> Awaitable\<boolean\>); organizationLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} & Record\<string, any\>) =\> Awaitable\<boolean\>); creatorRole?: string; membershipLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \}, organization: \{ id: string; name: string; slug: string; logo?: string \| null; metadata?: any; createdAt: Date \}) =\> number \| Promise\<number\>); ac?: AccessControl; roles?: \{ \[key: string\]: Role\<any\> \| undefined \}; dynamicAccessControl?: \{ enabled?: boolean; maximumRolesPerOrganization?: number \| ((organizationId: string) =\> Awaitable\<number\>) \}; teams?: \{ enabled: boolean; defaultTeam?: \{ enabled: boolean; customCreateDefaultTeam?: (organization: ..., ctx?: ...) =\> ... \}; maximumTeams?: number \| ((data: \{ organizationId: string; session: (...) \| (...) \}, ctx?: GenericEndpointContext) =\> Awaitable\<number\>); maximumMembersPerTeam?: number \| ((data: \{ teamId: string; session: \{ user: ...; session: ... \}; organizationId: string \}) =\> Awaitable\<number\>); allowRemovingAllTeams?: boolean \}; invitationExpiresIn?: number; invitationLimit?: number \| ((data: \{ user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\>; organization: \{ id: string; name: string; slug: string; logo?: (...) \| (...) \| (...); metadata?: any; createdAt: Date \} & Record\<string, any\>; member: \{ id: string; organizationId: string; userId: string; role: string; createdAt: Date \} & Record\<string, any\> \}, ctx: AuthContext) =\> Awaitable\<number\>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: \{ id: string; role: string; email: string; organization: \{ id: string; name: string; slug: string; logo?: string \| null; metadata?: any; createdAt: Date \}; invitation: \{ id: string; organizationId: string; email: string; role: string; status: "pending" \| "accepted" \| "rejected" \| "canceled"; teamId?: string \| null; inviterId: string; expiresAt: Date; createdAt: Date \}; inviter: \{ id: string; organizationId: string; userId: string; role: string; createdAt: Date \} & \{ user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} \} \}, request?: Request) =\> Promise\<void\>; schema?: \{ session?: \{ fields?: \{ activeOrganizationId?: ...; activeTeamId?: ... \} \}; organization?: \{ modelName?: string; fields?: \{ name?: ...; slug?: ...; logo?: ...; metadata?: ...; createdAt?: ... \}; additionalFields?: \{ \[key: ...\]: ... \} \}; member?: \{ modelName?: string; fields?: \{ organizationId?: ...; userId?: ...; role?: ...; createdAt?: ... \}; additionalFields?: \{ \[key: ...\]: ... \} \}; invitation?: \{ modelName?: string; fields?: \{ organizationId?: ...; email?: ...; role?: ...; status?: ...; teamId?: ...; inviterId?: ...; expiresAt?: ...; createdAt?: ... \}; additionalFields?: \{ \[key: ...\]: ... \} \}; team?: \{ modelName?: string; fields?: \{ name?: ...; organizationId?: ...; createdAt?: ...; updatedAt?: ... \}; additionalFields?: \{ \[key: ...\]: ... \} \}; teamMember?: \{ modelName?: string; fields?: \{ teamId?: ...; userId?: ...; createdAt?: ... \} \}; organizationRole?: \{ modelName?: string; fields?: \{ organizationId?: ...; role?: ...; permission?: ...; createdAt?: ...; updatedAt?: ... \}; additionalFields?: \{ \[key: ...\]: ... \} \} \}; disableOrganizationDeletion?: boolean; organizationHooks?: \{ beforeCreateOrganization?: (data: \{ organization: \{ name?: ...; slug?: ...; logo?: ...; metadata?: ...; \[key: ...\]: ... \}; user: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterCreateOrganization?: (data: \{ organization: (...) & (...); member: (...) & (...); user: (...) & (...) \}) =\> Promise\<void\>; beforeUpdateOrganization?: (data: \{ organization: \{ name?: ...; slug?: ...; logo?: ...; metadata?: ...; \[key: ...\]: ... \}; user: (...) & (...); member: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterUpdateOrganization?: (data: \{ organization: (...) \| (...); user: (...) & (...); member: (...) & (...) \}) =\> Promise\<void\>; beforeDeleteOrganization?: (data: \{ organization: (...) & (...); user: (...) & (...) \}, ctx?: GenericEndpointContext) =\> Promise\<void\>; afterDeleteOrganization?: (data: \{ organization: (...) & (...); user: (...) & (...) \}, ctx?: GenericEndpointContext) =\> Promise\<void\>; beforeAddMember?: (data: \{ member: \{ userId: ...; organizationId: ...; role: ...; \[key: ...\]: ... \}; user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterAddMember?: (data: \{ member: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeRemoveMember?: (data: \{ member: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterRemoveMember?: (data: \{ member: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeUpdateMemberRole?: (data: \{ member: (...) & (...); newRole: string; user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterUpdateMemberRole?: (data: \{ member: (...) & (...); previousRole: string; user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeCreateInvitation?: (data: \{ invitation: \{ email: ...; role: ...; organizationId: ...; inviterId: ...; teamId?: ...; \[key: ...\]: ... \}; inviter: (...) & (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterCreateInvitation?: (data: \{ invitation: (...) & (...); inviter: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeAcceptInvitation?: (data: \{ invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterAcceptInvitation?: (data: \{ invitation: (...) & (...); member: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeRejectInvitation?: (data: \{ invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterRejectInvitation?: (data: \{ invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeCancelInvitation?: (data: \{ invitation: (...) & (...); cancelledBy: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterCancelInvitation?: (data: \{ invitation: (...) & (...); cancelledBy: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeCreateTeam?: (data: \{ team: \{ name: ...; organizationId: ...; \[key: ...\]: ... \}; user?: (...) \| (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterCreateTeam?: (data: \{ team: (...) & (...); user?: (...) \| (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeUpdateTeam?: (data: \{ team: (...) & (...); updates: \{ name?: ...; \[key: ...\]: ... \}; user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterUpdateTeam?: (data: \{ team: (...) \| (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeDeleteTeam?: (data: \{ team: (...) & (...); user?: (...) \| (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterDeleteTeam?: (data: \{ team: (...) & (...); user?: (...) \| (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeAddTeamMember?: (data: \{ teamMember: \{ teamId: ...; userId: ...; \[key: ...\]: ... \}; team: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterAddTeamMember?: (data: \{ teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeRemoveTeamMember?: (data: \{ teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterRemoveTeamMember?: (data: \{ teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\> \} \}\>)\[\]\] | - | - | [src/convex/client/index.ts:937](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L937) |

***

### createBetterAuth()

```ts
function createBetterAuth(database, options?): Auth<{
  appName?: string;
  baseURL?: BaseURLConfig;
  secret?: string;
  secrets?: {
     version: number;
     value: string;
  }[];
  secondaryStorage?: SecondaryStorage;
  emailVerification?: {
     sendVerificationEmail?: (data, request?) => Promise<void>;
     sendOnSignUp?: boolean;
     sendOnSignIn?: boolean;
     autoSignInAfterVerification?: boolean;
     expiresIn?: number;
     beforeEmailVerification?: (user, request?) => Promise<void>;
     afterEmailVerification?: (user, request?) => Promise<void>;
  };
  socialProviders?: SocialProviders;
  session?: BetterAuthDBOptions<"session", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "id"
     | "expiresAt"
     | "token"
     | "ipAddress"
     | "userAgent"> & {
     expiresIn?: number;
     updateAge?: number;
     disableSessionRefresh?: boolean;
     deferSessionRefresh?: boolean;
     storeSessionInDatabase?: boolean;
     preserveSessionInDatabase?: boolean;
     cookieCache?: {
        maxAge?: number;
        enabled?: boolean;
        strategy?: "compact" | "jwt" | "jwe";
        refreshCache?:   | boolean
           | {
           updateAge?: number;
         };
        version?:   | string
           | ((session, user) => string)
           | ((session, user) => Promise<string>);
     };
     freshAge?: number;
  };
  account?: BetterAuthDBOptions<"account", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "id"
     | "password"
     | "accountId"
     | "providerId"
     | "accessToken"
     | "refreshToken"
     | "idToken"
     | "accessTokenExpiresAt"
     | "refreshTokenExpiresAt"
     | "scope"> & {
     updateAccountOnSignIn?: boolean;
     accountLinking?: {
        enabled?: boolean;
        disableImplicitLinking?: boolean;
        requireLocalEmailVerified?: boolean;
        trustedProviders?:   | LiteralUnion<
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ..., string>[]
           | ((request?) => Awaitable<...[]>);
        allowDifferentEmails?: boolean;
        allowUnlinkingAll?: boolean;
        updateUserInfoOnLink?: boolean;
     };
     encryptOAuthTokens?: boolean;
     skipStateCookieCheck?: boolean;
     storeStateStrategy?: "database" | "cookie";
     storeAccountCookie?: boolean;
  };
  verification?: BetterAuthDBOptions<"verification", "value" | "createdAt" | "updatedAt" | "id" | "expiresAt" | "identifier"> & {
     disableCleanup?: boolean;
     storeIdentifier?:   | StoreIdentifierOption
        | {
        default: StoreIdentifierOption;
        overrides?: Record<string, StoreIdentifierOption>;
      };
     storeInDatabase?: boolean;
  };
  trustedOrigins?:   | string[]
     | ((request?) => Awaitable<(string | null | undefined)[]>);
  rateLimit?: BetterAuthRateLimitOptions;
  advanced?: BetterAuthAdvancedOptions;
  logger?: Logger;
  databaseHooks?: {
     user?: {
        create?: {
           before?: (user, context) => Promise<...>;
           after?: (user, context) => Promise<...>;
        };
        update?: {
           before?: (user, context) => Promise<...>;
           after?: (user, context) => Promise<...>;
        };
        delete?: {
           before?: (user, context) => Promise<...>;
           after?: (user, context) => Promise<...>;
        };
     };
     session?: {
        create?: {
           before?: (session, context) => Promise<...>;
           after?: (session, context) => Promise<...>;
        };
        update?: {
           before?: (session, context) => Promise<...>;
           after?: (session, context) => Promise<...>;
        };
        delete?: {
           before?: (session, context) => Promise<...>;
           after?: (session, context) => Promise<...>;
        };
     };
     account?: {
        create?: {
           before?: (account, context) => Promise<...>;
           after?: (account, context) => Promise<...>;
        };
        update?: {
           before?: (account, context) => Promise<...>;
           after?: (account, context) => Promise<...>;
        };
        delete?: {
           before?: (account, context) => Promise<...>;
           after?: (account, context) => Promise<...>;
        };
     };
     verification?: {
        create?: {
           before?: (verification, context) => Promise<...>;
           after?: (verification, context) => Promise<...>;
        };
        update?: {
           before?: (verification, context) => Promise<...>;
           after?: (verification, context) => Promise<...>;
        };
        delete?: {
           before?: (verification, context) => Promise<...>;
           after?: (verification, context) => Promise<...>;
        };
     };
  };
  onAPIError?: {
     throw?: boolean;
     onError?: (error, ctx) => void | Promise<void>;
     errorURL?: string;
     customizeDefaultErrorPage?: {
        colors?: {
           background?: string;
           foreground?: string;
           primary?: string;
           primaryForeground?: string;
           mutedForeground?: string;
           border?: string;
           destructive?: string;
           titleBorder?: string;
           titleColor?: string;
           gridColor?: string;
           cardBackground?: string;
           cornerBorder?: string;
        };
        size?: {
           radiusSm?: string;
           radiusMd?: string;
           radiusLg?: string;
           textSm?: string;
           text2xl?: string;
           text4xl?: string;
           text6xl?: string;
        };
        font?: {
           defaultFamily?: string;
           monoFamily?: string;
        };
        disableTitleBorder?: boolean;
        disableCornerDecorations?: boolean;
        disableBackgroundGrid?: boolean;
     };
  };
  hooks?: {
     before?: (inputContext) => Promise<unknown>;
     after?: (inputContext) => Promise<unknown>;
  };
  disabledPaths?: string[];
  telemetry?: {
     enabled?: boolean;
     debug?: boolean;
  };
  experimental?: {
     joins?: boolean;
  };
  basePath: string;
  database: AdapterFactory<BetterAuthOptions>;
  emailAndPassword: {
     disableSignUp?: boolean;
     requireEmailVerification?: boolean;
     maxPasswordLength?: number;
     minPasswordLength?: number;
     sendResetPassword?: (data, request?) => Promise<void>;
     resetPasswordTokenExpiresIn?: number;
     onPasswordReset?: (data, request?) => Promise<void>;
     password?: {
        hash?: (password) => Promise<string>;
        verify?: (data) => Promise<boolean>;
     };
     autoSignIn?: boolean;
     revokeSessionsOnPasswordReset?: boolean;
     onExistingUserSignUp?: (data, request?) => Promise<void>;
     customSyntheticUser?: (params) => Record<string, unknown>;
     enabled: boolean;
  };
  user: {
     modelName?: "user" | LiteralString;
     fields?: Partial<Record<"createdAt" | "updatedAt" | "email" | "emailVerified" | "name" | "image", string>>;
     additionalFields?: {
      [key: string]: DBFieldAttribute;
     };
     changeEmail?: {
        enabled: boolean;
        sendChangeEmailConfirmation?: (data, request?) => Promise<void>;
        updateEmailWithoutVerification?: boolean;
     };
     deleteUser?: {
        enabled?: boolean;
        sendDeleteAccountVerification?: (data, request?) => Promise<void>;
        beforeDelete?: (user, request?) => Promise<void>;
        afterDelete?: (user, request?) => Promise<void>;
        deleteTokenExpiresIn?: number;
     };
  };
  plugins: [{
     id: "convex";
     version: string;
     init: (ctx) => void;
     hooks: {
        before: (
           | {
           matcher: boolean;
           handler: (inputContext) => Promise<... | ...>;
         }
           | {
           matcher: (ctx) => boolean;
           handler: (inputContext) => Promise<{
              context: ...;
           }>;
        })[];
        after: {
           matcher: (context) => boolean;
           handler: (inputContext) => Promise<unknown>;
        }[];
     };
     endpoints: {
        getOpenIdConfig: StrictEndpoint<"/convex/.well-known/openid-configuration", {
           method: "GET";
           metadata: {
              isAction: false;
           };
        }, OIDCMetadata>;
        getJwks: StrictEndpoint<"/convex/jwks", {
           method: "GET";
           metadata: {
              openapi: {
                 description: string;
                 responses: {
                    200: {
                       description: ...;
                       content: ...;
                    };
                 };
              };
           };
        }, JSONWebKeySet>;
        getLatestJwks: StrictEndpoint<"/convex/latest-jwks", {
           isAction: boolean;
           method: "POST";
           metadata: {
              SERVER_ONLY: true;
              openapi: {
                 description: string;
              };
           };
        }, any[]>;
        rotateKeys: StrictEndpoint<"/convex/rotate-keys", {
           isAction: boolean;
           method: "POST";
           metadata: {
              SERVER_ONLY: true;
              openapi: {
                 description: string;
              };
           };
        }, any[]>;
        getToken: StrictEndpoint<"/convex/token", {
           method: "GET";
           requireHeaders: true;
           use: (inputContext) => Promise<{
              session: ...;
           }>[];
           metadata: {
              openapi: {
                 description: string;
                 responses: {
                    200: {
                       description: ...;
                       content: ...;
                    };
                 };
              };
           };
         }, {
           token: string;
        }>;
     };
     schema: {
        jwks: {
           fields: {
              publicKey: {
                 type: "string";
                 required: true;
              };
              privateKey: {
                 type: "string";
                 required: true;
              };
              createdAt: {
                 type: "date";
                 required: true;
              };
              expiresAt: {
                 type: "date";
                 required: false;
              };
           };
        };
        user: {
           fields: {
              userId: {
                 type: "string";
                 required: false;
                 input: false;
              };
           };
        };
     };
  }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean; token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> } | { status: boolean; token: null; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ...; otp: ...; name: ...; image: ... }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ...; name: ...; context: ... }, $strip>>; metadata: { openapi: { operationId: string; description: string; parameters: (...)[]; responses: { 200: ... } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ...; 400: ... } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<(...), (...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } }; $Infer: { body: { response: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined } | { id: "admin"; version: string; init: any; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<(...) | (...)> }[] }; endpoints: { setRole: StrictEndpoint<"/admin/set-role", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; role: ZodUnion<(...)> }, $strip>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } }; $Infer: { body: { userId: ...; role: ... } } } }, { user: UserWithRole }>; getUser: StrictEndpoint<"/admin/get-user", { method: "GET"; query: ZodObject<{ id: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, UserWithRole>; createUser: StrictEndpoint<"/admin/create-user", { method: "POST"; body: ZodObject<{ email: ZodString; password: ZodOptional<(...)>; name: ZodString; role: ZodOptional<(...)>; data: ZodOptional<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } }; $Infer: { body: { email: ...; password?: ...; name: ...; role?: ...; data?: ... } } } }, { user: UserWithRole }>; adminUpdateUser: StrictEndpoint<"/admin/update-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; data: ZodRecord<(...), (...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, UserWithRole>; listUsers: StrictEndpoint<"/admin/list-users", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodObject<{ searchValue: ZodOptional<(...)>; searchField: ZodOptional<(...)>; searchOperator: ZodOptional<(...)>; limit: ZodOptional<(...)>; offset: ZodOptional<(...)>; sortBy: ZodOptional<(...)>; sortDirection: ZodOptional<(...)>; filterField: ZodOptional<(...)>; filterValue: ZodOptional<(...)>; filterOperator: ZodOptional<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { users: UserWithRole[]; total: number }>; listUserSessions: StrictEndpoint<"/admin/list-user-sessions", { method: "POST"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { sessions: SessionWithImpersonatedBy[] }>; unbanUser: StrictEndpoint<"/admin/unban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { user: UserWithRole }>; banUser: StrictEndpoint<"/admin/ban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; banReason: ZodOptional<(...)>; banExpiresIn: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { user: UserWithRole }>; impersonateUser: StrictEndpoint<"/admin/impersonate-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: UserWithRole }>; stopImpersonating: StrictEndpoint<"/admin/stop-impersonating", { method: "POST"; requireHeaders: true }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) | (...) | (...); userAgent?: (...) | (...) | (...) } & Record<string, any>; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> }>; revokeUserSession: StrictEndpoint<"/admin/revoke-user-session", { method: "POST"; body: ZodObject<{ sessionToken: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; revokeUserSessions: StrictEndpoint<"/admin/revoke-user-sessions", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; removeUser: StrictEndpoint<"/admin/remove-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; setUserPassword: StrictEndpoint<"/admin/set-user-password", { method: "POST"; body: ZodObject<{ newPassword: ZodString; userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { status: boolean }>; userHasPermission: StrictEndpoint<"/admin/has-permission", { method: "POST"; body: ZodIntersection<ZodObject<{ userId: ...; role: ... }, $strip>, ZodXor<readonly [(...), (...)]>>; metadata: { openapi: { description: string; requestBody: { content: ... }; responses: { 200: ... } }; $Infer: { body: (...) & (...) } } }, { error: null; success: boolean }> }; $ERROR_CODES: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: RawError<"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL">; FAILED_TO_CREATE_USER: RawError<"FAILED_TO_CREATE_USER">; USER_ALREADY_EXISTS: RawError<"USER_ALREADY_EXISTS">; YOU_CANNOT_BAN_YOURSELF: RawError<"YOU_CANNOT_BAN_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: RawError<"YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE">; YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_BAN_USERS">; YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD">; BANNED_USER: RawError<"BANNED_USER">; YOU_ARE_NOT_ALLOWED_TO_GET_USER: RawError<"YOU_ARE_NOT_ALLOWED_TO_GET_USER">; NO_DATA_TO_UPDATE: RawError<"NO_DATA_TO_UPDATE">; YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS">; YOU_CANNOT_REMOVE_YOURSELF: RawError<"YOU_CANNOT_REMOVE_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE">; YOU_CANNOT_IMPERSONATE_ADMINS: RawError<"YOU_CANNOT_IMPERSONATE_ADMINS">; INVALID_ROLE_TYPE: RawError<"INVALID_ROLE_TYPE">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL">; PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: RawError<"PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER"> }; schema: { user: { fields: { role: { type: "string"; required: false; input: false }; banned: { type: "boolean"; defaultValue: false; required: false; input: false }; banReason: { type: "string"; required: false; input: false }; banExpires: { type: "date"; required: false; input: false } } }; session: { fields: { impersonatedBy: { type: "string"; required: false; input: false } } } }; options: NoInfer<AdminOptions> } | DefaultOrganizationPlugin<{ allowUserToCreateOrganization?: boolean | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any>) => Awaitable<boolean>); organizationLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any>) => Awaitable<boolean>); creatorRole?: string; membershipLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null }, organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: any; createdAt: Date }) => number | Promise<number>); ac?: AccessControl; roles?: { [key: string]: Role<any> | undefined }; dynamicAccessControl?: { enabled?: boolean; maximumRolesPerOrganization?: number | ((organizationId: string) => Awaitable<(...)>) }; teams?: { enabled: boolean; defaultTeam?: { enabled: boolean; customCreateDefaultTeam?: (...) | (...) }; maximumTeams?: number | ((data: { organizationId: ...; session: ... }, ctx?: (...) | (...)) => Awaitable<(...)>); maximumMembersPerTeam?: number | ((data: { teamId: ...; session: ...; organizationId: ... }) => Awaitable<(...)>); allowRemovingAllTeams?: boolean }; invitationExpiresIn?: number; invitationLimit?: number | ((data: { user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)>; organization: { id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... } & Record<(...), (...)>; member: { id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... } & Record<(...), (...)> }, ctx: AuthContext) => Awaitable<number>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: { id: string; role: string; email: string; organization: { id: string; name: string; slug: string; logo?: (...) | (...) | (...); metadata?: any; createdAt: Date }; invitation: { id: string; organizationId: string; email: string; role: string; status: (...) | (...) | (...) | (...); teamId?: (...) | (...) | (...); inviterId: string; expiresAt: Date; createdAt: Date }; inviter: { id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... } & { user: ... } }, request?: Request) => Promise<void>; schema?: { session?: { fields?: (...) | (...) }; organization?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; member?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; invitation?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; team?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; teamMember?: { modelName?: (...) | (...); fields?: (...) | (...) }; organizationRole?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) } }; disableOrganizationDeletion?: boolean; organizationHooks?: { beforeCreateOrganization?: (data: { organization: ...; user: ... }) => Promise<(...)>; afterCreateOrganization?: (data: { organization: ...; member: ...; user: ... }) => Promise<(...)>; beforeUpdateOrganization?: (data: { organization: ...; user: ...; member: ... }) => Promise<(...)>; afterUpdateOrganization?: (data: { organization: ...; user: ...; member: ... }) => Promise<(...)>; beforeDeleteOrganization?: (data: { organization: ...; user: ... }, ctx?: (...) | (...)) => Promise<(...)>; afterDeleteOrganization?: (data: { organization: ...; user: ... }, ctx?: (...) | (...)) => Promise<(...)>; beforeAddMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; afterAddMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRemoveMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; afterRemoveMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeUpdateMemberRole?: (data: { member: ...; newRole: ...; user: ...; organization: ... }) => Promise<(...)>; afterUpdateMemberRole?: (data: { member: ...; previousRole: ...; user: ...; organization: ... }) => Promise<(...)>; beforeCreateInvitation?: (data: { invitation: ...; inviter: ...; organization: ... }) => Promise<(...)>; afterCreateInvitation?: (data: { invitation: ...; inviter: ...; organization: ... }) => Promise<(...)>; beforeAcceptInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; afterAcceptInvitation?: (data: { invitation: ...; member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRejectInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; afterRejectInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; beforeCancelInvitation?: (data: { invitation: ...; cancelledBy: ...; organization: ... }) => Promise<(...)>; afterCancelInvitation?: (data: { invitation: ...; cancelledBy: ...; organization: ... }) => Promise<(...)>; beforeCreateTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; afterCreateTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; beforeUpdateTeam?: (data: { team: ...; updates: ...; user: ...; organization: ... }) => Promise<(...)>; afterUpdateTeam?: (data: { team: ...; user: ...; organization: ... }) => Promise<(...)>; beforeDeleteTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; afterDeleteTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; beforeAddTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; afterAddTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRemoveTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; afterRemoveTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)> } }>)[]];
}>;
```

Defined in: [src/convex/client/index.ts:1017](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1017)

Shared factory that creates a Better Auth instance from a database adapter.

Used by the public client bridge and by the component HTTP router so the
packaged component and app-facing wrapper stay aligned.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `database` | `AdapterFactory`\<`BetterAuthOptions`\> |
| `options` | [`CreateBetterAuthOptions`](#createbetterauthoptions) |

#### Returns

`Auth`\<\{
  `appName?`: `string`;
  `baseURL?`: `BaseURLConfig`;
  `secret?`: `string`;
  `secrets?`: \{
     `version`: `number`;
     `value`: `string`;
  \}[];
  `secondaryStorage?`: `SecondaryStorage`;
  `emailVerification?`: \{
     `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>;
     `sendOnSignUp?`: `boolean`;
     `sendOnSignIn?`: `boolean`;
     `autoSignInAfterVerification?`: `boolean`;
     `expiresIn?`: `number`;
     `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>;
     `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>;
  \};
  `socialProviders?`: `SocialProviders`;
  `session?`: `BetterAuthDBOptions`\<`"session"`, 
     \| `"createdAt"`
     \| `"updatedAt"`
     \| `"userId"`
     \| `"id"`
     \| `"expiresAt"`
     \| `"token"`
     \| `"ipAddress"`
     \| `"userAgent"`\> & \{
     `expiresIn?`: `number`;
     `updateAge?`: `number`;
     `disableSessionRefresh?`: `boolean`;
     `deferSessionRefresh?`: `boolean`;
     `storeSessionInDatabase?`: `boolean`;
     `preserveSessionInDatabase?`: `boolean`;
     `cookieCache?`: \{
        `maxAge?`: `number`;
        `enabled?`: `boolean`;
        `strategy?`: `"compact"` \| `"jwt"` \| `"jwe"`;
        `refreshCache?`:   \| `boolean`
           \| \{
           `updateAge?`: `number`;
         \};
        `version?`:   \| `string`
           \| ((`session`, `user`) => `string`)
           \| ((`session`, `user`) => `Promise`\<`string`\>);
     \};
     `freshAge?`: `number`;
  \};
  `account?`: `BetterAuthDBOptions`\<`"account"`, 
     \| `"createdAt"`
     \| `"updatedAt"`
     \| `"userId"`
     \| `"id"`
     \| `"password"`
     \| `"accountId"`
     \| `"providerId"`
     \| `"accessToken"`
     \| `"refreshToken"`
     \| `"idToken"`
     \| `"accessTokenExpiresAt"`
     \| `"refreshTokenExpiresAt"`
     \| `"scope"`\> & \{
     `updateAccountOnSignIn?`: `boolean`;
     `accountLinking?`: \{
        `enabled?`: `boolean`;
        `disableImplicitLinking?`: `boolean`;
        `requireLocalEmailVerified?`: `boolean`;
        `trustedProviders?`:   \| `LiteralUnion`\<
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ..., `string`\>[]
           \| ((`request?`) => `Awaitable`\<...[]\>);
        `allowDifferentEmails?`: `boolean`;
        `allowUnlinkingAll?`: `boolean`;
        `updateUserInfoOnLink?`: `boolean`;
     \};
     `encryptOAuthTokens?`: `boolean`;
     `skipStateCookieCheck?`: `boolean`;
     `storeStateStrategy?`: `"database"` \| `"cookie"`;
     `storeAccountCookie?`: `boolean`;
  \};
  `verification?`: `BetterAuthDBOptions`\<`"verification"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"identifier"`\> & \{
     `disableCleanup?`: `boolean`;
     `storeIdentifier?`:   \| `StoreIdentifierOption`
        \| \{
        `default`: `StoreIdentifierOption`;
        `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>;
      \};
     `storeInDatabase?`: `boolean`;
  \};
  `trustedOrigins?`:   \| `string`[]
     \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>);
  `rateLimit?`: `BetterAuthRateLimitOptions`;
  `advanced?`: `BetterAuthAdvancedOptions`;
  `logger?`: `Logger`;
  `databaseHooks?`: \{
     `user?`: \{
        `create?`: \{
           `before?`: (`user`, `context`) => `Promise`\<...\>;
           `after?`: (`user`, `context`) => `Promise`\<...\>;
        \};
        `update?`: \{
           `before?`: (`user`, `context`) => `Promise`\<...\>;
           `after?`: (`user`, `context`) => `Promise`\<...\>;
        \};
        `delete?`: \{
           `before?`: (`user`, `context`) => `Promise`\<...\>;
           `after?`: (`user`, `context`) => `Promise`\<...\>;
        \};
     \};
     `session?`: \{
        `create?`: \{
           `before?`: (`session`, `context`) => `Promise`\<...\>;
           `after?`: (`session`, `context`) => `Promise`\<...\>;
        \};
        `update?`: \{
           `before?`: (`session`, `context`) => `Promise`\<...\>;
           `after?`: (`session`, `context`) => `Promise`\<...\>;
        \};
        `delete?`: \{
           `before?`: (`session`, `context`) => `Promise`\<...\>;
           `after?`: (`session`, `context`) => `Promise`\<...\>;
        \};
     \};
     `account?`: \{
        `create?`: \{
           `before?`: (`account`, `context`) => `Promise`\<...\>;
           `after?`: (`account`, `context`) => `Promise`\<...\>;
        \};
        `update?`: \{
           `before?`: (`account`, `context`) => `Promise`\<...\>;
           `after?`: (`account`, `context`) => `Promise`\<...\>;
        \};
        `delete?`: \{
           `before?`: (`account`, `context`) => `Promise`\<...\>;
           `after?`: (`account`, `context`) => `Promise`\<...\>;
        \};
     \};
     `verification?`: \{
        `create?`: \{
           `before?`: (`verification`, `context`) => `Promise`\<...\>;
           `after?`: (`verification`, `context`) => `Promise`\<...\>;
        \};
        `update?`: \{
           `before?`: (`verification`, `context`) => `Promise`\<...\>;
           `after?`: (`verification`, `context`) => `Promise`\<...\>;
        \};
        `delete?`: \{
           `before?`: (`verification`, `context`) => `Promise`\<...\>;
           `after?`: (`verification`, `context`) => `Promise`\<...\>;
        \};
     \};
  \};
  `onAPIError?`: \{
     `throw?`: `boolean`;
     `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>;
     `errorURL?`: `string`;
     `customizeDefaultErrorPage?`: \{
        `colors?`: \{
           `background?`: `string`;
           `foreground?`: `string`;
           `primary?`: `string`;
           `primaryForeground?`: `string`;
           `mutedForeground?`: `string`;
           `border?`: `string`;
           `destructive?`: `string`;
           `titleBorder?`: `string`;
           `titleColor?`: `string`;
           `gridColor?`: `string`;
           `cardBackground?`: `string`;
           `cornerBorder?`: `string`;
        \};
        `size?`: \{
           `radiusSm?`: `string`;
           `radiusMd?`: `string`;
           `radiusLg?`: `string`;
           `textSm?`: `string`;
           `text2xl?`: `string`;
           `text4xl?`: `string`;
           `text6xl?`: `string`;
        \};
        `font?`: \{
           `defaultFamily?`: `string`;
           `monoFamily?`: `string`;
        \};
        `disableTitleBorder?`: `boolean`;
        `disableCornerDecorations?`: `boolean`;
        `disableBackgroundGrid?`: `boolean`;
     \};
  \};
  `hooks?`: \{
     `before?`: (`inputContext`) => `Promise`\<`unknown`\>;
     `after?`: (`inputContext`) => `Promise`\<`unknown`\>;
  \};
  `disabledPaths?`: `string`[];
  `telemetry?`: \{
     `enabled?`: `boolean`;
     `debug?`: `boolean`;
  \};
  `experimental?`: \{
     `joins?`: `boolean`;
  \};
  `basePath`: `string`;
  `database`: `AdapterFactory`\<`BetterAuthOptions`\>;
  `emailAndPassword`: \{
     `disableSignUp?`: `boolean`;
     `requireEmailVerification?`: `boolean`;
     `maxPasswordLength?`: `number`;
     `minPasswordLength?`: `number`;
     `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>;
     `resetPasswordTokenExpiresIn?`: `number`;
     `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>;
     `password?`: \{
        `hash?`: (`password`) => `Promise`\<`string`\>;
        `verify?`: (`data`) => `Promise`\<`boolean`\>;
     \};
     `autoSignIn?`: `boolean`;
     `revokeSessionsOnPasswordReset?`: `boolean`;
     `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>;
     `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>;
     `enabled`: `boolean`;
  \};
  `user`: \{
     `modelName?`: `"user"` \| `LiteralString`;
     `fields?`: `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\>;
     `additionalFields?`: \{
      \[`key`: `string`\]: `DBFieldAttribute`;
     \};
     `changeEmail?`: \{
        `enabled`: `boolean`;
        `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>;
        `updateEmailWithoutVerification?`: `boolean`;
     \};
     `deleteUser?`: \{
        `enabled?`: `boolean`;
        `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>;
        `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>;
        `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>;
        `deleteTokenExpiresIn?`: `number`;
     \};
  \};
  `plugins`: \[\{
     `id`: `"convex"`;
     `version`: `string`;
     `init`: (`ctx`) => `void`;
     `hooks`: \{
        `before`: (
           \| \{
           `matcher`: `boolean`;
           `handler`: (`inputContext`) => `Promise`\<... \| ...\>;
         \}
           \| \{
           `matcher`: (`ctx`) => `boolean`;
           `handler`: (`inputContext`) => `Promise`\<\{
              `context`: ...;
           \}\>;
        \})[];
        `after`: \{
           `matcher`: (`context`) => `boolean`;
           `handler`: (`inputContext`) => `Promise`\<`unknown`\>;
        \}[];
     \};
     `endpoints`: \{
        `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{
           `method`: `"GET"`;
           `metadata`: \{
              `isAction`: `false`;
           \};
        \}, `OIDCMetadata`\>;
        `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{
           `method`: `"GET"`;
           `metadata`: \{
              `openapi`: \{
                 `description`: `string`;
                 `responses`: \{
                    `200`: \{
                       `description`: ...;
                       `content`: ...;
                    \};
                 \};
              \};
           \};
        \}, `JSONWebKeySet`\>;
        `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{
           `isAction`: `boolean`;
           `method`: `"POST"`;
           `metadata`: \{
              `SERVER_ONLY`: `true`;
              `openapi`: \{
                 `description`: `string`;
              \};
           \};
        \}, `any`[]\>;
        `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{
           `isAction`: `boolean`;
           `method`: `"POST"`;
           `metadata`: \{
              `SERVER_ONLY`: `true`;
              `openapi`: \{
                 `description`: `string`;
              \};
           \};
        \}, `any`[]\>;
        `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{
           `method`: `"GET"`;
           `requireHeaders`: `true`;
           `use`: (`inputContext`) => `Promise`\<\{
              `session`: ...;
           \}\>[];
           `metadata`: \{
              `openapi`: \{
                 `description`: `string`;
                 `responses`: \{
                    `200`: \{
                       `description`: ...;
                       `content`: ...;
                    \};
                 \};
              \};
           \};
         \}, \{
           `token`: `string`;
        \}\>;
     \};
     `schema`: \{
        `jwks`: \{
           `fields`: \{
              `publicKey`: \{
                 `type`: `"string"`;
                 `required`: `true`;
              \};
              `privateKey`: \{
                 `type`: `"string"`;
                 `required`: `true`;
              \};
              `createdAt`: \{
                 `type`: `"date"`;
                 `required`: `true`;
              \};
              `expiresAt`: \{
                 `type`: `"date"`;
                 `required`: `false`;
              \};
           \};
        \};
        `user`: \{
           `fields`: \{
              `userId`: \{
                 `type`: `"string"`;
                 `required`: `false`;
                 `input`: `false`;
              \};
           \};
        \};
     \};
  \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean; token: string; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \} \| \{ status: boolean; token: null; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ...; otp: ...; name: ...; image: ... \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ...; name: ...; context: ... \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; parameters: (...)\[\]; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ...; 400: ... \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<(...), (...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ response: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \} \| \{ id: "admin"; version: string; init: any; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<(...) \| (...)\> \}\[\] \}; endpoints: \{ setRole: StrictEndpoint\<"/admin/set-role", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; role: ZodUnion\<(...)\> \}, $strip\>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ userId: ...; role: ... \} \} \} \}, \{ user: UserWithRole \}\>; getUser: StrictEndpoint\<"/admin/get-user", \{ method: "GET"; query: ZodObject\<\{ id: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, UserWithRole\>; createUser: StrictEndpoint\<"/admin/create-user", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; password: ZodOptional\<(...)\>; name: ZodString; role: ZodOptional\<(...)\>; data: ZodOptional\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ email: ...; password?: ...; name: ...; role?: ...; data?: ... \} \} \} \}, \{ user: UserWithRole \}\>; adminUpdateUser: StrictEndpoint\<"/admin/update-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; data: ZodRecord\<(...), (...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, UserWithRole\>; listUsers: StrictEndpoint\<"/admin/list-users", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodObject\<\{ searchValue: ZodOptional\<(...)\>; searchField: ZodOptional\<(...)\>; searchOperator: ZodOptional\<(...)\>; limit: ZodOptional\<(...)\>; offset: ZodOptional\<(...)\>; sortBy: ZodOptional\<(...)\>; sortDirection: ZodOptional\<(...)\>; filterField: ZodOptional\<(...)\>; filterValue: ZodOptional\<(...)\>; filterOperator: ZodOptional\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ users: UserWithRole\[\]; total: number \}\>; listUserSessions: StrictEndpoint\<"/admin/list-user-sessions", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ sessions: SessionWithImpersonatedBy\[\] \}\>; unbanUser: StrictEndpoint\<"/admin/unban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ user: UserWithRole \}\>; banUser: StrictEndpoint\<"/admin/ban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; banReason: ZodOptional\<(...)\>; banExpiresIn: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ user: UserWithRole \}\>; impersonateUser: StrictEndpoint\<"/admin/impersonate-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: UserWithRole \}\>; stopImpersonating: StrictEndpoint\<"/admin/stop-impersonating", \{ method: "POST"; requireHeaders: true \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) \| (...) \| (...); userAgent?: (...) \| (...) \| (...) \} & Record\<string, any\>; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \}\>; revokeUserSession: StrictEndpoint\<"/admin/revoke-user-session", \{ method: "POST"; body: ZodObject\<\{ sessionToken: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; revokeUserSessions: StrictEndpoint\<"/admin/revoke-user-sessions", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; removeUser: StrictEndpoint\<"/admin/remove-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; setUserPassword: StrictEndpoint\<"/admin/set-user-password", \{ method: "POST"; body: ZodObject\<\{ newPassword: ZodString; userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; userHasPermission: StrictEndpoint\<"/admin/has-permission", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ userId: ...; role: ... \}, $strip\>, ZodXor\<readonly \[(...), (...)\]\>\>; metadata: \{ openapi: \{ description: string; requestBody: \{ content: ... \}; responses: \{ 200: ... \} \}; $Infer: \{ body: (...) & (...) \} \} \}, \{ error: null; success: boolean \}\> \}; $ERROR\_CODES: \{ USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL: RawError\<"USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL"\>; FAILED\_TO\_CREATE\_USER: RawError\<"FAILED\_TO\_CREATE\_USER"\>; USER\_ALREADY\_EXISTS: RawError\<"USER\_ALREADY\_EXISTS"\>; YOU\_CANNOT\_BAN\_YOURSELF: RawError\<"YOU\_CANNOT\_BAN\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD"\>; BANNED\_USER: RawError\<"BANNED\_USER"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER"\>; NO\_DATA\_TO\_UPDATE: RawError\<"NO\_DATA\_TO\_UPDATE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS"\>; YOU\_CANNOT\_REMOVE\_YOURSELF: RawError\<"YOU\_CANNOT\_REMOVE\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE"\>; YOU\_CANNOT\_IMPERSONATE\_ADMINS: RawError\<"YOU\_CANNOT\_IMPERSONATE\_ADMINS"\>; INVALID\_ROLE\_TYPE: RawError\<"INVALID\_ROLE\_TYPE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL"\>; PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER: RawError\<"PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER"\> \}; schema: \{ user: \{ fields: \{ role: \{ type: "string"; required: false; input: false \}; banned: \{ type: "boolean"; defaultValue: false; required: false; input: false \}; banReason: \{ type: "string"; required: false; input: false \}; banExpires: \{ type: "date"; required: false; input: false \} \} \}; session: \{ fields: \{ impersonatedBy: \{ type: "string"; required: false; input: false \} \} \} \}; options: NoInfer\<AdminOptions\> \} \| DefaultOrganizationPlugin\<\{ allowUserToCreateOrganization?: boolean \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\>) =\> Awaitable\<boolean\>); organizationLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\>) =\> Awaitable\<boolean\>); creatorRole?: string; membershipLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \}, organization: \{ id: string; name: string; slug: string; logo?: string \| null; metadata?: any; createdAt: Date \}) =\> number \| Promise\<number\>); ac?: AccessControl; roles?: \{ \[key: string\]: Role\<any\> \| undefined \}; dynamicAccessControl?: \{ enabled?: boolean; maximumRolesPerOrganization?: number \| ((organizationId: string) =\> Awaitable\<(...)\>) \}; teams?: \{ enabled: boolean; defaultTeam?: \{ enabled: boolean; customCreateDefaultTeam?: (...) \| (...) \}; maximumTeams?: number \| ((data: \{ organizationId: ...; session: ... \}, ctx?: (...) \| (...)) =\> Awaitable\<(...)\>); maximumMembersPerTeam?: number \| ((data: \{ teamId: ...; session: ...; organizationId: ... \}) =\> Awaitable\<(...)\>); allowRemovingAllTeams?: boolean \}; invitationExpiresIn?: number; invitationLimit?: number \| ((data: \{ user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\>; organization: \{ id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... \} & Record\<(...), (...)\>; member: \{ id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... \} & Record\<(...), (...)\> \}, ctx: AuthContext) =\> Awaitable\<number\>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: \{ id: string; role: string; email: string; organization: \{ id: string; name: string; slug: string; logo?: (...) \| (...) \| (...); metadata?: any; createdAt: Date \}; invitation: \{ id: string; organizationId: string; email: string; role: string; status: (...) \| (...) \| (...) \| (...); teamId?: (...) \| (...) \| (...); inviterId: string; expiresAt: Date; createdAt: Date \}; inviter: \{ id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... \} & \{ user: ... \} \}, request?: Request) =\> Promise\<void\>; schema?: \{ session?: \{ fields?: (...) \| (...) \}; organization?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; member?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; invitation?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; team?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; teamMember?: \{ modelName?: (...) \| (...); fields?: (...) \| (...) \}; organizationRole?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \} \}; disableOrganizationDeletion?: boolean; organizationHooks?: \{ beforeCreateOrganization?: (data: \{ organization: ...; user: ... \}) =\> Promise\<(...)\>; afterCreateOrganization?: (data: \{ organization: ...; member: ...; user: ... \}) =\> Promise\<(...)\>; beforeUpdateOrganization?: (data: \{ organization: ...; user: ...; member: ... \}) =\> Promise\<(...)\>; afterUpdateOrganization?: (data: \{ organization: ...; user: ...; member: ... \}) =\> Promise\<(...)\>; beforeDeleteOrganization?: (data: \{ organization: ...; user: ... \}, ctx?: (...) \| (...)) =\> Promise\<(...)\>; afterDeleteOrganization?: (data: \{ organization: ...; user: ... \}, ctx?: (...) \| (...)) =\> Promise\<(...)\>; beforeAddMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAddMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRemoveMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRemoveMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeUpdateMemberRole?: (data: \{ member: ...; newRole: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterUpdateMemberRole?: (data: \{ member: ...; previousRole: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCreateInvitation?: (data: \{ invitation: ...; inviter: ...; organization: ... \}) =\> Promise\<(...)\>; afterCreateInvitation?: (data: \{ invitation: ...; inviter: ...; organization: ... \}) =\> Promise\<(...)\>; beforeAcceptInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAcceptInvitation?: (data: \{ invitation: ...; member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRejectInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRejectInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCancelInvitation?: (data: \{ invitation: ...; cancelledBy: ...; organization: ... \}) =\> Promise\<(...)\>; afterCancelInvitation?: (data: \{ invitation: ...; cancelledBy: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCreateTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; afterCreateTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; beforeUpdateTeam?: (data: \{ team: ...; updates: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterUpdateTeam?: (data: \{ team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeDeleteTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; afterDeleteTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; beforeAddTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAddTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRemoveTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRemoveTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\> \} \}\>)\[\]\];
\}\>

***

### createAuthOptions()

```ts
function createAuthOptions<DM, Schema>(
   ctx, 
   components, 
   options?): {
  appName?: string;
  baseURL?: BaseURLConfig;
  secret?: string;
  secrets?: {
     version: number;
     value: string;
  }[];
  secondaryStorage?: SecondaryStorage;
  emailVerification?: {
     sendVerificationEmail?: (data, request?) => Promise<void>;
     sendOnSignUp?: boolean;
     sendOnSignIn?: boolean;
     autoSignInAfterVerification?: boolean;
     expiresIn?: number;
     beforeEmailVerification?: (user, request?) => Promise<void>;
     afterEmailVerification?: (user, request?) => Promise<void>;
  };
  socialProviders?: SocialProviders;
  session?: BetterAuthDBOptions<"session", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "id"
     | "expiresAt"
     | "token"
     | "ipAddress"
     | "userAgent"> & {
     expiresIn?: number;
     updateAge?: number;
     disableSessionRefresh?: boolean;
     deferSessionRefresh?: boolean;
     storeSessionInDatabase?: boolean;
     preserveSessionInDatabase?: boolean;
     cookieCache?: {
        maxAge?: number;
        enabled?: boolean;
        strategy?: "compact" | "jwt" | "jwe";
        refreshCache?:   | boolean
           | {
           updateAge?: number;
         };
        version?:   | string
           | ((session, user) => string)
           | ((session, user) => Promise<string>);
     };
     freshAge?: number;
  };
  account?: BetterAuthDBOptions<"account", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "id"
     | "password"
     | "accountId"
     | "providerId"
     | "accessToken"
     | "refreshToken"
     | "idToken"
     | "accessTokenExpiresAt"
     | "refreshTokenExpiresAt"
     | "scope"> & {
     updateAccountOnSignIn?: boolean;
     accountLinking?: {
        enabled?: boolean;
        disableImplicitLinking?: boolean;
        requireLocalEmailVerified?: boolean;
        trustedProviders?:   | LiteralUnion<
           | "github"
           | "apple"
           | "atlassian"
           | "cognito"
           | "discord"
           | "facebook"
           | "figma"
           | "microsoft"
           | "google"
           | "huggingface"
           | "slack"
           | "spotify"
           | "twitch"
           | "twitter"
           | "dropbox"
           | "kick"
           | "linear"
           | "linkedin"
           | "gitlab"
           | "tiktok"
           | "reddit"
           | "roblox"
           | "salesforce"
           | "vk"
           | "zoom"
           | "notion"
           | "kakao"
           | "naver"
           | "line"
           | "paybin"
           | "paypal"
           | "polar"
           | "railway"
           | "vercel"
           | "wechat"
           | "email-password", string>[]
           | ((request?) => Awaitable<LiteralUnion<..., ...>[]>);
        allowDifferentEmails?: boolean;
        allowUnlinkingAll?: boolean;
        updateUserInfoOnLink?: boolean;
     };
     encryptOAuthTokens?: boolean;
     skipStateCookieCheck?: boolean;
     storeStateStrategy?: "database" | "cookie";
     storeAccountCookie?: boolean;
  };
  verification?: BetterAuthDBOptions<"verification", "value" | "createdAt" | "updatedAt" | "id" | "expiresAt" | "identifier"> & {
     disableCleanup?: boolean;
     storeIdentifier?:   | StoreIdentifierOption
        | {
        default: StoreIdentifierOption;
        overrides?: Record<string, StoreIdentifierOption>;
      };
     storeInDatabase?: boolean;
  };
  trustedOrigins?:   | string[]
     | ((request?) => Awaitable<(string | null | undefined)[]>);
  rateLimit?: BetterAuthRateLimitOptions;
  advanced?: BetterAuthAdvancedOptions;
  logger?: Logger;
  databaseHooks?: {
     user?: {
        create?: {
           before?: (user, context) => Promise<... | ... | ... | ...>;
           after?: (user, context) => Promise<void>;
        };
        update?: {
           before?: (user, context) => Promise<... | ... | ... | ...>;
           after?: (user, context) => Promise<void>;
        };
        delete?: {
           before?: (user, context) => Promise<... | ... | ...>;
           after?: (user, context) => Promise<void>;
        };
     };
     session?: {
        create?: {
           before?: (session, context) => Promise<... | ... | ... | ...>;
           after?: (session, context) => Promise<void>;
        };
        update?: {
           before?: (session, context) => Promise<... | ... | ... | ...>;
           after?: (session, context) => Promise<void>;
        };
        delete?: {
           before?: (session, context) => Promise<... | ... | ...>;
           after?: (session, context) => Promise<void>;
        };
     };
     account?: {
        create?: {
           before?: (account, context) => Promise<... | ... | ... | ...>;
           after?: (account, context) => Promise<void>;
        };
        update?: {
           before?: (account, context) => Promise<... | ... | ... | ...>;
           after?: (account, context) => Promise<void>;
        };
        delete?: {
           before?: (account, context) => Promise<... | ... | ...>;
           after?: (account, context) => Promise<void>;
        };
     };
     verification?: {
        create?: {
           before?: (verification, context) => Promise<... | ... | ... | ...>;
           after?: (verification, context) => Promise<void>;
        };
        update?: {
           before?: (verification, context) => Promise<... | ... | ... | ...>;
           after?: (verification, context) => Promise<void>;
        };
        delete?: {
           before?: (verification, context) => Promise<... | ... | ...>;
           after?: (verification, context) => Promise<void>;
        };
     };
  };
  onAPIError?: {
     throw?: boolean;
     onError?: (error, ctx) => void | Promise<void>;
     errorURL?: string;
     customizeDefaultErrorPage?: {
        colors?: {
           background?: string;
           foreground?: string;
           primary?: string;
           primaryForeground?: string;
           mutedForeground?: string;
           border?: string;
           destructive?: string;
           titleBorder?: string;
           titleColor?: string;
           gridColor?: string;
           cardBackground?: string;
           cornerBorder?: string;
        };
        size?: {
           radiusSm?: string;
           radiusMd?: string;
           radiusLg?: string;
           textSm?: string;
           text2xl?: string;
           text4xl?: string;
           text6xl?: string;
        };
        font?: {
           defaultFamily?: string;
           monoFamily?: string;
        };
        disableTitleBorder?: boolean;
        disableCornerDecorations?: boolean;
        disableBackgroundGrid?: boolean;
     };
  };
  hooks?: {
     before?: (inputContext) => Promise<unknown>;
     after?: (inputContext) => Promise<unknown>;
  };
  disabledPaths?: string[];
  telemetry?: {
     enabled?: boolean;
     debug?: boolean;
  };
  experimental?: {
     joins?: boolean;
  };
  basePath: string;
  database: AdapterFactory<BetterAuthOptions>;
  emailAndPassword: {
     disableSignUp?: boolean;
     requireEmailVerification?: boolean;
     maxPasswordLength?: number;
     minPasswordLength?: number;
     sendResetPassword?: (data, request?) => Promise<void>;
     resetPasswordTokenExpiresIn?: number;
     onPasswordReset?: (data, request?) => Promise<void>;
     password?: {
        hash?: (password) => Promise<string>;
        verify?: (data) => Promise<boolean>;
     };
     autoSignIn?: boolean;
     revokeSessionsOnPasswordReset?: boolean;
     onExistingUserSignUp?: (data, request?) => Promise<void>;
     customSyntheticUser?: (params) => Record<string, unknown>;
     enabled: boolean;
  };
  user: {
     modelName?: "user" | LiteralString;
     fields?: Partial<Record<"createdAt" | "updatedAt" | "email" | "emailVerified" | "name" | "image", string>>;
     additionalFields?: {
      [key: string]: DBFieldAttribute;
     };
     changeEmail?: {
        enabled: boolean;
        sendChangeEmailConfirmation?: (data, request?) => Promise<void>;
        updateEmailWithoutVerification?: boolean;
     };
     deleteUser?: {
        enabled?: boolean;
        sendDeleteAccountVerification?: (data, request?) => Promise<void>;
        beforeDelete?: (user, request?) => Promise<void>;
        afterDelete?: (user, request?) => Promise<void>;
        deleteTokenExpiresIn?: number;
     };
  };
  plugins: [{
     id: "convex";
     version: string;
     init: (ctx) => void;
     hooks: {
        before: (
           | {
           matcher: boolean;
           handler: (inputContext) => Promise<
              | {
              context: ...;
            }
             | undefined>;
         }
           | {
           matcher: (ctx) => boolean;
           handler: (inputContext) => Promise<{
              context: MiddlewareContext<..., ...>;
           }>;
        })[];
        after: {
           matcher: (context) => boolean;
           handler: (inputContext) => Promise<unknown>;
        }[];
     };
     endpoints: {
        getOpenIdConfig: StrictEndpoint<"/convex/.well-known/openid-configuration", {
           method: "GET";
           metadata: {
              isAction: false;
           };
        }, OIDCMetadata>;
        getJwks: StrictEndpoint<"/convex/jwks", {
           method: "GET";
           metadata: {
              openapi: {
                 description: string;
                 responses: {
                    200: {
                       description: string;
                       content: {
                          application/json: ...;
                       };
                    };
                 };
              };
           };
        }, JSONWebKeySet>;
        getLatestJwks: StrictEndpoint<"/convex/latest-jwks", {
           isAction: boolean;
           method: "POST";
           metadata: {
              SERVER_ONLY: true;
              openapi: {
                 description: string;
              };
           };
        }, any[]>;
        rotateKeys: StrictEndpoint<"/convex/rotate-keys", {
           isAction: boolean;
           method: "POST";
           metadata: {
              SERVER_ONLY: true;
              openapi: {
                 description: string;
              };
           };
        }, any[]>;
        getToken: StrictEndpoint<"/convex/token", {
           method: "GET";
           requireHeaders: true;
           use: (inputContext) => Promise<{
              session: {
                 session: ...;
                 user: ...;
              };
           }>[];
           metadata: {
              openapi: {
                 description: string;
                 responses: {
                    200: {
                       description: string;
                       content: {
                          application/json: ...;
                       };
                    };
                 };
              };
           };
         }, {
           token: string;
        }>;
     };
     schema: {
        jwks: {
           fields: {
              publicKey: {
                 type: "string";
                 required: true;
              };
              privateKey: {
                 type: "string";
                 required: true;
              };
              createdAt: {
                 type: "date";
                 required: true;
              };
              expiresAt: {
                 type: "date";
                 required: false;
              };
           };
        };
        user: {
           fields: {
              userId: {
                 type: "string";
                 required: false;
                 input: false;
              };
           };
        };
     };
  }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void>)[]; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { status: boolean; token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> } | { status: boolean; token: null; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ZodString; otp: ZodString; name: ZodOptional<(...)>; image: ZodOptional<(...)> }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<ZodString> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ZodOptional<(...)>; name: ZodOptional<(...)>; context: ZodOptional<(...)> }, $strip>>; metadata: { openapi: { operationId: string; description: string; parameters: { name: ...; in: ...; required: ...; description: ...; schema: ... }[]; responses: { 200: { description: ...; content: ... } } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<ZodString> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... }; 400: { description: ... } } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<ZodAny, ZodAny> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } }; $Infer: { body: { response: AuthenticationResponseJSON } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>) | ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>))[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>) | ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>))[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined } | { id: "admin"; version: string; init: any; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<(...)[] | undefined> }[] }; endpoints: { setRole: StrictEndpoint<"/admin/set-role", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown>; role: ZodUnion<readonly [(...), (...)]> }, $strip>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } }; $Infer: { body: { userId: string; role: (...) | (...) | (...) } } } }, { user: UserWithRole }>; getUser: StrictEndpoint<"/admin/get-user", { method: "GET"; query: ZodObject<{ id: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, UserWithRole>; createUser: StrictEndpoint<"/admin/create-user", { method: "POST"; body: ZodObject<{ email: ZodString; password: ZodOptional<ZodString>; name: ZodString; role: ZodOptional<ZodUnion<(...)>>; data: ZodOptional<ZodRecord<(...), (...)>> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } }; $Infer: { body: { email: string; password?: (...) | (...); name: string; role?: (...) | (...) | (...) | (...); data?: (...) | (...) } } } }, { user: UserWithRole }>; adminUpdateUser: StrictEndpoint<"/admin/update-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown>; data: ZodRecord<ZodAny, ZodAny> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, UserWithRole>; listUsers: StrictEndpoint<"/admin/list-users", { method: "GET"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; query: ZodObject<{ searchValue: ZodOptional<ZodString>; searchField: ZodOptional<ZodEnum<(...)>>; searchOperator: ZodOptional<ZodEnum<(...)>>; limit: ZodOptional<ZodUnion<(...)>>; offset: ZodOptional<ZodUnion<(...)>>; sortBy: ZodOptional<ZodString>; sortDirection: ZodOptional<ZodEnum<(...)>>; filterField: ZodOptional<ZodString>; filterValue: ZodOptional<ZodUnion<(...)>>; filterOperator: ZodOptional<ZodEnum<(...)>> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { users: UserWithRole[]; total: number }>; listUserSessions: StrictEndpoint<"/admin/list-user-sessions", { method: "POST"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; body: ZodObject<{ userId: ZodCoercedString<unknown> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { sessions: SessionWithImpersonatedBy[] }>; unbanUser: StrictEndpoint<"/admin/unban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { user: UserWithRole }>; banUser: StrictEndpoint<"/admin/ban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown>; banReason: ZodOptional<ZodString>; banExpiresIn: ZodOptional<ZodNumber> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { user: UserWithRole }>; impersonateUser: StrictEndpoint<"/admin/impersonate-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: UserWithRole }>; stopImpersonating: StrictEndpoint<"/admin/stop-impersonating", { method: "POST"; requireHeaders: true }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null } & Record<string, any>; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } & Record<string, any> }>; revokeUserSession: StrictEndpoint<"/admin/revoke-user-session", { method: "POST"; body: ZodObject<{ sessionToken: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; revokeUserSessions: StrictEndpoint<"/admin/revoke-user-sessions", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; removeUser: StrictEndpoint<"/admin/remove-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<unknown> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; setUserPassword: StrictEndpoint<"/admin/set-user-password", { method: "POST"; body: ZodObject<{ newPassword: ZodString; userId: ZodCoercedString<unknown> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { status: boolean }>; userHasPermission: StrictEndpoint<"/admin/has-permission", { method: "POST"; body: ZodIntersection<ZodObject<{ userId: ZodOptional<(...)>; role: ZodOptional<(...)> }, $strip>, ZodXor<readonly [ZodObject<(...), (...)>, ZodObject<(...), (...)>]>>; metadata: { openapi: { description: string; requestBody: { content: { application/json: ... } }; responses: { 200: { description: ...; content: ... } } }; $Infer: { body: { permissions: ... } & { userId?: ...; role?: ... } } } }, { error: null; success: boolean }> }; $ERROR_CODES: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: RawError<"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL">; FAILED_TO_CREATE_USER: RawError<"FAILED_TO_CREATE_USER">; USER_ALREADY_EXISTS: RawError<"USER_ALREADY_EXISTS">; YOU_CANNOT_BAN_YOURSELF: RawError<"YOU_CANNOT_BAN_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: RawError<"YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE">; YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_BAN_USERS">; YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD">; BANNED_USER: RawError<"BANNED_USER">; YOU_ARE_NOT_ALLOWED_TO_GET_USER: RawError<"YOU_ARE_NOT_ALLOWED_TO_GET_USER">; NO_DATA_TO_UPDATE: RawError<"NO_DATA_TO_UPDATE">; YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS">; YOU_CANNOT_REMOVE_YOURSELF: RawError<"YOU_CANNOT_REMOVE_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE">; YOU_CANNOT_IMPERSONATE_ADMINS: RawError<"YOU_CANNOT_IMPERSONATE_ADMINS">; INVALID_ROLE_TYPE: RawError<"INVALID_ROLE_TYPE">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL">; PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: RawError<"PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER"> }; schema: { user: { fields: { role: { type: "string"; required: false; input: false }; banned: { type: "boolean"; defaultValue: false; required: false; input: false }; banReason: { type: "string"; required: false; input: false }; banExpires: { type: "date"; required: false; input: false } } }; session: { fields: { impersonatedBy: { type: "string"; required: false; input: false } } } }; options: NoInfer<AdminOptions> } | DefaultOrganizationPlugin<{ allowUserToCreateOrganization?: boolean | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } & Record<string, any>) => Awaitable<boolean>); organizationLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } & Record<string, any>) => Awaitable<boolean>); creatorRole?: string; membershipLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null }, organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: any; createdAt: Date }) => number | Promise<number>); ac?: AccessControl; roles?: { [key: string]: Role<any> | undefined }; dynamicAccessControl?: { enabled?: boolean; maximumRolesPerOrganization?: number | ((organizationId: string) => Awaitable<number>) }; teams?: { enabled: boolean; defaultTeam?: { enabled: boolean; customCreateDefaultTeam?: (organization: ..., ctx?: ...) => ... }; maximumTeams?: number | ((data: { organizationId: string; session: (...) | (...) }, ctx?: GenericEndpointContext) => Awaitable<number>); maximumMembersPerTeam?: number | ((data: { teamId: string; session: { user: ...; session: ... }; organizationId: string }) => Awaitable<number>); allowRemovingAllTeams?: boolean }; invitationExpiresIn?: number; invitationLimit?: number | ((data: { user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any>; organization: { id: string; name: string; slug: string; logo?: (...) | (...) | (...); metadata?: any; createdAt: Date } & Record<string, any>; member: { id: string; organizationId: string; userId: string; role: string; createdAt: Date } & Record<string, any> }, ctx: AuthContext) => Awaitable<number>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: { id: string; role: string; email: string; organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: any; createdAt: Date }; invitation: { id: string; organizationId: string; email: string; role: string; status: "pending" | "accepted" | "rejected" | "canceled"; teamId?: string | null; inviterId: string; expiresAt: Date; createdAt: Date }; inviter: { id: string; organizationId: string; userId: string; role: string; createdAt: Date } & { user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } } }, request?: Request) => Promise<void>; schema?: { session?: { fields?: { activeOrganizationId?: ...; activeTeamId?: ... } }; organization?: { modelName?: string; fields?: { name?: ...; slug?: ...; logo?: ...; metadata?: ...; createdAt?: ... }; additionalFields?: { [key: ...]: ... } }; member?: { modelName?: string; fields?: { organizationId?: ...; userId?: ...; role?: ...; createdAt?: ... }; additionalFields?: { [key: ...]: ... } }; invitation?: { modelName?: string; fields?: { organizationId?: ...; email?: ...; role?: ...; status?: ...; teamId?: ...; inviterId?: ...; expiresAt?: ...; createdAt?: ... }; additionalFields?: { [key: ...]: ... } }; team?: { modelName?: string; fields?: { name?: ...; organizationId?: ...; createdAt?: ...; updatedAt?: ... }; additionalFields?: { [key: ...]: ... } }; teamMember?: { modelName?: string; fields?: { teamId?: ...; userId?: ...; createdAt?: ... } }; organizationRole?: { modelName?: string; fields?: { organizationId?: ...; role?: ...; permission?: ...; createdAt?: ...; updatedAt?: ... }; additionalFields?: { [key: ...]: ... } } }; disableOrganizationDeletion?: boolean; organizationHooks?: { beforeCreateOrganization?: (data: { organization: { name?: ...; slug?: ...; logo?: ...; metadata?: ...; [key: ...]: ... }; user: (...) & (...) }) => Promise<(...) | (...)>; afterCreateOrganization?: (data: { organization: (...) & (...); member: (...) & (...); user: (...) & (...) }) => Promise<void>; beforeUpdateOrganization?: (data: { organization: { name?: ...; slug?: ...; logo?: ...; metadata?: ...; [key: ...]: ... }; user: (...) & (...); member: (...) & (...) }) => Promise<(...) | (...)>; afterUpdateOrganization?: (data: { organization: (...) | (...); user: (...) & (...); member: (...) & (...) }) => Promise<void>; beforeDeleteOrganization?: (data: { organization: (...) & (...); user: (...) & (...) }, ctx?: GenericEndpointContext) => Promise<void>; afterDeleteOrganization?: (data: { organization: (...) & (...); user: (...) & (...) }, ctx?: GenericEndpointContext) => Promise<void>; beforeAddMember?: (data: { member: { userId: ...; organizationId: ...; role: ...; [key: ...]: ... }; user: (...) & (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterAddMember?: (data: { member: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeRemoveMember?: (data: { member: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; afterRemoveMember?: (data: { member: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeUpdateMemberRole?: (data: { member: (...) & (...); newRole: string; user: (...) & (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterUpdateMemberRole?: (data: { member: (...) & (...); previousRole: string; user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeCreateInvitation?: (data: { invitation: { email: ...; role: ...; organizationId: ...; inviterId: ...; teamId?: ...; [key: ...]: ... }; inviter: (...) & (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterCreateInvitation?: (data: { invitation: (...) & (...); inviter: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeAcceptInvitation?: (data: { invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; afterAcceptInvitation?: (data: { invitation: (...) & (...); member: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeRejectInvitation?: (data: { invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; afterRejectInvitation?: (data: { invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeCancelInvitation?: (data: { invitation: (...) & (...); cancelledBy: (...) & (...); organization: (...) & (...) }) => Promise<void>; afterCancelInvitation?: (data: { invitation: (...) & (...); cancelledBy: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeCreateTeam?: (data: { team: { name: ...; organizationId: ...; [key: ...]: ... }; user?: (...) | (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterCreateTeam?: (data: { team: (...) & (...); user?: (...) | (...); organization: (...) & (...) }) => Promise<void>; beforeUpdateTeam?: (data: { team: (...) & (...); updates: { name?: ...; [key: ...]: ... }; user: (...) & (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterUpdateTeam?: (data: { team: (...) | (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeDeleteTeam?: (data: { team: (...) & (...); user?: (...) | (...); organization: (...) & (...) }) => Promise<void>; afterDeleteTeam?: (data: { team: (...) & (...); user?: (...) | (...); organization: (...) & (...) }) => Promise<void>; beforeAddTeamMember?: (data: { teamMember: { teamId: ...; userId: ...; [key: ...]: ... }; team: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<(...) | (...)>; afterAddTeamMember?: (data: { teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; beforeRemoveTeamMember?: (data: { teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void>; afterRemoveTeamMember?: (data: { teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) }) => Promise<void> } }>)[]];
};
```

Defined in: [src/convex/client/index.ts:1024](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1024)

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | - |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `true`\> | `SchemaDefinition`\<\{ `user`: `TableDefinition`\<`VObject`\<\{ `image?`: `string` \| `null`; `role?`: `string` \| `null`; `banReason?`: `string` \| `null`; `banned?`: `boolean` \| `null`; `banExpires?`: `number` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `email`: `string`; `emailVerified`: `boolean`; `name`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `emailVerified`: `VBoolean`\<`boolean`, `"required"`\>; `image`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `role`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `banned`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; `banReason`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `banExpires`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"` \| `"role"` \| `"banReason"` \| `"banned"` \| `"banExpires"`\>, \{ `email_name`: \[`"email"`, `"name"`, `"_creationTime"`\]; `name`: \[`"name"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `session`: `TableDefinition`\<`VObject`\<\{ `ipAddress?`: `string` \| `null`; `userAgent?`: `string` \| `null`; `activeOrganizationId?`: `string` \| `null`; `impersonatedBy?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `expiresAt`: `number`; `token`: `string`; \}, \{ `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `token`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `ipAddress`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userAgent`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VString`\<`string`, `"required"`\>; `impersonatedBy`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `activeOrganizationId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"` \| `"activeOrganizationId"` \| `"impersonatedBy"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `expiresAt_userId`: \[`"expiresAt"`, `"userId"`, `"_creationTime"`\]; `token`: \[`"token"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; `userId_expiresAt`: \[`"userId"`, `"expiresAt"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `account`: `TableDefinition`\<`VObject`\<\{ `password?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `idToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `scope?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `accountId`: `string`; `providerId`: `string`; \}, \{ `accountId`: `VString`\<`string`, `"required"`\>; `providerId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `idToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `scope`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `password`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\>, \{ `accountId`: \[`"accountId"`, `"_creationTime"`\]; `accountId_providerId`: \[`"accountId"`, `"providerId"`, `"_creationTime"`\]; `providerId_userId`: \[`"providerId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `verification`: `TableDefinition`\<`VObject`\<\{ `value`: `string`; `createdAt`: `number`; `updatedAt`: `number`; `expiresAt`: `number`; `identifier`: `string`; \}, \{ `identifier`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"expiresAt"` \| `"identifier"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `identifier`: \[`"identifier"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `rateLimit`: `TableDefinition`\<`VObject`\<\{ `key`: `string`; `count`: `number`; `lastRequest`: `number`; \}, \{ `key`: `VString`\<`string`, `"required"`\>; `count`: `VFloat64`\<`number`, `"required"`\>; `lastRequest`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"key"` \| `"count"` \| `"lastRequest"`\>, \{ `key`: \[`"key"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `passkey`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `name?`: `string` \| `null`; `transports?`: `string` \| `null`; `aaguid?`: `string` \| `null`; `userId`: `string`; `publicKey`: `string`; `credentialID`: `string`; `counter`: `number`; `deviceType`: `string`; `backedUp`: `boolean`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `publicKey`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `credentialID`: `VString`\<`string`, `"required"`\>; `counter`: `VFloat64`\<`number`, `"required"`\>; `deviceType`: `VString`\<`string`, `"required"`\>; `backedUp`: `VBoolean`\<`boolean`, `"required"`\>; `transports`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `aaguid`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"name"` \| `"userId"` \| `"publicKey"` \| `"credentialID"` \| `"counter"` \| `"deviceType"` \| `"backedUp"` \| `"transports"` \| `"aaguid"`\>, \{ `credentialID`: \[`"credentialID"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `jwks`: `TableDefinition`\<`VObject`\<\{ `expiresAt?`: `number` \| `null`; `createdAt`: `number`; `publicKey`: `string`; `privateKey`: `string`; \}, \{ `publicKey`: `VString`\<`string`, `"required"`\>; `privateKey`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `expiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"expiresAt"` \| `"publicKey"` \| `"privateKey"`\>, \{ \}, \{ \}, \{ \}\>; `organization`: `TableDefinition`\<`VObject`\<\{ `metadata?`: `string` \| `null`; `logo?`: `string` \| `null`; `createdAt`: `number`; `name`: `string`; `slug`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `slug`: `VString`\<`string`, `"required"`\>; `logo`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `metadata`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"name"` \| `"metadata"` \| `"slug"` \| `"logo"`\>, \{ `name`: \[`"name"`, `"_creationTime"`\]; `slug`: \[`"slug"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `member`: `TableDefinition`\<`VObject`\<\{ `createdAt`: `number`; `userId`: `string`; `organizationId`: `string`; `role`: `string`; \}, \{ `organizationId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `role`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"createdAt"` \| `"userId"` \| `"organizationId"` \| `"role"`\>, \{ `organizationId`: \[`"organizationId"`, `"_creationTime"`\]; `organizationId_userId`: \[`"organizationId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; `role`: \[`"role"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `invitation`: `TableDefinition`\<`VObject`\<\{ `role?`: `string` \| `null`; `createdAt`: `number`; `email`: `string`; `expiresAt`: `number`; `organizationId`: `string`; `status`: `string`; `inviterId`: `string`; \}, \{ `organizationId`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `role`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `status`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `inviterId`: `VString`\<`string`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"email"` \| `"expiresAt"` \| `"organizationId"` \| `"role"` \| `"status"` \| `"inviterId"`\>, \{ `organizationId`: \[`"organizationId"`, `"_creationTime"`\]; `email`: \[`"email"`, `"_creationTime"`\]; `role`: \[`"role"`, `"_creationTime"`\]; `status`: \[`"status"`, `"_creationTime"`\]; `inviterId`: \[`"inviterId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthApplication`: `TableDefinition`\<`VObject`\<\{ `type?`: `string` \| `null`; `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `name?`: `string` \| `null`; `userId?`: `string` \| `null`; `metadata?`: `string` \| `null`; `icon?`: `string` \| `null`; `clientId?`: `string` \| `null`; `clientSecret?`: `string` \| `null`; `redirectUrls?`: `string` \| `null`; `disabled?`: `boolean` \| `null`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `icon`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `metadata`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `clientSecret`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `redirectUrls`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `type`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `disabled`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"type"` \| `"createdAt"` \| `"updatedAt"` \| `"name"` \| `"userId"` \| `"metadata"` \| `"icon"` \| `"clientId"` \| `"clientSecret"` \| `"redirectUrls"` \| `"disabled"`\>, \{ `clientId`: \[`"clientId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthAccessToken`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `userId?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `clientId?`: `string` \| `null`; `scopes?`: `string` \| `null`; \}, \{ `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `scopes`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"accessToken"` \| `"refreshToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"clientId"` \| `"scopes"`\>, \{ `accessToken`: \[`"accessToken"`, `"_creationTime"`\]; `refreshToken`: \[`"refreshToken"`, `"_creationTime"`\]; `clientId`: \[`"clientId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthConsent`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `userId?`: `string` \| `null`; `clientId?`: `string` \| `null`; `scopes?`: `string` \| `null`; `consentGiven?`: `boolean` \| `null`; \}, \{ `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `scopes`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `consentGiven`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"clientId"` \| `"scopes"` \| `"consentGiven"`\>, \{ `clientId_userId`: \[`"clientId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; \}, `true`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `GenericCtx`\<`DM`\> |
| `components` | [`AuthSetupComponents`](#authsetupcomponents) |
| `options?` | [`SetupAuthOptions`](#setupauthoptions)\<`DM`, `Schema`\> |

#### Returns

| Name | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| `appName?` | `string` | - | The name of your application. Used as a display name in contexts where your app needs to be identified — for example, as the default issuer name in authenticator apps when users set up 2FA/TOTP. Can also be set via the `APP_NAME` environment variable. **Default** `"Better Auth"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:372 |
| `baseURL?` | `BaseURLConfig` | - | Base URL for the Better Auth. This is typically the root URL where your application server is hosted. Can be configured as: - A static string: `"https://myapp.com"` - A dynamic config with allowed hosts for multi-domain deployments If not explicitly set, the system will check environment variables: `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, etc. **Example** `// Static URL baseURL: "https://myapp.com" // Dynamic with allowed hosts (for Vercel, multi-domain, etc.) baseURL: { allowedHosts: ["myapp.com", "*.vercel.app", "preview-*.myapp.com"], fallback: "https://myapp.com" }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:396 |
| `secret?` | `string` | - | The secret to use for encryption, signing and hashing. By default Better Auth will look for the following environment variables: process.env.BETTER_AUTH_SECRET, process.env.AUTH_SECRET If none of these environment variables are set, it will default to "better-auth-secret-123456789". on production if it's not set it will throw an error. you can generate a good secret using the following command: **Example** `openssl rand -base64 32` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:428 |
| `secrets?` | \{ `version`: `number`; `value`: `string`; \}[] | - | Versioned secrets for non-destructive secret rotation. When set, encryption uses an envelope format with key IDs. First entry is the current key used for new encryption. Remaining entries are decryption-only (previous rotations). Can also be set via BETTER_AUTH_SECRETS env var: `BETTER_AUTH_SECRETS=2:base64secret,1:base64secret` When set, `secret` is only used as legacy fallback for decrypting bare-hex payloads that predate the envelope format. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:441 |
| `secondaryStorage?` | `SecondaryStorage` | - | Secondary storage configuration This is used to store session and rate limit data. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:506 |
| `emailVerification?` | \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \} | - | Email verification configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:510 |
| `emailVerification.sendVerificationEmail()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:516 |
| `emailVerification.sendOnSignUp?` | `boolean` | - | Send a verification email automatically after sign up. - `true`: Always send verification email on sign up - `false`: Never send verification email on sign up - `undefined`: Follows `requireEmailVerification` behavior **Default** `undefined` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:542 |
| `emailVerification.sendOnSignIn?` | `boolean` | - | Send a verification email automatically on sign in when the user's email is not verified **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:549 |
| `emailVerification.autoSignInAfterVerification?` | `boolean` | - | Auto signin the user after they verify their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:553 |
| `emailVerification.expiresIn?` | `number` | - | Number of seconds the verification token is valid for. **Default** `3600 seconds (1 hour)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:559 |
| `emailVerification.beforeEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user verifies their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:565 |
| `emailVerification.afterEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called when a user's email is updated to verified | node\_modules/@better-auth/core/dist/types/init-options.d.mts:571 |
| `socialProviders?` | `SocialProviders` | - | list of social providers | node\_modules/@better-auth/core/dist/types/init-options.d.mts:725 |
| `session?` | `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"compact"` \| `"jwt"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: `number`; \}; `version?`: \| `string` \| ((`session`, `user`) => `string`) \| ((`session`, `user`) => `Promise`\<`string`\>); \}; `freshAge?`: `number`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:800 |
| `account?` | `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: \| `LiteralUnion`\< \| `"github"` \| `"apple"` \| `"atlassian"` \| `"cognito"` \| `"discord"` \| `"facebook"` \| `"figma"` \| `"microsoft"` \| `"google"` \| `"huggingface"` \| `"slack"` \| `"spotify"` \| `"twitch"` \| `"twitter"` \| `"dropbox"` \| `"kick"` \| `"linear"` \| `"linkedin"` \| `"gitlab"` \| `"tiktok"` \| `"reddit"` \| `"roblox"` \| `"salesforce"` \| `"vk"` \| `"zoom"` \| `"notion"` \| `"kakao"` \| `"naver"` \| `"line"` \| `"paybin"` \| `"paypal"` \| `"polar"` \| `"railway"` \| `"vercel"` \| `"wechat"` \| `"email-password"`, `string`\>[] \| ((`request?`) => `Awaitable`\<`LiteralUnion`\<..., ...\>[]\>); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:928 |
| `verification?` | `BetterAuthDBOptions`\<`"verification"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>; \}; `storeInDatabase?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1068 |
| `trustedOrigins?` | \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>) | - | Additional trusted origins. By default, Better Auth trusts your app's [baseURL](#createauthoptions-2). Use this option to allow additional origins (e.g. a separate frontend domain). Can be a static array, a function that returns origins dynamically, or use wildcard patterns (e.g. `"https://*.example.com"`). **Param** **request** The request object. It'll be undefined if no request was made. Like during a create context call or `auth.api` call. Trusted origins will be dynamically calculated based on the request. **Example** `trustedOrigins: async (request) => { return [ "https://better-auth.com", "https://*.better-auth.com", request.headers.get("x-custom-origin") ]; }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1119 |
| `rateLimit?` | `BetterAuthRateLimitOptions` | - | Rate limiting configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1123 |
| `advanced?` | `BetterAuthAdvancedOptions` | - | Advanced options | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1127 |
| `logger?` | `Logger` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1128 |
| `databaseHooks?` | \{ `user?`: \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; \}; `session?`: \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; \}; `account?`: \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; \}; `verification?`: \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; \}; \} | - | allows you to define custom hooks that can be executed during lifecycle of core database operations. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1134 |
| `databaseHooks.user?` | \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; \} | - | User hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1138 |
| `databaseHooks.user.create?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1139 |
| `databaseHooks.user.create.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is created. if the hook returns false, the user will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1145 |
| `databaseHooks.user.create.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1151 |
| `databaseHooks.user.update?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1153 |
| `databaseHooks.user.update.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is updated. if the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1159 |
| `databaseHooks.user.update.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1165 |
| `databaseHooks.user.delete?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1167 |
| `databaseHooks.user.delete.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a user is deleted. if the hook returns false, the user will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1172 |
| `databaseHooks.user.delete.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1176 |
| `databaseHooks.session?` | \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; \} | - | Session Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1182 |
| `databaseHooks.session.create?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1183 |
| `databaseHooks.session.create.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a session is created. if the hook returns false, the session will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1189 |
| `databaseHooks.session.create.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1195 |
| `databaseHooks.session.update?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1200 |
| `databaseHooks.session.update.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is updated. if the hook returns false, the session will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1206 |
| `databaseHooks.session.update.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1212 |
| `databaseHooks.session.delete?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1214 |
| `databaseHooks.session.delete.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a session is deleted. if the hook returns false, the session will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1219 |
| `databaseHooks.session.delete.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1223 |
| `databaseHooks.account?` | \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; \} | - | Account Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1229 |
| `databaseHooks.account.create?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1230 |
| `databaseHooks.account.create.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a account is created. If the hook returns false, the account will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1236 |
| `databaseHooks.account.create.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a account is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1242 |
| `databaseHooks.account.update?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1247 |
| `databaseHooks.account.update.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a account is update. If the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1253 |
| `databaseHooks.account.update.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a account is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1259 |
| `databaseHooks.account.delete?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1261 |
| `databaseHooks.account.delete.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before an account is deleted. if the hook returns false, the account will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1266 |
| `databaseHooks.account.delete.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after an account is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1270 |
| `databaseHooks.verification?` | \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; \} | - | Verification Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1276 |
| `databaseHooks.verification.create?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1277 |
| `databaseHooks.verification.create.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a verification is created. if the hook returns false, the verification will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1283 |
| `databaseHooks.verification.create.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1289 |
| `databaseHooks.verification.update?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1291 |
| `databaseHooks.verification.update.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a verification is updated. if the hook returns false, the verification will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1297 |
| `databaseHooks.verification.update.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1303 |
| `databaseHooks.verification.delete?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1305 |
| `databaseHooks.verification.delete.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a verification is deleted. if the hook returns false, the verification will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1310 |
| `databaseHooks.verification.delete.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1314 |
| `onAPIError?` | \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \} | - | API error handling | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1321 |
| `onAPIError.throw?` | `boolean` | - | Throw an error on API error **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1327 |
| `onAPIError.onError()?` | (`error`, `ctx`) => `void` \| `Promise`\<`void`\> | - | Custom error handler | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1334 |
| `onAPIError.errorURL?` | `string` | - | The URL to redirect to on error When errorURL is provided, the error will be added to the URL as a query parameter and the user will be redirected to the errorURL. **Default** `- "/api/auth/error"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1343 |
| `onAPIError.customizeDefaultErrorPage?` | \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \} | - | Configure the default error page provided by Better-Auth Start your dev server and go to /api/auth/error to see the error page. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1348 |
| `onAPIError.customizeDefaultErrorPage.colors?` | \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1349 |
| `onAPIError.customizeDefaultErrorPage.colors.background?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1350 |
| `onAPIError.customizeDefaultErrorPage.colors.foreground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1351 |
| `onAPIError.customizeDefaultErrorPage.colors.primary?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1352 |
| `onAPIError.customizeDefaultErrorPage.colors.primaryForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1353 |
| `onAPIError.customizeDefaultErrorPage.colors.mutedForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1354 |
| `onAPIError.customizeDefaultErrorPage.colors.border?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1355 |
| `onAPIError.customizeDefaultErrorPage.colors.destructive?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1356 |
| `onAPIError.customizeDefaultErrorPage.colors.titleBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1357 |
| `onAPIError.customizeDefaultErrorPage.colors.titleColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1358 |
| `onAPIError.customizeDefaultErrorPage.colors.gridColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1359 |
| `onAPIError.customizeDefaultErrorPage.colors.cardBackground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1360 |
| `onAPIError.customizeDefaultErrorPage.colors.cornerBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1361 |
| `onAPIError.customizeDefaultErrorPage.size?` | \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1363 |
| `onAPIError.customizeDefaultErrorPage.size.radiusSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1364 |
| `onAPIError.customizeDefaultErrorPage.size.radiusMd?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1365 |
| `onAPIError.customizeDefaultErrorPage.size.radiusLg?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1366 |
| `onAPIError.customizeDefaultErrorPage.size.textSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1367 |
| `onAPIError.customizeDefaultErrorPage.size.text2xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1368 |
| `onAPIError.customizeDefaultErrorPage.size.text4xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1369 |
| `onAPIError.customizeDefaultErrorPage.size.text6xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1370 |
| `onAPIError.customizeDefaultErrorPage.font?` | \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1372 |
| `onAPIError.customizeDefaultErrorPage.font.defaultFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1373 |
| `onAPIError.customizeDefaultErrorPage.font.monoFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1374 |
| `onAPIError.customizeDefaultErrorPage.disableTitleBorder?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1376 |
| `onAPIError.customizeDefaultErrorPage.disableCornerDecorations?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1377 |
| `onAPIError.customizeDefaultErrorPage.disableBackgroundGrid?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1378 |
| `hooks?` | \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \} | - | Hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1384 |
| `hooks.before()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | Before a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1388 |
| `hooks.after()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | After a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1392 |
| `disabledPaths?` | `string`[] | - | Disabled paths Paths you want to disable. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1399 |
| `telemetry?` | \{ `enabled?`: `boolean`; `debug?`: `boolean`; \} | - | Telemetry configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1403 |
| `telemetry.enabled?` | `boolean` | - | Enable telemetry collection **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1409 |
| `telemetry.debug?` | `boolean` | - | Enable debug mode **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1415 |
| `experimental?` | \{ `joins?`: `boolean`; \} | - | Experimental features | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1420 |
| `experimental.joins?` | `boolean` | - | Enable experimental joins for your database adapter. 	Please read the adapter documentation for more information regarding joins before enabling this. 	Not all adapters support joins. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1429 |
| `basePath` | `string` | `resolvedBasePath` | - | [src/convex/client/index.ts:913](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L913) |
| `database` | `AdapterFactory`\<`BetterAuthOptions`\> | - | - | [src/convex/client/index.ts:914](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L914) |
| `emailAndPassword` | \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \} | - | - | [src/convex/client/index.ts:916](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L916) |
| `emailAndPassword.disableSignUp?` | `boolean` | - | Disable email and password sign up **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:588 |
| `emailAndPassword.requireEmailVerification?` | `boolean` | - | Require email verification before a session can be created for the user. if the user is not verified, the user will not be able to sign in and on sign in attempts, the user will be prompted to verify their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:596 |
| `emailAndPassword.maxPasswordLength?` | `number` | - | The maximum length of the password. **Default** `128` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:602 |
| `emailAndPassword.minPasswordLength?` | `number` | - | The minimum length of the password. **Default** `8` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:608 |
| `emailAndPassword.sendResetPassword()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | send reset password | node\_modules/@better-auth/core/dist/types/init-options.d.mts:612 |
| `emailAndPassword.resetPasswordTokenExpiresIn?` | `number` | - | Number of seconds the reset password token is valid for. **Default** `1 hour (60 * 60)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:634 |
| `emailAndPassword.onPasswordReset()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user's password is changed successfully. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:639 |
| `emailAndPassword.password?` | \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \} | - | Password hashing and verification By default Scrypt is used for password hashing and verification. You can provide your own hashing and verification function. if you want to use a different algorithm. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:650 |
| `emailAndPassword.password.hash()?` | (`password`) => `Promise`\<`string`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:651 |
| `emailAndPassword.password.verify()?` | (`data`) => `Promise`\<`boolean`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:652 |
| `emailAndPassword.autoSignIn?` | `boolean` | - | Automatically sign in the user after sign up **Default** `true` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:662 |
| `emailAndPassword.revokeSessionsOnPasswordReset?` | `boolean` | - | Whether to revoke all other sessions when resetting password **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:667 |
| `emailAndPassword.onExistingUserSignUp()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user tries to sign up with an email that already exists. Useful for notifying the existing user that someone attempted to register with their email. This is only called when `requireEmailVerification: true` or `autoSignIn: false`. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:675 |
| `emailAndPassword.customSyntheticUser()?` | (`params`) => `Record`\<`string`, `unknown`\> | - | Build a custom synthetic user for email enumeration protection. When a sign-up attempt is made with an email that already exists, this function is called to build the fake user response. Use this when plugins add fields to the user table (e.g. admin plugin adds `role`, `banned`, etc.) to ensure the fake response is indistinguishable from a real sign-up. **Example** `customSyntheticUser: ({ coreFields, additionalFields, id }) => ({ ...coreFields, role: "user", banned: false, banReason: null, banExpires: null, ...additionalFields, id, })` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:706 |
| `emailAndPassword.enabled` | `boolean` | `false` | Enable email and password authentication **Default** `false` | [src/convex/client/index.ts:917](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L917) |
| `user` | \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \} | - | - | [src/convex/client/index.ts:922](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L922) |
| `user.modelName?` | `"user"` \| `LiteralString` | - | The name of the model. Defaults to the model name. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:125 |
| `user.fields?` | `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\> | - | Map fields to database columns | node\_modules/@better-auth/core/dist/types/init-options.d.mts:129 |
| `user.additionalFields?` | \{ \[`key`: `string`\]: `DBFieldAttribute`; \} | - | Additional fields for the model | node\_modules/@better-auth/core/dist/types/init-options.d.mts:133 |
| `user.changeEmail?` | \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \} | - | Changing email configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:737 |
| `user.changeEmail.enabled` | `boolean` | - | Enable changing email **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:742 |
| `user.changeEmail.sendChangeEmailConfirmation()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a confirmation email to the old email address when the user changes their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:748 |
| `user.changeEmail.updateEmailWithoutVerification?` | `boolean` | - | Update the email without verification if the user is not verified. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:758 |
| `user.deleteUser?` | \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \} | - | User deletion configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:763 |
| `user.deleteUser.enabled?` | `boolean` | - | Enable user deletion | node\_modules/@better-auth/core/dist/types/init-options.d.mts:767 |
| `user.deleteUser.sendDeleteAccountVerification()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email when the user deletes their account. if this is not set, the user will be deleted immediately. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:775 |
| `user.deleteUser.beforeDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user is deleted. to interrupt with error you can throw `APIError` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:785 |
| `user.deleteUser.afterDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called after a user is deleted. This is useful for cleaning up user data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:791 |
| `user.deleteUser.deleteTokenExpiresIn?` | `number` | - | The expiration time for the delete token. **Default** `1 day (60 * 60 * 24) in seconds` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:797 |
| `plugins` | \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => `Promise`\< \| \{ `context`: ...; \} \| `undefined`\>; \} \| \{ `matcher`: (`ctx`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<\{ `context`: `MiddlewareContext`\<..., ...\>; \}\>; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<`unknown`\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: `string`; `content`: \{ `application/json`: ...; \}; \}; \}; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => `Promise`\<\{ `session`: \{ `session`: ...; `user`: ...; \}; \}\>[]; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: `string`; `content`: \{ `application/json`: ...; \}; \}; \}; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\>)\[\]; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ status: boolean; token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \} \| \{ status: boolean; token: null; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ZodString; otp: ZodString; name: ZodOptional\<(...)\>; image: ZodOptional\<(...)\> \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<ZodString\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ZodOptional\<(...)\>; name: ZodOptional\<(...)\>; context: ZodOptional\<(...)\> \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; parameters: \{ name: ...; in: ...; required: ...; description: ...; schema: ... \}\[\]; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<ZodString\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \}; 400: \{ description: ... \} \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<ZodAny, ZodAny\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \}; $Infer: \{ body: \{ response: AuthenticationResponseJSON \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>) \| ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>) \| ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \} \| \{ id: "admin"; version: string; init: any; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<(...)\[\] \| undefined\> \}\[\] \}; endpoints: \{ setRole: StrictEndpoint\<"/admin/set-role", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\>; role: ZodUnion\<readonly \[(...), (...)\]\> \}, $strip\>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \}; $Infer: \{ body: \{ userId: string; role: (...) \| (...) \| (...) \} \} \} \}, \{ user: UserWithRole \}\>; getUser: StrictEndpoint\<"/admin/get-user", \{ method: "GET"; query: ZodObject\<\{ id: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, UserWithRole\>; createUser: StrictEndpoint\<"/admin/create-user", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; password: ZodOptional\<ZodString\>; name: ZodString; role: ZodOptional\<ZodUnion\<(...)\>\>; data: ZodOptional\<ZodRecord\<(...), (...)\>\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \}; $Infer: \{ body: \{ email: string; password?: (...) \| (...); name: string; role?: (...) \| (...) \| (...) \| (...); data?: (...) \| (...) \} \} \} \}, \{ user: UserWithRole \}\>; adminUpdateUser: StrictEndpoint\<"/admin/update-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\>; data: ZodRecord\<ZodAny, ZodAny\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, UserWithRole\>; listUsers: StrictEndpoint\<"/admin/list-users", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; query: ZodObject\<\{ searchValue: ZodOptional\<ZodString\>; searchField: ZodOptional\<ZodEnum\<(...)\>\>; searchOperator: ZodOptional\<ZodEnum\<(...)\>\>; limit: ZodOptional\<ZodUnion\<(...)\>\>; offset: ZodOptional\<ZodUnion\<(...)\>\>; sortBy: ZodOptional\<ZodString\>; sortDirection: ZodOptional\<ZodEnum\<(...)\>\>; filterField: ZodOptional\<ZodString\>; filterValue: ZodOptional\<ZodUnion\<(...)\>\>; filterOperator: ZodOptional\<ZodEnum\<(...)\>\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ users: UserWithRole\[\]; total: number \}\>; listUserSessions: StrictEndpoint\<"/admin/list-user-sessions", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ sessions: SessionWithImpersonatedBy\[\] \}\>; unbanUser: StrictEndpoint\<"/admin/unban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ user: UserWithRole \}\>; banUser: StrictEndpoint\<"/admin/ban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\>; banReason: ZodOptional\<ZodString\>; banExpiresIn: ZodOptional\<ZodNumber\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ user: UserWithRole \}\>; impersonateUser: StrictEndpoint\<"/admin/impersonate-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: UserWithRole \}\>; stopImpersonating: StrictEndpoint\<"/admin/stop-impersonating", \{ method: "POST"; requireHeaders: true \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \} & Record\<string, any\>; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} & Record\<string, any\> \}\>; revokeUserSession: StrictEndpoint\<"/admin/revoke-user-session", \{ method: "POST"; body: ZodObject\<\{ sessionToken: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; revokeUserSessions: StrictEndpoint\<"/admin/revoke-user-sessions", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; removeUser: StrictEndpoint\<"/admin/remove-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<unknown\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; setUserPassword: StrictEndpoint\<"/admin/set-user-password", \{ method: "POST"; body: ZodObject\<\{ newPassword: ZodString; userId: ZodCoercedString\<unknown\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ status: boolean \}\>; userHasPermission: StrictEndpoint\<"/admin/has-permission", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ userId: ZodOptional\<(...)\>; role: ZodOptional\<(...)\> \}, $strip\>, ZodXor\<readonly \[ZodObject\<(...), (...)\>, ZodObject\<(...), (...)\>\]\>\>; metadata: \{ openapi: \{ description: string; requestBody: \{ content: \{ application/json: ... \} \}; responses: \{ 200: \{ description: ...; content: ... \} \} \}; $Infer: \{ body: \{ permissions: ... \} & \{ userId?: ...; role?: ... \} \} \} \}, \{ error: null; success: boolean \}\> \}; $ERROR\_CODES: \{ USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL: RawError\<"USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL"\>; FAILED\_TO\_CREATE\_USER: RawError\<"FAILED\_TO\_CREATE\_USER"\>; USER\_ALREADY\_EXISTS: RawError\<"USER\_ALREADY\_EXISTS"\>; YOU\_CANNOT\_BAN\_YOURSELF: RawError\<"YOU\_CANNOT\_BAN\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD"\>; BANNED\_USER: RawError\<"BANNED\_USER"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER"\>; NO\_DATA\_TO\_UPDATE: RawError\<"NO\_DATA\_TO\_UPDATE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS"\>; YOU\_CANNOT\_REMOVE\_YOURSELF: RawError\<"YOU\_CANNOT\_REMOVE\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE"\>; YOU\_CANNOT\_IMPERSONATE\_ADMINS: RawError\<"YOU\_CANNOT\_IMPERSONATE\_ADMINS"\>; INVALID\_ROLE\_TYPE: RawError\<"INVALID\_ROLE\_TYPE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL"\>; PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER: RawError\<"PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER"\> \}; schema: \{ user: \{ fields: \{ role: \{ type: "string"; required: false; input: false \}; banned: \{ type: "boolean"; defaultValue: false; required: false; input: false \}; banReason: \{ type: "string"; required: false; input: false \}; banExpires: \{ type: "date"; required: false; input: false \} \} \}; session: \{ fields: \{ impersonatedBy: \{ type: "string"; required: false; input: false \} \} \} \}; options: NoInfer\<AdminOptions\> \} \| DefaultOrganizationPlugin\<\{ allowUserToCreateOrganization?: boolean \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} & Record\<string, any\>) =\> Awaitable\<boolean\>); organizationLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} & Record\<string, any\>) =\> Awaitable\<boolean\>); creatorRole?: string; membershipLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \}, organization: \{ id: string; name: string; slug: string; logo?: string \| null; metadata?: any; createdAt: Date \}) =\> number \| Promise\<number\>); ac?: AccessControl; roles?: \{ \[key: string\]: Role\<any\> \| undefined \}; dynamicAccessControl?: \{ enabled?: boolean; maximumRolesPerOrganization?: number \| ((organizationId: string) =\> Awaitable\<number\>) \}; teams?: \{ enabled: boolean; defaultTeam?: \{ enabled: boolean; customCreateDefaultTeam?: (organization: ..., ctx?: ...) =\> ... \}; maximumTeams?: number \| ((data: \{ organizationId: string; session: (...) \| (...) \}, ctx?: GenericEndpointContext) =\> Awaitable\<number\>); maximumMembersPerTeam?: number \| ((data: \{ teamId: string; session: \{ user: ...; session: ... \}; organizationId: string \}) =\> Awaitable\<number\>); allowRemovingAllTeams?: boolean \}; invitationExpiresIn?: number; invitationLimit?: number \| ((data: \{ user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\>; organization: \{ id: string; name: string; slug: string; logo?: (...) \| (...) \| (...); metadata?: any; createdAt: Date \} & Record\<string, any\>; member: \{ id: string; organizationId: string; userId: string; role: string; createdAt: Date \} & Record\<string, any\> \}, ctx: AuthContext) =\> Awaitable\<number\>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: \{ id: string; role: string; email: string; organization: \{ id: string; name: string; slug: string; logo?: string \| null; metadata?: any; createdAt: Date \}; invitation: \{ id: string; organizationId: string; email: string; role: string; status: "pending" \| "accepted" \| "rejected" \| "canceled"; teamId?: string \| null; inviterId: string; expiresAt: Date; createdAt: Date \}; inviter: \{ id: string; organizationId: string; userId: string; role: string; createdAt: Date \} & \{ user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} \} \}, request?: Request) =\> Promise\<void\>; schema?: \{ session?: \{ fields?: \{ activeOrganizationId?: ...; activeTeamId?: ... \} \}; organization?: \{ modelName?: string; fields?: \{ name?: ...; slug?: ...; logo?: ...; metadata?: ...; createdAt?: ... \}; additionalFields?: \{ \[key: ...\]: ... \} \}; member?: \{ modelName?: string; fields?: \{ organizationId?: ...; userId?: ...; role?: ...; createdAt?: ... \}; additionalFields?: \{ \[key: ...\]: ... \} \}; invitation?: \{ modelName?: string; fields?: \{ organizationId?: ...; email?: ...; role?: ...; status?: ...; teamId?: ...; inviterId?: ...; expiresAt?: ...; createdAt?: ... \}; additionalFields?: \{ \[key: ...\]: ... \} \}; team?: \{ modelName?: string; fields?: \{ name?: ...; organizationId?: ...; createdAt?: ...; updatedAt?: ... \}; additionalFields?: \{ \[key: ...\]: ... \} \}; teamMember?: \{ modelName?: string; fields?: \{ teamId?: ...; userId?: ...; createdAt?: ... \} \}; organizationRole?: \{ modelName?: string; fields?: \{ organizationId?: ...; role?: ...; permission?: ...; createdAt?: ...; updatedAt?: ... \}; additionalFields?: \{ \[key: ...\]: ... \} \} \}; disableOrganizationDeletion?: boolean; organizationHooks?: \{ beforeCreateOrganization?: (data: \{ organization: \{ name?: ...; slug?: ...; logo?: ...; metadata?: ...; \[key: ...\]: ... \}; user: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterCreateOrganization?: (data: \{ organization: (...) & (...); member: (...) & (...); user: (...) & (...) \}) =\> Promise\<void\>; beforeUpdateOrganization?: (data: \{ organization: \{ name?: ...; slug?: ...; logo?: ...; metadata?: ...; \[key: ...\]: ... \}; user: (...) & (...); member: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterUpdateOrganization?: (data: \{ organization: (...) \| (...); user: (...) & (...); member: (...) & (...) \}) =\> Promise\<void\>; beforeDeleteOrganization?: (data: \{ organization: (...) & (...); user: (...) & (...) \}, ctx?: GenericEndpointContext) =\> Promise\<void\>; afterDeleteOrganization?: (data: \{ organization: (...) & (...); user: (...) & (...) \}, ctx?: GenericEndpointContext) =\> Promise\<void\>; beforeAddMember?: (data: \{ member: \{ userId: ...; organizationId: ...; role: ...; \[key: ...\]: ... \}; user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterAddMember?: (data: \{ member: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeRemoveMember?: (data: \{ member: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterRemoveMember?: (data: \{ member: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeUpdateMemberRole?: (data: \{ member: (...) & (...); newRole: string; user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterUpdateMemberRole?: (data: \{ member: (...) & (...); previousRole: string; user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeCreateInvitation?: (data: \{ invitation: \{ email: ...; role: ...; organizationId: ...; inviterId: ...; teamId?: ...; \[key: ...\]: ... \}; inviter: (...) & (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterCreateInvitation?: (data: \{ invitation: (...) & (...); inviter: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeAcceptInvitation?: (data: \{ invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterAcceptInvitation?: (data: \{ invitation: (...) & (...); member: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeRejectInvitation?: (data: \{ invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterRejectInvitation?: (data: \{ invitation: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeCancelInvitation?: (data: \{ invitation: (...) & (...); cancelledBy: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterCancelInvitation?: (data: \{ invitation: (...) & (...); cancelledBy: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeCreateTeam?: (data: \{ team: \{ name: ...; organizationId: ...; \[key: ...\]: ... \}; user?: (...) \| (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterCreateTeam?: (data: \{ team: (...) & (...); user?: (...) \| (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeUpdateTeam?: (data: \{ team: (...) & (...); updates: \{ name?: ...; \[key: ...\]: ... \}; user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterUpdateTeam?: (data: \{ team: (...) \| (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeDeleteTeam?: (data: \{ team: (...) & (...); user?: (...) \| (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterDeleteTeam?: (data: \{ team: (...) & (...); user?: (...) \| (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeAddTeamMember?: (data: \{ teamMember: \{ teamId: ...; userId: ...; \[key: ...\]: ... \}; team: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<(...) \| (...)\>; afterAddTeamMember?: (data: \{ teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; beforeRemoveTeamMember?: (data: \{ teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\>; afterRemoveTeamMember?: (data: \{ teamMember: (...) & (...); team: (...) & (...); user: (...) & (...); organization: (...) & (...) \}) =\> Promise\<void\> \} \}\>)\[\]\] | - | - | [src/convex/client/index.ts:937](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L937) |

***

### createAuth()

```ts
function createAuth<DM, Schema>(
   ctx, 
   components, 
   options?): Auth<{
  appName?: string;
  baseURL?: BaseURLConfig;
  secret?: string;
  secrets?: {
     version: number;
     value: string;
  }[];
  secondaryStorage?: SecondaryStorage;
  emailVerification?: {
     sendVerificationEmail?: (data, request?) => Promise<void>;
     sendOnSignUp?: boolean;
     sendOnSignIn?: boolean;
     autoSignInAfterVerification?: boolean;
     expiresIn?: number;
     beforeEmailVerification?: (user, request?) => Promise<void>;
     afterEmailVerification?: (user, request?) => Promise<void>;
  };
  socialProviders?: SocialProviders;
  session?: BetterAuthDBOptions<"session", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "id"
     | "expiresAt"
     | "token"
     | "ipAddress"
     | "userAgent"> & {
     expiresIn?: number;
     updateAge?: number;
     disableSessionRefresh?: boolean;
     deferSessionRefresh?: boolean;
     storeSessionInDatabase?: boolean;
     preserveSessionInDatabase?: boolean;
     cookieCache?: {
        maxAge?: number;
        enabled?: boolean;
        strategy?: "compact" | "jwt" | "jwe";
        refreshCache?:   | boolean
           | {
           updateAge?: number;
         };
        version?:   | string
           | ((session, user) => string)
           | ((session, user) => Promise<string>);
     };
     freshAge?: number;
  };
  account?: BetterAuthDBOptions<"account", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "id"
     | "password"
     | "accountId"
     | "providerId"
     | "accessToken"
     | "refreshToken"
     | "idToken"
     | "accessTokenExpiresAt"
     | "refreshTokenExpiresAt"
     | "scope"> & {
     updateAccountOnSignIn?: boolean;
     accountLinking?: {
        enabled?: boolean;
        disableImplicitLinking?: boolean;
        requireLocalEmailVerified?: boolean;
        trustedProviders?:   | LiteralUnion<
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ...
           | ..., string>[]
           | ((request?) => Awaitable<...[]>);
        allowDifferentEmails?: boolean;
        allowUnlinkingAll?: boolean;
        updateUserInfoOnLink?: boolean;
     };
     encryptOAuthTokens?: boolean;
     skipStateCookieCheck?: boolean;
     storeStateStrategy?: "database" | "cookie";
     storeAccountCookie?: boolean;
  };
  verification?: BetterAuthDBOptions<"verification", "value" | "createdAt" | "updatedAt" | "id" | "expiresAt" | "identifier"> & {
     disableCleanup?: boolean;
     storeIdentifier?:   | StoreIdentifierOption
        | {
        default: StoreIdentifierOption;
        overrides?: Record<string, StoreIdentifierOption>;
      };
     storeInDatabase?: boolean;
  };
  trustedOrigins?:   | string[]
     | ((request?) => Awaitable<(string | null | undefined)[]>);
  rateLimit?: BetterAuthRateLimitOptions;
  advanced?: BetterAuthAdvancedOptions;
  logger?: Logger;
  databaseHooks?: {
     user?: {
        create?: {
           before?: (user, context) => Promise<...>;
           after?: (user, context) => Promise<...>;
        };
        update?: {
           before?: (user, context) => Promise<...>;
           after?: (user, context) => Promise<...>;
        };
        delete?: {
           before?: (user, context) => Promise<...>;
           after?: (user, context) => Promise<...>;
        };
     };
     session?: {
        create?: {
           before?: (session, context) => Promise<...>;
           after?: (session, context) => Promise<...>;
        };
        update?: {
           before?: (session, context) => Promise<...>;
           after?: (session, context) => Promise<...>;
        };
        delete?: {
           before?: (session, context) => Promise<...>;
           after?: (session, context) => Promise<...>;
        };
     };
     account?: {
        create?: {
           before?: (account, context) => Promise<...>;
           after?: (account, context) => Promise<...>;
        };
        update?: {
           before?: (account, context) => Promise<...>;
           after?: (account, context) => Promise<...>;
        };
        delete?: {
           before?: (account, context) => Promise<...>;
           after?: (account, context) => Promise<...>;
        };
     };
     verification?: {
        create?: {
           before?: (verification, context) => Promise<...>;
           after?: (verification, context) => Promise<...>;
        };
        update?: {
           before?: (verification, context) => Promise<...>;
           after?: (verification, context) => Promise<...>;
        };
        delete?: {
           before?: (verification, context) => Promise<...>;
           after?: (verification, context) => Promise<...>;
        };
     };
  };
  onAPIError?: {
     throw?: boolean;
     onError?: (error, ctx) => void | Promise<void>;
     errorURL?: string;
     customizeDefaultErrorPage?: {
        colors?: {
           background?: string;
           foreground?: string;
           primary?: string;
           primaryForeground?: string;
           mutedForeground?: string;
           border?: string;
           destructive?: string;
           titleBorder?: string;
           titleColor?: string;
           gridColor?: string;
           cardBackground?: string;
           cornerBorder?: string;
        };
        size?: {
           radiusSm?: string;
           radiusMd?: string;
           radiusLg?: string;
           textSm?: string;
           text2xl?: string;
           text4xl?: string;
           text6xl?: string;
        };
        font?: {
           defaultFamily?: string;
           monoFamily?: string;
        };
        disableTitleBorder?: boolean;
        disableCornerDecorations?: boolean;
        disableBackgroundGrid?: boolean;
     };
  };
  hooks?: {
     before?: (inputContext) => Promise<unknown>;
     after?: (inputContext) => Promise<unknown>;
  };
  disabledPaths?: string[];
  telemetry?: {
     enabled?: boolean;
     debug?: boolean;
  };
  experimental?: {
     joins?: boolean;
  };
  basePath: string;
  database: AdapterFactory<BetterAuthOptions>;
  emailAndPassword: {
     disableSignUp?: boolean;
     requireEmailVerification?: boolean;
     maxPasswordLength?: number;
     minPasswordLength?: number;
     sendResetPassword?: (data, request?) => Promise<void>;
     resetPasswordTokenExpiresIn?: number;
     onPasswordReset?: (data, request?) => Promise<void>;
     password?: {
        hash?: (password) => Promise<string>;
        verify?: (data) => Promise<boolean>;
     };
     autoSignIn?: boolean;
     revokeSessionsOnPasswordReset?: boolean;
     onExistingUserSignUp?: (data, request?) => Promise<void>;
     customSyntheticUser?: (params) => Record<string, unknown>;
     enabled: boolean;
  };
  user: {
     modelName?: "user" | LiteralString;
     fields?: Partial<Record<"createdAt" | "updatedAt" | "email" | "emailVerified" | "name" | "image", string>>;
     additionalFields?: {
      [key: string]: DBFieldAttribute;
     };
     changeEmail?: {
        enabled: boolean;
        sendChangeEmailConfirmation?: (data, request?) => Promise<void>;
        updateEmailWithoutVerification?: boolean;
     };
     deleteUser?: {
        enabled?: boolean;
        sendDeleteAccountVerification?: (data, request?) => Promise<void>;
        beforeDelete?: (user, request?) => Promise<void>;
        afterDelete?: (user, request?) => Promise<void>;
        deleteTokenExpiresIn?: number;
     };
  };
  plugins: [{
     id: "convex";
     version: string;
     init: (ctx) => void;
     hooks: {
        before: (
           | {
           matcher: boolean;
           handler: (inputContext) => Promise<... | ...>;
         }
           | {
           matcher: (ctx) => boolean;
           handler: (inputContext) => Promise<{
              context: ...;
           }>;
        })[];
        after: {
           matcher: (context) => boolean;
           handler: (inputContext) => Promise<unknown>;
        }[];
     };
     endpoints: {
        getOpenIdConfig: StrictEndpoint<"/convex/.well-known/openid-configuration", {
           method: "GET";
           metadata: {
              isAction: false;
           };
        }, OIDCMetadata>;
        getJwks: StrictEndpoint<"/convex/jwks", {
           method: "GET";
           metadata: {
              openapi: {
                 description: string;
                 responses: {
                    200: {
                       description: ...;
                       content: ...;
                    };
                 };
              };
           };
        }, JSONWebKeySet>;
        getLatestJwks: StrictEndpoint<"/convex/latest-jwks", {
           isAction: boolean;
           method: "POST";
           metadata: {
              SERVER_ONLY: true;
              openapi: {
                 description: string;
              };
           };
        }, any[]>;
        rotateKeys: StrictEndpoint<"/convex/rotate-keys", {
           isAction: boolean;
           method: "POST";
           metadata: {
              SERVER_ONLY: true;
              openapi: {
                 description: string;
              };
           };
        }, any[]>;
        getToken: StrictEndpoint<"/convex/token", {
           method: "GET";
           requireHeaders: true;
           use: (inputContext) => Promise<{
              session: ...;
           }>[];
           metadata: {
              openapi: {
                 description: string;
                 responses: {
                    200: {
                       description: ...;
                       content: ...;
                    };
                 };
              };
           };
         }, {
           token: string;
        }>;
     };
     schema: {
        jwks: {
           fields: {
              publicKey: {
                 type: "string";
                 required: true;
              };
              privateKey: {
                 type: "string";
                 required: true;
              };
              createdAt: {
                 type: "date";
                 required: true;
              };
              expiresAt: {
                 type: "date";
                 required: false;
              };
           };
        };
        user: {
           fields: {
              userId: {
                 type: "string";
                 required: false;
                 input: false;
              };
           };
        };
     };
  }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean; token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> } | { status: boolean; token: null; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ...; otp: ...; name: ...; image: ... }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ...; name: ...; context: ... }, $strip>>; metadata: { openapi: { operationId: string; description: string; parameters: (...)[]; responses: { 200: ... } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ...; 400: ... } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<(...), (...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } }; $Infer: { body: { response: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined } | { id: "admin"; version: string; init: any; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<(...) | (...)> }[] }; endpoints: { setRole: StrictEndpoint<"/admin/set-role", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; role: ZodUnion<(...)> }, $strip>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } }; $Infer: { body: { userId: ...; role: ... } } } }, { user: UserWithRole }>; getUser: StrictEndpoint<"/admin/get-user", { method: "GET"; query: ZodObject<{ id: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, UserWithRole>; createUser: StrictEndpoint<"/admin/create-user", { method: "POST"; body: ZodObject<{ email: ZodString; password: ZodOptional<(...)>; name: ZodString; role: ZodOptional<(...)>; data: ZodOptional<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } }; $Infer: { body: { email: ...; password?: ...; name: ...; role?: ...; data?: ... } } } }, { user: UserWithRole }>; adminUpdateUser: StrictEndpoint<"/admin/update-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; data: ZodRecord<(...), (...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, UserWithRole>; listUsers: StrictEndpoint<"/admin/list-users", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodObject<{ searchValue: ZodOptional<(...)>; searchField: ZodOptional<(...)>; searchOperator: ZodOptional<(...)>; limit: ZodOptional<(...)>; offset: ZodOptional<(...)>; sortBy: ZodOptional<(...)>; sortDirection: ZodOptional<(...)>; filterField: ZodOptional<(...)>; filterValue: ZodOptional<(...)>; filterOperator: ZodOptional<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { users: UserWithRole[]; total: number }>; listUserSessions: StrictEndpoint<"/admin/list-user-sessions", { method: "POST"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { sessions: SessionWithImpersonatedBy[] }>; unbanUser: StrictEndpoint<"/admin/unban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { user: UserWithRole }>; banUser: StrictEndpoint<"/admin/ban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; banReason: ZodOptional<(...)>; banExpiresIn: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { user: UserWithRole }>; impersonateUser: StrictEndpoint<"/admin/impersonate-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: UserWithRole }>; stopImpersonating: StrictEndpoint<"/admin/stop-impersonating", { method: "POST"; requireHeaders: true }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) | (...) | (...); userAgent?: (...) | (...) | (...) } & Record<string, any>; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> }>; revokeUserSession: StrictEndpoint<"/admin/revoke-user-session", { method: "POST"; body: ZodObject<{ sessionToken: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; revokeUserSessions: StrictEndpoint<"/admin/revoke-user-sessions", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; removeUser: StrictEndpoint<"/admin/remove-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; setUserPassword: StrictEndpoint<"/admin/set-user-password", { method: "POST"; body: ZodObject<{ newPassword: ZodString; userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { status: boolean }>; userHasPermission: StrictEndpoint<"/admin/has-permission", { method: "POST"; body: ZodIntersection<ZodObject<{ userId: ...; role: ... }, $strip>, ZodXor<readonly [(...), (...)]>>; metadata: { openapi: { description: string; requestBody: { content: ... }; responses: { 200: ... } }; $Infer: { body: (...) & (...) } } }, { error: null; success: boolean }> }; $ERROR_CODES: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: RawError<"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL">; FAILED_TO_CREATE_USER: RawError<"FAILED_TO_CREATE_USER">; USER_ALREADY_EXISTS: RawError<"USER_ALREADY_EXISTS">; YOU_CANNOT_BAN_YOURSELF: RawError<"YOU_CANNOT_BAN_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: RawError<"YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE">; YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_BAN_USERS">; YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD">; BANNED_USER: RawError<"BANNED_USER">; YOU_ARE_NOT_ALLOWED_TO_GET_USER: RawError<"YOU_ARE_NOT_ALLOWED_TO_GET_USER">; NO_DATA_TO_UPDATE: RawError<"NO_DATA_TO_UPDATE">; YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS">; YOU_CANNOT_REMOVE_YOURSELF: RawError<"YOU_CANNOT_REMOVE_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE">; YOU_CANNOT_IMPERSONATE_ADMINS: RawError<"YOU_CANNOT_IMPERSONATE_ADMINS">; INVALID_ROLE_TYPE: RawError<"INVALID_ROLE_TYPE">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL">; PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: RawError<"PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER"> }; schema: { user: { fields: { role: { type: "string"; required: false; input: false }; banned: { type: "boolean"; defaultValue: false; required: false; input: false }; banReason: { type: "string"; required: false; input: false }; banExpires: { type: "date"; required: false; input: false } } }; session: { fields: { impersonatedBy: { type: "string"; required: false; input: false } } } }; options: NoInfer<AdminOptions> } | DefaultOrganizationPlugin<{ allowUserToCreateOrganization?: boolean | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any>) => Awaitable<boolean>); organizationLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any>) => Awaitable<boolean>); creatorRole?: string; membershipLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null }, organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: any; createdAt: Date }) => number | Promise<number>); ac?: AccessControl; roles?: { [key: string]: Role<any> | undefined }; dynamicAccessControl?: { enabled?: boolean; maximumRolesPerOrganization?: number | ((organizationId: string) => Awaitable<(...)>) }; teams?: { enabled: boolean; defaultTeam?: { enabled: boolean; customCreateDefaultTeam?: (...) | (...) }; maximumTeams?: number | ((data: { organizationId: ...; session: ... }, ctx?: (...) | (...)) => Awaitable<(...)>); maximumMembersPerTeam?: number | ((data: { teamId: ...; session: ...; organizationId: ... }) => Awaitable<(...)>); allowRemovingAllTeams?: boolean }; invitationExpiresIn?: number; invitationLimit?: number | ((data: { user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)>; organization: { id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... } & Record<(...), (...)>; member: { id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... } & Record<(...), (...)> }, ctx: AuthContext) => Awaitable<number>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: { id: string; role: string; email: string; organization: { id: string; name: string; slug: string; logo?: (...) | (...) | (...); metadata?: any; createdAt: Date }; invitation: { id: string; organizationId: string; email: string; role: string; status: (...) | (...) | (...) | (...); teamId?: (...) | (...) | (...); inviterId: string; expiresAt: Date; createdAt: Date }; inviter: { id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... } & { user: ... } }, request?: Request) => Promise<void>; schema?: { session?: { fields?: (...) | (...) }; organization?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; member?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; invitation?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; team?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; teamMember?: { modelName?: (...) | (...); fields?: (...) | (...) }; organizationRole?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) } }; disableOrganizationDeletion?: boolean; organizationHooks?: { beforeCreateOrganization?: (data: { organization: ...; user: ... }) => Promise<(...)>; afterCreateOrganization?: (data: { organization: ...; member: ...; user: ... }) => Promise<(...)>; beforeUpdateOrganization?: (data: { organization: ...; user: ...; member: ... }) => Promise<(...)>; afterUpdateOrganization?: (data: { organization: ...; user: ...; member: ... }) => Promise<(...)>; beforeDeleteOrganization?: (data: { organization: ...; user: ... }, ctx?: (...) | (...)) => Promise<(...)>; afterDeleteOrganization?: (data: { organization: ...; user: ... }, ctx?: (...) | (...)) => Promise<(...)>; beforeAddMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; afterAddMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRemoveMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; afterRemoveMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeUpdateMemberRole?: (data: { member: ...; newRole: ...; user: ...; organization: ... }) => Promise<(...)>; afterUpdateMemberRole?: (data: { member: ...; previousRole: ...; user: ...; organization: ... }) => Promise<(...)>; beforeCreateInvitation?: (data: { invitation: ...; inviter: ...; organization: ... }) => Promise<(...)>; afterCreateInvitation?: (data: { invitation: ...; inviter: ...; organization: ... }) => Promise<(...)>; beforeAcceptInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; afterAcceptInvitation?: (data: { invitation: ...; member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRejectInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; afterRejectInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; beforeCancelInvitation?: (data: { invitation: ...; cancelledBy: ...; organization: ... }) => Promise<(...)>; afterCancelInvitation?: (data: { invitation: ...; cancelledBy: ...; organization: ... }) => Promise<(...)>; beforeCreateTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; afterCreateTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; beforeUpdateTeam?: (data: { team: ...; updates: ...; user: ...; organization: ... }) => Promise<(...)>; afterUpdateTeam?: (data: { team: ...; user: ...; organization: ... }) => Promise<(...)>; beforeDeleteTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; afterDeleteTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; beforeAddTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; afterAddTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRemoveTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; afterRemoveTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)> } }>)[]];
}>;
```

Defined in: [src/convex/client/index.ts:1051](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1051)

Simple wrapper around the packaged auth component that runs in the app
environment.

This follows Convex's simple function wrapper pattern: app code can pass the
component reference and Convex context in directly, while this helper handles
the cross-boundary adapter wiring and environment-backed auth creation.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | - |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `true`\> | `SchemaDefinition`\<\{ `user`: `TableDefinition`\<`VObject`\<\{ `image?`: `string` \| `null`; `role?`: `string` \| `null`; `banReason?`: `string` \| `null`; `banned?`: `boolean` \| `null`; `banExpires?`: `number` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `email`: `string`; `emailVerified`: `boolean`; `name`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `emailVerified`: `VBoolean`\<`boolean`, `"required"`\>; `image`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `role`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `banned`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; `banReason`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `banExpires`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"` \| `"role"` \| `"banReason"` \| `"banned"` \| `"banExpires"`\>, \{ `email_name`: \[`"email"`, `"name"`, `"_creationTime"`\]; `name`: \[`"name"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `session`: `TableDefinition`\<`VObject`\<\{ `ipAddress?`: `string` \| `null`; `userAgent?`: `string` \| `null`; `activeOrganizationId?`: `string` \| `null`; `impersonatedBy?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `expiresAt`: `number`; `token`: `string`; \}, \{ `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `token`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `ipAddress`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userAgent`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VString`\<`string`, `"required"`\>; `impersonatedBy`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `activeOrganizationId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"` \| `"activeOrganizationId"` \| `"impersonatedBy"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `expiresAt_userId`: \[`"expiresAt"`, `"userId"`, `"_creationTime"`\]; `token`: \[`"token"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; `userId_expiresAt`: \[`"userId"`, `"expiresAt"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `account`: `TableDefinition`\<`VObject`\<\{ `password?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `idToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `scope?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `accountId`: `string`; `providerId`: `string`; \}, \{ `accountId`: `VString`\<`string`, `"required"`\>; `providerId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `idToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `scope`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `password`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\>, \{ `accountId`: \[`"accountId"`, `"_creationTime"`\]; `accountId_providerId`: \[`"accountId"`, `"providerId"`, `"_creationTime"`\]; `providerId_userId`: \[`"providerId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `verification`: `TableDefinition`\<`VObject`\<\{ `value`: `string`; `createdAt`: `number`; `updatedAt`: `number`; `expiresAt`: `number`; `identifier`: `string`; \}, \{ `identifier`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"expiresAt"` \| `"identifier"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `identifier`: \[`"identifier"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `rateLimit`: `TableDefinition`\<`VObject`\<\{ `key`: `string`; `count`: `number`; `lastRequest`: `number`; \}, \{ `key`: `VString`\<`string`, `"required"`\>; `count`: `VFloat64`\<`number`, `"required"`\>; `lastRequest`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"key"` \| `"count"` \| `"lastRequest"`\>, \{ `key`: \[`"key"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `passkey`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `name?`: `string` \| `null`; `transports?`: `string` \| `null`; `aaguid?`: `string` \| `null`; `userId`: `string`; `publicKey`: `string`; `credentialID`: `string`; `counter`: `number`; `deviceType`: `string`; `backedUp`: `boolean`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `publicKey`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `credentialID`: `VString`\<`string`, `"required"`\>; `counter`: `VFloat64`\<`number`, `"required"`\>; `deviceType`: `VString`\<`string`, `"required"`\>; `backedUp`: `VBoolean`\<`boolean`, `"required"`\>; `transports`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `aaguid`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"name"` \| `"userId"` \| `"publicKey"` \| `"credentialID"` \| `"counter"` \| `"deviceType"` \| `"backedUp"` \| `"transports"` \| `"aaguid"`\>, \{ `credentialID`: \[`"credentialID"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `jwks`: `TableDefinition`\<`VObject`\<\{ `expiresAt?`: `number` \| `null`; `createdAt`: `number`; `publicKey`: `string`; `privateKey`: `string`; \}, \{ `publicKey`: `VString`\<`string`, `"required"`\>; `privateKey`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `expiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"expiresAt"` \| `"publicKey"` \| `"privateKey"`\>, \{ \}, \{ \}, \{ \}\>; `organization`: `TableDefinition`\<`VObject`\<\{ `metadata?`: `string` \| `null`; `logo?`: `string` \| `null`; `createdAt`: `number`; `name`: `string`; `slug`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `slug`: `VString`\<`string`, `"required"`\>; `logo`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `metadata`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"name"` \| `"metadata"` \| `"slug"` \| `"logo"`\>, \{ `name`: \[`"name"`, `"_creationTime"`\]; `slug`: \[`"slug"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `member`: `TableDefinition`\<`VObject`\<\{ `createdAt`: `number`; `userId`: `string`; `organizationId`: `string`; `role`: `string`; \}, \{ `organizationId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `role`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"createdAt"` \| `"userId"` \| `"organizationId"` \| `"role"`\>, \{ `organizationId`: \[`"organizationId"`, `"_creationTime"`\]; `organizationId_userId`: \[`"organizationId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; `role`: \[`"role"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `invitation`: `TableDefinition`\<`VObject`\<\{ `role?`: `string` \| `null`; `createdAt`: `number`; `email`: `string`; `expiresAt`: `number`; `organizationId`: `string`; `status`: `string`; `inviterId`: `string`; \}, \{ `organizationId`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `role`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `status`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `inviterId`: `VString`\<`string`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"email"` \| `"expiresAt"` \| `"organizationId"` \| `"role"` \| `"status"` \| `"inviterId"`\>, \{ `organizationId`: \[`"organizationId"`, `"_creationTime"`\]; `email`: \[`"email"`, `"_creationTime"`\]; `role`: \[`"role"`, `"_creationTime"`\]; `status`: \[`"status"`, `"_creationTime"`\]; `inviterId`: \[`"inviterId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthApplication`: `TableDefinition`\<`VObject`\<\{ `type?`: `string` \| `null`; `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `name?`: `string` \| `null`; `userId?`: `string` \| `null`; `metadata?`: `string` \| `null`; `icon?`: `string` \| `null`; `clientId?`: `string` \| `null`; `clientSecret?`: `string` \| `null`; `redirectUrls?`: `string` \| `null`; `disabled?`: `boolean` \| `null`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `icon`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `metadata`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `clientSecret`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `redirectUrls`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `type`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `disabled`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"type"` \| `"createdAt"` \| `"updatedAt"` \| `"name"` \| `"userId"` \| `"metadata"` \| `"icon"` \| `"clientId"` \| `"clientSecret"` \| `"redirectUrls"` \| `"disabled"`\>, \{ `clientId`: \[`"clientId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthAccessToken`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `userId?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `clientId?`: `string` \| `null`; `scopes?`: `string` \| `null`; \}, \{ `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `scopes`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"accessToken"` \| `"refreshToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"clientId"` \| `"scopes"`\>, \{ `accessToken`: \[`"accessToken"`, `"_creationTime"`\]; `refreshToken`: \[`"refreshToken"`, `"_creationTime"`\]; `clientId`: \[`"clientId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthConsent`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `userId?`: `string` \| `null`; `clientId?`: `string` \| `null`; `scopes?`: `string` \| `null`; `consentGiven?`: `boolean` \| `null`; \}, \{ `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `scopes`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `consentGiven`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"clientId"` \| `"scopes"` \| `"consentGiven"`\>, \{ `clientId_userId`: \[`"clientId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; \}, `true`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `GenericCtx`\<`DM`\> |
| `components` | [`AuthSetupComponents`](#authsetupcomponents) |
| `options?` | [`SetupAuthOptions`](#setupauthoptions)\<`DM`, `Schema`\> |

#### Returns

`Auth`\<\{
  `appName?`: `string`;
  `baseURL?`: `BaseURLConfig`;
  `secret?`: `string`;
  `secrets?`: \{
     `version`: `number`;
     `value`: `string`;
  \}[];
  `secondaryStorage?`: `SecondaryStorage`;
  `emailVerification?`: \{
     `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>;
     `sendOnSignUp?`: `boolean`;
     `sendOnSignIn?`: `boolean`;
     `autoSignInAfterVerification?`: `boolean`;
     `expiresIn?`: `number`;
     `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>;
     `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>;
  \};
  `socialProviders?`: `SocialProviders`;
  `session?`: `BetterAuthDBOptions`\<`"session"`, 
     \| `"createdAt"`
     \| `"updatedAt"`
     \| `"userId"`
     \| `"id"`
     \| `"expiresAt"`
     \| `"token"`
     \| `"ipAddress"`
     \| `"userAgent"`\> & \{
     `expiresIn?`: `number`;
     `updateAge?`: `number`;
     `disableSessionRefresh?`: `boolean`;
     `deferSessionRefresh?`: `boolean`;
     `storeSessionInDatabase?`: `boolean`;
     `preserveSessionInDatabase?`: `boolean`;
     `cookieCache?`: \{
        `maxAge?`: `number`;
        `enabled?`: `boolean`;
        `strategy?`: `"compact"` \| `"jwt"` \| `"jwe"`;
        `refreshCache?`:   \| `boolean`
           \| \{
           `updateAge?`: `number`;
         \};
        `version?`:   \| `string`
           \| ((`session`, `user`) => `string`)
           \| ((`session`, `user`) => `Promise`\<`string`\>);
     \};
     `freshAge?`: `number`;
  \};
  `account?`: `BetterAuthDBOptions`\<`"account"`, 
     \| `"createdAt"`
     \| `"updatedAt"`
     \| `"userId"`
     \| `"id"`
     \| `"password"`
     \| `"accountId"`
     \| `"providerId"`
     \| `"accessToken"`
     \| `"refreshToken"`
     \| `"idToken"`
     \| `"accessTokenExpiresAt"`
     \| `"refreshTokenExpiresAt"`
     \| `"scope"`\> & \{
     `updateAccountOnSignIn?`: `boolean`;
     `accountLinking?`: \{
        `enabled?`: `boolean`;
        `disableImplicitLinking?`: `boolean`;
        `requireLocalEmailVerified?`: `boolean`;
        `trustedProviders?`:   \| `LiteralUnion`\<
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ...
           \| ..., `string`\>[]
           \| ((`request?`) => `Awaitable`\<...[]\>);
        `allowDifferentEmails?`: `boolean`;
        `allowUnlinkingAll?`: `boolean`;
        `updateUserInfoOnLink?`: `boolean`;
     \};
     `encryptOAuthTokens?`: `boolean`;
     `skipStateCookieCheck?`: `boolean`;
     `storeStateStrategy?`: `"database"` \| `"cookie"`;
     `storeAccountCookie?`: `boolean`;
  \};
  `verification?`: `BetterAuthDBOptions`\<`"verification"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"identifier"`\> & \{
     `disableCleanup?`: `boolean`;
     `storeIdentifier?`:   \| `StoreIdentifierOption`
        \| \{
        `default`: `StoreIdentifierOption`;
        `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>;
      \};
     `storeInDatabase?`: `boolean`;
  \};
  `trustedOrigins?`:   \| `string`[]
     \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>);
  `rateLimit?`: `BetterAuthRateLimitOptions`;
  `advanced?`: `BetterAuthAdvancedOptions`;
  `logger?`: `Logger`;
  `databaseHooks?`: \{
     `user?`: \{
        `create?`: \{
           `before?`: (`user`, `context`) => `Promise`\<...\>;
           `after?`: (`user`, `context`) => `Promise`\<...\>;
        \};
        `update?`: \{
           `before?`: (`user`, `context`) => `Promise`\<...\>;
           `after?`: (`user`, `context`) => `Promise`\<...\>;
        \};
        `delete?`: \{
           `before?`: (`user`, `context`) => `Promise`\<...\>;
           `after?`: (`user`, `context`) => `Promise`\<...\>;
        \};
     \};
     `session?`: \{
        `create?`: \{
           `before?`: (`session`, `context`) => `Promise`\<...\>;
           `after?`: (`session`, `context`) => `Promise`\<...\>;
        \};
        `update?`: \{
           `before?`: (`session`, `context`) => `Promise`\<...\>;
           `after?`: (`session`, `context`) => `Promise`\<...\>;
        \};
        `delete?`: \{
           `before?`: (`session`, `context`) => `Promise`\<...\>;
           `after?`: (`session`, `context`) => `Promise`\<...\>;
        \};
     \};
     `account?`: \{
        `create?`: \{
           `before?`: (`account`, `context`) => `Promise`\<...\>;
           `after?`: (`account`, `context`) => `Promise`\<...\>;
        \};
        `update?`: \{
           `before?`: (`account`, `context`) => `Promise`\<...\>;
           `after?`: (`account`, `context`) => `Promise`\<...\>;
        \};
        `delete?`: \{
           `before?`: (`account`, `context`) => `Promise`\<...\>;
           `after?`: (`account`, `context`) => `Promise`\<...\>;
        \};
     \};
     `verification?`: \{
        `create?`: \{
           `before?`: (`verification`, `context`) => `Promise`\<...\>;
           `after?`: (`verification`, `context`) => `Promise`\<...\>;
        \};
        `update?`: \{
           `before?`: (`verification`, `context`) => `Promise`\<...\>;
           `after?`: (`verification`, `context`) => `Promise`\<...\>;
        \};
        `delete?`: \{
           `before?`: (`verification`, `context`) => `Promise`\<...\>;
           `after?`: (`verification`, `context`) => `Promise`\<...\>;
        \};
     \};
  \};
  `onAPIError?`: \{
     `throw?`: `boolean`;
     `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>;
     `errorURL?`: `string`;
     `customizeDefaultErrorPage?`: \{
        `colors?`: \{
           `background?`: `string`;
           `foreground?`: `string`;
           `primary?`: `string`;
           `primaryForeground?`: `string`;
           `mutedForeground?`: `string`;
           `border?`: `string`;
           `destructive?`: `string`;
           `titleBorder?`: `string`;
           `titleColor?`: `string`;
           `gridColor?`: `string`;
           `cardBackground?`: `string`;
           `cornerBorder?`: `string`;
        \};
        `size?`: \{
           `radiusSm?`: `string`;
           `radiusMd?`: `string`;
           `radiusLg?`: `string`;
           `textSm?`: `string`;
           `text2xl?`: `string`;
           `text4xl?`: `string`;
           `text6xl?`: `string`;
        \};
        `font?`: \{
           `defaultFamily?`: `string`;
           `monoFamily?`: `string`;
        \};
        `disableTitleBorder?`: `boolean`;
        `disableCornerDecorations?`: `boolean`;
        `disableBackgroundGrid?`: `boolean`;
     \};
  \};
  `hooks?`: \{
     `before?`: (`inputContext`) => `Promise`\<`unknown`\>;
     `after?`: (`inputContext`) => `Promise`\<`unknown`\>;
  \};
  `disabledPaths?`: `string`[];
  `telemetry?`: \{
     `enabled?`: `boolean`;
     `debug?`: `boolean`;
  \};
  `experimental?`: \{
     `joins?`: `boolean`;
  \};
  `basePath`: `string`;
  `database`: `AdapterFactory`\<`BetterAuthOptions`\>;
  `emailAndPassword`: \{
     `disableSignUp?`: `boolean`;
     `requireEmailVerification?`: `boolean`;
     `maxPasswordLength?`: `number`;
     `minPasswordLength?`: `number`;
     `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>;
     `resetPasswordTokenExpiresIn?`: `number`;
     `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>;
     `password?`: \{
        `hash?`: (`password`) => `Promise`\<`string`\>;
        `verify?`: (`data`) => `Promise`\<`boolean`\>;
     \};
     `autoSignIn?`: `boolean`;
     `revokeSessionsOnPasswordReset?`: `boolean`;
     `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>;
     `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>;
     `enabled`: `boolean`;
  \};
  `user`: \{
     `modelName?`: `"user"` \| `LiteralString`;
     `fields?`: `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\>;
     `additionalFields?`: \{
      \[`key`: `string`\]: `DBFieldAttribute`;
     \};
     `changeEmail?`: \{
        `enabled`: `boolean`;
        `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>;
        `updateEmailWithoutVerification?`: `boolean`;
     \};
     `deleteUser?`: \{
        `enabled?`: `boolean`;
        `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>;
        `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>;
        `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>;
        `deleteTokenExpiresIn?`: `number`;
     \};
  \};
  `plugins`: \[\{
     `id`: `"convex"`;
     `version`: `string`;
     `init`: (`ctx`) => `void`;
     `hooks`: \{
        `before`: (
           \| \{
           `matcher`: `boolean`;
           `handler`: (`inputContext`) => `Promise`\<... \| ...\>;
         \}
           \| \{
           `matcher`: (`ctx`) => `boolean`;
           `handler`: (`inputContext`) => `Promise`\<\{
              `context`: ...;
           \}\>;
        \})[];
        `after`: \{
           `matcher`: (`context`) => `boolean`;
           `handler`: (`inputContext`) => `Promise`\<`unknown`\>;
        \}[];
     \};
     `endpoints`: \{
        `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{
           `method`: `"GET"`;
           `metadata`: \{
              `isAction`: `false`;
           \};
        \}, `OIDCMetadata`\>;
        `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{
           `method`: `"GET"`;
           `metadata`: \{
              `openapi`: \{
                 `description`: `string`;
                 `responses`: \{
                    `200`: \{
                       `description`: ...;
                       `content`: ...;
                    \};
                 \};
              \};
           \};
        \}, `JSONWebKeySet`\>;
        `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{
           `isAction`: `boolean`;
           `method`: `"POST"`;
           `metadata`: \{
              `SERVER_ONLY`: `true`;
              `openapi`: \{
                 `description`: `string`;
              \};
           \};
        \}, `any`[]\>;
        `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{
           `isAction`: `boolean`;
           `method`: `"POST"`;
           `metadata`: \{
              `SERVER_ONLY`: `true`;
              `openapi`: \{
                 `description`: `string`;
              \};
           \};
        \}, `any`[]\>;
        `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{
           `method`: `"GET"`;
           `requireHeaders`: `true`;
           `use`: (`inputContext`) => `Promise`\<\{
              `session`: ...;
           \}\>[];
           `metadata`: \{
              `openapi`: \{
                 `description`: `string`;
                 `responses`: \{
                    `200`: \{
                       `description`: ...;
                       `content`: ...;
                    \};
                 \};
              \};
           \};
         \}, \{
           `token`: `string`;
        \}\>;
     \};
     `schema`: \{
        `jwks`: \{
           `fields`: \{
              `publicKey`: \{
                 `type`: `"string"`;
                 `required`: `true`;
              \};
              `privateKey`: \{
                 `type`: `"string"`;
                 `required`: `true`;
              \};
              `createdAt`: \{
                 `type`: `"date"`;
                 `required`: `true`;
              \};
              `expiresAt`: \{
                 `type`: `"date"`;
                 `required`: `false`;
              \};
           \};
        \};
        `user`: \{
           `fields`: \{
              `userId`: \{
                 `type`: `"string"`;
                 `required`: `false`;
                 `input`: `false`;
              \};
           \};
        \};
     \};
  \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean; token: string; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \} \| \{ status: boolean; token: null; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ...; otp: ...; name: ...; image: ... \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ...; name: ...; context: ... \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; parameters: (...)\[\]; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ...; 400: ... \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<(...), (...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ response: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \} \| \{ id: "admin"; version: string; init: any; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<(...) \| (...)\> \}\[\] \}; endpoints: \{ setRole: StrictEndpoint\<"/admin/set-role", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; role: ZodUnion\<(...)\> \}, $strip\>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ userId: ...; role: ... \} \} \} \}, \{ user: UserWithRole \}\>; getUser: StrictEndpoint\<"/admin/get-user", \{ method: "GET"; query: ZodObject\<\{ id: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, UserWithRole\>; createUser: StrictEndpoint\<"/admin/create-user", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; password: ZodOptional\<(...)\>; name: ZodString; role: ZodOptional\<(...)\>; data: ZodOptional\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ email: ...; password?: ...; name: ...; role?: ...; data?: ... \} \} \} \}, \{ user: UserWithRole \}\>; adminUpdateUser: StrictEndpoint\<"/admin/update-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; data: ZodRecord\<(...), (...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, UserWithRole\>; listUsers: StrictEndpoint\<"/admin/list-users", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodObject\<\{ searchValue: ZodOptional\<(...)\>; searchField: ZodOptional\<(...)\>; searchOperator: ZodOptional\<(...)\>; limit: ZodOptional\<(...)\>; offset: ZodOptional\<(...)\>; sortBy: ZodOptional\<(...)\>; sortDirection: ZodOptional\<(...)\>; filterField: ZodOptional\<(...)\>; filterValue: ZodOptional\<(...)\>; filterOperator: ZodOptional\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ users: UserWithRole\[\]; total: number \}\>; listUserSessions: StrictEndpoint\<"/admin/list-user-sessions", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ sessions: SessionWithImpersonatedBy\[\] \}\>; unbanUser: StrictEndpoint\<"/admin/unban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ user: UserWithRole \}\>; banUser: StrictEndpoint\<"/admin/ban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; banReason: ZodOptional\<(...)\>; banExpiresIn: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ user: UserWithRole \}\>; impersonateUser: StrictEndpoint\<"/admin/impersonate-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: UserWithRole \}\>; stopImpersonating: StrictEndpoint\<"/admin/stop-impersonating", \{ method: "POST"; requireHeaders: true \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) \| (...) \| (...); userAgent?: (...) \| (...) \| (...) \} & Record\<string, any\>; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \}\>; revokeUserSession: StrictEndpoint\<"/admin/revoke-user-session", \{ method: "POST"; body: ZodObject\<\{ sessionToken: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; revokeUserSessions: StrictEndpoint\<"/admin/revoke-user-sessions", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; removeUser: StrictEndpoint\<"/admin/remove-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; setUserPassword: StrictEndpoint\<"/admin/set-user-password", \{ method: "POST"; body: ZodObject\<\{ newPassword: ZodString; userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; userHasPermission: StrictEndpoint\<"/admin/has-permission", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ userId: ...; role: ... \}, $strip\>, ZodXor\<readonly \[(...), (...)\]\>\>; metadata: \{ openapi: \{ description: string; requestBody: \{ content: ... \}; responses: \{ 200: ... \} \}; $Infer: \{ body: (...) & (...) \} \} \}, \{ error: null; success: boolean \}\> \}; $ERROR\_CODES: \{ USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL: RawError\<"USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL"\>; FAILED\_TO\_CREATE\_USER: RawError\<"FAILED\_TO\_CREATE\_USER"\>; USER\_ALREADY\_EXISTS: RawError\<"USER\_ALREADY\_EXISTS"\>; YOU\_CANNOT\_BAN\_YOURSELF: RawError\<"YOU\_CANNOT\_BAN\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD"\>; BANNED\_USER: RawError\<"BANNED\_USER"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER"\>; NO\_DATA\_TO\_UPDATE: RawError\<"NO\_DATA\_TO\_UPDATE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS"\>; YOU\_CANNOT\_REMOVE\_YOURSELF: RawError\<"YOU\_CANNOT\_REMOVE\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE"\>; YOU\_CANNOT\_IMPERSONATE\_ADMINS: RawError\<"YOU\_CANNOT\_IMPERSONATE\_ADMINS"\>; INVALID\_ROLE\_TYPE: RawError\<"INVALID\_ROLE\_TYPE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL"\>; PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER: RawError\<"PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER"\> \}; schema: \{ user: \{ fields: \{ role: \{ type: "string"; required: false; input: false \}; banned: \{ type: "boolean"; defaultValue: false; required: false; input: false \}; banReason: \{ type: "string"; required: false; input: false \}; banExpires: \{ type: "date"; required: false; input: false \} \} \}; session: \{ fields: \{ impersonatedBy: \{ type: "string"; required: false; input: false \} \} \} \}; options: NoInfer\<AdminOptions\> \} \| DefaultOrganizationPlugin\<\{ allowUserToCreateOrganization?: boolean \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\>) =\> Awaitable\<boolean\>); organizationLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\>) =\> Awaitable\<boolean\>); creatorRole?: string; membershipLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \}, organization: \{ id: string; name: string; slug: string; logo?: string \| null; metadata?: any; createdAt: Date \}) =\> number \| Promise\<number\>); ac?: AccessControl; roles?: \{ \[key: string\]: Role\<any\> \| undefined \}; dynamicAccessControl?: \{ enabled?: boolean; maximumRolesPerOrganization?: number \| ((organizationId: string) =\> Awaitable\<(...)\>) \}; teams?: \{ enabled: boolean; defaultTeam?: \{ enabled: boolean; customCreateDefaultTeam?: (...) \| (...) \}; maximumTeams?: number \| ((data: \{ organizationId: ...; session: ... \}, ctx?: (...) \| (...)) =\> Awaitable\<(...)\>); maximumMembersPerTeam?: number \| ((data: \{ teamId: ...; session: ...; organizationId: ... \}) =\> Awaitable\<(...)\>); allowRemovingAllTeams?: boolean \}; invitationExpiresIn?: number; invitationLimit?: number \| ((data: \{ user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\>; organization: \{ id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... \} & Record\<(...), (...)\>; member: \{ id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... \} & Record\<(...), (...)\> \}, ctx: AuthContext) =\> Awaitable\<number\>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: \{ id: string; role: string; email: string; organization: \{ id: string; name: string; slug: string; logo?: (...) \| (...) \| (...); metadata?: any; createdAt: Date \}; invitation: \{ id: string; organizationId: string; email: string; role: string; status: (...) \| (...) \| (...) \| (...); teamId?: (...) \| (...) \| (...); inviterId: string; expiresAt: Date; createdAt: Date \}; inviter: \{ id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... \} & \{ user: ... \} \}, request?: Request) =\> Promise\<void\>; schema?: \{ session?: \{ fields?: (...) \| (...) \}; organization?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; member?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; invitation?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; team?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; teamMember?: \{ modelName?: (...) \| (...); fields?: (...) \| (...) \}; organizationRole?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \} \}; disableOrganizationDeletion?: boolean; organizationHooks?: \{ beforeCreateOrganization?: (data: \{ organization: ...; user: ... \}) =\> Promise\<(...)\>; afterCreateOrganization?: (data: \{ organization: ...; member: ...; user: ... \}) =\> Promise\<(...)\>; beforeUpdateOrganization?: (data: \{ organization: ...; user: ...; member: ... \}) =\> Promise\<(...)\>; afterUpdateOrganization?: (data: \{ organization: ...; user: ...; member: ... \}) =\> Promise\<(...)\>; beforeDeleteOrganization?: (data: \{ organization: ...; user: ... \}, ctx?: (...) \| (...)) =\> Promise\<(...)\>; afterDeleteOrganization?: (data: \{ organization: ...; user: ... \}, ctx?: (...) \| (...)) =\> Promise\<(...)\>; beforeAddMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAddMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRemoveMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRemoveMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeUpdateMemberRole?: (data: \{ member: ...; newRole: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterUpdateMemberRole?: (data: \{ member: ...; previousRole: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCreateInvitation?: (data: \{ invitation: ...; inviter: ...; organization: ... \}) =\> Promise\<(...)\>; afterCreateInvitation?: (data: \{ invitation: ...; inviter: ...; organization: ... \}) =\> Promise\<(...)\>; beforeAcceptInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAcceptInvitation?: (data: \{ invitation: ...; member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRejectInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRejectInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCancelInvitation?: (data: \{ invitation: ...; cancelledBy: ...; organization: ... \}) =\> Promise\<(...)\>; afterCancelInvitation?: (data: \{ invitation: ...; cancelledBy: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCreateTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; afterCreateTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; beforeUpdateTeam?: (data: \{ team: ...; updates: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterUpdateTeam?: (data: \{ team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeDeleteTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; afterDeleteTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; beforeAddTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAddTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRemoveTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRemoveTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\> \} \}\>)\[\]\];
\}\>

***

### makeAuthApi()

```ts
function makeAuthApi<DM, Schema>(
   components, 
   queryBuilder, 
   options?): {
  getAuthUser: RegisteredQuery<"public", {
  }, Promise<MaybeMakeLooseDataModel<{ [TableName in string]: Schema["tables"][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<(...) & (...)>; fieldPaths: "_id" | ExtractFieldPaths<(...)>; indexes: Expand<(...) & (...)>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]>["user"]["document"]>>;
  authConfig: RegisteredQuery<"public", {
   }, Promise<{
     invitationPath: string | null;
  }>>;
  listWorkspaces: RegisteredQuery<"public", {
   }, Promise<
     | {
     id: string;
     name: string;
     slug: string;
     logo: string | null;
     role: string;
     active: boolean;
     joinedAt: number;
   }[]
    | null>>;
  listWorkspaceMembers: RegisteredQuery<"public", {
     organizationId?: string;
   }, Promise<
     | {
     organizationId: string;
     members: {
        userId: string;
        name: string;
        email: string;
        role: string;
        joinedAt: number;
     }[];
   }
    | null>>;
  updateProfile: RegisteredMutation<"public", {
     name: string;
  }, Promise<null>>;
};
```

Defined in: [src/convex/client/index.ts:1097](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1097)

Ready-made app query wrappers for re-exporting component functionality.

This follows Convex's API remounting pattern for component client code.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | - |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `true`\> | `SchemaDefinition`\<\{ `user`: `TableDefinition`\<`VObject`\<\{ `image?`: `string` \| `null`; `role?`: `string` \| `null`; `banReason?`: `string` \| `null`; `banned?`: `boolean` \| `null`; `banExpires?`: `number` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `email`: `string`; `emailVerified`: `boolean`; `name`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `emailVerified`: `VBoolean`\<`boolean`, `"required"`\>; `image`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `role`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `banned`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; `banReason`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `banExpires`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"` \| `"role"` \| `"banReason"` \| `"banned"` \| `"banExpires"`\>, \{ `email_name`: \[`"email"`, `"name"`, `"_creationTime"`\]; `name`: \[`"name"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `session`: `TableDefinition`\<`VObject`\<\{ `ipAddress?`: `string` \| `null`; `userAgent?`: `string` \| `null`; `activeOrganizationId?`: `string` \| `null`; `impersonatedBy?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `expiresAt`: `number`; `token`: `string`; \}, \{ `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `token`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `ipAddress`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userAgent`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VString`\<`string`, `"required"`\>; `impersonatedBy`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `activeOrganizationId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"` \| `"activeOrganizationId"` \| `"impersonatedBy"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `expiresAt_userId`: \[`"expiresAt"`, `"userId"`, `"_creationTime"`\]; `token`: \[`"token"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; `userId_expiresAt`: \[`"userId"`, `"expiresAt"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `account`: `TableDefinition`\<`VObject`\<\{ `password?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `idToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `scope?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `accountId`: `string`; `providerId`: `string`; \}, \{ `accountId`: `VString`\<`string`, `"required"`\>; `providerId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `idToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `scope`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `password`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\>, \{ `accountId`: \[`"accountId"`, `"_creationTime"`\]; `accountId_providerId`: \[`"accountId"`, `"providerId"`, `"_creationTime"`\]; `providerId_userId`: \[`"providerId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `verification`: `TableDefinition`\<`VObject`\<\{ `value`: `string`; `createdAt`: `number`; `updatedAt`: `number`; `expiresAt`: `number`; `identifier`: `string`; \}, \{ `identifier`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"expiresAt"` \| `"identifier"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `identifier`: \[`"identifier"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `rateLimit`: `TableDefinition`\<`VObject`\<\{ `key`: `string`; `count`: `number`; `lastRequest`: `number`; \}, \{ `key`: `VString`\<`string`, `"required"`\>; `count`: `VFloat64`\<`number`, `"required"`\>; `lastRequest`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"key"` \| `"count"` \| `"lastRequest"`\>, \{ `key`: \[`"key"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `passkey`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `name?`: `string` \| `null`; `transports?`: `string` \| `null`; `aaguid?`: `string` \| `null`; `userId`: `string`; `publicKey`: `string`; `credentialID`: `string`; `counter`: `number`; `deviceType`: `string`; `backedUp`: `boolean`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `publicKey`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `credentialID`: `VString`\<`string`, `"required"`\>; `counter`: `VFloat64`\<`number`, `"required"`\>; `deviceType`: `VString`\<`string`, `"required"`\>; `backedUp`: `VBoolean`\<`boolean`, `"required"`\>; `transports`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `aaguid`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"name"` \| `"userId"` \| `"publicKey"` \| `"credentialID"` \| `"counter"` \| `"deviceType"` \| `"backedUp"` \| `"transports"` \| `"aaguid"`\>, \{ `credentialID`: \[`"credentialID"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `jwks`: `TableDefinition`\<`VObject`\<\{ `expiresAt?`: `number` \| `null`; `createdAt`: `number`; `publicKey`: `string`; `privateKey`: `string`; \}, \{ `publicKey`: `VString`\<`string`, `"required"`\>; `privateKey`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `expiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"expiresAt"` \| `"publicKey"` \| `"privateKey"`\>, \{ \}, \{ \}, \{ \}\>; `organization`: `TableDefinition`\<`VObject`\<\{ `metadata?`: `string` \| `null`; `logo?`: `string` \| `null`; `createdAt`: `number`; `name`: `string`; `slug`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `slug`: `VString`\<`string`, `"required"`\>; `logo`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `metadata`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"name"` \| `"metadata"` \| `"slug"` \| `"logo"`\>, \{ `name`: \[`"name"`, `"_creationTime"`\]; `slug`: \[`"slug"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `member`: `TableDefinition`\<`VObject`\<\{ `createdAt`: `number`; `userId`: `string`; `organizationId`: `string`; `role`: `string`; \}, \{ `organizationId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `role`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"createdAt"` \| `"userId"` \| `"organizationId"` \| `"role"`\>, \{ `organizationId`: \[`"organizationId"`, `"_creationTime"`\]; `organizationId_userId`: \[`"organizationId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; `role`: \[`"role"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `invitation`: `TableDefinition`\<`VObject`\<\{ `role?`: `string` \| `null`; `createdAt`: `number`; `email`: `string`; `expiresAt`: `number`; `organizationId`: `string`; `status`: `string`; `inviterId`: `string`; \}, \{ `organizationId`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `role`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `status`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `inviterId`: `VString`\<`string`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"email"` \| `"expiresAt"` \| `"organizationId"` \| `"role"` \| `"status"` \| `"inviterId"`\>, \{ `organizationId`: \[`"organizationId"`, `"_creationTime"`\]; `email`: \[`"email"`, `"_creationTime"`\]; `role`: \[`"role"`, `"_creationTime"`\]; `status`: \[`"status"`, `"_creationTime"`\]; `inviterId`: \[`"inviterId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthApplication`: `TableDefinition`\<`VObject`\<\{ `type?`: `string` \| `null`; `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `name?`: `string` \| `null`; `userId?`: `string` \| `null`; `metadata?`: `string` \| `null`; `icon?`: `string` \| `null`; `clientId?`: `string` \| `null`; `clientSecret?`: `string` \| `null`; `redirectUrls?`: `string` \| `null`; `disabled?`: `boolean` \| `null`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `icon`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `metadata`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `clientSecret`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `redirectUrls`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `type`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `disabled`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"type"` \| `"createdAt"` \| `"updatedAt"` \| `"name"` \| `"userId"` \| `"metadata"` \| `"icon"` \| `"clientId"` \| `"clientSecret"` \| `"redirectUrls"` \| `"disabled"`\>, \{ `clientId`: \[`"clientId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthAccessToken`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `userId?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `clientId?`: `string` \| `null`; `scopes?`: `string` \| `null`; \}, \{ `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `scopes`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"accessToken"` \| `"refreshToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"clientId"` \| `"scopes"`\>, \{ `accessToken`: \[`"accessToken"`, `"_creationTime"`\]; `refreshToken`: \[`"refreshToken"`, `"_creationTime"`\]; `clientId`: \[`"clientId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthConsent`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `userId?`: `string` \| `null`; `clientId?`: `string` \| `null`; `scopes?`: `string` \| `null`; `consentGiven?`: `boolean` \| `null`; \}, \{ `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `scopes`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `consentGiven`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"clientId"` \| `"scopes"` \| `"consentGiven"`\>, \{ `clientId_userId`: \[`"clientId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; \}, `true`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `components` | [`AuthSetupComponents`](#authsetupcomponents) |
| `queryBuilder` | `QueryBuilder`\<`DM`, `"public"`\> |
| `options?` | [`SetupAuthOptions`](#setupauthoptions)\<`DM`, `Schema`\> |

#### Returns

```ts
{
  getAuthUser: RegisteredQuery<"public", {
  }, Promise<MaybeMakeLooseDataModel<{ [TableName in string]: Schema["tables"][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<(...) & (...)>; fieldPaths: "_id" | ExtractFieldPaths<(...)>; indexes: Expand<(...) & (...)>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]>["user"]["document"]>>;
  authConfig: RegisteredQuery<"public", {
   }, Promise<{
     invitationPath: string | null;
  }>>;
  listWorkspaces: RegisteredQuery<"public", {
   }, Promise<
     | {
     id: string;
     name: string;
     slug: string;
     logo: string | null;
     role: string;
     active: boolean;
     joinedAt: number;
   }[]
    | null>>;
  listWorkspaceMembers: RegisteredQuery<"public", {
     organizationId?: string;
   }, Promise<
     | {
     organizationId: string;
     members: {
        userId: string;
        name: string;
        email: string;
        role: string;
        joinedAt: number;
     }[];
   }
    | null>>;
  updateProfile: RegisteredMutation<"public", {
     name: string;
  }, Promise<null>>;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `getAuthUser` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<`MaybeMakeLooseDataModel`\<\{ \[TableName in string\]: Schema\["tables"\]\[TableName\] extends TableDefinition\<DocumentType, Indexes, SearchIndexes, VectorIndexes\> ? \{ document: Expand\<(...) & (...)\>; fieldPaths: "\_id" \| ExtractFieldPaths\<(...)\>; indexes: Expand\<(...) & (...)\>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes \} : never \}, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\]\>\> | [src/convex/client/index.ts:1230](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1230) |
| `authConfig` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `invitationPath`: `string` \| `null`; \}\>\> | [src/convex/client/index.ts:1231](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1231) |
| `listWorkspaces` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\< \| \{ `id`: `string`; `name`: `string`; `slug`: `string`; `logo`: `string` \| `null`; `role`: `string`; `active`: `boolean`; `joinedAt`: `number`; \}[] \| `null`\>\> | [src/convex/client/index.ts:1232](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1232) |
| `listWorkspaceMembers` | `RegisteredQuery`\<`"public"`, \{ `organizationId?`: `string`; \}, `Promise`\< \| \{ `organizationId`: `string`; `members`: \{ `userId`: `string`; `name`: `string`; `email`: `string`; `role`: `string`; `joinedAt`: `number`; \}[]; \} \| `null`\>\> | [src/convex/client/index.ts:1233](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1233) |
| `updateProfile` | `RegisteredMutation`\<`"public"`, \{ `name`: `string`; \}, `Promise`\<`null`\>\> | [src/convex/client/index.ts:1234](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1234) |

***

### setupAuth()

```ts
function setupAuth<DM, Schema>(
   components, 
   queryBuilder, 
   options?): {
  authComponent: {
     adapter: (ctx) => AdapterFactory<BetterAuthOptions>;
     getAuth: <T>(createAuth, ctx) => Promise<{
        auth: ReturnType<T>;
        headers: Headers;
     }>;
     getHeaders: (ctx) => Promise<Headers>;
     safeGetAuthUser: (ctx) => Promise<
        | MaybeMakeLooseDataModel<{ [TableName in string]: (...)[(...)] extends TableDefinition<(...), (...), (...), (...)> ? { document: ...; fieldPaths: ...; indexes: ...; searchIndexes: ...; vectorIndexes: ... } : never }, Schema["strictTableNameTypes"]>["user"]["document"]
       | undefined>;
     getAuthUser: (ctx) => Promise<MaybeMakeLooseDataModel<{ [TableName in string]: (...)[(...)][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<(...)>; fieldPaths: (...) | (...); indexes: Expand<(...)>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]>["user"]["document"]>;
     getAnyUserById: (ctx, id) => Promise<
        | MaybeMakeLooseDataModel<{ [TableName in string]: (...)[(...)] extends TableDefinition<(...), (...), (...), (...)> ? { document: ...; fieldPaths: ...; indexes: ...; searchIndexes: ...; vectorIndexes: ... } : never }, Schema["strictTableNameTypes"]>["user"]["document"]
       | null>;
     setUserId: (ctx, authId, userId) => Promise<void>;
     clientApi: () => {
        getAuthUser: RegisteredQuery<"public", {
        }, Promise<MaybeMakeLooseDataModel<{ [TableName in string]: (...) extends (...) ? (...) : (...) }, Schema["strictTableNameTypes"]>["user"]["document"]>>;
     };
     triggersApi: () => {
        onCreate: RegisteredMutation<"internal", {
           model: string;
           doc: any;
        }, Promise<void>>;
        onUpdate: RegisteredMutation<"internal", {
           model: string;
           oldDoc: any;
           newDoc: any;
        }, Promise<void>>;
        onDelete: RegisteredMutation<"internal", {
           model: string;
           doc: any;
        }, Promise<void>>;
     };
     registerRoutes: (http, createAuth, opts?) => void;
     registerRoutesLazy: <T>(http, createAuth, opts?) => void;
  };
  createAuthOptions: (ctx) => {
     appName?: string;
     baseURL?: BaseURLConfig;
     secret?: string;
     secrets?: {
        version: number;
        value: string;
     }[];
     secondaryStorage?: SecondaryStorage;
     emailVerification?: {
        sendVerificationEmail?: (data, request?) => Promise<void>;
        sendOnSignUp?: boolean;
        sendOnSignIn?: boolean;
        autoSignInAfterVerification?: boolean;
        expiresIn?: number;
        beforeEmailVerification?: (user, request?) => Promise<void>;
        afterEmailVerification?: (user, request?) => Promise<void>;
     };
     socialProviders?: SocialProviders;
     session?: BetterAuthDBOptions<"session", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "expiresAt"
        | "token"
        | "ipAddress"
        | "userAgent"> & {
        expiresIn?: number;
        updateAge?: number;
        disableSessionRefresh?: boolean;
        deferSessionRefresh?: boolean;
        storeSessionInDatabase?: boolean;
        preserveSessionInDatabase?: boolean;
        cookieCache?: {
           maxAge?: number;
           enabled?: boolean;
           strategy?: "compact" | "jwt" | "jwe";
           refreshCache?:   | boolean
              | {
              updateAge?: ... | ...;
            };
           version?:   | string
              | ((session, user) => string)
              | ((session, user) => Promise<...>);
        };
        freshAge?: number;
     };
     account?: BetterAuthDBOptions<"account", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "password"
        | "accountId"
        | "providerId"
        | "accessToken"
        | "refreshToken"
        | "idToken"
        | "accessTokenExpiresAt"
        | "refreshTokenExpiresAt"
        | "scope"> & {
        updateAccountOnSignIn?: boolean;
        accountLinking?: {
           enabled?: boolean;
           disableImplicitLinking?: boolean;
           requireLocalEmailVerified?: boolean;
           trustedProviders?: LiteralUnion<..., ...>[] | ((request?) => Awaitable<...>);
           allowDifferentEmails?: boolean;
           allowUnlinkingAll?: boolean;
           updateUserInfoOnLink?: boolean;
        };
        encryptOAuthTokens?: boolean;
        skipStateCookieCheck?: boolean;
        storeStateStrategy?: "database" | "cookie";
        storeAccountCookie?: boolean;
     };
     verification?: BetterAuthDBOptions<"verification", "value" | "createdAt" | "updatedAt" | "id" | "expiresAt" | "identifier"> & {
        disableCleanup?: boolean;
        storeIdentifier?:   | StoreIdentifierOption
           | {
           default: StoreIdentifierOption;
           overrides?: Record<string, StoreIdentifierOption>;
         };
        storeInDatabase?: boolean;
     };
     trustedOrigins?:   | string[]
        | ((request?) => Awaitable<(string | null | undefined)[]>);
     rateLimit?: BetterAuthRateLimitOptions;
     advanced?: BetterAuthAdvancedOptions;
     logger?: Logger;
     databaseHooks?: {
        user?: {
           create?: {
              before?: (user, context) => ...;
              after?: (user, context) => ...;
           };
           update?: {
              before?: (user, context) => ...;
              after?: (user, context) => ...;
           };
           delete?: {
              before?: (user, context) => ...;
              after?: (user, context) => ...;
           };
        };
        session?: {
           create?: {
              before?: (session, context) => ...;
              after?: (session, context) => ...;
           };
           update?: {
              before?: (session, context) => ...;
              after?: (session, context) => ...;
           };
           delete?: {
              before?: (session, context) => ...;
              after?: (session, context) => ...;
           };
        };
        account?: {
           create?: {
              before?: (account, context) => ...;
              after?: (account, context) => ...;
           };
           update?: {
              before?: (account, context) => ...;
              after?: (account, context) => ...;
           };
           delete?: {
              before?: (account, context) => ...;
              after?: (account, context) => ...;
           };
        };
        verification?: {
           create?: {
              before?: (verification, context) => ...;
              after?: (verification, context) => ...;
           };
           update?: {
              before?: (verification, context) => ...;
              after?: (verification, context) => ...;
           };
           delete?: {
              before?: (verification, context) => ...;
              after?: (verification, context) => ...;
           };
        };
     };
     onAPIError?: {
        throw?: boolean;
        onError?: (error, ctx) => void | Promise<void>;
        errorURL?: string;
        customizeDefaultErrorPage?: {
           colors?: {
              background?: string;
              foreground?: string;
              primary?: string;
              primaryForeground?: string;
              mutedForeground?: string;
              border?: string;
              destructive?: string;
              titleBorder?: string;
              titleColor?: string;
              gridColor?: string;
              cardBackground?: string;
              cornerBorder?: string;
           };
           size?: {
              radiusSm?: string;
              radiusMd?: string;
              radiusLg?: string;
              textSm?: string;
              text2xl?: string;
              text4xl?: string;
              text6xl?: string;
           };
           font?: {
              defaultFamily?: string;
              monoFamily?: string;
           };
           disableTitleBorder?: boolean;
           disableCornerDecorations?: boolean;
           disableBackgroundGrid?: boolean;
        };
     };
     hooks?: {
        before?: (inputContext) => Promise<unknown>;
        after?: (inputContext) => Promise<unknown>;
     };
     disabledPaths?: string[];
     telemetry?: {
        enabled?: boolean;
        debug?: boolean;
     };
     experimental?: {
        joins?: boolean;
     };
     basePath: string;
     database: AdapterFactory<BetterAuthOptions>;
     emailAndPassword: {
        disableSignUp?: boolean;
        requireEmailVerification?: boolean;
        maxPasswordLength?: number;
        minPasswordLength?: number;
        sendResetPassword?: (data, request?) => Promise<void>;
        resetPasswordTokenExpiresIn?: number;
        onPasswordReset?: (data, request?) => Promise<void>;
        password?: {
           hash?: (password) => Promise<string>;
           verify?: (data) => Promise<boolean>;
        };
        autoSignIn?: boolean;
        revokeSessionsOnPasswordReset?: boolean;
        onExistingUserSignUp?: (data, request?) => Promise<void>;
        customSyntheticUser?: (params) => Record<string, unknown>;
        enabled: boolean;
     };
     user: {
        modelName?: "user" | LiteralString;
        fields?: Partial<Record<"createdAt" | "updatedAt" | "email" | "emailVerified" | "name" | "image", string>>;
        additionalFields?: {
         [key: string]: DBFieldAttribute;
        };
        changeEmail?: {
           enabled: boolean;
           sendChangeEmailConfirmation?: (data, request?) => Promise<void>;
           updateEmailWithoutVerification?: boolean;
        };
        deleteUser?: {
           enabled?: boolean;
           sendDeleteAccountVerification?: (data, request?) => Promise<void>;
           beforeDelete?: (user, request?) => Promise<void>;
           afterDelete?: (user, request?) => Promise<void>;
           deleteTokenExpiresIn?: number;
        };
     };
     plugins: [{
        id: "convex";
        version: string;
        init: (ctx) => void;
        hooks: {
           before: (
              | {
              matcher: boolean;
              handler: (inputContext) => Promise<...>;
            }
              | {
              matcher: (ctx) => boolean;
              handler: (inputContext) => Promise<...>;
           })[];
           after: {
              matcher: (context) => boolean;
              handler: (inputContext) => Promise<unknown>;
           }[];
        };
        endpoints: {
           getOpenIdConfig: StrictEndpoint<"/convex/.well-known/openid-configuration", {
              method: "GET";
              metadata: {
                 isAction: false;
              };
           }, OIDCMetadata>;
           getJwks: StrictEndpoint<"/convex/jwks", {
              method: "GET";
              metadata: {
                 openapi: {
                    description: string;
                    responses: {
                       200: ...;
                    };
                 };
              };
           }, JSONWebKeySet>;
           getLatestJwks: StrictEndpoint<"/convex/latest-jwks", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: string;
                 };
              };
           }, any[]>;
           rotateKeys: StrictEndpoint<"/convex/rotate-keys", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: string;
                 };
              };
           }, any[]>;
           getToken: StrictEndpoint<"/convex/token", {
              method: "GET";
              requireHeaders: true;
              use: (inputContext) => Promise<...>[];
              metadata: {
                 openapi: {
                    description: string;
                    responses: {
                       200: ...;
                    };
                 };
              };
            }, {
              token: string;
           }>;
        };
        schema: {
           jwks: {
              fields: {
                 publicKey: {
                    type: "string";
                    required: true;
                 };
                 privateKey: {
                    type: "string";
                    required: true;
                 };
                 createdAt: {
                    type: "date";
                    required: true;
                 };
                 expiresAt: {
                    type: "date";
                    required: false;
                 };
              };
           };
           user: {
              fields: {
                 userId: {
                    type: "string";
                    required: false;
                    input: false;
                 };
              };
           };
        };
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; use: ((inputContext: ...) => ...)[]; body: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ...; type: ...; otp: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ...; otp: ... }, $strip>; metadata: { openapi: { description: ...; responses: ... } } }, { status: boolean; token: string; user: (...) & (...) } | { status: boolean; token: null; user: (...) & (...) }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<(...), (...)>, ZodRecord<(...), (...)>>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ...; otp: ...; password: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ...; otp: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ...; otp: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<(...)>) => Promise<(...)> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: ...) => ...)[]; query: ZodOptional<ZodObject<(...), (...)>>; metadata: { openapi: { operationId: ...; description: ...; parameters: ...; responses: ... } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ...; name: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... }; $Infer: { body: ... } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) | (...) | (...); userAgent?: (...) | (...) | (...) }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { description: ...; responses: ... } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ... }, $strip>; use: ((...) | (...))[]; metadata: { openapi: { description: ...; responses: ... } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ...; name: ... }, $strip>; use: ((...) | (...))[]; metadata: { openapi: { description: ...; responses: ... } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: ...; field: ... }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined } | { id: "admin"; version: string; init: any; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<(...)>) => Promise<(...)> }[] }; endpoints: { setRole: StrictEndpoint<"/admin/set-role", { method: "POST"; body: ZodObject<{ userId: ...; role: ... }, $strip>; requireHeaders: true; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... }; $Infer: { body: ... } } }, { user: UserWithRole }>; getUser: StrictEndpoint<"/admin/get-user", { method: "GET"; query: ZodObject<{ id: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, UserWithRole>; createUser: StrictEndpoint<"/admin/create-user", { method: "POST"; body: ZodObject<{ email: ...; password: ...; name: ...; role: ...; data: ... }, $strip>; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... }; $Infer: { body: ... } } }, { user: UserWithRole }>; adminUpdateUser: StrictEndpoint<"/admin/update-user", { method: "POST"; body: ZodObject<{ userId: ...; data: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, UserWithRole>; listUsers: StrictEndpoint<"/admin/list-users", { method: "GET"; use: ((inputContext: ...) => ...)[]; query: ZodObject<{ searchValue: ...; searchField: ...; searchOperator: ...; limit: ...; offset: ...; sortBy: ...; sortDirection: ...; filterField: ...; filterValue: ...; filterOperator: ... }, $strip>; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { users: UserWithRole[]; total: number }>; listUserSessions: StrictEndpoint<"/admin/list-user-sessions", { method: "POST"; use: ((inputContext: ...) => ...)[]; body: ZodObject<{ userId: ... }, $strip>; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { sessions: SessionWithImpersonatedBy[] }>; unbanUser: StrictEndpoint<"/admin/unban-user", { method: "POST"; body: ZodObject<{ userId: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { user: UserWithRole }>; banUser: StrictEndpoint<"/admin/ban-user", { method: "POST"; body: ZodObject<{ userId: ...; banReason: ...; banExpiresIn: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { user: UserWithRole }>; impersonateUser: StrictEndpoint<"/admin/impersonate-user", { method: "POST"; body: ZodObject<{ userId: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) | (...) | (...); userAgent?: (...) | (...) | (...) }; user: UserWithRole }>; stopImpersonating: StrictEndpoint<"/admin/stop-impersonating", { method: "POST"; requireHeaders: true }, { session: { id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... } & Record<(...), (...)>; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> }>; revokeUserSession: StrictEndpoint<"/admin/revoke-user-session", { method: "POST"; body: ZodObject<{ sessionToken: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { success: boolean }>; revokeUserSessions: StrictEndpoint<"/admin/revoke-user-sessions", { method: "POST"; body: ZodObject<{ userId: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { success: boolean }>; removeUser: StrictEndpoint<"/admin/remove-user", { method: "POST"; body: ZodObject<{ userId: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { success: boolean }>; setUserPassword: StrictEndpoint<"/admin/set-user-password", { method: "POST"; body: ZodObject<{ newPassword: ...; userId: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { status: boolean }>; userHasPermission: StrictEndpoint<"/admin/has-permission", { method: "POST"; body: ZodIntersection<ZodObject<(...), (...)>, ZodXor<(...)>>; metadata: { openapi: { description: ...; requestBody: ...; responses: ... }; $Infer: { body: ... } } }, { error: null; success: boolean }> }; $ERROR_CODES: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: RawError<"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL">; FAILED_TO_CREATE_USER: RawError<"FAILED_TO_CREATE_USER">; USER_ALREADY_EXISTS: RawError<"USER_ALREADY_EXISTS">; YOU_CANNOT_BAN_YOURSELF: RawError<"YOU_CANNOT_BAN_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: RawError<"YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE">; YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_BAN_USERS">; YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD">; BANNED_USER: RawError<"BANNED_USER">; YOU_ARE_NOT_ALLOWED_TO_GET_USER: RawError<"YOU_ARE_NOT_ALLOWED_TO_GET_USER">; NO_DATA_TO_UPDATE: RawError<"NO_DATA_TO_UPDATE">; YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS">; YOU_CANNOT_REMOVE_YOURSELF: RawError<"YOU_CANNOT_REMOVE_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE">; YOU_CANNOT_IMPERSONATE_ADMINS: RawError<"YOU_CANNOT_IMPERSONATE_ADMINS">; INVALID_ROLE_TYPE: RawError<"INVALID_ROLE_TYPE">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL">; PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: RawError<"PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER"> }; schema: { user: { fields: { role: { type: "string"; required: false; input: false }; banned: { type: "boolean"; defaultValue: false; required: false; input: false }; banReason: { type: "string"; required: false; input: false }; banExpires: { type: "date"; required: false; input: false } } }; session: { fields: { impersonatedBy: { type: "string"; required: false; input: false } } } }; options: NoInfer<AdminOptions> } | DefaultOrganizationPlugin<{ allowUserToCreateOrganization?: boolean | ((user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)>) => Awaitable<boolean>); organizationLimit?: number | ((user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)>) => Awaitable<boolean>); creatorRole?: string; membershipLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) }, organization: { id: string; name: string; slug: string; logo?: (...) | (...) | (...); metadata?: any; createdAt: Date }) => number | Promise<(...)>); ac?: AccessControl; roles?: { [key: string]: Role<(...)> | undefined }; dynamicAccessControl?: { enabled?: boolean; maximumRolesPerOrganization?: number | ((organizationId: ...) => ...) }; teams?: { enabled: boolean; defaultTeam?: { enabled: ...; customCreateDefaultTeam?: ... }; maximumTeams?: number | ((data: ..., ctx?: ...) => ...); maximumMembersPerTeam?: number | ((data: ...) => ...); allowRemovingAllTeams?: boolean }; invitationExpiresIn?: number; invitationLimit?: number | ((data: { user: (...) & (...); organization: (...) & (...); member: (...) & (...) }, ctx: AuthContext) => Awaitable<number>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: { id: string; role: string; email: string; organization: { id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... }; invitation: { id: ...; organizationId: ...; email: ...; role: ...; status: ...; teamId?: ...; inviterId: ...; expiresAt: ...; createdAt: ... }; inviter: (...) & (...) }, request?: Request) => Promise<void>; schema?: { session?: { fields?: ... }; organization?: { modelName?: ...; fields?: ...; additionalFields?: ... }; member?: { modelName?: ...; fields?: ...; additionalFields?: ... }; invitation?: { modelName?: ...; fields?: ...; additionalFields?: ... }; team?: { modelName?: ...; fields?: ...; additionalFields?: ... }; teamMember?: { modelName?: ...; fields?: ... }; organizationRole?: { modelName?: ...; fields?: ...; additionalFields?: ... } }; disableOrganizationDeletion?: boolean; organizationHooks?: { beforeCreateOrganization?: (data: ...) => ...; afterCreateOrganization?: (data: ...) => ...; beforeUpdateOrganization?: (data: ...) => ...; afterUpdateOrganization?: (data: ...) => ...; beforeDeleteOrganization?: (data: ..., ctx?: ...) => ...; afterDeleteOrganization?: (data: ..., ctx?: ...) => ...; beforeAddMember?: (data: ...) => ...; afterAddMember?: (data: ...) => ...; beforeRemoveMember?: (data: ...) => ...; afterRemoveMember?: (data: ...) => ...; beforeUpdateMemberRole?: (data: ...) => ...; afterUpdateMemberRole?: (data: ...) => ...; beforeCreateInvitation?: (data: ...) => ...; afterCreateInvitation?: (data: ...) => ...; beforeAcceptInvitation?: (data: ...) => ...; afterAcceptInvitation?: (data: ...) => ...; beforeRejectInvitation?: (data: ...) => ...; afterRejectInvitation?: (data: ...) => ...; beforeCancelInvitation?: (data: ...) => ...; afterCancelInvitation?: (data: ...) => ...; beforeCreateTeam?: (data: ...) => ...; afterCreateTeam?: (data: ...) => ...; beforeUpdateTeam?: (data: ...) => ...; afterUpdateTeam?: (data: ...) => ...; beforeDeleteTeam?: (data: ...) => ...; afterDeleteTeam?: (data: ...) => ...; beforeAddTeamMember?: (data: ...) => ...; afterAddTeamMember?: (data: ...) => ...; beforeRemoveTeamMember?: (data: ...) => ...; afterRemoveTeamMember?: (data: ...) => ... } }>)[]];
  };
  options: {
     appName?: string;
     baseURL?: BaseURLConfig;
     secret?: string;
     secrets?: {
        version: number;
        value: string;
     }[];
     secondaryStorage?: SecondaryStorage;
     emailVerification?: {
        sendVerificationEmail?: (data, request?) => Promise<void>;
        sendOnSignUp?: boolean;
        sendOnSignIn?: boolean;
        autoSignInAfterVerification?: boolean;
        expiresIn?: number;
        beforeEmailVerification?: (user, request?) => Promise<void>;
        afterEmailVerification?: (user, request?) => Promise<void>;
     };
     socialProviders?: SocialProviders;
     session?: BetterAuthDBOptions<"session", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "expiresAt"
        | "token"
        | "ipAddress"
        | "userAgent"> & {
        expiresIn?: number;
        updateAge?: number;
        disableSessionRefresh?: boolean;
        deferSessionRefresh?: boolean;
        storeSessionInDatabase?: boolean;
        preserveSessionInDatabase?: boolean;
        cookieCache?: {
           maxAge?: number;
           enabled?: boolean;
           strategy?: "compact" | "jwt" | "jwe";
           refreshCache?:   | boolean
              | {
              updateAge?: number;
            };
           version?:   | string
              | ((session, user) => string)
              | ((session, user) => Promise<string>);
        };
        freshAge?: number;
     };
     account?: BetterAuthDBOptions<"account", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "password"
        | "accountId"
        | "providerId"
        | "accessToken"
        | "refreshToken"
        | "idToken"
        | "accessTokenExpiresAt"
        | "refreshTokenExpiresAt"
        | "scope"> & {
        updateAccountOnSignIn?: boolean;
        accountLinking?: {
           enabled?: boolean;
           disableImplicitLinking?: boolean;
           requireLocalEmailVerified?: boolean;
           trustedProviders?:   | LiteralUnion<
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ..., string>[]
              | ((request?) => Awaitable<...[]>);
           allowDifferentEmails?: boolean;
           allowUnlinkingAll?: boolean;
           updateUserInfoOnLink?: boolean;
        };
        encryptOAuthTokens?: boolean;
        skipStateCookieCheck?: boolean;
        storeStateStrategy?: "database" | "cookie";
        storeAccountCookie?: boolean;
     };
     verification?: BetterAuthDBOptions<"verification", "value" | "createdAt" | "updatedAt" | "id" | "expiresAt" | "identifier"> & {
        disableCleanup?: boolean;
        storeIdentifier?:   | StoreIdentifierOption
           | {
           default: StoreIdentifierOption;
           overrides?: Record<string, StoreIdentifierOption>;
         };
        storeInDatabase?: boolean;
     };
     trustedOrigins?:   | string[]
        | ((request?) => Awaitable<(string | null | undefined)[]>);
     rateLimit?: BetterAuthRateLimitOptions;
     advanced?: BetterAuthAdvancedOptions;
     logger?: Logger;
     databaseHooks?: {
        user?: {
           create?: {
              before?: (user, context) => Promise<...>;
              after?: (user, context) => Promise<...>;
           };
           update?: {
              before?: (user, context) => Promise<...>;
              after?: (user, context) => Promise<...>;
           };
           delete?: {
              before?: (user, context) => Promise<...>;
              after?: (user, context) => Promise<...>;
           };
        };
        session?: {
           create?: {
              before?: (session, context) => Promise<...>;
              after?: (session, context) => Promise<...>;
           };
           update?: {
              before?: (session, context) => Promise<...>;
              after?: (session, context) => Promise<...>;
           };
           delete?: {
              before?: (session, context) => Promise<...>;
              after?: (session, context) => Promise<...>;
           };
        };
        account?: {
           create?: {
              before?: (account, context) => Promise<...>;
              after?: (account, context) => Promise<...>;
           };
           update?: {
              before?: (account, context) => Promise<...>;
              after?: (account, context) => Promise<...>;
           };
           delete?: {
              before?: (account, context) => Promise<...>;
              after?: (account, context) => Promise<...>;
           };
        };
        verification?: {
           create?: {
              before?: (verification, context) => Promise<...>;
              after?: (verification, context) => Promise<...>;
           };
           update?: {
              before?: (verification, context) => Promise<...>;
              after?: (verification, context) => Promise<...>;
           };
           delete?: {
              before?: (verification, context) => Promise<...>;
              after?: (verification, context) => Promise<...>;
           };
        };
     };
     onAPIError?: {
        throw?: boolean;
        onError?: (error, ctx) => void | Promise<void>;
        errorURL?: string;
        customizeDefaultErrorPage?: {
           colors?: {
              background?: string;
              foreground?: string;
              primary?: string;
              primaryForeground?: string;
              mutedForeground?: string;
              border?: string;
              destructive?: string;
              titleBorder?: string;
              titleColor?: string;
              gridColor?: string;
              cardBackground?: string;
              cornerBorder?: string;
           };
           size?: {
              radiusSm?: string;
              radiusMd?: string;
              radiusLg?: string;
              textSm?: string;
              text2xl?: string;
              text4xl?: string;
              text6xl?: string;
           };
           font?: {
              defaultFamily?: string;
              monoFamily?: string;
           };
           disableTitleBorder?: boolean;
           disableCornerDecorations?: boolean;
           disableBackgroundGrid?: boolean;
        };
     };
     hooks?: {
        before?: (inputContext) => Promise<unknown>;
        after?: (inputContext) => Promise<unknown>;
     };
     disabledPaths?: string[];
     telemetry?: {
        enabled?: boolean;
        debug?: boolean;
     };
     experimental?: {
        joins?: boolean;
     };
     basePath: string;
     database: AdapterFactory<BetterAuthOptions>;
     emailAndPassword: {
        disableSignUp?: boolean;
        requireEmailVerification?: boolean;
        maxPasswordLength?: number;
        minPasswordLength?: number;
        sendResetPassword?: (data, request?) => Promise<void>;
        resetPasswordTokenExpiresIn?: number;
        onPasswordReset?: (data, request?) => Promise<void>;
        password?: {
           hash?: (password) => Promise<string>;
           verify?: (data) => Promise<boolean>;
        };
        autoSignIn?: boolean;
        revokeSessionsOnPasswordReset?: boolean;
        onExistingUserSignUp?: (data, request?) => Promise<void>;
        customSyntheticUser?: (params) => Record<string, unknown>;
        enabled: boolean;
     };
     user: {
        modelName?: "user" | LiteralString;
        fields?: Partial<Record<"createdAt" | "updatedAt" | "email" | "emailVerified" | "name" | "image", string>>;
        additionalFields?: {
         [key: string]: DBFieldAttribute;
        };
        changeEmail?: {
           enabled: boolean;
           sendChangeEmailConfirmation?: (data, request?) => Promise<void>;
           updateEmailWithoutVerification?: boolean;
        };
        deleteUser?: {
           enabled?: boolean;
           sendDeleteAccountVerification?: (data, request?) => Promise<void>;
           beforeDelete?: (user, request?) => Promise<void>;
           afterDelete?: (user, request?) => Promise<void>;
           deleteTokenExpiresIn?: number;
        };
     };
     plugins: [{
        id: "convex";
        version: string;
        init: (ctx) => void;
        hooks: {
           before: (
              | {
              matcher: boolean;
              handler: (inputContext) => Promise<... | ...>;
            }
              | {
              matcher: (ctx) => boolean;
              handler: (inputContext) => Promise<{
                 context: ...;
              }>;
           })[];
           after: {
              matcher: (context) => boolean;
              handler: (inputContext) => Promise<unknown>;
           }[];
        };
        endpoints: {
           getOpenIdConfig: StrictEndpoint<"/convex/.well-known/openid-configuration", {
              method: "GET";
              metadata: {
                 isAction: false;
              };
           }, OIDCMetadata>;
           getJwks: StrictEndpoint<"/convex/jwks", {
              method: "GET";
              metadata: {
                 openapi: {
                    description: string;
                    responses: {
                       200: {
                          description: ...;
                          content: ...;
                       };
                    };
                 };
              };
           }, JSONWebKeySet>;
           getLatestJwks: StrictEndpoint<"/convex/latest-jwks", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: string;
                 };
              };
           }, any[]>;
           rotateKeys: StrictEndpoint<"/convex/rotate-keys", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: string;
                 };
              };
           }, any[]>;
           getToken: StrictEndpoint<"/convex/token", {
              method: "GET";
              requireHeaders: true;
              use: (inputContext) => Promise<{
                 session: ...;
              }>[];
              metadata: {
                 openapi: {
                    description: string;
                    responses: {
                       200: {
                          description: ...;
                          content: ...;
                       };
                    };
                 };
              };
            }, {
              token: string;
           }>;
        };
        schema: {
           jwks: {
              fields: {
                 publicKey: {
                    type: "string";
                    required: true;
                 };
                 privateKey: {
                    type: "string";
                    required: true;
                 };
                 createdAt: {
                    type: "date";
                    required: true;
                 };
                 expiresAt: {
                    type: "date";
                    required: false;
                 };
              };
           };
           user: {
              fields: {
                 userId: {
                    type: "string";
                    required: false;
                    input: false;
                 };
              };
           };
        };
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean; token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> } | { status: boolean; token: null; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ...; otp: ...; name: ...; image: ... }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ...; name: ...; context: ... }, $strip>>; metadata: { openapi: { operationId: string; description: string; parameters: (...)[]; responses: { 200: ... } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ...; 400: ... } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<(...), (...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } }; $Infer: { body: { response: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined } | { id: "admin"; version: string; init: any; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<(...) | (...)> }[] }; endpoints: { setRole: StrictEndpoint<"/admin/set-role", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; role: ZodUnion<(...)> }, $strip>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } }; $Infer: { body: { userId: ...; role: ... } } } }, { user: UserWithRole }>; getUser: StrictEndpoint<"/admin/get-user", { method: "GET"; query: ZodObject<{ id: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, UserWithRole>; createUser: StrictEndpoint<"/admin/create-user", { method: "POST"; body: ZodObject<{ email: ZodString; password: ZodOptional<(...)>; name: ZodString; role: ZodOptional<(...)>; data: ZodOptional<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } }; $Infer: { body: { email: ...; password?: ...; name: ...; role?: ...; data?: ... } } } }, { user: UserWithRole }>; adminUpdateUser: StrictEndpoint<"/admin/update-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; data: ZodRecord<(...), (...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, UserWithRole>; listUsers: StrictEndpoint<"/admin/list-users", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodObject<{ searchValue: ZodOptional<(...)>; searchField: ZodOptional<(...)>; searchOperator: ZodOptional<(...)>; limit: ZodOptional<(...)>; offset: ZodOptional<(...)>; sortBy: ZodOptional<(...)>; sortDirection: ZodOptional<(...)>; filterField: ZodOptional<(...)>; filterValue: ZodOptional<(...)>; filterOperator: ZodOptional<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { users: UserWithRole[]; total: number }>; listUserSessions: StrictEndpoint<"/admin/list-user-sessions", { method: "POST"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { sessions: SessionWithImpersonatedBy[] }>; unbanUser: StrictEndpoint<"/admin/unban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { user: UserWithRole }>; banUser: StrictEndpoint<"/admin/ban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; banReason: ZodOptional<(...)>; banExpiresIn: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { user: UserWithRole }>; impersonateUser: StrictEndpoint<"/admin/impersonate-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: UserWithRole }>; stopImpersonating: StrictEndpoint<"/admin/stop-impersonating", { method: "POST"; requireHeaders: true }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) | (...) | (...); userAgent?: (...) | (...) | (...) } & Record<string, any>; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> }>; revokeUserSession: StrictEndpoint<"/admin/revoke-user-session", { method: "POST"; body: ZodObject<{ sessionToken: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; revokeUserSessions: StrictEndpoint<"/admin/revoke-user-sessions", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; removeUser: StrictEndpoint<"/admin/remove-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; setUserPassword: StrictEndpoint<"/admin/set-user-password", { method: "POST"; body: ZodObject<{ newPassword: ZodString; userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { status: boolean }>; userHasPermission: StrictEndpoint<"/admin/has-permission", { method: "POST"; body: ZodIntersection<ZodObject<{ userId: ...; role: ... }, $strip>, ZodXor<readonly [(...), (...)]>>; metadata: { openapi: { description: string; requestBody: { content: ... }; responses: { 200: ... } }; $Infer: { body: (...) & (...) } } }, { error: null; success: boolean }> }; $ERROR_CODES: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: RawError<"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL">; FAILED_TO_CREATE_USER: RawError<"FAILED_TO_CREATE_USER">; USER_ALREADY_EXISTS: RawError<"USER_ALREADY_EXISTS">; YOU_CANNOT_BAN_YOURSELF: RawError<"YOU_CANNOT_BAN_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: RawError<"YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE">; YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_BAN_USERS">; YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD">; BANNED_USER: RawError<"BANNED_USER">; YOU_ARE_NOT_ALLOWED_TO_GET_USER: RawError<"YOU_ARE_NOT_ALLOWED_TO_GET_USER">; NO_DATA_TO_UPDATE: RawError<"NO_DATA_TO_UPDATE">; YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS">; YOU_CANNOT_REMOVE_YOURSELF: RawError<"YOU_CANNOT_REMOVE_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE">; YOU_CANNOT_IMPERSONATE_ADMINS: RawError<"YOU_CANNOT_IMPERSONATE_ADMINS">; INVALID_ROLE_TYPE: RawError<"INVALID_ROLE_TYPE">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL">; PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: RawError<"PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER"> }; schema: { user: { fields: { role: { type: "string"; required: false; input: false }; banned: { type: "boolean"; defaultValue: false; required: false; input: false }; banReason: { type: "string"; required: false; input: false }; banExpires: { type: "date"; required: false; input: false } } }; session: { fields: { impersonatedBy: { type: "string"; required: false; input: false } } } }; options: NoInfer<AdminOptions> } | DefaultOrganizationPlugin<{ allowUserToCreateOrganization?: boolean | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any>) => Awaitable<boolean>); organizationLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any>) => Awaitable<boolean>); creatorRole?: string; membershipLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null }, organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: any; createdAt: Date }) => number | Promise<number>); ac?: AccessControl; roles?: { [key: string]: Role<any> | undefined }; dynamicAccessControl?: { enabled?: boolean; maximumRolesPerOrganization?: number | ((organizationId: string) => Awaitable<(...)>) }; teams?: { enabled: boolean; defaultTeam?: { enabled: boolean; customCreateDefaultTeam?: (...) | (...) }; maximumTeams?: number | ((data: { organizationId: ...; session: ... }, ctx?: (...) | (...)) => Awaitable<(...)>); maximumMembersPerTeam?: number | ((data: { teamId: ...; session: ...; organizationId: ... }) => Awaitable<(...)>); allowRemovingAllTeams?: boolean }; invitationExpiresIn?: number; invitationLimit?: number | ((data: { user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)>; organization: { id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... } & Record<(...), (...)>; member: { id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... } & Record<(...), (...)> }, ctx: AuthContext) => Awaitable<number>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: { id: string; role: string; email: string; organization: { id: string; name: string; slug: string; logo?: (...) | (...) | (...); metadata?: any; createdAt: Date }; invitation: { id: string; organizationId: string; email: string; role: string; status: (...) | (...) | (...) | (...); teamId?: (...) | (...) | (...); inviterId: string; expiresAt: Date; createdAt: Date }; inviter: { id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... } & { user: ... } }, request?: Request) => Promise<void>; schema?: { session?: { fields?: (...) | (...) }; organization?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; member?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; invitation?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; team?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; teamMember?: { modelName?: (...) | (...); fields?: (...) | (...) }; organizationRole?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) } }; disableOrganizationDeletion?: boolean; organizationHooks?: { beforeCreateOrganization?: (data: { organization: ...; user: ... }) => Promise<(...)>; afterCreateOrganization?: (data: { organization: ...; member: ...; user: ... }) => Promise<(...)>; beforeUpdateOrganization?: (data: { organization: ...; user: ...; member: ... }) => Promise<(...)>; afterUpdateOrganization?: (data: { organization: ...; user: ...; member: ... }) => Promise<(...)>; beforeDeleteOrganization?: (data: { organization: ...; user: ... }, ctx?: (...) | (...)) => Promise<(...)>; afterDeleteOrganization?: (data: { organization: ...; user: ... }, ctx?: (...) | (...)) => Promise<(...)>; beforeAddMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; afterAddMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRemoveMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; afterRemoveMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeUpdateMemberRole?: (data: { member: ...; newRole: ...; user: ...; organization: ... }) => Promise<(...)>; afterUpdateMemberRole?: (data: { member: ...; previousRole: ...; user: ...; organization: ... }) => Promise<(...)>; beforeCreateInvitation?: (data: { invitation: ...; inviter: ...; organization: ... }) => Promise<(...)>; afterCreateInvitation?: (data: { invitation: ...; inviter: ...; organization: ... }) => Promise<(...)>; beforeAcceptInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; afterAcceptInvitation?: (data: { invitation: ...; member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRejectInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; afterRejectInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; beforeCancelInvitation?: (data: { invitation: ...; cancelledBy: ...; organization: ... }) => Promise<(...)>; afterCancelInvitation?: (data: { invitation: ...; cancelledBy: ...; organization: ... }) => Promise<(...)>; beforeCreateTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; afterCreateTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; beforeUpdateTeam?: (data: { team: ...; updates: ...; user: ...; organization: ... }) => Promise<(...)>; afterUpdateTeam?: (data: { team: ...; user: ...; organization: ... }) => Promise<(...)>; beforeDeleteTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; afterDeleteTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; beforeAddTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; afterAddTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRemoveTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; afterRemoveTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)> } }>)[]];
  };
  createAuth: (ctx) => Auth<{
     appName?: string;
     baseURL?: BaseURLConfig;
     secret?: string;
     secrets?: {
        version: number;
        value: string;
     }[];
     secondaryStorage?: SecondaryStorage;
     emailVerification?: {
        sendVerificationEmail?: (data, request?) => Promise<void>;
        sendOnSignUp?: boolean;
        sendOnSignIn?: boolean;
        autoSignInAfterVerification?: boolean;
        expiresIn?: number;
        beforeEmailVerification?: (user, request?) => Promise<void>;
        afterEmailVerification?: (user, request?) => Promise<void>;
     };
     socialProviders?: SocialProviders;
     session?: BetterAuthDBOptions<"session", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "expiresAt"
        | "token"
        | "ipAddress"
        | "userAgent"> & {
        expiresIn?: number;
        updateAge?: number;
        disableSessionRefresh?: boolean;
        deferSessionRefresh?: boolean;
        storeSessionInDatabase?: boolean;
        preserveSessionInDatabase?: boolean;
        cookieCache?: {
           maxAge?: number;
           enabled?: boolean;
           strategy?: "compact" | "jwt" | "jwe";
           refreshCache?:   | boolean
              | {
              updateAge?: ...;
            };
           version?: string | ((session, user) => ...) | ((session, user) => ...);
        };
        freshAge?: number;
     };
     account?: BetterAuthDBOptions<"account", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "password"
        | "accountId"
        | "providerId"
        | "accessToken"
        | "refreshToken"
        | "idToken"
        | "accessTokenExpiresAt"
        | "refreshTokenExpiresAt"
        | "scope"> & {
        updateAccountOnSignIn?: boolean;
        accountLinking?: {
           enabled?: boolean;
           disableImplicitLinking?: boolean;
           requireLocalEmailVerified?: boolean;
           trustedProviders?: ...[] | ((request?) => ...);
           allowDifferentEmails?: boolean;
           allowUnlinkingAll?: boolean;
           updateUserInfoOnLink?: boolean;
        };
        encryptOAuthTokens?: boolean;
        skipStateCookieCheck?: boolean;
        storeStateStrategy?: "database" | "cookie";
        storeAccountCookie?: boolean;
     };
     verification?: BetterAuthDBOptions<"verification", "value" | "createdAt" | "updatedAt" | "id" | "expiresAt" | "identifier"> & {
        disableCleanup?: boolean;
        storeIdentifier?:   | StoreIdentifierOption
           | {
           default: StoreIdentifierOption;
           overrides?: Record<..., ...>;
         };
        storeInDatabase?: boolean;
     };
     trustedOrigins?:   | string[]
        | ((request?) => Awaitable<(string | null | undefined)[]>);
     rateLimit?: BetterAuthRateLimitOptions;
     advanced?: BetterAuthAdvancedOptions;
     logger?: Logger;
     databaseHooks?: {
        user?: {
           create?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           update?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           delete?: {
              before?: ... | ...;
              after?: ... | ...;
           };
        };
        session?: {
           create?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           update?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           delete?: {
              before?: ... | ...;
              after?: ... | ...;
           };
        };
        account?: {
           create?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           update?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           delete?: {
              before?: ... | ...;
              after?: ... | ...;
           };
        };
        verification?: {
           create?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           update?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           delete?: {
              before?: ... | ...;
              after?: ... | ...;
           };
        };
     };
     onAPIError?: {
        throw?: boolean;
        onError?: (error, ctx) => void | Promise<void>;
        errorURL?: string;
        customizeDefaultErrorPage?: {
           colors?: {
              background?: ... | ...;
              foreground?: ... | ...;
              primary?: ... | ...;
              primaryForeground?: ... | ...;
              mutedForeground?: ... | ...;
              border?: ... | ...;
              destructive?: ... | ...;
              titleBorder?: ... | ...;
              titleColor?: ... | ...;
              gridColor?: ... | ...;
              cardBackground?: ... | ...;
              cornerBorder?: ... | ...;
           };
           size?: {
              radiusSm?: ... | ...;
              radiusMd?: ... | ...;
              radiusLg?: ... | ...;
              textSm?: ... | ...;
              text2xl?: ... | ...;
              text4xl?: ... | ...;
              text6xl?: ... | ...;
           };
           font?: {
              defaultFamily?: ... | ...;
              monoFamily?: ... | ...;
           };
           disableTitleBorder?: boolean;
           disableCornerDecorations?: boolean;
           disableBackgroundGrid?: boolean;
        };
     };
     hooks?: {
        before?: (inputContext) => Promise<unknown>;
        after?: (inputContext) => Promise<unknown>;
     };
     disabledPaths?: string[];
     telemetry?: {
        enabled?: boolean;
        debug?: boolean;
     };
     experimental?: {
        joins?: boolean;
     };
     basePath: string;
     database: AdapterFactory<BetterAuthOptions>;
     emailAndPassword: {
        disableSignUp?: boolean;
        requireEmailVerification?: boolean;
        maxPasswordLength?: number;
        minPasswordLength?: number;
        sendResetPassword?: (data, request?) => Promise<void>;
        resetPasswordTokenExpiresIn?: number;
        onPasswordReset?: (data, request?) => Promise<void>;
        password?: {
           hash?: (password) => Promise<string>;
           verify?: (data) => Promise<boolean>;
        };
        autoSignIn?: boolean;
        revokeSessionsOnPasswordReset?: boolean;
        onExistingUserSignUp?: (data, request?) => Promise<void>;
        customSyntheticUser?: (params) => Record<string, unknown>;
        enabled: boolean;
     };
     user: {
        modelName?: "user" | LiteralString;
        fields?: Partial<Record<"createdAt" | "updatedAt" | "email" | "emailVerified" | "name" | "image", string>>;
        additionalFields?: {
         [key: string]: DBFieldAttribute;
        };
        changeEmail?: {
           enabled: boolean;
           sendChangeEmailConfirmation?: (data, request?) => Promise<void>;
           updateEmailWithoutVerification?: boolean;
        };
        deleteUser?: {
           enabled?: boolean;
           sendDeleteAccountVerification?: (data, request?) => Promise<void>;
           beforeDelete?: (user, request?) => Promise<void>;
           afterDelete?: (user, request?) => Promise<void>;
           deleteTokenExpiresIn?: number;
        };
     };
     plugins: [{
        id: "convex";
        version: string;
        init: (ctx) => void;
        hooks: {
           before: (
              | {
              matcher: boolean;
              handler: (inputContext) => ...;
            }
              | {
              matcher: (ctx) => ...;
              handler: (inputContext) => ...;
           })[];
           after: {
              matcher: (context) => boolean;
              handler: (inputContext) => Promise<...>;
           }[];
        };
        endpoints: {
           getOpenIdConfig: StrictEndpoint<"/convex/.well-known/openid-configuration", {
              method: "GET";
              metadata: {
                 isAction: false;
              };
           }, OIDCMetadata>;
           getJwks: StrictEndpoint<"/convex/jwks", {
              method: "GET";
              metadata: {
                 openapi: {
                    description: ...;
                    responses: ...;
                 };
              };
           }, JSONWebKeySet>;
           getLatestJwks: StrictEndpoint<"/convex/latest-jwks", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: ...;
                 };
              };
           }, any[]>;
           rotateKeys: StrictEndpoint<"/convex/rotate-keys", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: ...;
                 };
              };
           }, any[]>;
           getToken: StrictEndpoint<"/convex/token", {
              method: "GET";
              requireHeaders: true;
              use: (inputContext) => ...[];
              metadata: {
                 openapi: {
                    description: ...;
                    responses: ...;
                 };
              };
            }, {
              token: string;
           }>;
        };
        schema: {
           jwks: {
              fields: {
                 publicKey: {
                    type: "string";
                    required: true;
                 };
                 privateKey: {
                    type: "string";
                    required: true;
                 };
                 createdAt: {
                    type: "date";
                    required: true;
                 };
                 expiresAt: {
                    type: "date";
                    required: false;
                 };
              };
           };
           user: {
              fields: {
                 userId: {
                    type: "string";
                    required: false;
                    input: false;
                 };
              };
           };
        };
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; use: (...)[]; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { otp: ... } | { otp: ... }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { status: ...; token: ...; user: ... } | { status: ...; token: ...; user: ... }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<(...), (...)>; metadata: { openapi: ... } }, { token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: ...) => ... }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: (...)[]; query: ZodOptional<(...)>; metadata: { openapi: ... } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: ... } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ...; $Infer: ... } }, { session: { id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... }; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: (...)[]; metadata: { openapi: ... } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: ...; required: ... }; publicKey: { type: ...; required: ... }; userId: { type: ...; references: ...; required: ...; index: ... }; credentialID: { type: ...; required: ...; index: ... }; counter: { type: ...; required: ... }; deviceType: { type: ...; required: ... }; backedUp: { type: ...; required: ... }; transports: { type: ...; required: ... }; createdAt: { type: ...; required: ... }; aaguid: { type: ...; required: ... } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined } | { id: "admin"; version: string; init: any; hooks: { after: { matcher: any; handler: (inputContext: ...) => ... }[] }; endpoints: { setRole: StrictEndpoint<"/admin/set-role", { method: "POST"; body: ZodObject<(...), (...)>; requireHeaders: true; use: (...)[]; metadata: { openapi: ...; $Infer: ... } }, { user: UserWithRole }>; getUser: StrictEndpoint<"/admin/get-user", { method: "GET"; query: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, UserWithRole>; createUser: StrictEndpoint<"/admin/create-user", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ...; $Infer: ... } }, { user: UserWithRole }>; adminUpdateUser: StrictEndpoint<"/admin/update-user", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, UserWithRole>; listUsers: StrictEndpoint<"/admin/list-users", { method: "GET"; use: (...)[]; query: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { users: (...)[]; total: number }>; listUserSessions: StrictEndpoint<"/admin/list-user-sessions", { method: "POST"; use: (...)[]; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { sessions: (...)[] }>; unbanUser: StrictEndpoint<"/admin/unban-user", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { user: UserWithRole }>; banUser: StrictEndpoint<"/admin/ban-user", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { user: UserWithRole }>; impersonateUser: StrictEndpoint<"/admin/impersonate-user", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { session: { id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... }; user: UserWithRole }>; stopImpersonating: StrictEndpoint<"/admin/stop-impersonating", { method: "POST"; requireHeaders: true }, { session: (...) & (...); user: (...) & (...) }>; revokeUserSession: StrictEndpoint<"/admin/revoke-user-session", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }>; revokeUserSessions: StrictEndpoint<"/admin/revoke-user-sessions", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }>; removeUser: StrictEndpoint<"/admin/remove-user", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }>; setUserPassword: StrictEndpoint<"/admin/set-user-password", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { status: boolean }>; userHasPermission: StrictEndpoint<"/admin/has-permission", { method: "POST"; body: ZodIntersection<(...), (...)>; metadata: { openapi: ...; $Infer: ... } }, { error: null; success: boolean }> }; $ERROR_CODES: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: RawError<"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL">; FAILED_TO_CREATE_USER: RawError<"FAILED_TO_CREATE_USER">; USER_ALREADY_EXISTS: RawError<"USER_ALREADY_EXISTS">; YOU_CANNOT_BAN_YOURSELF: RawError<"YOU_CANNOT_BAN_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: RawError<"YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE">; YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_BAN_USERS">; YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD">; BANNED_USER: RawError<"BANNED_USER">; YOU_ARE_NOT_ALLOWED_TO_GET_USER: RawError<"YOU_ARE_NOT_ALLOWED_TO_GET_USER">; NO_DATA_TO_UPDATE: RawError<"NO_DATA_TO_UPDATE">; YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS">; YOU_CANNOT_REMOVE_YOURSELF: RawError<"YOU_CANNOT_REMOVE_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE">; YOU_CANNOT_IMPERSONATE_ADMINS: RawError<"YOU_CANNOT_IMPERSONATE_ADMINS">; INVALID_ROLE_TYPE: RawError<"INVALID_ROLE_TYPE">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL">; PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: RawError<"PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER"> }; schema: { user: { fields: { role: { type: ...; required: ...; input: ... }; banned: { type: ...; defaultValue: ...; required: ...; input: ... }; banReason: { type: ...; required: ...; input: ... }; banExpires: { type: ...; required: ...; input: ... } } }; session: { fields: { impersonatedBy: { type: ...; required: ...; input: ... } } } }; options: NoInfer<AdminOptions> } | DefaultOrganizationPlugin<{ allowUserToCreateOrganization?: boolean | ((user: (...) & (...)) => Awaitable<(...)>); organizationLimit?: number | ((user: (...) & (...)) => Awaitable<(...)>); creatorRole?: string; membershipLimit?: number | ((user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... }, organization: { id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... }) => (...) | (...)); ac?: AccessControl; roles?: { [key: string]: (...) | (...) }; dynamicAccessControl?: { enabled?: (...) | (...) | (...); maximumRolesPerOrganization?: (...) | (...) | (...) }; teams?: { enabled: boolean; defaultTeam?: (...) | (...); maximumTeams?: (...) | (...) | (...); maximumMembersPerTeam?: (...) | (...) | (...); allowRemovingAllTeams?: (...) | (...) | (...) }; invitationExpiresIn?: number; invitationLimit?: number | ((data: { user: ...; organization: ...; member: ... }, ctx: AuthContext) => Awaitable<(...)>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: { id: ...; role: ...; email: ...; organization: ...; invitation: ...; inviter: ... }, request?: (...) | (...)) => Promise<(...)>; schema?: { session?: (...) | (...); organization?: (...) | (...); member?: (...) | (...); invitation?: (...) | (...); team?: (...) | (...); teamMember?: (...) | (...); organizationRole?: (...) | (...) }; disableOrganizationDeletion?: boolean; organizationHooks?: { beforeCreateOrganization?: (...) | (...); afterCreateOrganization?: (...) | (...); beforeUpdateOrganization?: (...) | (...); afterUpdateOrganization?: (...) | (...); beforeDeleteOrganization?: (...) | (...); afterDeleteOrganization?: (...) | (...); beforeAddMember?: (...) | (...); afterAddMember?: (...) | (...); beforeRemoveMember?: (...) | (...); afterRemoveMember?: (...) | (...); beforeUpdateMemberRole?: (...) | (...); afterUpdateMemberRole?: (...) | (...); beforeCreateInvitation?: (...) | (...); afterCreateInvitation?: (...) | (...); beforeAcceptInvitation?: (...) | (...); afterAcceptInvitation?: (...) | (...); beforeRejectInvitation?: (...) | (...); afterRejectInvitation?: (...) | (...); beforeCancelInvitation?: (...) | (...); afterCancelInvitation?: (...) | (...); beforeCreateTeam?: (...) | (...); afterCreateTeam?: (...) | (...); beforeUpdateTeam?: (...) | (...); afterUpdateTeam?: (...) | (...); beforeDeleteTeam?: (...) | (...); afterDeleteTeam?: (...) | (...); beforeAddTeamMember?: (...) | (...); afterAddTeamMember?: (...) | (...); beforeRemoveTeamMember?: (...) | (...); afterRemoveTeamMember?: (...) | (...) } }>)[]];
  }>;
  getAuthUser: RegisteredQuery<"public", {
  }, Promise<MaybeMakeLooseDataModel<{ [TableName in string]: Schema["tables"][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<(...) & (...)>; fieldPaths: "_id" | ExtractFieldPaths<(...)>; indexes: Expand<(...) & (...)>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]>["user"]["document"]>>;
  authConfig: RegisteredQuery<"public", {
   }, Promise<{
     invitationPath: string | null;
  }>>;
  listWorkspaces: RegisteredQuery<"public", {
   }, Promise<
     | {
     id: string;
     name: string;
     slug: string;
     logo: string | null;
     role: string;
     active: boolean;
     joinedAt: number;
   }[]
    | null>>;
  listWorkspaceMembers: RegisteredQuery<"public", {
     organizationId?: string;
   }, Promise<
     | {
     organizationId: string;
     members: {
        userId: string;
        name: string;
        email: string;
        role: string;
        joinedAt: number;
     }[];
   }
    | null>>;
  updateProfile: RegisteredMutation<"public", {
     name: string;
  }, Promise<null>>;
  mcp: McpExchange;
};
```

Defined in: [src/convex/client/index.ts:1255](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1255)

App-facing client bridge for the packaged Convex component.

This convenience helper composes the simple wrapper and API remounting
patterns exported from this module.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | - |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `true`\> | `SchemaDefinition`\<\{ `user`: `TableDefinition`\<`VObject`\<\{ `image?`: `string` \| `null`; `role?`: `string` \| `null`; `banReason?`: `string` \| `null`; `banned?`: `boolean` \| `null`; `banExpires?`: `number` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `email`: `string`; `emailVerified`: `boolean`; `name`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `emailVerified`: `VBoolean`\<`boolean`, `"required"`\>; `image`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `role`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `banned`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; `banReason`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `banExpires`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"` \| `"role"` \| `"banReason"` \| `"banned"` \| `"banExpires"`\>, \{ `email_name`: \[`"email"`, `"name"`, `"_creationTime"`\]; `name`: \[`"name"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `session`: `TableDefinition`\<`VObject`\<\{ `ipAddress?`: `string` \| `null`; `userAgent?`: `string` \| `null`; `activeOrganizationId?`: `string` \| `null`; `impersonatedBy?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `expiresAt`: `number`; `token`: `string`; \}, \{ `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `token`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `ipAddress`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userAgent`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VString`\<`string`, `"required"`\>; `impersonatedBy`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `activeOrganizationId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"` \| `"activeOrganizationId"` \| `"impersonatedBy"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `expiresAt_userId`: \[`"expiresAt"`, `"userId"`, `"_creationTime"`\]; `token`: \[`"token"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; `userId_expiresAt`: \[`"userId"`, `"expiresAt"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `account`: `TableDefinition`\<`VObject`\<\{ `password?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `idToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `scope?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `accountId`: `string`; `providerId`: `string`; \}, \{ `accountId`: `VString`\<`string`, `"required"`\>; `providerId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `idToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `scope`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `password`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\>, \{ `accountId`: \[`"accountId"`, `"_creationTime"`\]; `accountId_providerId`: \[`"accountId"`, `"providerId"`, `"_creationTime"`\]; `providerId_userId`: \[`"providerId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `verification`: `TableDefinition`\<`VObject`\<\{ `value`: `string`; `createdAt`: `number`; `updatedAt`: `number`; `expiresAt`: `number`; `identifier`: `string`; \}, \{ `identifier`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"expiresAt"` \| `"identifier"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `identifier`: \[`"identifier"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `rateLimit`: `TableDefinition`\<`VObject`\<\{ `key`: `string`; `count`: `number`; `lastRequest`: `number`; \}, \{ `key`: `VString`\<`string`, `"required"`\>; `count`: `VFloat64`\<`number`, `"required"`\>; `lastRequest`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"key"` \| `"count"` \| `"lastRequest"`\>, \{ `key`: \[`"key"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `passkey`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `name?`: `string` \| `null`; `transports?`: `string` \| `null`; `aaguid?`: `string` \| `null`; `userId`: `string`; `publicKey`: `string`; `credentialID`: `string`; `counter`: `number`; `deviceType`: `string`; `backedUp`: `boolean`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `publicKey`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `credentialID`: `VString`\<`string`, `"required"`\>; `counter`: `VFloat64`\<`number`, `"required"`\>; `deviceType`: `VString`\<`string`, `"required"`\>; `backedUp`: `VBoolean`\<`boolean`, `"required"`\>; `transports`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `aaguid`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"name"` \| `"userId"` \| `"publicKey"` \| `"credentialID"` \| `"counter"` \| `"deviceType"` \| `"backedUp"` \| `"transports"` \| `"aaguid"`\>, \{ `credentialID`: \[`"credentialID"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `jwks`: `TableDefinition`\<`VObject`\<\{ `expiresAt?`: `number` \| `null`; `createdAt`: `number`; `publicKey`: `string`; `privateKey`: `string`; \}, \{ `publicKey`: `VString`\<`string`, `"required"`\>; `privateKey`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `expiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"expiresAt"` \| `"publicKey"` \| `"privateKey"`\>, \{ \}, \{ \}, \{ \}\>; `organization`: `TableDefinition`\<`VObject`\<\{ `metadata?`: `string` \| `null`; `logo?`: `string` \| `null`; `createdAt`: `number`; `name`: `string`; `slug`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `slug`: `VString`\<`string`, `"required"`\>; `logo`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `metadata`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"name"` \| `"metadata"` \| `"slug"` \| `"logo"`\>, \{ `name`: \[`"name"`, `"_creationTime"`\]; `slug`: \[`"slug"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `member`: `TableDefinition`\<`VObject`\<\{ `createdAt`: `number`; `userId`: `string`; `organizationId`: `string`; `role`: `string`; \}, \{ `organizationId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `role`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"createdAt"` \| `"userId"` \| `"organizationId"` \| `"role"`\>, \{ `organizationId`: \[`"organizationId"`, `"_creationTime"`\]; `organizationId_userId`: \[`"organizationId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; `role`: \[`"role"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `invitation`: `TableDefinition`\<`VObject`\<\{ `role?`: `string` \| `null`; `createdAt`: `number`; `email`: `string`; `expiresAt`: `number`; `organizationId`: `string`; `status`: `string`; `inviterId`: `string`; \}, \{ `organizationId`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `role`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `status`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `inviterId`: `VString`\<`string`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"email"` \| `"expiresAt"` \| `"organizationId"` \| `"role"` \| `"status"` \| `"inviterId"`\>, \{ `organizationId`: \[`"organizationId"`, `"_creationTime"`\]; `email`: \[`"email"`, `"_creationTime"`\]; `role`: \[`"role"`, `"_creationTime"`\]; `status`: \[`"status"`, `"_creationTime"`\]; `inviterId`: \[`"inviterId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthApplication`: `TableDefinition`\<`VObject`\<\{ `type?`: `string` \| `null`; `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `name?`: `string` \| `null`; `userId?`: `string` \| `null`; `metadata?`: `string` \| `null`; `icon?`: `string` \| `null`; `clientId?`: `string` \| `null`; `clientSecret?`: `string` \| `null`; `redirectUrls?`: `string` \| `null`; `disabled?`: `boolean` \| `null`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `icon`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `metadata`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `clientSecret`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `redirectUrls`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `type`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `disabled`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"type"` \| `"createdAt"` \| `"updatedAt"` \| `"name"` \| `"userId"` \| `"metadata"` \| `"icon"` \| `"clientId"` \| `"clientSecret"` \| `"redirectUrls"` \| `"disabled"`\>, \{ `clientId`: \[`"clientId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthAccessToken`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `userId?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `clientId?`: `string` \| `null`; `scopes?`: `string` \| `null`; \}, \{ `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `scopes`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"accessToken"` \| `"refreshToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"clientId"` \| `"scopes"`\>, \{ `accessToken`: \[`"accessToken"`, `"_creationTime"`\]; `refreshToken`: \[`"refreshToken"`, `"_creationTime"`\]; `clientId`: \[`"clientId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `oauthConsent`: `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `userId?`: `string` \| `null`; `clientId?`: `string` \| `null`; `scopes?`: `string` \| `null`; `consentGiven?`: `boolean` \| `null`; \}, \{ `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `scopes`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `consentGiven`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"clientId"` \| `"scopes"` \| `"consentGiven"`\>, \{ `clientId_userId`: \[`"clientId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; \}, `true`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `components` | [`AuthSetupComponents`](#authsetupcomponents) |
| `queryBuilder` | `QueryBuilder`\<`DM`, `"public"`\> |
| `options?` | [`SetupAuthOptions`](#setupauthoptions)\<`DM`, `Schema`\> |

#### Returns

```ts
{
  authComponent: {
     adapter: (ctx) => AdapterFactory<BetterAuthOptions>;
     getAuth: <T>(createAuth, ctx) => Promise<{
        auth: ReturnType<T>;
        headers: Headers;
     }>;
     getHeaders: (ctx) => Promise<Headers>;
     safeGetAuthUser: (ctx) => Promise<
        | MaybeMakeLooseDataModel<{ [TableName in string]: (...)[(...)] extends TableDefinition<(...), (...), (...), (...)> ? { document: ...; fieldPaths: ...; indexes: ...; searchIndexes: ...; vectorIndexes: ... } : never }, Schema["strictTableNameTypes"]>["user"]["document"]
       | undefined>;
     getAuthUser: (ctx) => Promise<MaybeMakeLooseDataModel<{ [TableName in string]: (...)[(...)][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<(...)>; fieldPaths: (...) | (...); indexes: Expand<(...)>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]>["user"]["document"]>;
     getAnyUserById: (ctx, id) => Promise<
        | MaybeMakeLooseDataModel<{ [TableName in string]: (...)[(...)] extends TableDefinition<(...), (...), (...), (...)> ? { document: ...; fieldPaths: ...; indexes: ...; searchIndexes: ...; vectorIndexes: ... } : never }, Schema["strictTableNameTypes"]>["user"]["document"]
       | null>;
     setUserId: (ctx, authId, userId) => Promise<void>;
     clientApi: () => {
        getAuthUser: RegisteredQuery<"public", {
        }, Promise<MaybeMakeLooseDataModel<{ [TableName in string]: (...) extends (...) ? (...) : (...) }, Schema["strictTableNameTypes"]>["user"]["document"]>>;
     };
     triggersApi: () => {
        onCreate: RegisteredMutation<"internal", {
           model: string;
           doc: any;
        }, Promise<void>>;
        onUpdate: RegisteredMutation<"internal", {
           model: string;
           oldDoc: any;
           newDoc: any;
        }, Promise<void>>;
        onDelete: RegisteredMutation<"internal", {
           model: string;
           doc: any;
        }, Promise<void>>;
     };
     registerRoutes: (http, createAuth, opts?) => void;
     registerRoutesLazy: <T>(http, createAuth, opts?) => void;
  };
  createAuthOptions: (ctx) => {
     appName?: string;
     baseURL?: BaseURLConfig;
     secret?: string;
     secrets?: {
        version: number;
        value: string;
     }[];
     secondaryStorage?: SecondaryStorage;
     emailVerification?: {
        sendVerificationEmail?: (data, request?) => Promise<void>;
        sendOnSignUp?: boolean;
        sendOnSignIn?: boolean;
        autoSignInAfterVerification?: boolean;
        expiresIn?: number;
        beforeEmailVerification?: (user, request?) => Promise<void>;
        afterEmailVerification?: (user, request?) => Promise<void>;
     };
     socialProviders?: SocialProviders;
     session?: BetterAuthDBOptions<"session", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "expiresAt"
        | "token"
        | "ipAddress"
        | "userAgent"> & {
        expiresIn?: number;
        updateAge?: number;
        disableSessionRefresh?: boolean;
        deferSessionRefresh?: boolean;
        storeSessionInDatabase?: boolean;
        preserveSessionInDatabase?: boolean;
        cookieCache?: {
           maxAge?: number;
           enabled?: boolean;
           strategy?: "compact" | "jwt" | "jwe";
           refreshCache?:   | boolean
              | {
              updateAge?: ... | ...;
            };
           version?:   | string
              | ((session, user) => string)
              | ((session, user) => Promise<...>);
        };
        freshAge?: number;
     };
     account?: BetterAuthDBOptions<"account", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "password"
        | "accountId"
        | "providerId"
        | "accessToken"
        | "refreshToken"
        | "idToken"
        | "accessTokenExpiresAt"
        | "refreshTokenExpiresAt"
        | "scope"> & {
        updateAccountOnSignIn?: boolean;
        accountLinking?: {
           enabled?: boolean;
           disableImplicitLinking?: boolean;
           requireLocalEmailVerified?: boolean;
           trustedProviders?: LiteralUnion<..., ...>[] | ((request?) => Awaitable<...>);
           allowDifferentEmails?: boolean;
           allowUnlinkingAll?: boolean;
           updateUserInfoOnLink?: boolean;
        };
        encryptOAuthTokens?: boolean;
        skipStateCookieCheck?: boolean;
        storeStateStrategy?: "database" | "cookie";
        storeAccountCookie?: boolean;
     };
     verification?: BetterAuthDBOptions<"verification", "value" | "createdAt" | "updatedAt" | "id" | "expiresAt" | "identifier"> & {
        disableCleanup?: boolean;
        storeIdentifier?:   | StoreIdentifierOption
           | {
           default: StoreIdentifierOption;
           overrides?: Record<string, StoreIdentifierOption>;
         };
        storeInDatabase?: boolean;
     };
     trustedOrigins?:   | string[]
        | ((request?) => Awaitable<(string | null | undefined)[]>);
     rateLimit?: BetterAuthRateLimitOptions;
     advanced?: BetterAuthAdvancedOptions;
     logger?: Logger;
     databaseHooks?: {
        user?: {
           create?: {
              before?: (user, context) => ...;
              after?: (user, context) => ...;
           };
           update?: {
              before?: (user, context) => ...;
              after?: (user, context) => ...;
           };
           delete?: {
              before?: (user, context) => ...;
              after?: (user, context) => ...;
           };
        };
        session?: {
           create?: {
              before?: (session, context) => ...;
              after?: (session, context) => ...;
           };
           update?: {
              before?: (session, context) => ...;
              after?: (session, context) => ...;
           };
           delete?: {
              before?: (session, context) => ...;
              after?: (session, context) => ...;
           };
        };
        account?: {
           create?: {
              before?: (account, context) => ...;
              after?: (account, context) => ...;
           };
           update?: {
              before?: (account, context) => ...;
              after?: (account, context) => ...;
           };
           delete?: {
              before?: (account, context) => ...;
              after?: (account, context) => ...;
           };
        };
        verification?: {
           create?: {
              before?: (verification, context) => ...;
              after?: (verification, context) => ...;
           };
           update?: {
              before?: (verification, context) => ...;
              after?: (verification, context) => ...;
           };
           delete?: {
              before?: (verification, context) => ...;
              after?: (verification, context) => ...;
           };
        };
     };
     onAPIError?: {
        throw?: boolean;
        onError?: (error, ctx) => void | Promise<void>;
        errorURL?: string;
        customizeDefaultErrorPage?: {
           colors?: {
              background?: string;
              foreground?: string;
              primary?: string;
              primaryForeground?: string;
              mutedForeground?: string;
              border?: string;
              destructive?: string;
              titleBorder?: string;
              titleColor?: string;
              gridColor?: string;
              cardBackground?: string;
              cornerBorder?: string;
           };
           size?: {
              radiusSm?: string;
              radiusMd?: string;
              radiusLg?: string;
              textSm?: string;
              text2xl?: string;
              text4xl?: string;
              text6xl?: string;
           };
           font?: {
              defaultFamily?: string;
              monoFamily?: string;
           };
           disableTitleBorder?: boolean;
           disableCornerDecorations?: boolean;
           disableBackgroundGrid?: boolean;
        };
     };
     hooks?: {
        before?: (inputContext) => Promise<unknown>;
        after?: (inputContext) => Promise<unknown>;
     };
     disabledPaths?: string[];
     telemetry?: {
        enabled?: boolean;
        debug?: boolean;
     };
     experimental?: {
        joins?: boolean;
     };
     basePath: string;
     database: AdapterFactory<BetterAuthOptions>;
     emailAndPassword: {
        disableSignUp?: boolean;
        requireEmailVerification?: boolean;
        maxPasswordLength?: number;
        minPasswordLength?: number;
        sendResetPassword?: (data, request?) => Promise<void>;
        resetPasswordTokenExpiresIn?: number;
        onPasswordReset?: (data, request?) => Promise<void>;
        password?: {
           hash?: (password) => Promise<string>;
           verify?: (data) => Promise<boolean>;
        };
        autoSignIn?: boolean;
        revokeSessionsOnPasswordReset?: boolean;
        onExistingUserSignUp?: (data, request?) => Promise<void>;
        customSyntheticUser?: (params) => Record<string, unknown>;
        enabled: boolean;
     };
     user: {
        modelName?: "user" | LiteralString;
        fields?: Partial<Record<"createdAt" | "updatedAt" | "email" | "emailVerified" | "name" | "image", string>>;
        additionalFields?: {
         [key: string]: DBFieldAttribute;
        };
        changeEmail?: {
           enabled: boolean;
           sendChangeEmailConfirmation?: (data, request?) => Promise<void>;
           updateEmailWithoutVerification?: boolean;
        };
        deleteUser?: {
           enabled?: boolean;
           sendDeleteAccountVerification?: (data, request?) => Promise<void>;
           beforeDelete?: (user, request?) => Promise<void>;
           afterDelete?: (user, request?) => Promise<void>;
           deleteTokenExpiresIn?: number;
        };
     };
     plugins: [{
        id: "convex";
        version: string;
        init: (ctx) => void;
        hooks: {
           before: (
              | {
              matcher: boolean;
              handler: (inputContext) => Promise<...>;
            }
              | {
              matcher: (ctx) => boolean;
              handler: (inputContext) => Promise<...>;
           })[];
           after: {
              matcher: (context) => boolean;
              handler: (inputContext) => Promise<unknown>;
           }[];
        };
        endpoints: {
           getOpenIdConfig: StrictEndpoint<"/convex/.well-known/openid-configuration", {
              method: "GET";
              metadata: {
                 isAction: false;
              };
           }, OIDCMetadata>;
           getJwks: StrictEndpoint<"/convex/jwks", {
              method: "GET";
              metadata: {
                 openapi: {
                    description: string;
                    responses: {
                       200: ...;
                    };
                 };
              };
           }, JSONWebKeySet>;
           getLatestJwks: StrictEndpoint<"/convex/latest-jwks", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: string;
                 };
              };
           }, any[]>;
           rotateKeys: StrictEndpoint<"/convex/rotate-keys", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: string;
                 };
              };
           }, any[]>;
           getToken: StrictEndpoint<"/convex/token", {
              method: "GET";
              requireHeaders: true;
              use: (inputContext) => Promise<...>[];
              metadata: {
                 openapi: {
                    description: string;
                    responses: {
                       200: ...;
                    };
                 };
              };
            }, {
              token: string;
           }>;
        };
        schema: {
           jwks: {
              fields: {
                 publicKey: {
                    type: "string";
                    required: true;
                 };
                 privateKey: {
                    type: "string";
                    required: true;
                 };
                 createdAt: {
                    type: "date";
                    required: true;
                 };
                 expiresAt: {
                    type: "date";
                    required: false;
                 };
              };
           };
           user: {
              fields: {
                 userId: {
                    type: "string";
                    required: false;
                    input: false;
                 };
              };
           };
        };
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; use: ((inputContext: ...) => ...)[]; body: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ...; type: ...; otp: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ...; otp: ... }, $strip>; metadata: { openapi: { description: ...; responses: ... } } }, { status: boolean; token: string; user: (...) & (...) } | { status: boolean; token: null; user: (...) & (...) }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<(...), (...)>, ZodRecord<(...), (...)>>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ...; otp: ...; password: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ...; otp: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ...; otp: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<(...)>) => Promise<(...)> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: ...) => ...)[]; query: ZodOptional<ZodObject<(...), (...)>>; metadata: { openapi: { operationId: ...; description: ...; parameters: ...; responses: ... } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ...; name: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... }; $Infer: { body: ... } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) | (...) | (...); userAgent?: (...) | (...) | (...) }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { description: ...; responses: ... } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ... }, $strip>; use: ((...) | (...))[]; metadata: { openapi: { description: ...; responses: ... } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ...; name: ... }, $strip>; use: ((...) | (...))[]; metadata: { openapi: { description: ...; responses: ... } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: ...; field: ... }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined } | { id: "admin"; version: string; init: any; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<(...)>) => Promise<(...)> }[] }; endpoints: { setRole: StrictEndpoint<"/admin/set-role", { method: "POST"; body: ZodObject<{ userId: ...; role: ... }, $strip>; requireHeaders: true; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... }; $Infer: { body: ... } } }, { user: UserWithRole }>; getUser: StrictEndpoint<"/admin/get-user", { method: "GET"; query: ZodObject<{ id: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, UserWithRole>; createUser: StrictEndpoint<"/admin/create-user", { method: "POST"; body: ZodObject<{ email: ...; password: ...; name: ...; role: ...; data: ... }, $strip>; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... }; $Infer: { body: ... } } }, { user: UserWithRole }>; adminUpdateUser: StrictEndpoint<"/admin/update-user", { method: "POST"; body: ZodObject<{ userId: ...; data: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, UserWithRole>; listUsers: StrictEndpoint<"/admin/list-users", { method: "GET"; use: ((inputContext: ...) => ...)[]; query: ZodObject<{ searchValue: ...; searchField: ...; searchOperator: ...; limit: ...; offset: ...; sortBy: ...; sortDirection: ...; filterField: ...; filterValue: ...; filterOperator: ... }, $strip>; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { users: UserWithRole[]; total: number }>; listUserSessions: StrictEndpoint<"/admin/list-user-sessions", { method: "POST"; use: ((inputContext: ...) => ...)[]; body: ZodObject<{ userId: ... }, $strip>; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { sessions: SessionWithImpersonatedBy[] }>; unbanUser: StrictEndpoint<"/admin/unban-user", { method: "POST"; body: ZodObject<{ userId: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { user: UserWithRole }>; banUser: StrictEndpoint<"/admin/ban-user", { method: "POST"; body: ZodObject<{ userId: ...; banReason: ...; banExpiresIn: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { user: UserWithRole }>; impersonateUser: StrictEndpoint<"/admin/impersonate-user", { method: "POST"; body: ZodObject<{ userId: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) | (...) | (...); userAgent?: (...) | (...) | (...) }; user: UserWithRole }>; stopImpersonating: StrictEndpoint<"/admin/stop-impersonating", { method: "POST"; requireHeaders: true }, { session: { id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... } & Record<(...), (...)>; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> }>; revokeUserSession: StrictEndpoint<"/admin/revoke-user-session", { method: "POST"; body: ZodObject<{ sessionToken: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { success: boolean }>; revokeUserSessions: StrictEndpoint<"/admin/revoke-user-sessions", { method: "POST"; body: ZodObject<{ userId: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { success: boolean }>; removeUser: StrictEndpoint<"/admin/remove-user", { method: "POST"; body: ZodObject<{ userId: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { success: boolean }>; setUserPassword: StrictEndpoint<"/admin/set-user-password", { method: "POST"; body: ZodObject<{ newPassword: ...; userId: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; summary: ...; description: ...; responses: ... } } }, { status: boolean }>; userHasPermission: StrictEndpoint<"/admin/has-permission", { method: "POST"; body: ZodIntersection<ZodObject<(...), (...)>, ZodXor<(...)>>; metadata: { openapi: { description: ...; requestBody: ...; responses: ... }; $Infer: { body: ... } } }, { error: null; success: boolean }> }; $ERROR_CODES: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: RawError<"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL">; FAILED_TO_CREATE_USER: RawError<"FAILED_TO_CREATE_USER">; USER_ALREADY_EXISTS: RawError<"USER_ALREADY_EXISTS">; YOU_CANNOT_BAN_YOURSELF: RawError<"YOU_CANNOT_BAN_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: RawError<"YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE">; YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_BAN_USERS">; YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD">; BANNED_USER: RawError<"BANNED_USER">; YOU_ARE_NOT_ALLOWED_TO_GET_USER: RawError<"YOU_ARE_NOT_ALLOWED_TO_GET_USER">; NO_DATA_TO_UPDATE: RawError<"NO_DATA_TO_UPDATE">; YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS">; YOU_CANNOT_REMOVE_YOURSELF: RawError<"YOU_CANNOT_REMOVE_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE">; YOU_CANNOT_IMPERSONATE_ADMINS: RawError<"YOU_CANNOT_IMPERSONATE_ADMINS">; INVALID_ROLE_TYPE: RawError<"INVALID_ROLE_TYPE">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL">; PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: RawError<"PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER"> }; schema: { user: { fields: { role: { type: "string"; required: false; input: false }; banned: { type: "boolean"; defaultValue: false; required: false; input: false }; banReason: { type: "string"; required: false; input: false }; banExpires: { type: "date"; required: false; input: false } } }; session: { fields: { impersonatedBy: { type: "string"; required: false; input: false } } } }; options: NoInfer<AdminOptions> } | DefaultOrganizationPlugin<{ allowUserToCreateOrganization?: boolean | ((user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)>) => Awaitable<boolean>); organizationLimit?: number | ((user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)>) => Awaitable<boolean>); creatorRole?: string; membershipLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) }, organization: { id: string; name: string; slug: string; logo?: (...) | (...) | (...); metadata?: any; createdAt: Date }) => number | Promise<(...)>); ac?: AccessControl; roles?: { [key: string]: Role<(...)> | undefined }; dynamicAccessControl?: { enabled?: boolean; maximumRolesPerOrganization?: number | ((organizationId: ...) => ...) }; teams?: { enabled: boolean; defaultTeam?: { enabled: ...; customCreateDefaultTeam?: ... }; maximumTeams?: number | ((data: ..., ctx?: ...) => ...); maximumMembersPerTeam?: number | ((data: ...) => ...); allowRemovingAllTeams?: boolean }; invitationExpiresIn?: number; invitationLimit?: number | ((data: { user: (...) & (...); organization: (...) & (...); member: (...) & (...) }, ctx: AuthContext) => Awaitable<number>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: { id: string; role: string; email: string; organization: { id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... }; invitation: { id: ...; organizationId: ...; email: ...; role: ...; status: ...; teamId?: ...; inviterId: ...; expiresAt: ...; createdAt: ... }; inviter: (...) & (...) }, request?: Request) => Promise<void>; schema?: { session?: { fields?: ... }; organization?: { modelName?: ...; fields?: ...; additionalFields?: ... }; member?: { modelName?: ...; fields?: ...; additionalFields?: ... }; invitation?: { modelName?: ...; fields?: ...; additionalFields?: ... }; team?: { modelName?: ...; fields?: ...; additionalFields?: ... }; teamMember?: { modelName?: ...; fields?: ... }; organizationRole?: { modelName?: ...; fields?: ...; additionalFields?: ... } }; disableOrganizationDeletion?: boolean; organizationHooks?: { beforeCreateOrganization?: (data: ...) => ...; afterCreateOrganization?: (data: ...) => ...; beforeUpdateOrganization?: (data: ...) => ...; afterUpdateOrganization?: (data: ...) => ...; beforeDeleteOrganization?: (data: ..., ctx?: ...) => ...; afterDeleteOrganization?: (data: ..., ctx?: ...) => ...; beforeAddMember?: (data: ...) => ...; afterAddMember?: (data: ...) => ...; beforeRemoveMember?: (data: ...) => ...; afterRemoveMember?: (data: ...) => ...; beforeUpdateMemberRole?: (data: ...) => ...; afterUpdateMemberRole?: (data: ...) => ...; beforeCreateInvitation?: (data: ...) => ...; afterCreateInvitation?: (data: ...) => ...; beforeAcceptInvitation?: (data: ...) => ...; afterAcceptInvitation?: (data: ...) => ...; beforeRejectInvitation?: (data: ...) => ...; afterRejectInvitation?: (data: ...) => ...; beforeCancelInvitation?: (data: ...) => ...; afterCancelInvitation?: (data: ...) => ...; beforeCreateTeam?: (data: ...) => ...; afterCreateTeam?: (data: ...) => ...; beforeUpdateTeam?: (data: ...) => ...; afterUpdateTeam?: (data: ...) => ...; beforeDeleteTeam?: (data: ...) => ...; afterDeleteTeam?: (data: ...) => ...; beforeAddTeamMember?: (data: ...) => ...; afterAddTeamMember?: (data: ...) => ...; beforeRemoveTeamMember?: (data: ...) => ...; afterRemoveTeamMember?: (data: ...) => ... } }>)[]];
  };
  options: {
     appName?: string;
     baseURL?: BaseURLConfig;
     secret?: string;
     secrets?: {
        version: number;
        value: string;
     }[];
     secondaryStorage?: SecondaryStorage;
     emailVerification?: {
        sendVerificationEmail?: (data, request?) => Promise<void>;
        sendOnSignUp?: boolean;
        sendOnSignIn?: boolean;
        autoSignInAfterVerification?: boolean;
        expiresIn?: number;
        beforeEmailVerification?: (user, request?) => Promise<void>;
        afterEmailVerification?: (user, request?) => Promise<void>;
     };
     socialProviders?: SocialProviders;
     session?: BetterAuthDBOptions<"session", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "expiresAt"
        | "token"
        | "ipAddress"
        | "userAgent"> & {
        expiresIn?: number;
        updateAge?: number;
        disableSessionRefresh?: boolean;
        deferSessionRefresh?: boolean;
        storeSessionInDatabase?: boolean;
        preserveSessionInDatabase?: boolean;
        cookieCache?: {
           maxAge?: number;
           enabled?: boolean;
           strategy?: "compact" | "jwt" | "jwe";
           refreshCache?:   | boolean
              | {
              updateAge?: number;
            };
           version?:   | string
              | ((session, user) => string)
              | ((session, user) => Promise<string>);
        };
        freshAge?: number;
     };
     account?: BetterAuthDBOptions<"account", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "password"
        | "accountId"
        | "providerId"
        | "accessToken"
        | "refreshToken"
        | "idToken"
        | "accessTokenExpiresAt"
        | "refreshTokenExpiresAt"
        | "scope"> & {
        updateAccountOnSignIn?: boolean;
        accountLinking?: {
           enabled?: boolean;
           disableImplicitLinking?: boolean;
           requireLocalEmailVerified?: boolean;
           trustedProviders?:   | LiteralUnion<
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ...
              | ..., string>[]
              | ((request?) => Awaitable<...[]>);
           allowDifferentEmails?: boolean;
           allowUnlinkingAll?: boolean;
           updateUserInfoOnLink?: boolean;
        };
        encryptOAuthTokens?: boolean;
        skipStateCookieCheck?: boolean;
        storeStateStrategy?: "database" | "cookie";
        storeAccountCookie?: boolean;
     };
     verification?: BetterAuthDBOptions<"verification", "value" | "createdAt" | "updatedAt" | "id" | "expiresAt" | "identifier"> & {
        disableCleanup?: boolean;
        storeIdentifier?:   | StoreIdentifierOption
           | {
           default: StoreIdentifierOption;
           overrides?: Record<string, StoreIdentifierOption>;
         };
        storeInDatabase?: boolean;
     };
     trustedOrigins?:   | string[]
        | ((request?) => Awaitable<(string | null | undefined)[]>);
     rateLimit?: BetterAuthRateLimitOptions;
     advanced?: BetterAuthAdvancedOptions;
     logger?: Logger;
     databaseHooks?: {
        user?: {
           create?: {
              before?: (user, context) => Promise<...>;
              after?: (user, context) => Promise<...>;
           };
           update?: {
              before?: (user, context) => Promise<...>;
              after?: (user, context) => Promise<...>;
           };
           delete?: {
              before?: (user, context) => Promise<...>;
              after?: (user, context) => Promise<...>;
           };
        };
        session?: {
           create?: {
              before?: (session, context) => Promise<...>;
              after?: (session, context) => Promise<...>;
           };
           update?: {
              before?: (session, context) => Promise<...>;
              after?: (session, context) => Promise<...>;
           };
           delete?: {
              before?: (session, context) => Promise<...>;
              after?: (session, context) => Promise<...>;
           };
        };
        account?: {
           create?: {
              before?: (account, context) => Promise<...>;
              after?: (account, context) => Promise<...>;
           };
           update?: {
              before?: (account, context) => Promise<...>;
              after?: (account, context) => Promise<...>;
           };
           delete?: {
              before?: (account, context) => Promise<...>;
              after?: (account, context) => Promise<...>;
           };
        };
        verification?: {
           create?: {
              before?: (verification, context) => Promise<...>;
              after?: (verification, context) => Promise<...>;
           };
           update?: {
              before?: (verification, context) => Promise<...>;
              after?: (verification, context) => Promise<...>;
           };
           delete?: {
              before?: (verification, context) => Promise<...>;
              after?: (verification, context) => Promise<...>;
           };
        };
     };
     onAPIError?: {
        throw?: boolean;
        onError?: (error, ctx) => void | Promise<void>;
        errorURL?: string;
        customizeDefaultErrorPage?: {
           colors?: {
              background?: string;
              foreground?: string;
              primary?: string;
              primaryForeground?: string;
              mutedForeground?: string;
              border?: string;
              destructive?: string;
              titleBorder?: string;
              titleColor?: string;
              gridColor?: string;
              cardBackground?: string;
              cornerBorder?: string;
           };
           size?: {
              radiusSm?: string;
              radiusMd?: string;
              radiusLg?: string;
              textSm?: string;
              text2xl?: string;
              text4xl?: string;
              text6xl?: string;
           };
           font?: {
              defaultFamily?: string;
              monoFamily?: string;
           };
           disableTitleBorder?: boolean;
           disableCornerDecorations?: boolean;
           disableBackgroundGrid?: boolean;
        };
     };
     hooks?: {
        before?: (inputContext) => Promise<unknown>;
        after?: (inputContext) => Promise<unknown>;
     };
     disabledPaths?: string[];
     telemetry?: {
        enabled?: boolean;
        debug?: boolean;
     };
     experimental?: {
        joins?: boolean;
     };
     basePath: string;
     database: AdapterFactory<BetterAuthOptions>;
     emailAndPassword: {
        disableSignUp?: boolean;
        requireEmailVerification?: boolean;
        maxPasswordLength?: number;
        minPasswordLength?: number;
        sendResetPassword?: (data, request?) => Promise<void>;
        resetPasswordTokenExpiresIn?: number;
        onPasswordReset?: (data, request?) => Promise<void>;
        password?: {
           hash?: (password) => Promise<string>;
           verify?: (data) => Promise<boolean>;
        };
        autoSignIn?: boolean;
        revokeSessionsOnPasswordReset?: boolean;
        onExistingUserSignUp?: (data, request?) => Promise<void>;
        customSyntheticUser?: (params) => Record<string, unknown>;
        enabled: boolean;
     };
     user: {
        modelName?: "user" | LiteralString;
        fields?: Partial<Record<"createdAt" | "updatedAt" | "email" | "emailVerified" | "name" | "image", string>>;
        additionalFields?: {
         [key: string]: DBFieldAttribute;
        };
        changeEmail?: {
           enabled: boolean;
           sendChangeEmailConfirmation?: (data, request?) => Promise<void>;
           updateEmailWithoutVerification?: boolean;
        };
        deleteUser?: {
           enabled?: boolean;
           sendDeleteAccountVerification?: (data, request?) => Promise<void>;
           beforeDelete?: (user, request?) => Promise<void>;
           afterDelete?: (user, request?) => Promise<void>;
           deleteTokenExpiresIn?: number;
        };
     };
     plugins: [{
        id: "convex";
        version: string;
        init: (ctx) => void;
        hooks: {
           before: (
              | {
              matcher: boolean;
              handler: (inputContext) => Promise<... | ...>;
            }
              | {
              matcher: (ctx) => boolean;
              handler: (inputContext) => Promise<{
                 context: ...;
              }>;
           })[];
           after: {
              matcher: (context) => boolean;
              handler: (inputContext) => Promise<unknown>;
           }[];
        };
        endpoints: {
           getOpenIdConfig: StrictEndpoint<"/convex/.well-known/openid-configuration", {
              method: "GET";
              metadata: {
                 isAction: false;
              };
           }, OIDCMetadata>;
           getJwks: StrictEndpoint<"/convex/jwks", {
              method: "GET";
              metadata: {
                 openapi: {
                    description: string;
                    responses: {
                       200: {
                          description: ...;
                          content: ...;
                       };
                    };
                 };
              };
           }, JSONWebKeySet>;
           getLatestJwks: StrictEndpoint<"/convex/latest-jwks", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: string;
                 };
              };
           }, any[]>;
           rotateKeys: StrictEndpoint<"/convex/rotate-keys", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: string;
                 };
              };
           }, any[]>;
           getToken: StrictEndpoint<"/convex/token", {
              method: "GET";
              requireHeaders: true;
              use: (inputContext) => Promise<{
                 session: ...;
              }>[];
              metadata: {
                 openapi: {
                    description: string;
                    responses: {
                       200: {
                          description: ...;
                          content: ...;
                       };
                    };
                 };
              };
            }, {
              token: string;
           }>;
        };
        schema: {
           jwks: {
              fields: {
                 publicKey: {
                    type: "string";
                    required: true;
                 };
                 privateKey: {
                    type: "string";
                    required: true;
                 };
                 createdAt: {
                    type: "date";
                    required: true;
                 };
                 expiresAt: {
                    type: "date";
                    required: false;
                 };
              };
           };
           user: {
              fields: {
                 userId: {
                    type: "string";
                    required: false;
                    input: false;
                 };
              };
           };
        };
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean; token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> } | { status: boolean; token: null; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ...; otp: ...; name: ...; image: ... }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ...; name: ...; context: ... }, $strip>>; metadata: { openapi: { operationId: string; description: string; parameters: (...)[]; responses: { 200: ... } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ...; 400: ... } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<(...), (...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } }; $Infer: { body: { response: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined } | { id: "admin"; version: string; init: any; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<(...) | (...)> }[] }; endpoints: { setRole: StrictEndpoint<"/admin/set-role", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; role: ZodUnion<(...)> }, $strip>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } }; $Infer: { body: { userId: ...; role: ... } } } }, { user: UserWithRole }>; getUser: StrictEndpoint<"/admin/get-user", { method: "GET"; query: ZodObject<{ id: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, UserWithRole>; createUser: StrictEndpoint<"/admin/create-user", { method: "POST"; body: ZodObject<{ email: ZodString; password: ZodOptional<(...)>; name: ZodString; role: ZodOptional<(...)>; data: ZodOptional<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } }; $Infer: { body: { email: ...; password?: ...; name: ...; role?: ...; data?: ... } } } }, { user: UserWithRole }>; adminUpdateUser: StrictEndpoint<"/admin/update-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; data: ZodRecord<(...), (...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, UserWithRole>; listUsers: StrictEndpoint<"/admin/list-users", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodObject<{ searchValue: ZodOptional<(...)>; searchField: ZodOptional<(...)>; searchOperator: ZodOptional<(...)>; limit: ZodOptional<(...)>; offset: ZodOptional<(...)>; sortBy: ZodOptional<(...)>; sortDirection: ZodOptional<(...)>; filterField: ZodOptional<(...)>; filterValue: ZodOptional<(...)>; filterOperator: ZodOptional<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { users: UserWithRole[]; total: number }>; listUserSessions: StrictEndpoint<"/admin/list-user-sessions", { method: "POST"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { sessions: SessionWithImpersonatedBy[] }>; unbanUser: StrictEndpoint<"/admin/unban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { user: UserWithRole }>; banUser: StrictEndpoint<"/admin/ban-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)>; banReason: ZodOptional<(...)>; banExpiresIn: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { user: UserWithRole }>; impersonateUser: StrictEndpoint<"/admin/impersonate-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: UserWithRole }>; stopImpersonating: StrictEndpoint<"/admin/stop-impersonating", { method: "POST"; requireHeaders: true }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) | (...) | (...); userAgent?: (...) | (...) | (...) } & Record<string, any>; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> }>; revokeUserSession: StrictEndpoint<"/admin/revoke-user-session", { method: "POST"; body: ZodObject<{ sessionToken: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; revokeUserSessions: StrictEndpoint<"/admin/revoke-user-sessions", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; removeUser: StrictEndpoint<"/admin/remove-user", { method: "POST"; body: ZodObject<{ userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; setUserPassword: StrictEndpoint<"/admin/set-user-password", { method: "POST"; body: ZodObject<{ newPassword: ZodString; userId: ZodCoercedString<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; summary: string; description: string; responses: { 200: ... } } } }, { status: boolean }>; userHasPermission: StrictEndpoint<"/admin/has-permission", { method: "POST"; body: ZodIntersection<ZodObject<{ userId: ...; role: ... }, $strip>, ZodXor<readonly [(...), (...)]>>; metadata: { openapi: { description: string; requestBody: { content: ... }; responses: { 200: ... } }; $Infer: { body: (...) & (...) } } }, { error: null; success: boolean }> }; $ERROR_CODES: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: RawError<"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL">; FAILED_TO_CREATE_USER: RawError<"FAILED_TO_CREATE_USER">; USER_ALREADY_EXISTS: RawError<"USER_ALREADY_EXISTS">; YOU_CANNOT_BAN_YOURSELF: RawError<"YOU_CANNOT_BAN_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: RawError<"YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE">; YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_BAN_USERS">; YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD">; BANNED_USER: RawError<"BANNED_USER">; YOU_ARE_NOT_ALLOWED_TO_GET_USER: RawError<"YOU_ARE_NOT_ALLOWED_TO_GET_USER">; NO_DATA_TO_UPDATE: RawError<"NO_DATA_TO_UPDATE">; YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS">; YOU_CANNOT_REMOVE_YOURSELF: RawError<"YOU_CANNOT_REMOVE_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE">; YOU_CANNOT_IMPERSONATE_ADMINS: RawError<"YOU_CANNOT_IMPERSONATE_ADMINS">; INVALID_ROLE_TYPE: RawError<"INVALID_ROLE_TYPE">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL">; PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: RawError<"PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER"> }; schema: { user: { fields: { role: { type: "string"; required: false; input: false }; banned: { type: "boolean"; defaultValue: false; required: false; input: false }; banReason: { type: "string"; required: false; input: false }; banExpires: { type: "date"; required: false; input: false } } }; session: { fields: { impersonatedBy: { type: "string"; required: false; input: false } } } }; options: NoInfer<AdminOptions> } | DefaultOrganizationPlugin<{ allowUserToCreateOrganization?: boolean | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any>) => Awaitable<boolean>); organizationLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any>) => Awaitable<boolean>); creatorRole?: string; membershipLimit?: number | ((user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null }, organization: { id: string; name: string; slug: string; logo?: string | null; metadata?: any; createdAt: Date }) => number | Promise<number>); ac?: AccessControl; roles?: { [key: string]: Role<any> | undefined }; dynamicAccessControl?: { enabled?: boolean; maximumRolesPerOrganization?: number | ((organizationId: string) => Awaitable<(...)>) }; teams?: { enabled: boolean; defaultTeam?: { enabled: boolean; customCreateDefaultTeam?: (...) | (...) }; maximumTeams?: number | ((data: { organizationId: ...; session: ... }, ctx?: (...) | (...)) => Awaitable<(...)>); maximumMembersPerTeam?: number | ((data: { teamId: ...; session: ...; organizationId: ... }) => Awaitable<(...)>); allowRemovingAllTeams?: boolean }; invitationExpiresIn?: number; invitationLimit?: number | ((data: { user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)>; organization: { id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... } & Record<(...), (...)>; member: { id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... } & Record<(...), (...)> }, ctx: AuthContext) => Awaitable<number>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: { id: string; role: string; email: string; organization: { id: string; name: string; slug: string; logo?: (...) | (...) | (...); metadata?: any; createdAt: Date }; invitation: { id: string; organizationId: string; email: string; role: string; status: (...) | (...) | (...) | (...); teamId?: (...) | (...) | (...); inviterId: string; expiresAt: Date; createdAt: Date }; inviter: { id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... } & { user: ... } }, request?: Request) => Promise<void>; schema?: { session?: { fields?: (...) | (...) }; organization?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; member?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; invitation?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; team?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) }; teamMember?: { modelName?: (...) | (...); fields?: (...) | (...) }; organizationRole?: { modelName?: (...) | (...); fields?: (...) | (...); additionalFields?: (...) | (...) } }; disableOrganizationDeletion?: boolean; organizationHooks?: { beforeCreateOrganization?: (data: { organization: ...; user: ... }) => Promise<(...)>; afterCreateOrganization?: (data: { organization: ...; member: ...; user: ... }) => Promise<(...)>; beforeUpdateOrganization?: (data: { organization: ...; user: ...; member: ... }) => Promise<(...)>; afterUpdateOrganization?: (data: { organization: ...; user: ...; member: ... }) => Promise<(...)>; beforeDeleteOrganization?: (data: { organization: ...; user: ... }, ctx?: (...) | (...)) => Promise<(...)>; afterDeleteOrganization?: (data: { organization: ...; user: ... }, ctx?: (...) | (...)) => Promise<(...)>; beforeAddMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; afterAddMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRemoveMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; afterRemoveMember?: (data: { member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeUpdateMemberRole?: (data: { member: ...; newRole: ...; user: ...; organization: ... }) => Promise<(...)>; afterUpdateMemberRole?: (data: { member: ...; previousRole: ...; user: ...; organization: ... }) => Promise<(...)>; beforeCreateInvitation?: (data: { invitation: ...; inviter: ...; organization: ... }) => Promise<(...)>; afterCreateInvitation?: (data: { invitation: ...; inviter: ...; organization: ... }) => Promise<(...)>; beforeAcceptInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; afterAcceptInvitation?: (data: { invitation: ...; member: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRejectInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; afterRejectInvitation?: (data: { invitation: ...; user: ...; organization: ... }) => Promise<(...)>; beforeCancelInvitation?: (data: { invitation: ...; cancelledBy: ...; organization: ... }) => Promise<(...)>; afterCancelInvitation?: (data: { invitation: ...; cancelledBy: ...; organization: ... }) => Promise<(...)>; beforeCreateTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; afterCreateTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; beforeUpdateTeam?: (data: { team: ...; updates: ...; user: ...; organization: ... }) => Promise<(...)>; afterUpdateTeam?: (data: { team: ...; user: ...; organization: ... }) => Promise<(...)>; beforeDeleteTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; afterDeleteTeam?: (data: { team: ...; user?: ...; organization: ... }) => Promise<(...)>; beforeAddTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; afterAddTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; beforeRemoveTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)>; afterRemoveTeamMember?: (data: { teamMember: ...; team: ...; user: ...; organization: ... }) => Promise<(...)> } }>)[]];
  };
  createAuth: (ctx) => Auth<{
     appName?: string;
     baseURL?: BaseURLConfig;
     secret?: string;
     secrets?: {
        version: number;
        value: string;
     }[];
     secondaryStorage?: SecondaryStorage;
     emailVerification?: {
        sendVerificationEmail?: (data, request?) => Promise<void>;
        sendOnSignUp?: boolean;
        sendOnSignIn?: boolean;
        autoSignInAfterVerification?: boolean;
        expiresIn?: number;
        beforeEmailVerification?: (user, request?) => Promise<void>;
        afterEmailVerification?: (user, request?) => Promise<void>;
     };
     socialProviders?: SocialProviders;
     session?: BetterAuthDBOptions<"session", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "expiresAt"
        | "token"
        | "ipAddress"
        | "userAgent"> & {
        expiresIn?: number;
        updateAge?: number;
        disableSessionRefresh?: boolean;
        deferSessionRefresh?: boolean;
        storeSessionInDatabase?: boolean;
        preserveSessionInDatabase?: boolean;
        cookieCache?: {
           maxAge?: number;
           enabled?: boolean;
           strategy?: "compact" | "jwt" | "jwe";
           refreshCache?:   | boolean
              | {
              updateAge?: ...;
            };
           version?: string | ((session, user) => ...) | ((session, user) => ...);
        };
        freshAge?: number;
     };
     account?: BetterAuthDBOptions<"account", 
        | "createdAt"
        | "updatedAt"
        | "userId"
        | "id"
        | "password"
        | "accountId"
        | "providerId"
        | "accessToken"
        | "refreshToken"
        | "idToken"
        | "accessTokenExpiresAt"
        | "refreshTokenExpiresAt"
        | "scope"> & {
        updateAccountOnSignIn?: boolean;
        accountLinking?: {
           enabled?: boolean;
           disableImplicitLinking?: boolean;
           requireLocalEmailVerified?: boolean;
           trustedProviders?: ...[] | ((request?) => ...);
           allowDifferentEmails?: boolean;
           allowUnlinkingAll?: boolean;
           updateUserInfoOnLink?: boolean;
        };
        encryptOAuthTokens?: boolean;
        skipStateCookieCheck?: boolean;
        storeStateStrategy?: "database" | "cookie";
        storeAccountCookie?: boolean;
     };
     verification?: BetterAuthDBOptions<"verification", "value" | "createdAt" | "updatedAt" | "id" | "expiresAt" | "identifier"> & {
        disableCleanup?: boolean;
        storeIdentifier?:   | StoreIdentifierOption
           | {
           default: StoreIdentifierOption;
           overrides?: Record<..., ...>;
         };
        storeInDatabase?: boolean;
     };
     trustedOrigins?:   | string[]
        | ((request?) => Awaitable<(string | null | undefined)[]>);
     rateLimit?: BetterAuthRateLimitOptions;
     advanced?: BetterAuthAdvancedOptions;
     logger?: Logger;
     databaseHooks?: {
        user?: {
           create?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           update?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           delete?: {
              before?: ... | ...;
              after?: ... | ...;
           };
        };
        session?: {
           create?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           update?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           delete?: {
              before?: ... | ...;
              after?: ... | ...;
           };
        };
        account?: {
           create?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           update?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           delete?: {
              before?: ... | ...;
              after?: ... | ...;
           };
        };
        verification?: {
           create?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           update?: {
              before?: ... | ...;
              after?: ... | ...;
           };
           delete?: {
              before?: ... | ...;
              after?: ... | ...;
           };
        };
     };
     onAPIError?: {
        throw?: boolean;
        onError?: (error, ctx) => void | Promise<void>;
        errorURL?: string;
        customizeDefaultErrorPage?: {
           colors?: {
              background?: ... | ...;
              foreground?: ... | ...;
              primary?: ... | ...;
              primaryForeground?: ... | ...;
              mutedForeground?: ... | ...;
              border?: ... | ...;
              destructive?: ... | ...;
              titleBorder?: ... | ...;
              titleColor?: ... | ...;
              gridColor?: ... | ...;
              cardBackground?: ... | ...;
              cornerBorder?: ... | ...;
           };
           size?: {
              radiusSm?: ... | ...;
              radiusMd?: ... | ...;
              radiusLg?: ... | ...;
              textSm?: ... | ...;
              text2xl?: ... | ...;
              text4xl?: ... | ...;
              text6xl?: ... | ...;
           };
           font?: {
              defaultFamily?: ... | ...;
              monoFamily?: ... | ...;
           };
           disableTitleBorder?: boolean;
           disableCornerDecorations?: boolean;
           disableBackgroundGrid?: boolean;
        };
     };
     hooks?: {
        before?: (inputContext) => Promise<unknown>;
        after?: (inputContext) => Promise<unknown>;
     };
     disabledPaths?: string[];
     telemetry?: {
        enabled?: boolean;
        debug?: boolean;
     };
     experimental?: {
        joins?: boolean;
     };
     basePath: string;
     database: AdapterFactory<BetterAuthOptions>;
     emailAndPassword: {
        disableSignUp?: boolean;
        requireEmailVerification?: boolean;
        maxPasswordLength?: number;
        minPasswordLength?: number;
        sendResetPassword?: (data, request?) => Promise<void>;
        resetPasswordTokenExpiresIn?: number;
        onPasswordReset?: (data, request?) => Promise<void>;
        password?: {
           hash?: (password) => Promise<string>;
           verify?: (data) => Promise<boolean>;
        };
        autoSignIn?: boolean;
        revokeSessionsOnPasswordReset?: boolean;
        onExistingUserSignUp?: (data, request?) => Promise<void>;
        customSyntheticUser?: (params) => Record<string, unknown>;
        enabled: boolean;
     };
     user: {
        modelName?: "user" | LiteralString;
        fields?: Partial<Record<"createdAt" | "updatedAt" | "email" | "emailVerified" | "name" | "image", string>>;
        additionalFields?: {
         [key: string]: DBFieldAttribute;
        };
        changeEmail?: {
           enabled: boolean;
           sendChangeEmailConfirmation?: (data, request?) => Promise<void>;
           updateEmailWithoutVerification?: boolean;
        };
        deleteUser?: {
           enabled?: boolean;
           sendDeleteAccountVerification?: (data, request?) => Promise<void>;
           beforeDelete?: (user, request?) => Promise<void>;
           afterDelete?: (user, request?) => Promise<void>;
           deleteTokenExpiresIn?: number;
        };
     };
     plugins: [{
        id: "convex";
        version: string;
        init: (ctx) => void;
        hooks: {
           before: (
              | {
              matcher: boolean;
              handler: (inputContext) => ...;
            }
              | {
              matcher: (ctx) => ...;
              handler: (inputContext) => ...;
           })[];
           after: {
              matcher: (context) => boolean;
              handler: (inputContext) => Promise<...>;
           }[];
        };
        endpoints: {
           getOpenIdConfig: StrictEndpoint<"/convex/.well-known/openid-configuration", {
              method: "GET";
              metadata: {
                 isAction: false;
              };
           }, OIDCMetadata>;
           getJwks: StrictEndpoint<"/convex/jwks", {
              method: "GET";
              metadata: {
                 openapi: {
                    description: ...;
                    responses: ...;
                 };
              };
           }, JSONWebKeySet>;
           getLatestJwks: StrictEndpoint<"/convex/latest-jwks", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: ...;
                 };
              };
           }, any[]>;
           rotateKeys: StrictEndpoint<"/convex/rotate-keys", {
              isAction: boolean;
              method: "POST";
              metadata: {
                 SERVER_ONLY: true;
                 openapi: {
                    description: ...;
                 };
              };
           }, any[]>;
           getToken: StrictEndpoint<"/convex/token", {
              method: "GET";
              requireHeaders: true;
              use: (inputContext) => ...[];
              metadata: {
                 openapi: {
                    description: ...;
                    responses: ...;
                 };
              };
            }, {
              token: string;
           }>;
        };
        schema: {
           jwks: {
              fields: {
                 publicKey: {
                    type: "string";
                    required: true;
                 };
                 privateKey: {
                    type: "string";
                    required: true;
                 };
                 createdAt: {
                    type: "date";
                    required: true;
                 };
                 expiresAt: {
                    type: "date";
                    required: false;
                 };
              };
           };
           user: {
              fields: {
                 userId: {
                    type: "string";
                    required: false;
                    input: false;
                 };
              };
           };
        };
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; use: (...)[]; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { otp: ... } | { otp: ... }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { status: ...; token: ...; user: ... } | { status: ...; token: ...; user: ... }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<(...), (...)>; metadata: { openapi: ... } }, { token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: ...) => ... }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: (...)[]; query: ZodOptional<(...)>; metadata: { openapi: ... } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: ... } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ...; $Infer: ... } }, { session: { id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... }; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: (...)[]; metadata: { openapi: ... } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: ...; required: ... }; publicKey: { type: ...; required: ... }; userId: { type: ...; references: ...; required: ...; index: ... }; credentialID: { type: ...; required: ...; index: ... }; counter: { type: ...; required: ... }; deviceType: { type: ...; required: ... }; backedUp: { type: ...; required: ... }; transports: { type: ...; required: ... }; createdAt: { type: ...; required: ... }; aaguid: { type: ...; required: ... } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined } | { id: "admin"; version: string; init: any; hooks: { after: { matcher: any; handler: (inputContext: ...) => ... }[] }; endpoints: { setRole: StrictEndpoint<"/admin/set-role", { method: "POST"; body: ZodObject<(...), (...)>; requireHeaders: true; use: (...)[]; metadata: { openapi: ...; $Infer: ... } }, { user: UserWithRole }>; getUser: StrictEndpoint<"/admin/get-user", { method: "GET"; query: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, UserWithRole>; createUser: StrictEndpoint<"/admin/create-user", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ...; $Infer: ... } }, { user: UserWithRole }>; adminUpdateUser: StrictEndpoint<"/admin/update-user", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, UserWithRole>; listUsers: StrictEndpoint<"/admin/list-users", { method: "GET"; use: (...)[]; query: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { users: (...)[]; total: number }>; listUserSessions: StrictEndpoint<"/admin/list-user-sessions", { method: "POST"; use: (...)[]; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { sessions: (...)[] }>; unbanUser: StrictEndpoint<"/admin/unban-user", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { user: UserWithRole }>; banUser: StrictEndpoint<"/admin/ban-user", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { user: UserWithRole }>; impersonateUser: StrictEndpoint<"/admin/impersonate-user", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { session: { id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... }; user: UserWithRole }>; stopImpersonating: StrictEndpoint<"/admin/stop-impersonating", { method: "POST"; requireHeaders: true }, { session: (...) & (...); user: (...) & (...) }>; revokeUserSession: StrictEndpoint<"/admin/revoke-user-session", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }>; revokeUserSessions: StrictEndpoint<"/admin/revoke-user-sessions", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }>; removeUser: StrictEndpoint<"/admin/remove-user", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }>; setUserPassword: StrictEndpoint<"/admin/set-user-password", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { status: boolean }>; userHasPermission: StrictEndpoint<"/admin/has-permission", { method: "POST"; body: ZodIntersection<(...), (...)>; metadata: { openapi: ...; $Infer: ... } }, { error: null; success: boolean }> }; $ERROR_CODES: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: RawError<"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL">; FAILED_TO_CREATE_USER: RawError<"FAILED_TO_CREATE_USER">; USER_ALREADY_EXISTS: RawError<"USER_ALREADY_EXISTS">; YOU_CANNOT_BAN_YOURSELF: RawError<"YOU_CANNOT_BAN_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: RawError<"YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE">; YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS">; YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_BAN_USERS">; YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS">; YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: RawError<"YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS">; YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD">; BANNED_USER: RawError<"BANNED_USER">; YOU_ARE_NOT_ALLOWED_TO_GET_USER: RawError<"YOU_ARE_NOT_ALLOWED_TO_GET_USER">; NO_DATA_TO_UPDATE: RawError<"NO_DATA_TO_UPDATE">; YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: RawError<"YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS">; YOU_CANNOT_REMOVE_YOURSELF: RawError<"YOU_CANNOT_REMOVE_YOURSELF">; YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE">; YOU_CANNOT_IMPERSONATE_ADMINS: RawError<"YOU_CANNOT_IMPERSONATE_ADMINS">; INVALID_ROLE_TYPE: RawError<"INVALID_ROLE_TYPE">; YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: RawError<"YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL">; PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER: RawError<"PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER"> }; schema: { user: { fields: { role: { type: ...; required: ...; input: ... }; banned: { type: ...; defaultValue: ...; required: ...; input: ... }; banReason: { type: ...; required: ...; input: ... }; banExpires: { type: ...; required: ...; input: ... } } }; session: { fields: { impersonatedBy: { type: ...; required: ...; input: ... } } } }; options: NoInfer<AdminOptions> } | DefaultOrganizationPlugin<{ allowUserToCreateOrganization?: boolean | ((user: (...) & (...)) => Awaitable<(...)>); organizationLimit?: number | ((user: (...) & (...)) => Awaitable<(...)>); creatorRole?: string; membershipLimit?: number | ((user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... }, organization: { id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... }) => (...) | (...)); ac?: AccessControl; roles?: { [key: string]: (...) | (...) }; dynamicAccessControl?: { enabled?: (...) | (...) | (...); maximumRolesPerOrganization?: (...) | (...) | (...) }; teams?: { enabled: boolean; defaultTeam?: (...) | (...); maximumTeams?: (...) | (...) | (...); maximumMembersPerTeam?: (...) | (...) | (...); allowRemovingAllTeams?: (...) | (...) | (...) }; invitationExpiresIn?: number; invitationLimit?: number | ((data: { user: ...; organization: ...; member: ... }, ctx: AuthContext) => Awaitable<(...)>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: { id: ...; role: ...; email: ...; organization: ...; invitation: ...; inviter: ... }, request?: (...) | (...)) => Promise<(...)>; schema?: { session?: (...) | (...); organization?: (...) | (...); member?: (...) | (...); invitation?: (...) | (...); team?: (...) | (...); teamMember?: (...) | (...); organizationRole?: (...) | (...) }; disableOrganizationDeletion?: boolean; organizationHooks?: { beforeCreateOrganization?: (...) | (...); afterCreateOrganization?: (...) | (...); beforeUpdateOrganization?: (...) | (...); afterUpdateOrganization?: (...) | (...); beforeDeleteOrganization?: (...) | (...); afterDeleteOrganization?: (...) | (...); beforeAddMember?: (...) | (...); afterAddMember?: (...) | (...); beforeRemoveMember?: (...) | (...); afterRemoveMember?: (...) | (...); beforeUpdateMemberRole?: (...) | (...); afterUpdateMemberRole?: (...) | (...); beforeCreateInvitation?: (...) | (...); afterCreateInvitation?: (...) | (...); beforeAcceptInvitation?: (...) | (...); afterAcceptInvitation?: (...) | (...); beforeRejectInvitation?: (...) | (...); afterRejectInvitation?: (...) | (...); beforeCancelInvitation?: (...) | (...); afterCancelInvitation?: (...) | (...); beforeCreateTeam?: (...) | (...); afterCreateTeam?: (...) | (...); beforeUpdateTeam?: (...) | (...); afterUpdateTeam?: (...) | (...); beforeDeleteTeam?: (...) | (...); afterDeleteTeam?: (...) | (...); beforeAddTeamMember?: (...) | (...); afterAddTeamMember?: (...) | (...); beforeRemoveTeamMember?: (...) | (...); afterRemoveTeamMember?: (...) | (...) } }>)[]];
  }>;
  getAuthUser: RegisteredQuery<"public", {
  }, Promise<MaybeMakeLooseDataModel<{ [TableName in string]: Schema["tables"][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<(...) & (...)>; fieldPaths: "_id" | ExtractFieldPaths<(...)>; indexes: Expand<(...) & (...)>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]>["user"]["document"]>>;
  authConfig: RegisteredQuery<"public", {
   }, Promise<{
     invitationPath: string | null;
  }>>;
  listWorkspaces: RegisteredQuery<"public", {
   }, Promise<
     | {
     id: string;
     name: string;
     slug: string;
     logo: string | null;
     role: string;
     active: boolean;
     joinedAt: number;
   }[]
    | null>>;
  listWorkspaceMembers: RegisteredQuery<"public", {
     organizationId?: string;
   }, Promise<
     | {
     organizationId: string;
     members: {
        userId: string;
        name: string;
        email: string;
        role: string;
        joinedAt: number;
     }[];
   }
    | null>>;
  updateProfile: RegisteredMutation<"public", {
     name: string;
  }, Promise<null>>;
  mcp: McpExchange;
}
```

| Name | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| `authComponent` | \{ `adapter`: (`ctx`) => `AdapterFactory`\<`BetterAuthOptions`\>; `getAuth`: \<`T`\>(`createAuth`, `ctx`) => `Promise`\<\{ `auth`: `ReturnType`\<`T`\>; `headers`: `Headers`; \}\>; `getHeaders`: (`ctx`) => `Promise`\<`Headers`\>; `safeGetAuthUser`: (`ctx`) => `Promise`\< \| `MaybeMakeLooseDataModel`\<`{ [TableName in string]: (...)[(...)] extends TableDefinition<(...), (...), (...), (...)> ? { document: ...; fieldPaths: ...; indexes: ...; searchIndexes: ...; vectorIndexes: ... } : never }`, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\] \| `undefined`\>; `getAuthUser`: (`ctx`) => `Promise`\<`MaybeMakeLooseDataModel`\<\{ \[TableName in string\]: (...)\[(...)\]\[TableName\] extends TableDefinition\<DocumentType, Indexes, SearchIndexes, VectorIndexes\> ? \{ document: Expand\<(...)\>; fieldPaths: (...) \| (...); indexes: Expand\<(...)\>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes \} : never \}, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\]\>; `getAnyUserById`: (`ctx`, `id`) => `Promise`\< \| `MaybeMakeLooseDataModel`\<`{ [TableName in string]: (...)[(...)] extends TableDefinition<(...), (...), (...), (...)> ? { document: ...; fieldPaths: ...; indexes: ...; searchIndexes: ...; vectorIndexes: ... } : never }`, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\] \| `null`\>; `setUserId`: (`ctx`, `authId`, `userId`) => `Promise`\<`void`\>; `clientApi`: () => \{ `getAuthUser`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<`MaybeMakeLooseDataModel`\<`{ [TableName in string]: (...) extends (...) ? (...) : (...) }`, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\]\>\>; \}; `triggersApi`: () => \{ `onCreate`: `RegisteredMutation`\<`"internal"`, \{ `model`: `string`; `doc`: `any`; \}, `Promise`\<`void`\>\>; `onUpdate`: `RegisteredMutation`\<`"internal"`, \{ `model`: `string`; `oldDoc`: `any`; `newDoc`: `any`; \}, `Promise`\<`void`\>\>; `onDelete`: `RegisteredMutation`\<`"internal"`, \{ `model`: `string`; `doc`: `any`; \}, `Promise`\<`void`\>\>; \}; `registerRoutes`: (`http`, `createAuth`, `opts?`) => `void`; `registerRoutesLazy`: \<`T`\>(`http`, `createAuth`, `opts?`) => `void`; \} | - | - | [src/convex/client/index.ts:1312](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1312) |
| `authComponent.adapter()` | (`ctx`) => `AdapterFactory`\<`BetterAuthOptions`\> | - | Returns the Convex database adapter for use in Better Auth options. | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:87 |
| `authComponent.getAuth()` | \<`T`\>(`createAuth`, `ctx`) => `Promise`\<\{ `auth`: `ReturnType`\<`T`\>; `headers`: `Headers`; \}\> | - | Returns the Better Auth auth object and headers for using Better Auth API methods directly in a Convex mutation or query. Convex functions don't have access to request headers, so the headers object is created at runtime with the token for the current session as a Bearer token. | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:99 |
| `authComponent.getHeaders()` | (`ctx`) => `Promise`\<`Headers`\> | - | Returns a Headers object for the current session using the session id from the current user identity via `ctx.auth.getUserIdentity()`. This is used to pass the headers to the Better Auth API methods when using the `getAuth` method. | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:112 |
| `authComponent.safeGetAuthUser()` | (`ctx`) => `Promise`\< \| `MaybeMakeLooseDataModel`\<`{ [TableName in string]: (...)[(...)] extends TableDefinition<(...), (...), (...), (...)> ? { document: ...; fieldPaths: ...; indexes: ...; searchIndexes: ...; vectorIndexes: ... } : never }`, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\] \| `undefined`\> | - | Returns the current user or null if the user is not found | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:118 |
| `authComponent.getAuthUser()` | (`ctx`) => `Promise`\<`MaybeMakeLooseDataModel`\<\{ \[TableName in string\]: (...)\[(...)\]\[TableName\] extends TableDefinition\<DocumentType, Indexes, SearchIndexes, VectorIndexes\> ? \{ document: Expand\<(...)\>; fieldPaths: (...) \| (...); indexes: Expand\<(...)\>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes \} : never \}, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\]\> | - | Returns the current user or throws an error if the user is not found | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:125 |
| `authComponent.getAnyUserById()` | (`ctx`, `id`) => `Promise`\< \| `MaybeMakeLooseDataModel`\<`{ [TableName in string]: (...)[(...)] extends TableDefinition<(...), (...), (...), (...)> ? { document: ...; fieldPaths: ...; indexes: ...; searchIndexes: ...; vectorIndexes: ... } : never }`, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\] \| `null`\> | - | Returns a user by their Better Auth user id. | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:132 |
| `authComponent.setUserId()` | (`ctx`, `authId`, `userId`) => `Promise`\<`void`\> | - | Replaces 0.7 behavior of returning a new user id from onCreateUser **Deprecated** in 0.9 | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:141 |
| `authComponent.clientApi()` | () => \{ `getAuthUser`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<`MaybeMakeLooseDataModel`\<`{ [TableName in string]: (...) extends (...) ? (...) : (...) }`, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\]\>\>; \} | - | Exposes functions for use with the ClientAuthBoundary component. Currently only contains getAuthUser. | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:147 |
| `authComponent.triggersApi()` | () => \{ `onCreate`: `RegisteredMutation`\<`"internal"`, \{ `model`: `string`; `doc`: `any`; \}, `Promise`\<`void`\>\>; `onUpdate`: `RegisteredMutation`\<`"internal"`, \{ `model`: `string`; `oldDoc`: `any`; `newDoc`: `any`; \}, `Promise`\<`void`\>\>; `onDelete`: `RegisteredMutation`\<`"internal"`, \{ `model`: `string`; `doc`: `any`; \}, `Promise`\<`void`\>\>; \} | - | Exposes functions for executing trigger callbacks in the app context. Callbacks are defined in the `triggers` option to the component client config. See createClient for more information. | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:168 |
| `authComponent.registerRoutes()` | (`http`, `createAuth`, `opts?`) => `void` | - | - | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:183 |
| `authComponent.registerRoutesLazy()` | \<`T`\>(`http`, `createAuth`, `opts?`) => `void` | - | - | node\_modules/@convex-dev/better-auth/dist/client/create-client.d.ts:190 |
| `createAuthOptions()` | (`ctx`) => \{ `appName?`: `string`; `baseURL?`: `BaseURLConfig`; `secret?`: `string`; `secrets?`: \{ `version`: `number`; `value`: `string`; \}[]; `secondaryStorage?`: `SecondaryStorage`; `emailVerification?`: \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \}; `socialProviders?`: `SocialProviders`; `session?`: `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"compact"` \| `"jwt"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: ... \| ...; \}; `version?`: \| `string` \| ((`session`, `user`) => `string`) \| ((`session`, `user`) => `Promise`\<...\>); \}; `freshAge?`: `number`; \}; `account?`: `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: `LiteralUnion`\<..., ...\>[] \| ((`request?`) => `Awaitable`\<...\>); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \}; `verification?`: `BetterAuthDBOptions`\<`"verification"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>; \}; `storeInDatabase?`: `boolean`; \}; `trustedOrigins?`: \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>); `rateLimit?`: `BetterAuthRateLimitOptions`; `advanced?`: `BetterAuthAdvancedOptions`; `logger?`: `Logger`; `databaseHooks?`: \{ `user?`: \{ `create?`: \{ `before?`: (`user`, `context`) => ...; `after?`: (`user`, `context`) => ...; \}; `update?`: \{ `before?`: (`user`, `context`) => ...; `after?`: (`user`, `context`) => ...; \}; `delete?`: \{ `before?`: (`user`, `context`) => ...; `after?`: (`user`, `context`) => ...; \}; \}; `session?`: \{ `create?`: \{ `before?`: (`session`, `context`) => ...; `after?`: (`session`, `context`) => ...; \}; `update?`: \{ `before?`: (`session`, `context`) => ...; `after?`: (`session`, `context`) => ...; \}; `delete?`: \{ `before?`: (`session`, `context`) => ...; `after?`: (`session`, `context`) => ...; \}; \}; `account?`: \{ `create?`: \{ `before?`: (`account`, `context`) => ...; `after?`: (`account`, `context`) => ...; \}; `update?`: \{ `before?`: (`account`, `context`) => ...; `after?`: (`account`, `context`) => ...; \}; `delete?`: \{ `before?`: (`account`, `context`) => ...; `after?`: (`account`, `context`) => ...; \}; \}; `verification?`: \{ `create?`: \{ `before?`: (`verification`, `context`) => ...; `after?`: (`verification`, `context`) => ...; \}; `update?`: \{ `before?`: (`verification`, `context`) => ...; `after?`: (`verification`, `context`) => ...; \}; `delete?`: \{ `before?`: (`verification`, `context`) => ...; `after?`: (`verification`, `context`) => ...; \}; \}; \}; `onAPIError?`: \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \}; `hooks?`: \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \}; `disabledPaths?`: `string`[]; `telemetry?`: \{ `enabled?`: `boolean`; `debug?`: `boolean`; \}; `experimental?`: \{ `joins?`: `boolean`; \}; `basePath`: `string`; `database`: `AdapterFactory`\<`BetterAuthOptions`\>; `emailAndPassword`: \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \}; `user`: \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \}; `plugins`: \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => `Promise`\<...\>; \} \| \{ `matcher`: (`ctx`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<...\>; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<`unknown`\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: ...; \}; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => `Promise`\<...\>[]; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: ...; \}; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; use: ((inputContext: ...) =\> ...)\[\]; body: ZodObject\<\{ email: ...; type: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ...; type: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ...; type: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ...; type: ...; otp: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ...; otp: ... \}, $strip\>; metadata: \{ openapi: \{ description: ...; responses: ... \} \} \}, \{ status: boolean; token: string; user: (...) & (...) \} \| \{ status: boolean; token: null; user: (...) & (...) \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<(...), (...)\>, ZodRecord\<(...), (...)\>\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ...; otp: ...; password: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ...; otp: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ...; otp: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: ...) =\> ...)\[\]; query: ZodOptional\<ZodObject\<(...), (...)\>\>; metadata: \{ openapi: \{ operationId: ...; description: ...; parameters: ...; responses: ... \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ...; name: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \}; $Infer: \{ body: ... \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) \| (...) \| (...); userAgent?: (...) \| (...) \| (...) \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ description: ...; responses: ... \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ... \}, $strip\>; use: ((...) \| (...))\[\]; metadata: \{ openapi: \{ description: ...; responses: ... \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ...; name: ... \}, $strip\>; use: ((...) \| (...))\[\]; metadata: \{ openapi: \{ description: ...; responses: ... \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: ...; field: ... \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \} \| \{ id: "admin"; version: string; init: any; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\> \}\[\] \}; endpoints: \{ setRole: StrictEndpoint\<"/admin/set-role", \{ method: "POST"; body: ZodObject\<\{ userId: ...; role: ... \}, $strip\>; requireHeaders: true; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \}; $Infer: \{ body: ... \} \} \}, \{ user: UserWithRole \}\>; getUser: StrictEndpoint\<"/admin/get-user", \{ method: "GET"; query: ZodObject\<\{ id: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, UserWithRole\>; createUser: StrictEndpoint\<"/admin/create-user", \{ method: "POST"; body: ZodObject\<\{ email: ...; password: ...; name: ...; role: ...; data: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \}; $Infer: \{ body: ... \} \} \}, \{ user: UserWithRole \}\>; adminUpdateUser: StrictEndpoint\<"/admin/update-user", \{ method: "POST"; body: ZodObject\<\{ userId: ...; data: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, UserWithRole\>; listUsers: StrictEndpoint\<"/admin/list-users", \{ method: "GET"; use: ((inputContext: ...) =\> ...)\[\]; query: ZodObject\<\{ searchValue: ...; searchField: ...; searchOperator: ...; limit: ...; offset: ...; sortBy: ...; sortDirection: ...; filterField: ...; filterValue: ...; filterOperator: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, \{ users: UserWithRole\[\]; total: number \}\>; listUserSessions: StrictEndpoint\<"/admin/list-user-sessions", \{ method: "POST"; use: ((inputContext: ...) =\> ...)\[\]; body: ZodObject\<\{ userId: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, \{ sessions: SessionWithImpersonatedBy\[\] \}\>; unbanUser: StrictEndpoint\<"/admin/unban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, \{ user: UserWithRole \}\>; banUser: StrictEndpoint\<"/admin/ban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ...; banReason: ...; banExpiresIn: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, \{ user: UserWithRole \}\>; impersonateUser: StrictEndpoint\<"/admin/impersonate-user", \{ method: "POST"; body: ZodObject\<\{ userId: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) \| (...) \| (...); userAgent?: (...) \| (...) \| (...) \}; user: UserWithRole \}\>; stopImpersonating: StrictEndpoint\<"/admin/stop-impersonating", \{ method: "POST"; requireHeaders: true \}, \{ session: \{ id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... \} & Record\<(...), (...)\>; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \}\>; revokeUserSession: StrictEndpoint\<"/admin/revoke-user-session", \{ method: "POST"; body: ZodObject\<\{ sessionToken: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; revokeUserSessions: StrictEndpoint\<"/admin/revoke-user-sessions", \{ method: "POST"; body: ZodObject\<\{ userId: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; removeUser: StrictEndpoint\<"/admin/remove-user", \{ method: "POST"; body: ZodObject\<\{ userId: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; setUserPassword: StrictEndpoint\<"/admin/set-user-password", \{ method: "POST"; body: ZodObject\<\{ newPassword: ...; userId: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; summary: ...; description: ...; responses: ... \} \} \}, \{ status: boolean \}\>; userHasPermission: StrictEndpoint\<"/admin/has-permission", \{ method: "POST"; body: ZodIntersection\<ZodObject\<(...), (...)\>, ZodXor\<(...)\>\>; metadata: \{ openapi: \{ description: ...; requestBody: ...; responses: ... \}; $Infer: \{ body: ... \} \} \}, \{ error: null; success: boolean \}\> \}; $ERROR\_CODES: \{ USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL: RawError\<"USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL"\>; FAILED\_TO\_CREATE\_USER: RawError\<"FAILED\_TO\_CREATE\_USER"\>; USER\_ALREADY\_EXISTS: RawError\<"USER\_ALREADY\_EXISTS"\>; YOU\_CANNOT\_BAN\_YOURSELF: RawError\<"YOU\_CANNOT\_BAN\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD"\>; BANNED\_USER: RawError\<"BANNED\_USER"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER"\>; NO\_DATA\_TO\_UPDATE: RawError\<"NO\_DATA\_TO\_UPDATE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS"\>; YOU\_CANNOT\_REMOVE\_YOURSELF: RawError\<"YOU\_CANNOT\_REMOVE\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE"\>; YOU\_CANNOT\_IMPERSONATE\_ADMINS: RawError\<"YOU\_CANNOT\_IMPERSONATE\_ADMINS"\>; INVALID\_ROLE\_TYPE: RawError\<"INVALID\_ROLE\_TYPE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL"\>; PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER: RawError\<"PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER"\> \}; schema: \{ user: \{ fields: \{ role: \{ type: "string"; required: false; input: false \}; banned: \{ type: "boolean"; defaultValue: false; required: false; input: false \}; banReason: \{ type: "string"; required: false; input: false \}; banExpires: \{ type: "date"; required: false; input: false \} \} \}; session: \{ fields: \{ impersonatedBy: \{ type: "string"; required: false; input: false \} \} \} \}; options: NoInfer\<AdminOptions\> \} \| DefaultOrganizationPlugin\<\{ allowUserToCreateOrganization?: boolean \| ((user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\>) =\> Awaitable\<boolean\>); organizationLimit?: number \| ((user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\>) =\> Awaitable\<boolean\>); creatorRole?: string; membershipLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \}, organization: \{ id: string; name: string; slug: string; logo?: (...) \| (...) \| (...); metadata?: any; createdAt: Date \}) =\> number \| Promise\<(...)\>); ac?: AccessControl; roles?: \{ \[key: string\]: Role\<(...)\> \| undefined \}; dynamicAccessControl?: \{ enabled?: boolean; maximumRolesPerOrganization?: number \| ((organizationId: ...) =\> ...) \}; teams?: \{ enabled: boolean; defaultTeam?: \{ enabled: ...; customCreateDefaultTeam?: ... \}; maximumTeams?: number \| ((data: ..., ctx?: ...) =\> ...); maximumMembersPerTeam?: number \| ((data: ...) =\> ...); allowRemovingAllTeams?: boolean \}; invitationExpiresIn?: number; invitationLimit?: number \| ((data: \{ user: (...) & (...); organization: (...) & (...); member: (...) & (...) \}, ctx: AuthContext) =\> Awaitable\<number\>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: \{ id: string; role: string; email: string; organization: \{ id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... \}; invitation: \{ id: ...; organizationId: ...; email: ...; role: ...; status: ...; teamId?: ...; inviterId: ...; expiresAt: ...; createdAt: ... \}; inviter: (...) & (...) \}, request?: Request) =\> Promise\<void\>; schema?: \{ session?: \{ fields?: ... \}; organization?: \{ modelName?: ...; fields?: ...; additionalFields?: ... \}; member?: \{ modelName?: ...; fields?: ...; additionalFields?: ... \}; invitation?: \{ modelName?: ...; fields?: ...; additionalFields?: ... \}; team?: \{ modelName?: ...; fields?: ...; additionalFields?: ... \}; teamMember?: \{ modelName?: ...; fields?: ... \}; organizationRole?: \{ modelName?: ...; fields?: ...; additionalFields?: ... \} \}; disableOrganizationDeletion?: boolean; organizationHooks?: \{ beforeCreateOrganization?: (data: ...) =\> ...; afterCreateOrganization?: (data: ...) =\> ...; beforeUpdateOrganization?: (data: ...) =\> ...; afterUpdateOrganization?: (data: ...) =\> ...; beforeDeleteOrganization?: (data: ..., ctx?: ...) =\> ...; afterDeleteOrganization?: (data: ..., ctx?: ...) =\> ...; beforeAddMember?: (data: ...) =\> ...; afterAddMember?: (data: ...) =\> ...; beforeRemoveMember?: (data: ...) =\> ...; afterRemoveMember?: (data: ...) =\> ...; beforeUpdateMemberRole?: (data: ...) =\> ...; afterUpdateMemberRole?: (data: ...) =\> ...; beforeCreateInvitation?: (data: ...) =\> ...; afterCreateInvitation?: (data: ...) =\> ...; beforeAcceptInvitation?: (data: ...) =\> ...; afterAcceptInvitation?: (data: ...) =\> ...; beforeRejectInvitation?: (data: ...) =\> ...; afterRejectInvitation?: (data: ...) =\> ...; beforeCancelInvitation?: (data: ...) =\> ...; afterCancelInvitation?: (data: ...) =\> ...; beforeCreateTeam?: (data: ...) =\> ...; afterCreateTeam?: (data: ...) =\> ...; beforeUpdateTeam?: (data: ...) =\> ...; afterUpdateTeam?: (data: ...) =\> ...; beforeDeleteTeam?: (data: ...) =\> ...; afterDeleteTeam?: (data: ...) =\> ...; beforeAddTeamMember?: (data: ...) =\> ...; afterAddTeamMember?: (data: ...) =\> ...; beforeRemoveTeamMember?: (data: ...) =\> ...; afterRemoveTeamMember?: (data: ...) =\> ... \} \}\>)\[\]\]; \} | `createAuthOptionsForContext` | - | [src/convex/client/index.ts:1313](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1313) |
| `options` | \{ `appName?`: `string`; `baseURL?`: `BaseURLConfig`; `secret?`: `string`; `secrets?`: \{ `version`: `number`; `value`: `string`; \}[]; `secondaryStorage?`: `SecondaryStorage`; `emailVerification?`: \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \}; `socialProviders?`: `SocialProviders`; `session?`: `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"compact"` \| `"jwt"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: `number`; \}; `version?`: \| `string` \| ((`session`, `user`) => `string`) \| ((`session`, `user`) => `Promise`\<`string`\>); \}; `freshAge?`: `number`; \}; `account?`: `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: \| `LiteralUnion`\< \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ..., `string`\>[] \| ((`request?`) => `Awaitable`\<...[]\>); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \}; `verification?`: `BetterAuthDBOptions`\<`"verification"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>; \}; `storeInDatabase?`: `boolean`; \}; `trustedOrigins?`: \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>); `rateLimit?`: `BetterAuthRateLimitOptions`; `advanced?`: `BetterAuthAdvancedOptions`; `logger?`: `Logger`; `databaseHooks?`: \{ `user?`: \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; \}; `session?`: \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; \}; `account?`: \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; \}; `verification?`: \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; \}; \}; `onAPIError?`: \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \}; `hooks?`: \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \}; `disabledPaths?`: `string`[]; `telemetry?`: \{ `enabled?`: `boolean`; `debug?`: `boolean`; \}; `experimental?`: \{ `joins?`: `boolean`; \}; `basePath`: `string`; `database`: `AdapterFactory`\<`BetterAuthOptions`\>; `emailAndPassword`: \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \}; `user`: \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \}; `plugins`: \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => `Promise`\<... \| ...\>; \} \| \{ `matcher`: (`ctx`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<\{ `context`: ...; \}\>; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<`unknown`\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: ...; `content`: ...; \}; \}; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => `Promise`\<\{ `session`: ...; \}\>[]; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: ...; `content`: ...; \}; \}; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean; token: string; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \} \| \{ status: boolean; token: null; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ...; otp: ...; name: ...; image: ... \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ...; name: ...; context: ... \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; parameters: (...)\[\]; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ...; 400: ... \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<(...), (...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ response: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \} \| \{ id: "admin"; version: string; init: any; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<(...) \| (...)\> \}\[\] \}; endpoints: \{ setRole: StrictEndpoint\<"/admin/set-role", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; role: ZodUnion\<(...)\> \}, $strip\>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ userId: ...; role: ... \} \} \} \}, \{ user: UserWithRole \}\>; getUser: StrictEndpoint\<"/admin/get-user", \{ method: "GET"; query: ZodObject\<\{ id: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, UserWithRole\>; createUser: StrictEndpoint\<"/admin/create-user", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; password: ZodOptional\<(...)\>; name: ZodString; role: ZodOptional\<(...)\>; data: ZodOptional\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ email: ...; password?: ...; name: ...; role?: ...; data?: ... \} \} \} \}, \{ user: UserWithRole \}\>; adminUpdateUser: StrictEndpoint\<"/admin/update-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; data: ZodRecord\<(...), (...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, UserWithRole\>; listUsers: StrictEndpoint\<"/admin/list-users", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodObject\<\{ searchValue: ZodOptional\<(...)\>; searchField: ZodOptional\<(...)\>; searchOperator: ZodOptional\<(...)\>; limit: ZodOptional\<(...)\>; offset: ZodOptional\<(...)\>; sortBy: ZodOptional\<(...)\>; sortDirection: ZodOptional\<(...)\>; filterField: ZodOptional\<(...)\>; filterValue: ZodOptional\<(...)\>; filterOperator: ZodOptional\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ users: UserWithRole\[\]; total: number \}\>; listUserSessions: StrictEndpoint\<"/admin/list-user-sessions", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ sessions: SessionWithImpersonatedBy\[\] \}\>; unbanUser: StrictEndpoint\<"/admin/unban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ user: UserWithRole \}\>; banUser: StrictEndpoint\<"/admin/ban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; banReason: ZodOptional\<(...)\>; banExpiresIn: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ user: UserWithRole \}\>; impersonateUser: StrictEndpoint\<"/admin/impersonate-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: UserWithRole \}\>; stopImpersonating: StrictEndpoint\<"/admin/stop-impersonating", \{ method: "POST"; requireHeaders: true \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) \| (...) \| (...); userAgent?: (...) \| (...) \| (...) \} & Record\<string, any\>; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \}\>; revokeUserSession: StrictEndpoint\<"/admin/revoke-user-session", \{ method: "POST"; body: ZodObject\<\{ sessionToken: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; revokeUserSessions: StrictEndpoint\<"/admin/revoke-user-sessions", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; removeUser: StrictEndpoint\<"/admin/remove-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; setUserPassword: StrictEndpoint\<"/admin/set-user-password", \{ method: "POST"; body: ZodObject\<\{ newPassword: ZodString; userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; userHasPermission: StrictEndpoint\<"/admin/has-permission", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ userId: ...; role: ... \}, $strip\>, ZodXor\<readonly \[(...), (...)\]\>\>; metadata: \{ openapi: \{ description: string; requestBody: \{ content: ... \}; responses: \{ 200: ... \} \}; $Infer: \{ body: (...) & (...) \} \} \}, \{ error: null; success: boolean \}\> \}; $ERROR\_CODES: \{ USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL: RawError\<"USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL"\>; FAILED\_TO\_CREATE\_USER: RawError\<"FAILED\_TO\_CREATE\_USER"\>; USER\_ALREADY\_EXISTS: RawError\<"USER\_ALREADY\_EXISTS"\>; YOU\_CANNOT\_BAN\_YOURSELF: RawError\<"YOU\_CANNOT\_BAN\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD"\>; BANNED\_USER: RawError\<"BANNED\_USER"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER"\>; NO\_DATA\_TO\_UPDATE: RawError\<"NO\_DATA\_TO\_UPDATE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS"\>; YOU\_CANNOT\_REMOVE\_YOURSELF: RawError\<"YOU\_CANNOT\_REMOVE\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE"\>; YOU\_CANNOT\_IMPERSONATE\_ADMINS: RawError\<"YOU\_CANNOT\_IMPERSONATE\_ADMINS"\>; INVALID\_ROLE\_TYPE: RawError\<"INVALID\_ROLE\_TYPE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL"\>; PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER: RawError\<"PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER"\> \}; schema: \{ user: \{ fields: \{ role: \{ type: "string"; required: false; input: false \}; banned: \{ type: "boolean"; defaultValue: false; required: false; input: false \}; banReason: \{ type: "string"; required: false; input: false \}; banExpires: \{ type: "date"; required: false; input: false \} \} \}; session: \{ fields: \{ impersonatedBy: \{ type: "string"; required: false; input: false \} \} \} \}; options: NoInfer\<AdminOptions\> \} \| DefaultOrganizationPlugin\<\{ allowUserToCreateOrganization?: boolean \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\>) =\> Awaitable\<boolean\>); organizationLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\>) =\> Awaitable\<boolean\>); creatorRole?: string; membershipLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \}, organization: \{ id: string; name: string; slug: string; logo?: string \| null; metadata?: any; createdAt: Date \}) =\> number \| Promise\<number\>); ac?: AccessControl; roles?: \{ \[key: string\]: Role\<any\> \| undefined \}; dynamicAccessControl?: \{ enabled?: boolean; maximumRolesPerOrganization?: number \| ((organizationId: string) =\> Awaitable\<(...)\>) \}; teams?: \{ enabled: boolean; defaultTeam?: \{ enabled: boolean; customCreateDefaultTeam?: (...) \| (...) \}; maximumTeams?: number \| ((data: \{ organizationId: ...; session: ... \}, ctx?: (...) \| (...)) =\> Awaitable\<(...)\>); maximumMembersPerTeam?: number \| ((data: \{ teamId: ...; session: ...; organizationId: ... \}) =\> Awaitable\<(...)\>); allowRemovingAllTeams?: boolean \}; invitationExpiresIn?: number; invitationLimit?: number \| ((data: \{ user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\>; organization: \{ id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... \} & Record\<(...), (...)\>; member: \{ id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... \} & Record\<(...), (...)\> \}, ctx: AuthContext) =\> Awaitable\<number\>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: \{ id: string; role: string; email: string; organization: \{ id: string; name: string; slug: string; logo?: (...) \| (...) \| (...); metadata?: any; createdAt: Date \}; invitation: \{ id: string; organizationId: string; email: string; role: string; status: (...) \| (...) \| (...) \| (...); teamId?: (...) \| (...) \| (...); inviterId: string; expiresAt: Date; createdAt: Date \}; inviter: \{ id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... \} & \{ user: ... \} \}, request?: Request) =\> Promise\<void\>; schema?: \{ session?: \{ fields?: (...) \| (...) \}; organization?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; member?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; invitation?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; team?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; teamMember?: \{ modelName?: (...) \| (...); fields?: (...) \| (...) \}; organizationRole?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \} \}; disableOrganizationDeletion?: boolean; organizationHooks?: \{ beforeCreateOrganization?: (data: \{ organization: ...; user: ... \}) =\> Promise\<(...)\>; afterCreateOrganization?: (data: \{ organization: ...; member: ...; user: ... \}) =\> Promise\<(...)\>; beforeUpdateOrganization?: (data: \{ organization: ...; user: ...; member: ... \}) =\> Promise\<(...)\>; afterUpdateOrganization?: (data: \{ organization: ...; user: ...; member: ... \}) =\> Promise\<(...)\>; beforeDeleteOrganization?: (data: \{ organization: ...; user: ... \}, ctx?: (...) \| (...)) =\> Promise\<(...)\>; afterDeleteOrganization?: (data: \{ organization: ...; user: ... \}, ctx?: (...) \| (...)) =\> Promise\<(...)\>; beforeAddMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAddMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRemoveMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRemoveMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeUpdateMemberRole?: (data: \{ member: ...; newRole: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterUpdateMemberRole?: (data: \{ member: ...; previousRole: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCreateInvitation?: (data: \{ invitation: ...; inviter: ...; organization: ... \}) =\> Promise\<(...)\>; afterCreateInvitation?: (data: \{ invitation: ...; inviter: ...; organization: ... \}) =\> Promise\<(...)\>; beforeAcceptInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAcceptInvitation?: (data: \{ invitation: ...; member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRejectInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRejectInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCancelInvitation?: (data: \{ invitation: ...; cancelledBy: ...; organization: ... \}) =\> Promise\<(...)\>; afterCancelInvitation?: (data: \{ invitation: ...; cancelledBy: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCreateTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; afterCreateTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; beforeUpdateTeam?: (data: \{ team: ...; updates: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterUpdateTeam?: (data: \{ team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeDeleteTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; afterDeleteTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; beforeAddTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAddTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRemoveTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRemoveTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\> \} \}\>)\[\]\]; \} | - | - | [src/convex/client/index.ts:1314](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1314) |
| `options.appName?` | `string` | - | The name of your application. Used as a display name in contexts where your app needs to be identified — for example, as the default issuer name in authenticator apps when users set up 2FA/TOTP. Can also be set via the `APP_NAME` environment variable. **Default** `"Better Auth"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:372 |
| `options.baseURL?` | `BaseURLConfig` | - | Base URL for the Better Auth. This is typically the root URL where your application server is hosted. Can be configured as: - A static string: `"https://myapp.com"` - A dynamic config with allowed hosts for multi-domain deployments If not explicitly set, the system will check environment variables: `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, etc. **Example** `// Static URL baseURL: "https://myapp.com" // Dynamic with allowed hosts (for Vercel, multi-domain, etc.) baseURL: { allowedHosts: ["myapp.com", "*.vercel.app", "preview-*.myapp.com"], fallback: "https://myapp.com" }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:396 |
| `options.secret?` | `string` | - | The secret to use for encryption, signing and hashing. By default Better Auth will look for the following environment variables: process.env.BETTER_AUTH_SECRET, process.env.AUTH_SECRET If none of these environment variables are set, it will default to "better-auth-secret-123456789". on production if it's not set it will throw an error. you can generate a good secret using the following command: **Example** `openssl rand -base64 32` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:428 |
| `options.secrets?` | \{ `version`: `number`; `value`: `string`; \}[] | - | Versioned secrets for non-destructive secret rotation. When set, encryption uses an envelope format with key IDs. First entry is the current key used for new encryption. Remaining entries are decryption-only (previous rotations). Can also be set via BETTER_AUTH_SECRETS env var: `BETTER_AUTH_SECRETS=2:base64secret,1:base64secret` When set, `secret` is only used as legacy fallback for decrypting bare-hex payloads that predate the envelope format. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:441 |
| `options.secondaryStorage?` | `SecondaryStorage` | - | Secondary storage configuration This is used to store session and rate limit data. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:506 |
| `options.emailVerification?` | \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \} | - | Email verification configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:510 |
| `options.emailVerification.sendVerificationEmail()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:516 |
| `options.emailVerification.sendOnSignUp?` | `boolean` | - | Send a verification email automatically after sign up. - `true`: Always send verification email on sign up - `false`: Never send verification email on sign up - `undefined`: Follows `requireEmailVerification` behavior **Default** `undefined` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:542 |
| `options.emailVerification.sendOnSignIn?` | `boolean` | - | Send a verification email automatically on sign in when the user's email is not verified **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:549 |
| `options.emailVerification.autoSignInAfterVerification?` | `boolean` | - | Auto signin the user after they verify their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:553 |
| `options.emailVerification.expiresIn?` | `number` | - | Number of seconds the verification token is valid for. **Default** `3600 seconds (1 hour)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:559 |
| `options.emailVerification.beforeEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user verifies their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:565 |
| `options.emailVerification.afterEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called when a user's email is updated to verified | node\_modules/@better-auth/core/dist/types/init-options.d.mts:571 |
| `options.socialProviders?` | `SocialProviders` | - | list of social providers | node\_modules/@better-auth/core/dist/types/init-options.d.mts:725 |
| `options.session?` | `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"compact"` \| `"jwt"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: `number`; \}; `version?`: \| `string` \| ((`session`, `user`) => `string`) \| ((`session`, `user`) => `Promise`\<`string`\>); \}; `freshAge?`: `number`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:800 |
| `options.account?` | `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: \| `LiteralUnion`\< \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ..., `string`\>[] \| ((`request?`) => `Awaitable`\<...[]\>); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:928 |
| `options.verification?` | `BetterAuthDBOptions`\<`"verification"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>; \}; `storeInDatabase?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1068 |
| `options.trustedOrigins?` | \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>) | - | Additional trusted origins. By default, Better Auth trusts your app's [baseURL](#setupauth-2). Use this option to allow additional origins (e.g. a separate frontend domain). Can be a static array, a function that returns origins dynamically, or use wildcard patterns (e.g. `"https://*.example.com"`). **Param** **request** The request object. It'll be undefined if no request was made. Like during a create context call or `auth.api` call. Trusted origins will be dynamically calculated based on the request. **Example** `trustedOrigins: async (request) => { return [ "https://better-auth.com", "https://*.better-auth.com", request.headers.get("x-custom-origin") ]; }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1119 |
| `options.rateLimit?` | `BetterAuthRateLimitOptions` | - | Rate limiting configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1123 |
| `options.advanced?` | `BetterAuthAdvancedOptions` | - | Advanced options | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1127 |
| `options.logger?` | `Logger` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1128 |
| `options.databaseHooks?` | \{ `user?`: \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; \}; `session?`: \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; \}; `account?`: \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; \}; `verification?`: \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; \}; \} | - | allows you to define custom hooks that can be executed during lifecycle of core database operations. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1134 |
| `options.databaseHooks.user?` | \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; \} | - | User hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1138 |
| `options.databaseHooks.user.create?` | \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1139 |
| `options.databaseHooks.user.create.before()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called before a user is created. if the hook returns false, the user will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1145 |
| `options.databaseHooks.user.create.after()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called after a user is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1151 |
| `options.databaseHooks.user.update?` | \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1153 |
| `options.databaseHooks.user.update.before()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called before a user is updated. if the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1159 |
| `options.databaseHooks.user.update.after()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called after a user is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1165 |
| `options.databaseHooks.user.delete?` | \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1167 |
| `options.databaseHooks.user.delete.before()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called before a user is deleted. if the hook returns false, the user will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1172 |
| `options.databaseHooks.user.delete.after()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called after a user is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1176 |
| `options.databaseHooks.session?` | \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; \} | - | Session Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1182 |
| `options.databaseHooks.session.create?` | \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1183 |
| `options.databaseHooks.session.create.before()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called before a session is created. if the hook returns false, the session will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1189 |
| `options.databaseHooks.session.create.after()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called after a session is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1195 |
| `options.databaseHooks.session.update?` | \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1200 |
| `options.databaseHooks.session.update.before()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called before a user is updated. if the hook returns false, the session will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1206 |
| `options.databaseHooks.session.update.after()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called after a session is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1212 |
| `options.databaseHooks.session.delete?` | \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1214 |
| `options.databaseHooks.session.delete.before()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called before a session is deleted. if the hook returns false, the session will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1219 |
| `options.databaseHooks.session.delete.after()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called after a session is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1223 |
| `options.databaseHooks.account?` | \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; \} | - | Account Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1229 |
| `options.databaseHooks.account.create?` | \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1230 |
| `options.databaseHooks.account.create.before()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called before a account is created. If the hook returns false, the account will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1236 |
| `options.databaseHooks.account.create.after()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called after a account is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1242 |
| `options.databaseHooks.account.update?` | \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1247 |
| `options.databaseHooks.account.update.before()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called before a account is update. If the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1253 |
| `options.databaseHooks.account.update.after()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called after a account is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1259 |
| `options.databaseHooks.account.delete?` | \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1261 |
| `options.databaseHooks.account.delete.before()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called before an account is deleted. if the hook returns false, the account will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1266 |
| `options.databaseHooks.account.delete.after()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called after an account is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1270 |
| `options.databaseHooks.verification?` | \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; \} | - | Verification Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1276 |
| `options.databaseHooks.verification.create?` | \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1277 |
| `options.databaseHooks.verification.create.before()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called before a verification is created. if the hook returns false, the verification will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1283 |
| `options.databaseHooks.verification.create.after()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called after a verification is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1289 |
| `options.databaseHooks.verification.update?` | \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1291 |
| `options.databaseHooks.verification.update.before()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called before a verification is updated. if the hook returns false, the verification will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1297 |
| `options.databaseHooks.verification.update.after()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called after a verification is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1303 |
| `options.databaseHooks.verification.delete?` | \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1305 |
| `options.databaseHooks.verification.delete.before()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called before a verification is deleted. if the hook returns false, the verification will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1310 |
| `options.databaseHooks.verification.delete.after()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called after a verification is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1314 |
| `options.onAPIError?` | \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \} | - | API error handling | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1321 |
| `options.onAPIError.throw?` | `boolean` | - | Throw an error on API error **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1327 |
| `options.onAPIError.onError()?` | (`error`, `ctx`) => `void` \| `Promise`\<`void`\> | - | Custom error handler | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1334 |
| `options.onAPIError.errorURL?` | `string` | - | The URL to redirect to on error When errorURL is provided, the error will be added to the URL as a query parameter and the user will be redirected to the errorURL. **Default** `- "/api/auth/error"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1343 |
| `options.onAPIError.customizeDefaultErrorPage?` | \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \} | - | Configure the default error page provided by Better-Auth Start your dev server and go to /api/auth/error to see the error page. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1348 |
| `options.onAPIError.customizeDefaultErrorPage.colors?` | \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1349 |
| `options.onAPIError.customizeDefaultErrorPage.colors.background?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1350 |
| `options.onAPIError.customizeDefaultErrorPage.colors.foreground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1351 |
| `options.onAPIError.customizeDefaultErrorPage.colors.primary?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1352 |
| `options.onAPIError.customizeDefaultErrorPage.colors.primaryForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1353 |
| `options.onAPIError.customizeDefaultErrorPage.colors.mutedForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1354 |
| `options.onAPIError.customizeDefaultErrorPage.colors.border?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1355 |
| `options.onAPIError.customizeDefaultErrorPage.colors.destructive?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1356 |
| `options.onAPIError.customizeDefaultErrorPage.colors.titleBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1357 |
| `options.onAPIError.customizeDefaultErrorPage.colors.titleColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1358 |
| `options.onAPIError.customizeDefaultErrorPage.colors.gridColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1359 |
| `options.onAPIError.customizeDefaultErrorPage.colors.cardBackground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1360 |
| `options.onAPIError.customizeDefaultErrorPage.colors.cornerBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1361 |
| `options.onAPIError.customizeDefaultErrorPage.size?` | \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1363 |
| `options.onAPIError.customizeDefaultErrorPage.size.radiusSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1364 |
| `options.onAPIError.customizeDefaultErrorPage.size.radiusMd?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1365 |
| `options.onAPIError.customizeDefaultErrorPage.size.radiusLg?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1366 |
| `options.onAPIError.customizeDefaultErrorPage.size.textSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1367 |
| `options.onAPIError.customizeDefaultErrorPage.size.text2xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1368 |
| `options.onAPIError.customizeDefaultErrorPage.size.text4xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1369 |
| `options.onAPIError.customizeDefaultErrorPage.size.text6xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1370 |
| `options.onAPIError.customizeDefaultErrorPage.font?` | \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1372 |
| `options.onAPIError.customizeDefaultErrorPage.font.defaultFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1373 |
| `options.onAPIError.customizeDefaultErrorPage.font.monoFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1374 |
| `options.onAPIError.customizeDefaultErrorPage.disableTitleBorder?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1376 |
| `options.onAPIError.customizeDefaultErrorPage.disableCornerDecorations?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1377 |
| `options.onAPIError.customizeDefaultErrorPage.disableBackgroundGrid?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1378 |
| `options.hooks?` | \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \} | - | Hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1384 |
| `options.hooks.before()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | Before a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1388 |
| `options.hooks.after()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | After a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1392 |
| `options.disabledPaths?` | `string`[] | - | Disabled paths Paths you want to disable. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1399 |
| `options.telemetry?` | \{ `enabled?`: `boolean`; `debug?`: `boolean`; \} | - | Telemetry configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1403 |
| `options.telemetry.enabled?` | `boolean` | - | Enable telemetry collection **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1409 |
| `options.telemetry.debug?` | `boolean` | - | Enable debug mode **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1415 |
| `options.experimental?` | \{ `joins?`: `boolean`; \} | - | Experimental features | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1420 |
| `options.experimental.joins?` | `boolean` | - | Enable experimental joins for your database adapter. 	Please read the adapter documentation for more information regarding joins before enabling this. 	Not all adapters support joins. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1429 |
| `options.basePath` | `string` | `resolvedBasePath` | - | [src/convex/client/index.ts:913](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L913) |
| `options.database` | `AdapterFactory`\<`BetterAuthOptions`\> | - | - | [src/convex/client/index.ts:914](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L914) |
| `options.emailAndPassword` | \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \} | - | - | [src/convex/client/index.ts:916](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L916) |
| `options.emailAndPassword.disableSignUp?` | `boolean` | - | Disable email and password sign up **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:588 |
| `options.emailAndPassword.requireEmailVerification?` | `boolean` | - | Require email verification before a session can be created for the user. if the user is not verified, the user will not be able to sign in and on sign in attempts, the user will be prompted to verify their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:596 |
| `options.emailAndPassword.maxPasswordLength?` | `number` | - | The maximum length of the password. **Default** `128` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:602 |
| `options.emailAndPassword.minPasswordLength?` | `number` | - | The minimum length of the password. **Default** `8` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:608 |
| `options.emailAndPassword.sendResetPassword()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | send reset password | node\_modules/@better-auth/core/dist/types/init-options.d.mts:612 |
| `options.emailAndPassword.resetPasswordTokenExpiresIn?` | `number` | - | Number of seconds the reset password token is valid for. **Default** `1 hour (60 * 60)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:634 |
| `options.emailAndPassword.onPasswordReset()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user's password is changed successfully. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:639 |
| `options.emailAndPassword.password?` | \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \} | - | Password hashing and verification By default Scrypt is used for password hashing and verification. You can provide your own hashing and verification function. if you want to use a different algorithm. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:650 |
| `options.emailAndPassword.password.hash()?` | (`password`) => `Promise`\<`string`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:651 |
| `options.emailAndPassword.password.verify()?` | (`data`) => `Promise`\<`boolean`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:652 |
| `options.emailAndPassword.autoSignIn?` | `boolean` | - | Automatically sign in the user after sign up **Default** `true` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:662 |
| `options.emailAndPassword.revokeSessionsOnPasswordReset?` | `boolean` | - | Whether to revoke all other sessions when resetting password **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:667 |
| `options.emailAndPassword.onExistingUserSignUp()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user tries to sign up with an email that already exists. Useful for notifying the existing user that someone attempted to register with their email. This is only called when `requireEmailVerification: true` or `autoSignIn: false`. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:675 |
| `options.emailAndPassword.customSyntheticUser()?` | (`params`) => `Record`\<`string`, `unknown`\> | - | Build a custom synthetic user for email enumeration protection. When a sign-up attempt is made with an email that already exists, this function is called to build the fake user response. Use this when plugins add fields to the user table (e.g. admin plugin adds `role`, `banned`, etc.) to ensure the fake response is indistinguishable from a real sign-up. **Example** `customSyntheticUser: ({ coreFields, additionalFields, id }) => ({ ...coreFields, role: "user", banned: false, banReason: null, banExpires: null, ...additionalFields, id, })` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:706 |
| `options.emailAndPassword.enabled` | `boolean` | `false` | Enable email and password authentication **Default** `false` | [src/convex/client/index.ts:917](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L917) |
| `options.user` | \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \} | - | - | [src/convex/client/index.ts:922](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L922) |
| `options.user.modelName?` | `"user"` \| `LiteralString` | - | The name of the model. Defaults to the model name. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:125 |
| `options.user.fields?` | `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\> | - | Map fields to database columns | node\_modules/@better-auth/core/dist/types/init-options.d.mts:129 |
| `options.user.additionalFields?` | \{ \[`key`: `string`\]: `DBFieldAttribute`; \} | - | Additional fields for the model | node\_modules/@better-auth/core/dist/types/init-options.d.mts:133 |
| `options.user.changeEmail?` | \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \} | - | Changing email configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:737 |
| `options.user.changeEmail.enabled` | `boolean` | - | Enable changing email **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:742 |
| `options.user.changeEmail.sendChangeEmailConfirmation()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a confirmation email to the old email address when the user changes their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:748 |
| `options.user.changeEmail.updateEmailWithoutVerification?` | `boolean` | - | Update the email without verification if the user is not verified. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:758 |
| `options.user.deleteUser?` | \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \} | - | User deletion configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:763 |
| `options.user.deleteUser.enabled?` | `boolean` | - | Enable user deletion | node\_modules/@better-auth/core/dist/types/init-options.d.mts:767 |
| `options.user.deleteUser.sendDeleteAccountVerification()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email when the user deletes their account. if this is not set, the user will be deleted immediately. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:775 |
| `options.user.deleteUser.beforeDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user is deleted. to interrupt with error you can throw `APIError` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:785 |
| `options.user.deleteUser.afterDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called after a user is deleted. This is useful for cleaning up user data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:791 |
| `options.user.deleteUser.deleteTokenExpiresIn?` | `number` | - | The expiration time for the delete token. **Default** `1 day (60 * 60 * 24) in seconds` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:797 |
| `options.plugins` | \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => `Promise`\<... \| ...\>; \} \| \{ `matcher`: (`ctx`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<\{ `context`: ...; \}\>; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<`unknown`\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: ...; `content`: ...; \}; \}; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => `Promise`\<\{ `session`: ...; \}\>[]; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: ...; `content`: ...; \}; \}; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean; token: string; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \} \| \{ status: boolean; token: null; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ...; otp: ...; name: ...; image: ... \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ...; name: ...; context: ... \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; parameters: (...)\[\]; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ...; 400: ... \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<(...), (...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ response: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \} \| \{ id: "admin"; version: string; init: any; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<(...) \| (...)\> \}\[\] \}; endpoints: \{ setRole: StrictEndpoint\<"/admin/set-role", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; role: ZodUnion\<(...)\> \}, $strip\>; requireHeaders: true; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ userId: ...; role: ... \} \} \} \}, \{ user: UserWithRole \}\>; getUser: StrictEndpoint\<"/admin/get-user", \{ method: "GET"; query: ZodObject\<\{ id: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, UserWithRole\>; createUser: StrictEndpoint\<"/admin/create-user", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; password: ZodOptional\<(...)\>; name: ZodString; role: ZodOptional\<(...)\>; data: ZodOptional\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ email: ...; password?: ...; name: ...; role?: ...; data?: ... \} \} \} \}, \{ user: UserWithRole \}\>; adminUpdateUser: StrictEndpoint\<"/admin/update-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; data: ZodRecord\<(...), (...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, UserWithRole\>; listUsers: StrictEndpoint\<"/admin/list-users", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodObject\<\{ searchValue: ZodOptional\<(...)\>; searchField: ZodOptional\<(...)\>; searchOperator: ZodOptional\<(...)\>; limit: ZodOptional\<(...)\>; offset: ZodOptional\<(...)\>; sortBy: ZodOptional\<(...)\>; sortDirection: ZodOptional\<(...)\>; filterField: ZodOptional\<(...)\>; filterValue: ZodOptional\<(...)\>; filterOperator: ZodOptional\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ users: UserWithRole\[\]; total: number \}\>; listUserSessions: StrictEndpoint\<"/admin/list-user-sessions", \{ method: "POST"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ sessions: SessionWithImpersonatedBy\[\] \}\>; unbanUser: StrictEndpoint\<"/admin/unban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ user: UserWithRole \}\>; banUser: StrictEndpoint\<"/admin/ban-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\>; banReason: ZodOptional\<(...)\>; banExpiresIn: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ user: UserWithRole \}\>; impersonateUser: StrictEndpoint\<"/admin/impersonate-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: UserWithRole \}\>; stopImpersonating: StrictEndpoint\<"/admin/stop-impersonating", \{ method: "POST"; requireHeaders: true \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) \| (...) \| (...); userAgent?: (...) \| (...) \| (...) \} & Record\<string, any\>; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \}\>; revokeUserSession: StrictEndpoint\<"/admin/revoke-user-session", \{ method: "POST"; body: ZodObject\<\{ sessionToken: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; revokeUserSessions: StrictEndpoint\<"/admin/revoke-user-sessions", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; removeUser: StrictEndpoint\<"/admin/remove-user", \{ method: "POST"; body: ZodObject\<\{ userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; setUserPassword: StrictEndpoint\<"/admin/set-user-password", \{ method: "POST"; body: ZodObject\<\{ newPassword: ZodString; userId: ZodCoercedString\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; summary: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; userHasPermission: StrictEndpoint\<"/admin/has-permission", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ userId: ...; role: ... \}, $strip\>, ZodXor\<readonly \[(...), (...)\]\>\>; metadata: \{ openapi: \{ description: string; requestBody: \{ content: ... \}; responses: \{ 200: ... \} \}; $Infer: \{ body: (...) & (...) \} \} \}, \{ error: null; success: boolean \}\> \}; $ERROR\_CODES: \{ USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL: RawError\<"USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL"\>; FAILED\_TO\_CREATE\_USER: RawError\<"FAILED\_TO\_CREATE\_USER"\>; USER\_ALREADY\_EXISTS: RawError\<"USER\_ALREADY\_EXISTS"\>; YOU\_CANNOT\_BAN\_YOURSELF: RawError\<"YOU\_CANNOT\_BAN\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD"\>; BANNED\_USER: RawError\<"BANNED\_USER"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER"\>; NO\_DATA\_TO\_UPDATE: RawError\<"NO\_DATA\_TO\_UPDATE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS"\>; YOU\_CANNOT\_REMOVE\_YOURSELF: RawError\<"YOU\_CANNOT\_REMOVE\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE"\>; YOU\_CANNOT\_IMPERSONATE\_ADMINS: RawError\<"YOU\_CANNOT\_IMPERSONATE\_ADMINS"\>; INVALID\_ROLE\_TYPE: RawError\<"INVALID\_ROLE\_TYPE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL"\>; PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER: RawError\<"PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER"\> \}; schema: \{ user: \{ fields: \{ role: \{ type: "string"; required: false; input: false \}; banned: \{ type: "boolean"; defaultValue: false; required: false; input: false \}; banReason: \{ type: "string"; required: false; input: false \}; banExpires: \{ type: "date"; required: false; input: false \} \} \}; session: \{ fields: \{ impersonatedBy: \{ type: "string"; required: false; input: false \} \} \} \}; options: NoInfer\<AdminOptions\> \} \| DefaultOrganizationPlugin\<\{ allowUserToCreateOrganization?: boolean \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\>) =\> Awaitable\<boolean\>); organizationLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\>) =\> Awaitable\<boolean\>); creatorRole?: string; membershipLimit?: number \| ((user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \}, organization: \{ id: string; name: string; slug: string; logo?: string \| null; metadata?: any; createdAt: Date \}) =\> number \| Promise\<number\>); ac?: AccessControl; roles?: \{ \[key: string\]: Role\<any\> \| undefined \}; dynamicAccessControl?: \{ enabled?: boolean; maximumRolesPerOrganization?: number \| ((organizationId: string) =\> Awaitable\<(...)\>) \}; teams?: \{ enabled: boolean; defaultTeam?: \{ enabled: boolean; customCreateDefaultTeam?: (...) \| (...) \}; maximumTeams?: number \| ((data: \{ organizationId: ...; session: ... \}, ctx?: (...) \| (...)) =\> Awaitable\<(...)\>); maximumMembersPerTeam?: number \| ((data: \{ teamId: ...; session: ...; organizationId: ... \}) =\> Awaitable\<(...)\>); allowRemovingAllTeams?: boolean \}; invitationExpiresIn?: number; invitationLimit?: number \| ((data: \{ user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\>; organization: \{ id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... \} & Record\<(...), (...)\>; member: \{ id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... \} & Record\<(...), (...)\> \}, ctx: AuthContext) =\> Awaitable\<number\>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: \{ id: string; role: string; email: string; organization: \{ id: string; name: string; slug: string; logo?: (...) \| (...) \| (...); metadata?: any; createdAt: Date \}; invitation: \{ id: string; organizationId: string; email: string; role: string; status: (...) \| (...) \| (...) \| (...); teamId?: (...) \| (...) \| (...); inviterId: string; expiresAt: Date; createdAt: Date \}; inviter: \{ id: ...; organizationId: ...; userId: ...; role: ...; createdAt: ... \} & \{ user: ... \} \}, request?: Request) =\> Promise\<void\>; schema?: \{ session?: \{ fields?: (...) \| (...) \}; organization?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; member?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; invitation?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; team?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \}; teamMember?: \{ modelName?: (...) \| (...); fields?: (...) \| (...) \}; organizationRole?: \{ modelName?: (...) \| (...); fields?: (...) \| (...); additionalFields?: (...) \| (...) \} \}; disableOrganizationDeletion?: boolean; organizationHooks?: \{ beforeCreateOrganization?: (data: \{ organization: ...; user: ... \}) =\> Promise\<(...)\>; afterCreateOrganization?: (data: \{ organization: ...; member: ...; user: ... \}) =\> Promise\<(...)\>; beforeUpdateOrganization?: (data: \{ organization: ...; user: ...; member: ... \}) =\> Promise\<(...)\>; afterUpdateOrganization?: (data: \{ organization: ...; user: ...; member: ... \}) =\> Promise\<(...)\>; beforeDeleteOrganization?: (data: \{ organization: ...; user: ... \}, ctx?: (...) \| (...)) =\> Promise\<(...)\>; afterDeleteOrganization?: (data: \{ organization: ...; user: ... \}, ctx?: (...) \| (...)) =\> Promise\<(...)\>; beforeAddMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAddMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRemoveMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRemoveMember?: (data: \{ member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeUpdateMemberRole?: (data: \{ member: ...; newRole: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterUpdateMemberRole?: (data: \{ member: ...; previousRole: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCreateInvitation?: (data: \{ invitation: ...; inviter: ...; organization: ... \}) =\> Promise\<(...)\>; afterCreateInvitation?: (data: \{ invitation: ...; inviter: ...; organization: ... \}) =\> Promise\<(...)\>; beforeAcceptInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAcceptInvitation?: (data: \{ invitation: ...; member: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRejectInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRejectInvitation?: (data: \{ invitation: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCancelInvitation?: (data: \{ invitation: ...; cancelledBy: ...; organization: ... \}) =\> Promise\<(...)\>; afterCancelInvitation?: (data: \{ invitation: ...; cancelledBy: ...; organization: ... \}) =\> Promise\<(...)\>; beforeCreateTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; afterCreateTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; beforeUpdateTeam?: (data: \{ team: ...; updates: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterUpdateTeam?: (data: \{ team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeDeleteTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; afterDeleteTeam?: (data: \{ team: ...; user?: ...; organization: ... \}) =\> Promise\<(...)\>; beforeAddTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterAddTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; beforeRemoveTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\>; afterRemoveTeamMember?: (data: \{ teamMember: ...; team: ...; user: ...; organization: ... \}) =\> Promise\<(...)\> \} \}\>)\[\]\] | - | - | [src/convex/client/index.ts:937](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L937) |
| `createAuth()` | (`ctx`) => `Auth`\<\{ `appName?`: `string`; `baseURL?`: `BaseURLConfig`; `secret?`: `string`; `secrets?`: \{ `version`: `number`; `value`: `string`; \}[]; `secondaryStorage?`: `SecondaryStorage`; `emailVerification?`: \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \}; `socialProviders?`: `SocialProviders`; `session?`: `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"compact"` \| `"jwt"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: ...; \}; `version?`: `string` \| ((`session`, `user`) => ...) \| ((`session`, `user`) => ...); \}; `freshAge?`: `number`; \}; `account?`: `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: ...[] \| ((`request?`) => ...); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \}; `verification?`: `BetterAuthDBOptions`\<`"verification"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<..., ...\>; \}; `storeInDatabase?`: `boolean`; \}; `trustedOrigins?`: \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>); `rateLimit?`: `BetterAuthRateLimitOptions`; `advanced?`: `BetterAuthAdvancedOptions`; `logger?`: `Logger`; `databaseHooks?`: \{ `user?`: \{ `create?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `update?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `delete?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; \}; `session?`: \{ `create?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `update?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `delete?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; \}; `account?`: \{ `create?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `update?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `delete?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; \}; `verification?`: \{ `create?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `update?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `delete?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; \}; \}; `onAPIError?`: \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: ... \| ...; `foreground?`: ... \| ...; `primary?`: ... \| ...; `primaryForeground?`: ... \| ...; `mutedForeground?`: ... \| ...; `border?`: ... \| ...; `destructive?`: ... \| ...; `titleBorder?`: ... \| ...; `titleColor?`: ... \| ...; `gridColor?`: ... \| ...; `cardBackground?`: ... \| ...; `cornerBorder?`: ... \| ...; \}; `size?`: \{ `radiusSm?`: ... \| ...; `radiusMd?`: ... \| ...; `radiusLg?`: ... \| ...; `textSm?`: ... \| ...; `text2xl?`: ... \| ...; `text4xl?`: ... \| ...; `text6xl?`: ... \| ...; \}; `font?`: \{ `defaultFamily?`: ... \| ...; `monoFamily?`: ... \| ...; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \}; `hooks?`: \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \}; `disabledPaths?`: `string`[]; `telemetry?`: \{ `enabled?`: `boolean`; `debug?`: `boolean`; \}; `experimental?`: \{ `joins?`: `boolean`; \}; `basePath`: `string`; `database`: `AdapterFactory`\<`BetterAuthOptions`\>; `emailAndPassword`: \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \}; `user`: \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \}; `plugins`: \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => ...; \} \| \{ `matcher`: (`ctx`) => ...; `handler`: (`inputContext`) => ...; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<...\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: ...; `responses`: ...; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: ...; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: ...; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => ...[]; `metadata`: \{ `openapi`: \{ `description`: ...; `responses`: ...; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; use: (...)\[\]; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ otp: ... \} \| \{ otp: ... \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ status: ...; token: ...; user: ... \} \| \{ status: ...; token: ...; user: ... \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ token: string; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: ...) =\> ... \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: (...)\[\]; query: ZodOptional\<(...)\>; metadata: \{ openapi: ... \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: ... \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ...; $Infer: ... \} \}, \{ session: \{ id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... \}; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: (...)\[\]; metadata: \{ openapi: ... \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: ...; required: ... \}; publicKey: \{ type: ...; required: ... \}; userId: \{ type: ...; references: ...; required: ...; index: ... \}; credentialID: \{ type: ...; required: ...; index: ... \}; counter: \{ type: ...; required: ... \}; deviceType: \{ type: ...; required: ... \}; backedUp: \{ type: ...; required: ... \}; transports: \{ type: ...; required: ... \}; createdAt: \{ type: ...; required: ... \}; aaguid: \{ type: ...; required: ... \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \} \| \{ id: "admin"; version: string; init: any; hooks: \{ after: \{ matcher: any; handler: (inputContext: ...) =\> ... \}\[\] \}; endpoints: \{ setRole: StrictEndpoint\<"/admin/set-role", \{ method: "POST"; body: ZodObject\<(...), (...)\>; requireHeaders: true; use: (...)\[\]; metadata: \{ openapi: ...; $Infer: ... \} \}, \{ user: UserWithRole \}\>; getUser: StrictEndpoint\<"/admin/get-user", \{ method: "GET"; query: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, UserWithRole\>; createUser: StrictEndpoint\<"/admin/create-user", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ...; $Infer: ... \} \}, \{ user: UserWithRole \}\>; adminUpdateUser: StrictEndpoint\<"/admin/update-user", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, UserWithRole\>; listUsers: StrictEndpoint\<"/admin/list-users", \{ method: "GET"; use: (...)\[\]; query: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ users: (...)\[\]; total: number \}\>; listUserSessions: StrictEndpoint\<"/admin/list-user-sessions", \{ method: "POST"; use: (...)\[\]; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ sessions: (...)\[\] \}\>; unbanUser: StrictEndpoint\<"/admin/unban-user", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ user: UserWithRole \}\>; banUser: StrictEndpoint\<"/admin/ban-user", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ user: UserWithRole \}\>; impersonateUser: StrictEndpoint\<"/admin/impersonate-user", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ session: \{ id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... \}; user: UserWithRole \}\>; stopImpersonating: StrictEndpoint\<"/admin/stop-impersonating", \{ method: "POST"; requireHeaders: true \}, \{ session: (...) & (...); user: (...) & (...) \}\>; revokeUserSession: StrictEndpoint\<"/admin/revoke-user-session", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; revokeUserSessions: StrictEndpoint\<"/admin/revoke-user-sessions", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; removeUser: StrictEndpoint\<"/admin/remove-user", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; setUserPassword: StrictEndpoint\<"/admin/set-user-password", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ status: boolean \}\>; userHasPermission: StrictEndpoint\<"/admin/has-permission", \{ method: "POST"; body: ZodIntersection\<(...), (...)\>; metadata: \{ openapi: ...; $Infer: ... \} \}, \{ error: null; success: boolean \}\> \}; $ERROR\_CODES: \{ USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL: RawError\<"USER\_ALREADY\_EXISTS\_USE\_ANOTHER\_EMAIL"\>; FAILED\_TO\_CREATE\_USER: RawError\<"FAILED\_TO\_CREATE\_USER"\>; USER\_ALREADY\_EXISTS: RawError\<"USER\_ALREADY\_EXISTS"\>; YOU\_CANNOT\_BAN\_YOURSELF: RawError\<"YOU\_CANNOT\_BAN\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CHANGE\_USERS\_ROLE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_CREATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_LIST\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_BAN\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_IMPERSONATE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REVOKE\_USERS\_SESSIONS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_DELETE\_USERS"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_PASSWORD"\>; BANNED\_USER: RawError\<"BANNED\_USER"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_GET\_USER"\>; NO\_DATA\_TO\_UPDATE: RawError\<"NO\_DATA\_TO\_UPDATE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_UPDATE\_USERS"\>; YOU\_CANNOT\_REMOVE\_YOURSELF: RawError\<"YOU\_CANNOT\_REMOVE\_YOURSELF"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_NON\_EXISTENT\_VALUE"\>; YOU\_CANNOT\_IMPERSONATE\_ADMINS: RawError\<"YOU\_CANNOT\_IMPERSONATE\_ADMINS"\>; INVALID\_ROLE\_TYPE: RawError\<"INVALID\_ROLE\_TYPE"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_SET\_USERS\_EMAIL"\>; PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER: RawError\<"PASSWORD\_CANNOT\_BE\_UPDATED\_VIA\_UPDATE\_USER"\> \}; schema: \{ user: \{ fields: \{ role: \{ type: ...; required: ...; input: ... \}; banned: \{ type: ...; defaultValue: ...; required: ...; input: ... \}; banReason: \{ type: ...; required: ...; input: ... \}; banExpires: \{ type: ...; required: ...; input: ... \} \} \}; session: \{ fields: \{ impersonatedBy: \{ type: ...; required: ...; input: ... \} \} \} \}; options: NoInfer\<AdminOptions\> \} \| DefaultOrganizationPlugin\<\{ allowUserToCreateOrganization?: boolean \| ((user: (...) & (...)) =\> Awaitable\<(...)\>); organizationLimit?: number \| ((user: (...) & (...)) =\> Awaitable\<(...)\>); creatorRole?: string; membershipLimit?: number \| ((user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \}, organization: \{ id: ...; name: ...; slug: ...; logo?: ...; metadata?: ...; createdAt: ... \}) =\> (...) \| (...)); ac?: AccessControl; roles?: \{ \[key: string\]: (...) \| (...) \}; dynamicAccessControl?: \{ enabled?: (...) \| (...) \| (...); maximumRolesPerOrganization?: (...) \| (...) \| (...) \}; teams?: \{ enabled: boolean; defaultTeam?: (...) \| (...); maximumTeams?: (...) \| (...) \| (...); maximumMembersPerTeam?: (...) \| (...) \| (...); allowRemovingAllTeams?: (...) \| (...) \| (...) \}; invitationExpiresIn?: number; invitationLimit?: number \| ((data: \{ user: ...; organization: ...; member: ... \}, ctx: AuthContext) =\> Awaitable\<(...)\>); cancelPendingInvitationsOnReInvite?: boolean; requireEmailVerificationOnInvitation?: boolean; sendInvitationEmail?: (data: \{ id: ...; role: ...; email: ...; organization: ...; invitation: ...; inviter: ... \}, request?: (...) \| (...)) =\> Promise\<(...)\>; schema?: \{ session?: (...) \| (...); organization?: (...) \| (...); member?: (...) \| (...); invitation?: (...) \| (...); team?: (...) \| (...); teamMember?: (...) \| (...); organizationRole?: (...) \| (...) \}; disableOrganizationDeletion?: boolean; organizationHooks?: \{ beforeCreateOrganization?: (...) \| (...); afterCreateOrganization?: (...) \| (...); beforeUpdateOrganization?: (...) \| (...); afterUpdateOrganization?: (...) \| (...); beforeDeleteOrganization?: (...) \| (...); afterDeleteOrganization?: (...) \| (...); beforeAddMember?: (...) \| (...); afterAddMember?: (...) \| (...); beforeRemoveMember?: (...) \| (...); afterRemoveMember?: (...) \| (...); beforeUpdateMemberRole?: (...) \| (...); afterUpdateMemberRole?: (...) \| (...); beforeCreateInvitation?: (...) \| (...); afterCreateInvitation?: (...) \| (...); beforeAcceptInvitation?: (...) \| (...); afterAcceptInvitation?: (...) \| (...); beforeRejectInvitation?: (...) \| (...); afterRejectInvitation?: (...) \| (...); beforeCancelInvitation?: (...) \| (...); afterCancelInvitation?: (...) \| (...); beforeCreateTeam?: (...) \| (...); afterCreateTeam?: (...) \| (...); beforeUpdateTeam?: (...) \| (...); afterUpdateTeam?: (...) \| (...); beforeDeleteTeam?: (...) \| (...); afterDeleteTeam?: (...) \| (...); beforeAddTeamMember?: (...) \| (...); afterAddTeamMember?: (...) \| (...); beforeRemoveTeamMember?: (...) \| (...); afterRemoveTeamMember?: (...) \| (...) \} \}\>)\[\]\]; \}\> | `createAuthForContext` | - | [src/convex/client/index.ts:1315](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1315) |
| `getAuthUser` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<`MaybeMakeLooseDataModel`\<\{ \[TableName in string\]: Schema\["tables"\]\[TableName\] extends TableDefinition\<DocumentType, Indexes, SearchIndexes, VectorIndexes\> ? \{ document: Expand\<(...) & (...)\>; fieldPaths: "\_id" \| ExtractFieldPaths\<(...)\>; indexes: Expand\<(...) & (...)\>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes \} : never \}, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\]\>\> | - | - | [src/convex/client/index.ts:1316](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1316) |
| `authConfig` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `invitationPath`: `string` \| `null`; \}\>\> | - | - | [src/convex/client/index.ts:1317](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1317) |
| `listWorkspaces` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\< \| \{ `id`: `string`; `name`: `string`; `slug`: `string`; `logo`: `string` \| `null`; `role`: `string`; `active`: `boolean`; `joinedAt`: `number`; \}[] \| `null`\>\> | - | - | [src/convex/client/index.ts:1318](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1318) |
| `listWorkspaceMembers` | `RegisteredQuery`\<`"public"`, \{ `organizationId?`: `string`; \}, `Promise`\< \| \{ `organizationId`: `string`; `members`: \{ `userId`: `string`; `name`: `string`; `email`: `string`; `role`: `string`; `joinedAt`: `number`; \}[]; \} \| `null`\>\> | - | - | [src/convex/client/index.ts:1319](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1319) |
| `updateProfile` | `RegisteredMutation`\<`"public"`, \{ `name`: `string`; \}, `Promise`\<`null`\>\> | - | - | [src/convex/client/index.ts:1320](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1320) |
| `mcp` | [`McpExchange`](/api-reference/reference/convex/integrations/http#mcpexchange) | `mcpExchange` | - | [src/convex/client/index.ts:1321](https://github.com/qruto/nuxt-backend/blob/main/src/convex/client/index.ts#L1321) |

#### Example

```ts
import { setupAuth } from 'nuxt-backend/auth'
import { components } from './_generated/api'
import { query } from './_generated/server'

export const { authComponent, createAuth, getAuthUser } = setupAuth(
  components, query,
)
```
