---
navigation: true
---

# convex/client

## Interfaces

### AuthMutationCtx

Defined in: [src/convex/client/index.ts:117](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L117)

A DataModel-independent Convex context that can run mutations / queries and
schedule work — what the auth email / rate-limit / lifecycle integrations
receive. Auth email flows execute inside a mutation/action, so the request
ctx is narrowed to one of these. Kept structural (rather than
`GenericMutationCtx<DM>`) so a context for *any* data model is assignable.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="runmutation"></a> `runMutation` | \<`Mutation`\>(`mutation`, ...`args`) => `Promise`\<[`FunctionReturnType`](/api-reference/reference/runtime/vue#functionreturntype)\<`Mutation`\>\> | [src/convex/client/index.ts:118](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L118) |
| <a id="runquery"></a> `runQuery` | \<`Query`\>(`query`, ...`args`) => `Promise`\<[`FunctionReturnType`](/api-reference/reference/runtime/vue#functionreturntype)\<`Query`\>\> | [src/convex/client/index.ts:119](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L119) |
| <a id="scheduler"></a> `scheduler` | `Scheduler` | [src/convex/client/index.ts:120](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L120) |

***

### AuthEmailMessage

Defined in: [src/convex/client/index.ts:124](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L124)

A single transactional email, as understood by the auth flows.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="to"></a> `to` | `string` | [src/convex/client/index.ts:125](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L125) |
| <a id="subject"></a> `subject` | `string` | [src/convex/client/index.ts:126](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L126) |
| <a id="html"></a> `html?` | `string` | [src/convex/client/index.ts:127](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L127) |
| <a id="text"></a> `text?` | `string` | [src/convex/client/index.ts:128](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L128) |

***

### AuthRateLimiter

Defined in: [src/convex/client/index.ts:146](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L146)

Guards auth-sensitive flows. Satisfied by `setupRateLimiter(...)` from
`nuxt-backend/convex/rate-limit` (which seeds these named limits).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="limit"></a> `limit` | (`ctx`, `name`, `options?`) => `Promise`\<\{ `ok`: `boolean`; `retryAfter?`: `number`; \}\> | [src/convex/client/index.ts:147](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L147) |

***

### AuthCreatedUser

Defined in: [src/convex/client/index.ts:155](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L155)

The newly-created user passed to [AuthIntegrations.onUserCreated](#onusercreated-1).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | [src/convex/client/index.ts:156](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L156) |
| <a id="email"></a> `email` | `string` | [src/convex/client/index.ts:157](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L157) |
| <a id="name"></a> `name` | `string` | [src/convex/client/index.ts:158](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L158) |

***

### AuthIntegrations

Defined in: [src/convex/client/index.ts:176](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L176)

Cross-component wiring for Better Auth. All optional and fully backward
compatible: with none supplied, auth behaves exactly as before (OTP logs to
the console). Provide an `email` transport to deliver OTP / verification /
reset emails, a `rateLimiter` to throttle OTP sends, and `onUserCreated` to
run side effects (durable workflows, analytics) on signup.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | `GenericDataModel` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="email-1"></a> `email?` | [`AuthEmailSender`](#authemailsender) | - | [src/convex/client/index.ts:177](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L177) |
| <a id="ratelimiter"></a> `rateLimiter?` | [`AuthRateLimiter`](#authratelimiter) | - | [src/convex/client/index.ts:178](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L178) |
| <a id="onusercreated-1"></a> `onUserCreated?` | [`OnUserCreated`](#onusercreated)\<`DM`\> | - | [src/convex/client/index.ts:179](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L179) |
| <a id="emailtemplates"></a> `emailTemplates?` | `Partial`\<[`AuthEmailTemplates`](#authemailtemplates)\> | Override any of the default auth-email templates (welcome/otp/verify/change/delete). | [src/convex/client/index.ts:181](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L181) |

***

### AuthEmailTemplates

Defined in: [src/convex/client/index.ts:250](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L250)

The default transactional auth-email templates, all delivered through the
nested Resend component. Override any of them via
`integrations.emailTemplates` to restyle without replacing the transport.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="otp"></a> `otp` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | OTP code email (sign-in / email-verification / change-email). | [src/convex/client/index.ts:252](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L252) |
| <a id="welcome"></a> `welcome` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | Welcome email sent once, right after a user is created. | [src/convex/client/index.ts:254](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L254) |
| <a id="verify"></a> `verify` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | Email-verification link (when verification is enabled). | [src/convex/client/index.ts:256](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L256) |
| <a id="changeemail"></a> `changeEmail` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | Confirmation sent to the current address when changing email. | [src/convex/client/index.ts:258](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L258) |
| <a id="deleteaccount"></a> `deleteAccount` | (`data`) => [`AuthEmailMessage`](#authemailmessage) | Confirmation link for account deletion. | [src/convex/client/index.ts:260](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L260) |

***

### CreateBetterAuthOptions

Defined in: [src/convex/client/index.ts:320](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L320)

#### Extended by

- [`SetupAuthOptions`](#setupauthoptions)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="authconfig"></a> `authConfig?` | `AuthConfig` | Override the default auth config (e.g. to add custom providers) | [src/convex/client/index.ts:322](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L322) |
| <a id="authoptions"></a> `authOptions?` | `BetterAuthOptions` | Override Better Auth options (merged with defaults) | [src/convex/client/index.ts:324](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L324) |
| <a id="basepath"></a> `basePath?` | `string` | Override Better Auth basePath and matching Convex auth route | [src/convex/client/index.ts:326](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L326) |

***

### SetupAuthOptions

Defined in: [src/convex/client/index.ts:329](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L329)

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
| <a id="authconfig-1"></a> `authConfig?` | `AuthConfig` | Override the default auth config (e.g. to add custom providers) | [`CreateBetterAuthOptions`](#createbetterauthoptions).[`authConfig`](#authconfig) | [src/convex/client/index.ts:322](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L322) |
| <a id="authoptions-1"></a> `authOptions?` | `BetterAuthOptions` | Override Better Auth options (merged with defaults) | [`CreateBetterAuthOptions`](#createbetterauthoptions).[`authOptions`](#authoptions) | [src/convex/client/index.ts:324](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L324) |
| <a id="basepath-1"></a> `basePath?` | `string` | Override Better Auth basePath and matching Convex auth route | [`CreateBetterAuthOptions`](#createbetterauthoptions).[`basePath`](#basepath) | [src/convex/client/index.ts:326](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L326) |
| <a id="schema-1"></a> `schema?` | `Schema` | Local Better Auth schema for hybrid/local component installs | - | [src/convex/client/index.ts:334](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L334) |
| <a id="verbose"></a> `verbose?` | `boolean` | Enable verbose logs in the Better Auth Convex component client | - | [src/convex/client/index.ts:336](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L336) |
| <a id="integrations"></a> `integrations?` | [`AuthIntegrations`](#authintegrations)\<`DM`\> | Cross-component wiring: an email transport for auth emails, a rate limiter for OTP sends, and an `onUserCreated` hook. See [AuthIntegrations](#authintegrations). | - | [src/convex/client/index.ts:341](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L341) |

## Type Aliases

### AuthEmailSender

```ts
type AuthEmailSender = (ctx, message) => Promise<unknown>;
```

Defined in: [src/convex/client/index.ts:137](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L137)

Sends an auth-related email. By default this is wired automatically to the
Resend component nested inside `backend` (`components.backend.email.send`),
so auth OTP / verification / reset email works out of the box — but any
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
type AuthRateLimitName = "emailOtp" | "signIn" | "signUp" | "passwordReset";
```

Defined in: [src/convex/client/index.ts:140](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L140)

The named rate limits the auth flows consult (a subset of the defaults).

***

### OnUserCreated

```ts
type OnUserCreated<DM> = (ctx, user) => Promise<void>;
```

Defined in: [src/convex/client/index.ts:166](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L166)

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
        strategy?: "jwt" | "compact" | "jwe";
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
  verification?: BetterAuthDBOptions<"verification", "createdAt" | "updatedAt" | "id" | "expiresAt" | "value" | "identifier"> & {
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
     fields?: Partial<Record<"name" | "createdAt" | "updatedAt" | "email" | "emailVerified" | "image", string>>;
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
  }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { status: boolean; token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> } | { status: boolean; token: null; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ZodString; otp: ZodString; name: ZodOptional<(...)>; image: ZodOptional<(...)> }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<ZodString> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ZodOptional<(...)>; name: ZodOptional<(...)>; context: ZodOptional<(...)> }, $strip>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; parameters: ...; content: ... } } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<ZodString> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... }; 400: { description: ... } } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<ZodAny, ZodAny> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } }; $Infer: { body: { response: AuthenticationResponseJSON } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>) | ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>))[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>) | ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>))[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined })[]];
};
```

Defined in: [src/convex/client/index.ts:425](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L425)

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
| `appName?` | `string` | - | The name of your application. Used as a display name in contexts where your app needs to be identified — for example, as the default issuer name in authenticator apps when users set up 2FA/TOTP. Can also be set via the `APP_NAME` environment variable. **Default** `"Better Auth"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:357 |
| `baseURL?` | `BaseURLConfig` | - | Base URL for the Better Auth. This is typically the root URL where your application server is hosted. Can be configured as: - A static string: `"https://myapp.com"` - A dynamic config with allowed hosts for multi-domain deployments If not explicitly set, the system will check environment variables: `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, etc. **Example** `// Static URL baseURL: "https://myapp.com" // Dynamic with allowed hosts (for Vercel, multi-domain, etc.) baseURL: { allowedHosts: ["myapp.com", "*.vercel.app", "preview-*.myapp.com"], fallback: "https://myapp.com" }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:381 |
| `secret?` | `string` | - | The secret to use for encryption, signing and hashing. By default Better Auth will look for the following environment variables: process.env.BETTER_AUTH_SECRET, process.env.AUTH_SECRET If none of these environment variables are set, it will default to "better-auth-secret-123456789". on production if it's not set it will throw an error. you can generate a good secret using the following command: **Example** `openssl rand -base64 32` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:413 |
| `secrets?` | \{ `version`: `number`; `value`: `string`; \}[] | - | Versioned secrets for non-destructive secret rotation. When set, encryption uses an envelope format with key IDs. First entry is the current key used for new encryption. Remaining entries are decryption-only (previous rotations). Can also be set via BETTER_AUTH_SECRETS env var: `BETTER_AUTH_SECRETS=2:base64secret,1:base64secret` When set, `secret` is only used as legacy fallback for decrypting bare-hex payloads that predate the envelope format. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:426 |
| `secondaryStorage?` | `SecondaryStorage` | - | Secondary storage configuration This is used to store session and rate limit data. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:491 |
| `emailVerification?` | \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \} | - | Email verification configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:495 |
| `emailVerification.sendVerificationEmail()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:501 |
| `emailVerification.sendOnSignUp?` | `boolean` | - | Send a verification email automatically after sign up. - `true`: Always send verification email on sign up - `false`: Never send verification email on sign up - `undefined`: Follows `requireEmailVerification` behavior **Default** `undefined` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:527 |
| `emailVerification.sendOnSignIn?` | `boolean` | - | Send a verification email automatically on sign in when the user's email is not verified **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:534 |
| `emailVerification.autoSignInAfterVerification?` | `boolean` | - | Auto signin the user after they verify their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:538 |
| `emailVerification.expiresIn?` | `number` | - | Number of seconds the verification token is valid for. **Default** `3600 seconds (1 hour)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:544 |
| `emailVerification.beforeEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user verifies their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:550 |
| `emailVerification.afterEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called when a user's email is updated to verified | node\_modules/@better-auth/core/dist/types/init-options.d.mts:556 |
| `socialProviders?` | `SocialProviders` | - | list of social providers | node\_modules/@better-auth/core/dist/types/init-options.d.mts:707 |
| `session?` | `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"jwt"` \| `"compact"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: `number`; \}; `version?`: \| `string` \| ((`session`, `user`) => `string`) \| ((`session`, `user`) => `Promise`\<`string`\>); \}; `freshAge?`: `number`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:782 |
| `account?` | `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: \| `LiteralUnion`\< \| `"github"` \| `"apple"` \| `"atlassian"` \| `"cognito"` \| `"discord"` \| `"facebook"` \| `"figma"` \| `"microsoft"` \| `"google"` \| `"huggingface"` \| `"slack"` \| `"spotify"` \| `"twitch"` \| `"twitter"` \| `"dropbox"` \| `"kick"` \| `"linear"` \| `"linkedin"` \| `"gitlab"` \| `"tiktok"` \| `"reddit"` \| `"roblox"` \| `"salesforce"` \| `"vk"` \| `"zoom"` \| `"notion"` \| `"kakao"` \| `"naver"` \| `"line"` \| `"paybin"` \| `"paypal"` \| `"polar"` \| `"railway"` \| `"vercel"` \| `"wechat"` \| `"email-password"`, `string`\>[] \| ((`request?`) => `Awaitable`\<`LiteralUnion`\<..., ...\>[]\>); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:910 |
| `verification?` | `BetterAuthDBOptions`\<`"verification"`, `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>; \}; `storeInDatabase?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1046 |
| `trustedOrigins?` | \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>) | - | Additional trusted origins. By default, Better Auth trusts your app's [baseURL](#createbetterauthoptions-3). Use this option to allow additional origins (e.g. a separate frontend domain). Can be a static array, a function that returns origins dynamically, or use wildcard patterns (e.g. `"https://*.example.com"`). **Param** **request** The request object. It'll be undefined if no request was made. Like during a create context call or `auth.api` call. Trusted origins will be dynamically calculated based on the request. **Example** `trustedOrigins: async (request) => { return [ "https://better-auth.com", "https://*.better-auth.com", request.headers.get("x-custom-origin") ]; }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1097 |
| `rateLimit?` | `BetterAuthRateLimitOptions` | - | Rate limiting configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1101 |
| `advanced?` | `BetterAuthAdvancedOptions` | - | Advanced options | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1105 |
| `logger?` | `Logger` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1106 |
| `databaseHooks?` | \{ `user?`: \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; \}; `session?`: \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; \}; `account?`: \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; \}; `verification?`: \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; \}; \} | - | allows you to define custom hooks that can be executed during lifecycle of core database operations. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1112 |
| `databaseHooks.user?` | \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; \} | - | User hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1116 |
| `databaseHooks.user.create?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1117 |
| `databaseHooks.user.create.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is created. if the hook returns false, the user will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1123 |
| `databaseHooks.user.create.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1129 |
| `databaseHooks.user.update?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1131 |
| `databaseHooks.user.update.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is updated. if the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1137 |
| `databaseHooks.user.update.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1143 |
| `databaseHooks.user.delete?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1145 |
| `databaseHooks.user.delete.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a user is deleted. if the hook returns false, the user will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1150 |
| `databaseHooks.user.delete.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1154 |
| `databaseHooks.session?` | \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; \} | - | Session Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1160 |
| `databaseHooks.session.create?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1161 |
| `databaseHooks.session.create.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a session is created. if the hook returns false, the session will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1167 |
| `databaseHooks.session.create.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1173 |
| `databaseHooks.session.update?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1178 |
| `databaseHooks.session.update.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is updated. if the hook returns false, the session will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1184 |
| `databaseHooks.session.update.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1190 |
| `databaseHooks.session.delete?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1192 |
| `databaseHooks.session.delete.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a session is deleted. if the hook returns false, the session will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1197 |
| `databaseHooks.session.delete.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1201 |
| `databaseHooks.account?` | \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; \} | - | Account Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1207 |
| `databaseHooks.account.create?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1208 |
| `databaseHooks.account.create.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a account is created. If the hook returns false, the account will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1214 |
| `databaseHooks.account.create.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a account is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1220 |
| `databaseHooks.account.update?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1225 |
| `databaseHooks.account.update.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a account is update. If the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1231 |
| `databaseHooks.account.update.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a account is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1237 |
| `databaseHooks.account.delete?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1239 |
| `databaseHooks.account.delete.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before an account is deleted. if the hook returns false, the account will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1244 |
| `databaseHooks.account.delete.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after an account is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1248 |
| `databaseHooks.verification?` | \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; \} | - | Verification Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1254 |
| `databaseHooks.verification.create?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1255 |
| `databaseHooks.verification.create.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a verification is created. if the hook returns false, the verification will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1261 |
| `databaseHooks.verification.create.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1267 |
| `databaseHooks.verification.update?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1269 |
| `databaseHooks.verification.update.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a verification is updated. if the hook returns false, the verification will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1275 |
| `databaseHooks.verification.update.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1281 |
| `databaseHooks.verification.delete?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1283 |
| `databaseHooks.verification.delete.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a verification is deleted. if the hook returns false, the verification will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1288 |
| `databaseHooks.verification.delete.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1292 |
| `onAPIError?` | \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \} | - | API error handling | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1299 |
| `onAPIError.throw?` | `boolean` | - | Throw an error on API error **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1305 |
| `onAPIError.onError()?` | (`error`, `ctx`) => `void` \| `Promise`\<`void`\> | - | Custom error handler | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1312 |
| `onAPIError.errorURL?` | `string` | - | The URL to redirect to on error When errorURL is provided, the error will be added to the URL as a query parameter and the user will be redirected to the errorURL. **Default** `- "/api/auth/error"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1321 |
| `onAPIError.customizeDefaultErrorPage?` | \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \} | - | Configure the default error page provided by Better-Auth Start your dev server and go to /api/auth/error to see the error page. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1326 |
| `onAPIError.customizeDefaultErrorPage.colors?` | \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1327 |
| `onAPIError.customizeDefaultErrorPage.colors.background?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1328 |
| `onAPIError.customizeDefaultErrorPage.colors.foreground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1329 |
| `onAPIError.customizeDefaultErrorPage.colors.primary?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1330 |
| `onAPIError.customizeDefaultErrorPage.colors.primaryForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1331 |
| `onAPIError.customizeDefaultErrorPage.colors.mutedForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1332 |
| `onAPIError.customizeDefaultErrorPage.colors.border?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1333 |
| `onAPIError.customizeDefaultErrorPage.colors.destructive?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1334 |
| `onAPIError.customizeDefaultErrorPage.colors.titleBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1335 |
| `onAPIError.customizeDefaultErrorPage.colors.titleColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1336 |
| `onAPIError.customizeDefaultErrorPage.colors.gridColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1337 |
| `onAPIError.customizeDefaultErrorPage.colors.cardBackground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1338 |
| `onAPIError.customizeDefaultErrorPage.colors.cornerBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1339 |
| `onAPIError.customizeDefaultErrorPage.size?` | \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1341 |
| `onAPIError.customizeDefaultErrorPage.size.radiusSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1342 |
| `onAPIError.customizeDefaultErrorPage.size.radiusMd?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1343 |
| `onAPIError.customizeDefaultErrorPage.size.radiusLg?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1344 |
| `onAPIError.customizeDefaultErrorPage.size.textSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1345 |
| `onAPIError.customizeDefaultErrorPage.size.text2xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1346 |
| `onAPIError.customizeDefaultErrorPage.size.text4xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1347 |
| `onAPIError.customizeDefaultErrorPage.size.text6xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1348 |
| `onAPIError.customizeDefaultErrorPage.font?` | \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1350 |
| `onAPIError.customizeDefaultErrorPage.font.defaultFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1351 |
| `onAPIError.customizeDefaultErrorPage.font.monoFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1352 |
| `onAPIError.customizeDefaultErrorPage.disableTitleBorder?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1354 |
| `onAPIError.customizeDefaultErrorPage.disableCornerDecorations?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1355 |
| `onAPIError.customizeDefaultErrorPage.disableBackgroundGrid?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1356 |
| `hooks?` | \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \} | - | Hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1362 |
| `hooks.before()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | Before a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1366 |
| `hooks.after()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | After a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1370 |
| `disabledPaths?` | `string`[] | - | Disabled paths Paths you want to disable. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1377 |
| `telemetry?` | \{ `enabled?`: `boolean`; `debug?`: `boolean`; \} | - | Telemetry configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1381 |
| `telemetry.enabled?` | `boolean` | - | Enable telemetry collection **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1387 |
| `telemetry.debug?` | `boolean` | - | Enable debug mode **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1393 |
| `experimental?` | \{ `joins?`: `boolean`; \} | - | Experimental features | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1398 |
| `experimental.joins?` | `boolean` | - | Enable experimental joins for your database adapter. 	Please read the adapter documentation for more information regarding joins before enabling this. 	Not all adapters support joins. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1407 |
| `basePath` | `string` | `resolvedBasePath` | - | [src/convex/client/index.ts:496](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L496) |
| `database` | `AdapterFactory`\<`BetterAuthOptions`\> | - | - | [src/convex/client/index.ts:497](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L497) |
| `emailAndPassword` | \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \} | - | - | [src/convex/client/index.ts:499](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L499) |
| `emailAndPassword.disableSignUp?` | `boolean` | - | Disable email and password sign up **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:573 |
| `emailAndPassword.requireEmailVerification?` | `boolean` | - | Require email verification before a session can be created for the user. if the user is not verified, the user will not be able to sign in and on sign in attempts, the user will be prompted to verify their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:581 |
| `emailAndPassword.maxPasswordLength?` | `number` | - | The maximum length of the password. **Default** `128` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:587 |
| `emailAndPassword.minPasswordLength?` | `number` | - | The minimum length of the password. **Default** `8` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:593 |
| `emailAndPassword.sendResetPassword()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | send reset password | node\_modules/@better-auth/core/dist/types/init-options.d.mts:597 |
| `emailAndPassword.resetPasswordTokenExpiresIn?` | `number` | - | Number of seconds the reset password token is valid for. **Default** `1 hour (60 * 60)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:619 |
| `emailAndPassword.onPasswordReset()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user's password is changed successfully. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:624 |
| `emailAndPassword.password?` | \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \} | - | Password hashing and verification By default Scrypt is used for password hashing and verification. You can provide your own hashing and verification function. if you want to use a different algorithm. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:635 |
| `emailAndPassword.password.hash()?` | (`password`) => `Promise`\<`string`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:636 |
| `emailAndPassword.password.verify()?` | (`data`) => `Promise`\<`boolean`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:637 |
| `emailAndPassword.autoSignIn?` | `boolean` | - | Automatically sign in the user after sign up **Default** `true` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:647 |
| `emailAndPassword.revokeSessionsOnPasswordReset?` | `boolean` | - | Whether to revoke all other sessions when resetting password **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:652 |
| `emailAndPassword.onExistingUserSignUp()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user tries to sign up with an email that already exists. Useful for notifying the existing user that someone attempted to register with their email. This is only called when `requireEmailVerification: true` or `autoSignIn: false`. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:660 |
| `emailAndPassword.customSyntheticUser()?` | (`params`) => `Record`\<`string`, `unknown`\> | - | Build a custom synthetic user for email enumeration protection. When a sign-up attempt is made with an email that already exists, this function is called to build the fake user response. Use this when plugins add fields to the user table (e.g. admin plugin adds `role`, `banned`, etc.) to ensure the fake response is indistinguishable from a real sign-up. **Example** `customSyntheticUser: ({ coreFields, additionalFields, id }) => ({ ...coreFields, role: "user", banned: false, banReason: null, banExpires: null, ...additionalFields, id, })` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:691 |
| `emailAndPassword.enabled` | `boolean` | `false` | Enable email and password authentication **Default** `false` | [src/convex/client/index.ts:500](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L500) |
| `user` | \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \} | - | - | [src/convex/client/index.ts:505](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L505) |
| `user.modelName?` | `"user"` \| `LiteralString` | - | The name of the model. Defaults to the model name. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:125 |
| `user.fields?` | `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\> | - | Map fields to database columns | node\_modules/@better-auth/core/dist/types/init-options.d.mts:129 |
| `user.additionalFields?` | \{ \[`key`: `string`\]: `DBFieldAttribute`; \} | - | Additional fields for the model | node\_modules/@better-auth/core/dist/types/init-options.d.mts:133 |
| `user.changeEmail?` | \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \} | - | Changing email configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:719 |
| `user.changeEmail.enabled` | `boolean` | - | Enable changing email **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:724 |
| `user.changeEmail.sendChangeEmailConfirmation()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a confirmation email to the old email address when the user changes their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:730 |
| `user.changeEmail.updateEmailWithoutVerification?` | `boolean` | - | Update the email without verification if the user is not verified. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:740 |
| `user.deleteUser?` | \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \} | - | User deletion configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:745 |
| `user.deleteUser.enabled?` | `boolean` | - | Enable user deletion | node\_modules/@better-auth/core/dist/types/init-options.d.mts:749 |
| `user.deleteUser.sendDeleteAccountVerification()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email when the user deletes their account. if this is not set, the user will be deleted immediately. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:757 |
| `user.deleteUser.beforeDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user is deleted. to interrupt with error you can throw `APIError` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:767 |
| `user.deleteUser.afterDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called after a user is deleted. This is useful for cleaning up user data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:773 |
| `user.deleteUser.deleteTokenExpiresIn?` | `number` | - | The expiration time for the delete token. **Default** `1 day (60 * 60 * 24) in seconds` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:779 |
| `plugins` | \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => `Promise`\< \| \{ `context`: ...; \} \| `undefined`\>; \} \| \{ `matcher`: (`ctx`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<\{ `context`: `MiddlewareContext`\<..., ...\>; \}\>; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<`unknown`\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: `string`; `content`: \{ `application/json`: ...; \}; \}; \}; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => `Promise`\<\{ `session`: \{ `session`: ...; `user`: ...; \}; \}\>[]; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: `string`; `content`: \{ `application/json`: ...; \}; \}; \}; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ status: boolean; token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \} \| \{ status: boolean; token: null; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ZodString; otp: ZodString; name: ZodOptional\<(...)\>; image: ZodOptional\<(...)\> \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<ZodString\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ZodOptional\<(...)\>; name: ZodOptional\<(...)\>; context: ZodOptional\<(...)\> \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; parameters: ...; content: ... \} \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<ZodString\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \}; 400: \{ description: ... \} \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<ZodAny, ZodAny\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \}; $Infer: \{ body: \{ response: AuthenticationResponseJSON \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>) \| ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>) \| ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \})\[\]\] | - | - | [src/convex/client/index.ts:520](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L520) |

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
        strategy?: "jwt" | "compact" | "jwe";
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
  verification?: BetterAuthDBOptions<"verification", "createdAt" | "updatedAt" | "id" | "expiresAt" | "value" | "identifier"> & {
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
     fields?: Partial<Record<"name" | "createdAt" | "updatedAt" | "email" | "emailVerified" | "image", string>>;
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
  }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean; token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> } | { status: boolean; token: null; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ...; otp: ...; name: ...; image: ... }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ...; name: ...; context: ... }, $strip>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ...; 400: ... } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<(...), (...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } }; $Infer: { body: { response: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined })[]];
}>;
```

Defined in: [src/convex/client/index.ts:539](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L539)

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
        `strategy?`: `"jwt"` \| `"compact"` \| `"jwe"`;
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
  `verification?`: `BetterAuthDBOptions`\<`"verification"`, `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\> & \{
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
     `fields?`: `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\>;
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
  \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean; token: string; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \} \| \{ status: boolean; token: null; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ...; otp: ...; name: ...; image: ... \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ...; name: ...; context: ... \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ...; 400: ... \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<(...), (...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ response: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \})\[\]\];
\}\>

***

### createAuthOptions()

```ts
function createAuthOptions<DM, Schema>(
   ctx, 
   componentRef, 
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
        strategy?: "jwt" | "compact" | "jwe";
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
  verification?: BetterAuthDBOptions<"verification", "createdAt" | "updatedAt" | "id" | "expiresAt" | "value" | "identifier"> & {
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
     fields?: Partial<Record<"name" | "createdAt" | "updatedAt" | "email" | "emailVerified" | "image", string>>;
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
  }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... }>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { status: boolean; token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> } | { status: boolean; token: null; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } & Record<string, any> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ZodString; otp: ZodString; name: ZodOptional<(...)>; image: ZodOptional<(...)> }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<ZodString> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ZodOptional<(...)>; name: ZodOptional<(...)>; context: ZodOptional<(...)> }, $strip>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; parameters: ...; content: ... } } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<ZodString> }, $strip>; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... }; 400: { description: ... } } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<ZodAny, ZodAny> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: { description: ...; content: ... } } }; $Infer: { body: { response: AuthenticationResponseJSON } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{ session: ... }>)[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>) | ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>))[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>) | ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>))[]; metadata: { openapi: { description: string; responses: { 200: { description: ...; content: ... } } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined })[]];
};
```

Defined in: [src/convex/client/index.ts:546](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L546)

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | - |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `true`\> | `SchemaDefinition`\<\{ `user`: `TableDefinition`\<`VObject`\<\{ `image?`: `string` \| `null`; `name`: `string`; `createdAt`: `number`; `updatedAt`: `number`; `email`: `string`; `emailVerified`: `boolean`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `emailVerified`: `VBoolean`\<`boolean`, `"required"`\>; `image`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`\>, \{ `email_name`: \[`"email"`, `"name"`, `"_creationTime"`\]; `name`: \[`"name"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `session`: `TableDefinition`\<`VObject`\<\{ `ipAddress?`: `string` \| `null`; `userAgent?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `expiresAt`: `number`; `token`: `string`; \}, \{ `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `token`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `ipAddress`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userAgent`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VString`\<`string`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `expiresAt_userId`: \[`"expiresAt"`, `"userId"`, `"_creationTime"`\]; `token`: \[`"token"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `account`: `TableDefinition`\<`VObject`\<\{ `password?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `idToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `scope?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `accountId`: `string`; `providerId`: `string`; \}, \{ `accountId`: `VString`\<`string`, `"required"`\>; `providerId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `idToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `scope`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `password`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\>, \{ `accountId`: \[`"accountId"`, `"_creationTime"`\]; `accountId_providerId`: \[`"accountId"`, `"providerId"`, `"_creationTime"`\]; `providerId_userId`: \[`"providerId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `verification`: `TableDefinition`\<`VObject`\<\{ `createdAt`: `number`; `updatedAt`: `number`; `expiresAt`: `number`; `value`: `string`; `identifier`: `string`; \}, \{ `identifier`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"createdAt"` \| `"updatedAt"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `identifier`: \[`"identifier"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `rateLimit`: `TableDefinition`\<`VObject`\<\{ `key`: `string`; `count`: `number`; `lastRequest`: `number`; \}, \{ `key`: `VString`\<`string`, `"required"`\>; `count`: `VFloat64`\<`number`, `"required"`\>; `lastRequest`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"key"` \| `"count"` \| `"lastRequest"`\>, \{ `key`: \[`"key"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `passkey`: `TableDefinition`\<`VObject`\<\{ `name?`: `string` \| `null`; `createdAt?`: `number` \| `null`; `transports?`: `string` \| `null`; `aaguid?`: `string` \| `null`; `userId`: `string`; `publicKey`: `string`; `credentialID`: `string`; `counter`: `number`; `deviceType`: `string`; `backedUp`: `boolean`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `publicKey`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `credentialID`: `VString`\<`string`, `"required"`\>; `counter`: `VFloat64`\<`number`, `"required"`\>; `deviceType`: `VString`\<`string`, `"required"`\>; `backedUp`: `VBoolean`\<`boolean`, `"required"`\>; `transports`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `aaguid`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"name"` \| `"createdAt"` \| `"userId"` \| `"publicKey"` \| `"credentialID"` \| `"counter"` \| `"deviceType"` \| `"backedUp"` \| `"transports"` \| `"aaguid"`\>, \{ `credentialID`: \[`"credentialID"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `jwks`: `TableDefinition`\<`VObject`\<\{ `expiresAt?`: `number` \| `null`; `createdAt`: `number`; `publicKey`: `string`; `privateKey`: `string`; \}, \{ `publicKey`: `VString`\<`string`, `"required"`\>; `privateKey`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `expiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"expiresAt"` \| `"publicKey"` \| `"privateKey"`\>, \{ \}, \{ \}, \{ \}\>; \}, `true`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `GenericCtx`\<`DM`\> |
| `componentRef` | `PublicAuthComponentRef` |
| `options?` | [`SetupAuthOptions`](#setupauthoptions)\<`DM`, `Schema`\> |

#### Returns

| Name | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| `appName?` | `string` | - | The name of your application. Used as a display name in contexts where your app needs to be identified — for example, as the default issuer name in authenticator apps when users set up 2FA/TOTP. Can also be set via the `APP_NAME` environment variable. **Default** `"Better Auth"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:357 |
| `baseURL?` | `BaseURLConfig` | - | Base URL for the Better Auth. This is typically the root URL where your application server is hosted. Can be configured as: - A static string: `"https://myapp.com"` - A dynamic config with allowed hosts for multi-domain deployments If not explicitly set, the system will check environment variables: `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, etc. **Example** `// Static URL baseURL: "https://myapp.com" // Dynamic with allowed hosts (for Vercel, multi-domain, etc.) baseURL: { allowedHosts: ["myapp.com", "*.vercel.app", "preview-*.myapp.com"], fallback: "https://myapp.com" }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:381 |
| `secret?` | `string` | - | The secret to use for encryption, signing and hashing. By default Better Auth will look for the following environment variables: process.env.BETTER_AUTH_SECRET, process.env.AUTH_SECRET If none of these environment variables are set, it will default to "better-auth-secret-123456789". on production if it's not set it will throw an error. you can generate a good secret using the following command: **Example** `openssl rand -base64 32` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:413 |
| `secrets?` | \{ `version`: `number`; `value`: `string`; \}[] | - | Versioned secrets for non-destructive secret rotation. When set, encryption uses an envelope format with key IDs. First entry is the current key used for new encryption. Remaining entries are decryption-only (previous rotations). Can also be set via BETTER_AUTH_SECRETS env var: `BETTER_AUTH_SECRETS=2:base64secret,1:base64secret` When set, `secret` is only used as legacy fallback for decrypting bare-hex payloads that predate the envelope format. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:426 |
| `secondaryStorage?` | `SecondaryStorage` | - | Secondary storage configuration This is used to store session and rate limit data. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:491 |
| `emailVerification?` | \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \} | - | Email verification configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:495 |
| `emailVerification.sendVerificationEmail()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:501 |
| `emailVerification.sendOnSignUp?` | `boolean` | - | Send a verification email automatically after sign up. - `true`: Always send verification email on sign up - `false`: Never send verification email on sign up - `undefined`: Follows `requireEmailVerification` behavior **Default** `undefined` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:527 |
| `emailVerification.sendOnSignIn?` | `boolean` | - | Send a verification email automatically on sign in when the user's email is not verified **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:534 |
| `emailVerification.autoSignInAfterVerification?` | `boolean` | - | Auto signin the user after they verify their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:538 |
| `emailVerification.expiresIn?` | `number` | - | Number of seconds the verification token is valid for. **Default** `3600 seconds (1 hour)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:544 |
| `emailVerification.beforeEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user verifies their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:550 |
| `emailVerification.afterEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called when a user's email is updated to verified | node\_modules/@better-auth/core/dist/types/init-options.d.mts:556 |
| `socialProviders?` | `SocialProviders` | - | list of social providers | node\_modules/@better-auth/core/dist/types/init-options.d.mts:707 |
| `session?` | `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"jwt"` \| `"compact"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: `number`; \}; `version?`: \| `string` \| ((`session`, `user`) => `string`) \| ((`session`, `user`) => `Promise`\<`string`\>); \}; `freshAge?`: `number`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:782 |
| `account?` | `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: \| `LiteralUnion`\< \| `"github"` \| `"apple"` \| `"atlassian"` \| `"cognito"` \| `"discord"` \| `"facebook"` \| `"figma"` \| `"microsoft"` \| `"google"` \| `"huggingface"` \| `"slack"` \| `"spotify"` \| `"twitch"` \| `"twitter"` \| `"dropbox"` \| `"kick"` \| `"linear"` \| `"linkedin"` \| `"gitlab"` \| `"tiktok"` \| `"reddit"` \| `"roblox"` \| `"salesforce"` \| `"vk"` \| `"zoom"` \| `"notion"` \| `"kakao"` \| `"naver"` \| `"line"` \| `"paybin"` \| `"paypal"` \| `"polar"` \| `"railway"` \| `"vercel"` \| `"wechat"` \| `"email-password"`, `string`\>[] \| ((`request?`) => `Awaitable`\<`LiteralUnion`\<..., ...\>[]\>); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:910 |
| `verification?` | `BetterAuthDBOptions`\<`"verification"`, `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>; \}; `storeInDatabase?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1046 |
| `trustedOrigins?` | \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>) | - | Additional trusted origins. By default, Better Auth trusts your app's [baseURL](#createauthoptions-2). Use this option to allow additional origins (e.g. a separate frontend domain). Can be a static array, a function that returns origins dynamically, or use wildcard patterns (e.g. `"https://*.example.com"`). **Param** **request** The request object. It'll be undefined if no request was made. Like during a create context call or `auth.api` call. Trusted origins will be dynamically calculated based on the request. **Example** `trustedOrigins: async (request) => { return [ "https://better-auth.com", "https://*.better-auth.com", request.headers.get("x-custom-origin") ]; }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1097 |
| `rateLimit?` | `BetterAuthRateLimitOptions` | - | Rate limiting configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1101 |
| `advanced?` | `BetterAuthAdvancedOptions` | - | Advanced options | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1105 |
| `logger?` | `Logger` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1106 |
| `databaseHooks?` | \{ `user?`: \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; \}; `session?`: \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; \}; `account?`: \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; \}; `verification?`: \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; \}; \} | - | allows you to define custom hooks that can be executed during lifecycle of core database operations. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1112 |
| `databaseHooks.user?` | \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \}; \} | - | User hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1116 |
| `databaseHooks.user.create?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1117 |
| `databaseHooks.user.create.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is created. if the hook returns false, the user will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1123 |
| `databaseHooks.user.create.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1129 |
| `databaseHooks.user.update?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1131 |
| `databaseHooks.user.update.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is updated. if the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1137 |
| `databaseHooks.user.update.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1143 |
| `databaseHooks.user.delete?` | \{ `before?`: (`user`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`user`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1145 |
| `databaseHooks.user.delete.before()?` | (`user`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a user is deleted. if the hook returns false, the user will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1150 |
| `databaseHooks.user.delete.after()?` | (`user`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a user is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1154 |
| `databaseHooks.session?` | \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \}; \} | - | Session Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1160 |
| `databaseHooks.session.create?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1161 |
| `databaseHooks.session.create.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a session is created. if the hook returns false, the session will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1167 |
| `databaseHooks.session.create.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1173 |
| `databaseHooks.session.update?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1178 |
| `databaseHooks.session.update.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a user is updated. if the hook returns false, the session will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1184 |
| `databaseHooks.session.update.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1190 |
| `databaseHooks.session.delete?` | \{ `before?`: (`session`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`session`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1192 |
| `databaseHooks.session.delete.before()?` | (`session`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a session is deleted. if the hook returns false, the session will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1197 |
| `databaseHooks.session.delete.after()?` | (`session`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a session is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1201 |
| `databaseHooks.account?` | \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \}; \} | - | Account Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1207 |
| `databaseHooks.account.create?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1208 |
| `databaseHooks.account.create.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a account is created. If the hook returns false, the account will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1214 |
| `databaseHooks.account.create.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a account is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1220 |
| `databaseHooks.account.update?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1225 |
| `databaseHooks.account.update.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a account is update. If the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1231 |
| `databaseHooks.account.update.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a account is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1237 |
| `databaseHooks.account.delete?` | \{ `before?`: (`account`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`account`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1239 |
| `databaseHooks.account.delete.before()?` | (`account`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before an account is deleted. if the hook returns false, the account will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1244 |
| `databaseHooks.account.delete.after()?` | (`account`, `context`) => `Promise`\<`void`\> | - | Hook that is called after an account is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1248 |
| `databaseHooks.verification?` | \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \}; \} | - | Verification Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1254 |
| `databaseHooks.verification.create?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1255 |
| `databaseHooks.verification.create.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a verification is created. if the hook returns false, the verification will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1261 |
| `databaseHooks.verification.create.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1267 |
| `databaseHooks.verification.update?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1269 |
| `databaseHooks.verification.update.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ... \| ...\> | - | Hook that is called before a verification is updated. if the hook returns false, the verification will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1275 |
| `databaseHooks.verification.update.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1281 |
| `databaseHooks.verification.delete?` | \{ `before?`: (`verification`, `context`) => `Promise`\<... \| ... \| ...\>; `after?`: (`verification`, `context`) => `Promise`\<`void`\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1283 |
| `databaseHooks.verification.delete.before()?` | (`verification`, `context`) => `Promise`\<... \| ... \| ...\> | - | Hook that is called before a verification is deleted. if the hook returns false, the verification will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1288 |
| `databaseHooks.verification.delete.after()?` | (`verification`, `context`) => `Promise`\<`void`\> | - | Hook that is called after a verification is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1292 |
| `onAPIError?` | \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \} | - | API error handling | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1299 |
| `onAPIError.throw?` | `boolean` | - | Throw an error on API error **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1305 |
| `onAPIError.onError()?` | (`error`, `ctx`) => `void` \| `Promise`\<`void`\> | - | Custom error handler | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1312 |
| `onAPIError.errorURL?` | `string` | - | The URL to redirect to on error When errorURL is provided, the error will be added to the URL as a query parameter and the user will be redirected to the errorURL. **Default** `- "/api/auth/error"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1321 |
| `onAPIError.customizeDefaultErrorPage?` | \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \} | - | Configure the default error page provided by Better-Auth Start your dev server and go to /api/auth/error to see the error page. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1326 |
| `onAPIError.customizeDefaultErrorPage.colors?` | \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1327 |
| `onAPIError.customizeDefaultErrorPage.colors.background?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1328 |
| `onAPIError.customizeDefaultErrorPage.colors.foreground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1329 |
| `onAPIError.customizeDefaultErrorPage.colors.primary?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1330 |
| `onAPIError.customizeDefaultErrorPage.colors.primaryForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1331 |
| `onAPIError.customizeDefaultErrorPage.colors.mutedForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1332 |
| `onAPIError.customizeDefaultErrorPage.colors.border?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1333 |
| `onAPIError.customizeDefaultErrorPage.colors.destructive?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1334 |
| `onAPIError.customizeDefaultErrorPage.colors.titleBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1335 |
| `onAPIError.customizeDefaultErrorPage.colors.titleColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1336 |
| `onAPIError.customizeDefaultErrorPage.colors.gridColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1337 |
| `onAPIError.customizeDefaultErrorPage.colors.cardBackground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1338 |
| `onAPIError.customizeDefaultErrorPage.colors.cornerBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1339 |
| `onAPIError.customizeDefaultErrorPage.size?` | \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1341 |
| `onAPIError.customizeDefaultErrorPage.size.radiusSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1342 |
| `onAPIError.customizeDefaultErrorPage.size.radiusMd?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1343 |
| `onAPIError.customizeDefaultErrorPage.size.radiusLg?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1344 |
| `onAPIError.customizeDefaultErrorPage.size.textSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1345 |
| `onAPIError.customizeDefaultErrorPage.size.text2xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1346 |
| `onAPIError.customizeDefaultErrorPage.size.text4xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1347 |
| `onAPIError.customizeDefaultErrorPage.size.text6xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1348 |
| `onAPIError.customizeDefaultErrorPage.font?` | \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1350 |
| `onAPIError.customizeDefaultErrorPage.font.defaultFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1351 |
| `onAPIError.customizeDefaultErrorPage.font.monoFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1352 |
| `onAPIError.customizeDefaultErrorPage.disableTitleBorder?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1354 |
| `onAPIError.customizeDefaultErrorPage.disableCornerDecorations?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1355 |
| `onAPIError.customizeDefaultErrorPage.disableBackgroundGrid?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1356 |
| `hooks?` | \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \} | - | Hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1362 |
| `hooks.before()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | Before a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1366 |
| `hooks.after()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | After a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1370 |
| `disabledPaths?` | `string`[] | - | Disabled paths Paths you want to disable. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1377 |
| `telemetry?` | \{ `enabled?`: `boolean`; `debug?`: `boolean`; \} | - | Telemetry configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1381 |
| `telemetry.enabled?` | `boolean` | - | Enable telemetry collection **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1387 |
| `telemetry.debug?` | `boolean` | - | Enable debug mode **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1393 |
| `experimental?` | \{ `joins?`: `boolean`; \} | - | Experimental features | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1398 |
| `experimental.joins?` | `boolean` | - | Enable experimental joins for your database adapter. 	Please read the adapter documentation for more information regarding joins before enabling this. 	Not all adapters support joins. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1407 |
| `basePath` | `string` | `resolvedBasePath` | - | [src/convex/client/index.ts:496](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L496) |
| `database` | `AdapterFactory`\<`BetterAuthOptions`\> | - | - | [src/convex/client/index.ts:497](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L497) |
| `emailAndPassword` | \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \} | - | - | [src/convex/client/index.ts:499](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L499) |
| `emailAndPassword.disableSignUp?` | `boolean` | - | Disable email and password sign up **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:573 |
| `emailAndPassword.requireEmailVerification?` | `boolean` | - | Require email verification before a session can be created for the user. if the user is not verified, the user will not be able to sign in and on sign in attempts, the user will be prompted to verify their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:581 |
| `emailAndPassword.maxPasswordLength?` | `number` | - | The maximum length of the password. **Default** `128` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:587 |
| `emailAndPassword.minPasswordLength?` | `number` | - | The minimum length of the password. **Default** `8` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:593 |
| `emailAndPassword.sendResetPassword()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | send reset password | node\_modules/@better-auth/core/dist/types/init-options.d.mts:597 |
| `emailAndPassword.resetPasswordTokenExpiresIn?` | `number` | - | Number of seconds the reset password token is valid for. **Default** `1 hour (60 * 60)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:619 |
| `emailAndPassword.onPasswordReset()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user's password is changed successfully. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:624 |
| `emailAndPassword.password?` | \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \} | - | Password hashing and verification By default Scrypt is used for password hashing and verification. You can provide your own hashing and verification function. if you want to use a different algorithm. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:635 |
| `emailAndPassword.password.hash()?` | (`password`) => `Promise`\<`string`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:636 |
| `emailAndPassword.password.verify()?` | (`data`) => `Promise`\<`boolean`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:637 |
| `emailAndPassword.autoSignIn?` | `boolean` | - | Automatically sign in the user after sign up **Default** `true` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:647 |
| `emailAndPassword.revokeSessionsOnPasswordReset?` | `boolean` | - | Whether to revoke all other sessions when resetting password **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:652 |
| `emailAndPassword.onExistingUserSignUp()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user tries to sign up with an email that already exists. Useful for notifying the existing user that someone attempted to register with their email. This is only called when `requireEmailVerification: true` or `autoSignIn: false`. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:660 |
| `emailAndPassword.customSyntheticUser()?` | (`params`) => `Record`\<`string`, `unknown`\> | - | Build a custom synthetic user for email enumeration protection. When a sign-up attempt is made with an email that already exists, this function is called to build the fake user response. Use this when plugins add fields to the user table (e.g. admin plugin adds `role`, `banned`, etc.) to ensure the fake response is indistinguishable from a real sign-up. **Example** `customSyntheticUser: ({ coreFields, additionalFields, id }) => ({ ...coreFields, role: "user", banned: false, banReason: null, banExpires: null, ...additionalFields, id, })` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:691 |
| `emailAndPassword.enabled` | `boolean` | `false` | Enable email and password authentication **Default** `false` | [src/convex/client/index.ts:500](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L500) |
| `user` | \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \} | - | - | [src/convex/client/index.ts:505](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L505) |
| `user.modelName?` | `"user"` \| `LiteralString` | - | The name of the model. Defaults to the model name. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:125 |
| `user.fields?` | `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\> | - | Map fields to database columns | node\_modules/@better-auth/core/dist/types/init-options.d.mts:129 |
| `user.additionalFields?` | \{ \[`key`: `string`\]: `DBFieldAttribute`; \} | - | Additional fields for the model | node\_modules/@better-auth/core/dist/types/init-options.d.mts:133 |
| `user.changeEmail?` | \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \} | - | Changing email configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:719 |
| `user.changeEmail.enabled` | `boolean` | - | Enable changing email **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:724 |
| `user.changeEmail.sendChangeEmailConfirmation()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a confirmation email to the old email address when the user changes their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:730 |
| `user.changeEmail.updateEmailWithoutVerification?` | `boolean` | - | Update the email without verification if the user is not verified. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:740 |
| `user.deleteUser?` | \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \} | - | User deletion configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:745 |
| `user.deleteUser.enabled?` | `boolean` | - | Enable user deletion | node\_modules/@better-auth/core/dist/types/init-options.d.mts:749 |
| `user.deleteUser.sendDeleteAccountVerification()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email when the user deletes their account. if this is not set, the user will be deleted immediately. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:757 |
| `user.deleteUser.beforeDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user is deleted. to interrupt with error you can throw `APIError` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:767 |
| `user.deleteUser.afterDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called after a user is deleted. This is useful for cleaning up user data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:773 |
| `user.deleteUser.deleteTokenExpiresIn?` | `number` | - | The expiration time for the delete token. **Default** `1 day (60 * 60 * 24) in seconds` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:779 |
| `plugins` | \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => `Promise`\< \| \{ `context`: ...; \} \| `undefined`\>; \} \| \{ `matcher`: (`ctx`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<\{ `context`: `MiddlewareContext`\<..., ...\>; \}\>; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<`unknown`\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: `string`; `content`: \{ `application/json`: ...; \}; \}; \}; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => `Promise`\<\{ `session`: \{ `session`: ...; `user`: ...; \}; \}\>[]; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: `string`; `content`: \{ `application/json`: ...; \}; \}; \}; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<\{ sign-in: ...; change-email: ...; email-verification: ...; forget-password: ... \}\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ status: boolean; token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \} \| \{ status: boolean; token: null; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} & Record\<string, any\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ZodString; otp: ZodString; name: ZodOptional\<(...)\>; image: ZodOptional\<(...)\> \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<ZodString\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ZodOptional\<(...)\>; name: ZodOptional\<(...)\>; context: ZodOptional\<(...)\> \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; parameters: ...; content: ... \} \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<ZodString\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \}; 400: \{ description: ... \} \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<ZodAny, ZodAny\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \}; $Infer: \{ body: \{ response: AuthenticationResponseJSON \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<\{ session: ... \}\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>) \| ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>) \| ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: \{ description: ...; content: ... \} \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \})\[\]\] | - | - | [src/convex/client/index.ts:520](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L520) |

***

### createAuth()

```ts
function createAuth<DM, Schema>(
   ctx, 
   componentRef, 
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
        strategy?: "jwt" | "compact" | "jwe";
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
  verification?: BetterAuthDBOptions<"verification", "createdAt" | "updatedAt" | "id" | "expiresAt" | "value" | "identifier"> & {
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
     fields?: Partial<Record<"name" | "createdAt" | "updatedAt" | "email" | "emailVerified" | "image", string>>;
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
  }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean; token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> } | { status: boolean; token: null; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ...; otp: ...; name: ...; image: ... }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ...; name: ...; context: ... }, $strip>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ...; 400: ... } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<(...), (...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } }; $Infer: { body: { response: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined })[]];
}>;
```

Defined in: [src/convex/client/index.ts:570](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L570)

Simple wrapper around the packaged auth component that runs in the app
environment.

This follows Convex's simple function wrapper pattern: app code can pass the
component reference and Convex context in directly, while this helper handles
the cross-boundary adapter wiring and environment-backed auth creation.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | - |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `true`\> | `SchemaDefinition`\<\{ `user`: `TableDefinition`\<`VObject`\<\{ `image?`: `string` \| `null`; `name`: `string`; `createdAt`: `number`; `updatedAt`: `number`; `email`: `string`; `emailVerified`: `boolean`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `emailVerified`: `VBoolean`\<`boolean`, `"required"`\>; `image`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`\>, \{ `email_name`: \[`"email"`, `"name"`, `"_creationTime"`\]; `name`: \[`"name"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `session`: `TableDefinition`\<`VObject`\<\{ `ipAddress?`: `string` \| `null`; `userAgent?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `expiresAt`: `number`; `token`: `string`; \}, \{ `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `token`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `ipAddress`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userAgent`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VString`\<`string`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `expiresAt_userId`: \[`"expiresAt"`, `"userId"`, `"_creationTime"`\]; `token`: \[`"token"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `account`: `TableDefinition`\<`VObject`\<\{ `password?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `idToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `scope?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `accountId`: `string`; `providerId`: `string`; \}, \{ `accountId`: `VString`\<`string`, `"required"`\>; `providerId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `idToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `scope`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `password`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\>, \{ `accountId`: \[`"accountId"`, `"_creationTime"`\]; `accountId_providerId`: \[`"accountId"`, `"providerId"`, `"_creationTime"`\]; `providerId_userId`: \[`"providerId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `verification`: `TableDefinition`\<`VObject`\<\{ `createdAt`: `number`; `updatedAt`: `number`; `expiresAt`: `number`; `value`: `string`; `identifier`: `string`; \}, \{ `identifier`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"createdAt"` \| `"updatedAt"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `identifier`: \[`"identifier"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `rateLimit`: `TableDefinition`\<`VObject`\<\{ `key`: `string`; `count`: `number`; `lastRequest`: `number`; \}, \{ `key`: `VString`\<`string`, `"required"`\>; `count`: `VFloat64`\<`number`, `"required"`\>; `lastRequest`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"key"` \| `"count"` \| `"lastRequest"`\>, \{ `key`: \[`"key"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `passkey`: `TableDefinition`\<`VObject`\<\{ `name?`: `string` \| `null`; `createdAt?`: `number` \| `null`; `transports?`: `string` \| `null`; `aaguid?`: `string` \| `null`; `userId`: `string`; `publicKey`: `string`; `credentialID`: `string`; `counter`: `number`; `deviceType`: `string`; `backedUp`: `boolean`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `publicKey`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `credentialID`: `VString`\<`string`, `"required"`\>; `counter`: `VFloat64`\<`number`, `"required"`\>; `deviceType`: `VString`\<`string`, `"required"`\>; `backedUp`: `VBoolean`\<`boolean`, `"required"`\>; `transports`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `aaguid`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"name"` \| `"createdAt"` \| `"userId"` \| `"publicKey"` \| `"credentialID"` \| `"counter"` \| `"deviceType"` \| `"backedUp"` \| `"transports"` \| `"aaguid"`\>, \{ `credentialID`: \[`"credentialID"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `jwks`: `TableDefinition`\<`VObject`\<\{ `expiresAt?`: `number` \| `null`; `createdAt`: `number`; `publicKey`: `string`; `privateKey`: `string`; \}, \{ `publicKey`: `VString`\<`string`, `"required"`\>; `privateKey`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `expiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"expiresAt"` \| `"publicKey"` \| `"privateKey"`\>, \{ \}, \{ \}, \{ \}\>; \}, `true`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `GenericCtx`\<`DM`\> |
| `componentRef` | `PublicAuthComponentRef` |
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
        `strategy?`: `"jwt"` \| `"compact"` \| `"jwe"`;
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
  `verification?`: `BetterAuthDBOptions`\<`"verification"`, `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\> & \{
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
     `fields?`: `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\>;
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
  \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean; token: string; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \} \| \{ status: boolean; token: null; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ...; otp: ...; name: ...; image: ... \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ...; name: ...; context: ... \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ...; 400: ... \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<(...), (...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ response: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \})\[\]\];
\}\>

***

### makeAuthApi()

```ts
function makeAuthApi<DM, Schema>(
   componentRef, 
   queryBuilder, 
   options?): {
  getAuthUser: RegisteredQuery<"public", {
  }, Promise<MaybeMakeLooseDataModel<{ [TableName in string]: Schema["tables"][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<(...) & (...)>; fieldPaths: "_id" | ExtractFieldPaths<(...)>; indexes: Expand<(...) & (...)>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]>["user"]["document"]>>;
};
```

Defined in: [src/convex/client/index.ts:586](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L586)

Ready-made app query wrappers for re-exporting component functionality.

This follows Convex's API remounting pattern for component client code.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | - |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `true`\> | `SchemaDefinition`\<\{ `user`: `TableDefinition`\<`VObject`\<\{ `image?`: `string` \| `null`; `name`: `string`; `createdAt`: `number`; `updatedAt`: `number`; `email`: `string`; `emailVerified`: `boolean`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `emailVerified`: `VBoolean`\<`boolean`, `"required"`\>; `image`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`\>, \{ `email_name`: \[`"email"`, `"name"`, `"_creationTime"`\]; `name`: \[`"name"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `session`: `TableDefinition`\<`VObject`\<\{ `ipAddress?`: `string` \| `null`; `userAgent?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `expiresAt`: `number`; `token`: `string`; \}, \{ `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `token`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `ipAddress`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userAgent`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VString`\<`string`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `expiresAt_userId`: \[`"expiresAt"`, `"userId"`, `"_creationTime"`\]; `token`: \[`"token"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `account`: `TableDefinition`\<`VObject`\<\{ `password?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `idToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `scope?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `accountId`: `string`; `providerId`: `string`; \}, \{ `accountId`: `VString`\<`string`, `"required"`\>; `providerId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `idToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `scope`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `password`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\>, \{ `accountId`: \[`"accountId"`, `"_creationTime"`\]; `accountId_providerId`: \[`"accountId"`, `"providerId"`, `"_creationTime"`\]; `providerId_userId`: \[`"providerId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `verification`: `TableDefinition`\<`VObject`\<\{ `createdAt`: `number`; `updatedAt`: `number`; `expiresAt`: `number`; `value`: `string`; `identifier`: `string`; \}, \{ `identifier`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"createdAt"` \| `"updatedAt"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `identifier`: \[`"identifier"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `rateLimit`: `TableDefinition`\<`VObject`\<\{ `key`: `string`; `count`: `number`; `lastRequest`: `number`; \}, \{ `key`: `VString`\<`string`, `"required"`\>; `count`: `VFloat64`\<`number`, `"required"`\>; `lastRequest`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"key"` \| `"count"` \| `"lastRequest"`\>, \{ `key`: \[`"key"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `passkey`: `TableDefinition`\<`VObject`\<\{ `name?`: `string` \| `null`; `createdAt?`: `number` \| `null`; `transports?`: `string` \| `null`; `aaguid?`: `string` \| `null`; `userId`: `string`; `publicKey`: `string`; `credentialID`: `string`; `counter`: `number`; `deviceType`: `string`; `backedUp`: `boolean`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `publicKey`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `credentialID`: `VString`\<`string`, `"required"`\>; `counter`: `VFloat64`\<`number`, `"required"`\>; `deviceType`: `VString`\<`string`, `"required"`\>; `backedUp`: `VBoolean`\<`boolean`, `"required"`\>; `transports`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `aaguid`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"name"` \| `"createdAt"` \| `"userId"` \| `"publicKey"` \| `"credentialID"` \| `"counter"` \| `"deviceType"` \| `"backedUp"` \| `"transports"` \| `"aaguid"`\>, \{ `credentialID`: \[`"credentialID"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `jwks`: `TableDefinition`\<`VObject`\<\{ `expiresAt?`: `number` \| `null`; `createdAt`: `number`; `publicKey`: `string`; `privateKey`: `string`; \}, \{ `publicKey`: `VString`\<`string`, `"required"`\>; `privateKey`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `expiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"expiresAt"` \| `"publicKey"` \| `"privateKey"`\>, \{ \}, \{ \}, \{ \}\>; \}, `true`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `componentRef` | `PublicAuthComponentRef` |
| `queryBuilder` | `QueryBuilder`\<`DM`, `"public"`\> |
| `options?` | [`SetupAuthOptions`](#setupauthoptions)\<`DM`, `Schema`\> |

#### Returns

```ts
{
  getAuthUser: RegisteredQuery<"public", {
  }, Promise<MaybeMakeLooseDataModel<{ [TableName in string]: Schema["tables"][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<(...) & (...)>; fieldPaths: "_id" | ExtractFieldPaths<(...)>; indexes: Expand<(...) & (...)>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]>["user"]["document"]>>;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `getAuthUser` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<`MaybeMakeLooseDataModel`\<\{ \[TableName in string\]: Schema\["tables"\]\[TableName\] extends TableDefinition\<DocumentType, Indexes, SearchIndexes, VectorIndexes\> ? \{ document: Expand\<(...) & (...)\>; fieldPaths: "\_id" \| ExtractFieldPaths\<(...)\>; indexes: Expand\<(...) & (...)\>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes \} : never \}, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\]\>\> | [src/convex/client/index.ts:604](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L604) |

***

### setupAuth()

```ts
function setupAuth<DM, Schema>(
   componentRef, 
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
           strategy?: "jwt" | "compact" | "jwe";
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
     verification?: BetterAuthDBOptions<"verification", "createdAt" | "updatedAt" | "id" | "expiresAt" | "value" | "identifier"> & {
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
        fields?: Partial<Record<"name" | "createdAt" | "updatedAt" | "email" | "emailVerified" | "image", string>>;
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
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; body: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ...; type: ...; otp: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ...; otp: ... }, $strip>; metadata: { openapi: { description: ...; responses: ... } } }, { status: boolean; token: string; user: (...) & (...) } | { status: boolean; token: null; user: (...) & (...) }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<(...), (...)>, ZodRecord<(...), (...)>>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ...; otp: ...; password: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ...; otp: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ...; otp: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<(...)>) => Promise<(...)> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: ...) => ...)[]; query: ZodOptional<ZodObject<(...), (...)>>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ...; name: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... }; $Infer: { body: ... } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) | (...) | (...); userAgent?: (...) | (...) | (...) }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { description: ...; responses: ... } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ... }, $strip>; use: ((...) | (...))[]; metadata: { openapi: { description: ...; responses: ... } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ...; name: ... }, $strip>; use: ((...) | (...))[]; metadata: { openapi: { description: ...; responses: ... } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: ...; field: ... }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined })[]];
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
           strategy?: "jwt" | "compact" | "jwe";
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
     verification?: BetterAuthDBOptions<"verification", "createdAt" | "updatedAt" | "id" | "expiresAt" | "value" | "identifier"> & {
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
        fields?: Partial<Record<"name" | "createdAt" | "updatedAt" | "email" | "emailVerified" | "image", string>>;
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
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean; token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> } | { status: boolean; token: null; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ...; otp: ...; name: ...; image: ... }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ...; name: ...; context: ... }, $strip>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ...; 400: ... } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<(...), (...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } }; $Infer: { body: { response: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined })[]];
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
           strategy?: "jwt" | "compact" | "jwe";
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
     verification?: BetterAuthDBOptions<"verification", "createdAt" | "updatedAt" | "id" | "expiresAt" | "value" | "identifier"> & {
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
        fields?: Partial<Record<"name" | "createdAt" | "updatedAt" | "email" | "emailVerified" | "image", string>>;
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
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { otp: ... } | { otp: ... }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { status: ...; token: ...; user: ... } | { status: ...; token: ...; user: ... }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<(...), (...)>; metadata: { openapi: ... } }, { token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: ...) => ... }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: (...)[]; query: ZodOptional<(...)>; metadata: { openapi: ... } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: ... } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ...; $Infer: ... } }, { session: { id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... }; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: (...)[]; metadata: { openapi: ... } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: ...; required: ... }; publicKey: { type: ...; required: ... }; userId: { type: ...; references: ...; required: ...; index: ... }; credentialID: { type: ...; required: ...; index: ... }; counter: { type: ...; required: ... }; deviceType: { type: ...; required: ... }; backedUp: { type: ...; required: ... }; transports: { type: ...; required: ... }; createdAt: { type: ...; required: ... }; aaguid: { type: ...; required: ... } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined })[]];
  }>;
  getAuthUser: RegisteredQuery<"public", {
  }, Promise<MaybeMakeLooseDataModel<{ [TableName in string]: Schema["tables"][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<(...) & (...)>; fieldPaths: "_id" | ExtractFieldPaths<(...)>; indexes: Expand<(...) & (...)>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]>["user"]["document"]>>;
};
```

Defined in: [src/convex/client/index.ts:625](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L625)

App-facing client bridge for the packaged Convex component.

This convenience helper composes the simple wrapper and API remounting
patterns exported from this module.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DM` *extends* `GenericDataModel` | - |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `true`\> | `SchemaDefinition`\<\{ `user`: `TableDefinition`\<`VObject`\<\{ `image?`: `string` \| `null`; `name`: `string`; `createdAt`: `number`; `updatedAt`: `number`; `email`: `string`; `emailVerified`: `boolean`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `emailVerified`: `VBoolean`\<`boolean`, `"required"`\>; `image`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`\>, \{ `email_name`: \[`"email"`, `"name"`, `"_creationTime"`\]; `name`: \[`"name"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `session`: `TableDefinition`\<`VObject`\<\{ `ipAddress?`: `string` \| `null`; `userAgent?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `expiresAt`: `number`; `token`: `string`; \}, \{ `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `token`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `ipAddress`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userAgent`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VString`\<`string`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `expiresAt_userId`: \[`"expiresAt"`, `"userId"`, `"_creationTime"`\]; `token`: \[`"token"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `account`: `TableDefinition`\<`VObject`\<\{ `password?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `idToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `scope?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `accountId`: `string`; `providerId`: `string`; \}, \{ `accountId`: `VString`\<`string`, `"required"`\>; `providerId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `idToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `scope`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `password`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\>, \{ `accountId`: \[`"accountId"`, `"_creationTime"`\]; `accountId_providerId`: \[`"accountId"`, `"providerId"`, `"_creationTime"`\]; `providerId_userId`: \[`"providerId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `verification`: `TableDefinition`\<`VObject`\<\{ `createdAt`: `number`; `updatedAt`: `number`; `expiresAt`: `number`; `value`: `string`; `identifier`: `string`; \}, \{ `identifier`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"createdAt"` \| `"updatedAt"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `identifier`: \[`"identifier"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `rateLimit`: `TableDefinition`\<`VObject`\<\{ `key`: `string`; `count`: `number`; `lastRequest`: `number`; \}, \{ `key`: `VString`\<`string`, `"required"`\>; `count`: `VFloat64`\<`number`, `"required"`\>; `lastRequest`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"key"` \| `"count"` \| `"lastRequest"`\>, \{ `key`: \[`"key"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `passkey`: `TableDefinition`\<`VObject`\<\{ `name?`: `string` \| `null`; `createdAt?`: `number` \| `null`; `transports?`: `string` \| `null`; `aaguid?`: `string` \| `null`; `userId`: `string`; `publicKey`: `string`; `credentialID`: `string`; `counter`: `number`; `deviceType`: `string`; `backedUp`: `boolean`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `publicKey`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `credentialID`: `VString`\<`string`, `"required"`\>; `counter`: `VFloat64`\<`number`, `"required"`\>; `deviceType`: `VString`\<`string`, `"required"`\>; `backedUp`: `VBoolean`\<`boolean`, `"required"`\>; `transports`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `aaguid`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"name"` \| `"createdAt"` \| `"userId"` \| `"publicKey"` \| `"credentialID"` \| `"counter"` \| `"deviceType"` \| `"backedUp"` \| `"transports"` \| `"aaguid"`\>, \{ `credentialID`: \[`"credentialID"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\>; `jwks`: `TableDefinition`\<`VObject`\<\{ `expiresAt?`: `number` \| `null`; `createdAt`: `number`; `publicKey`: `string`; `privateKey`: `string`; \}, \{ `publicKey`: `VString`\<`string`, `"required"`\>; `privateKey`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `expiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"expiresAt"` \| `"publicKey"` \| `"privateKey"`\>, \{ \}, \{ \}, \{ \}\>; \}, `true`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `componentRef` | `PublicAuthComponentRef` |
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
           strategy?: "jwt" | "compact" | "jwe";
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
     verification?: BetterAuthDBOptions<"verification", "createdAt" | "updatedAt" | "id" | "expiresAt" | "value" | "identifier"> & {
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
        fields?: Partial<Record<"name" | "createdAt" | "updatedAt" | "email" | "emailVerified" | "image", string>>;
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
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; body: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ...; type: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ...; type: ...; otp: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ...; otp: ... }, $strip>; metadata: { openapi: { description: ...; responses: ... } } }, { status: boolean; token: string; user: (...) & (...) } | { status: boolean; token: null; user: (...) & (...) }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<(...), (...)>, ZodRecord<(...), (...)>>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ...; otp: ...; password: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ...; otp: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ...; otp: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<(...)>) => Promise<(...)> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: ...) => ...)[]; query: ZodOptional<ZodObject<(...), (...)>>; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ...; name: ... }, $strip>; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { operationId: ...; description: ...; responses: ... } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ... }, $strip>; metadata: { openapi: { operationId: ...; description: ...; responses: ... }; $Infer: { body: ... } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) | (...) | (...); userAgent?: (...) | (...) | (...) }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) | (...) | (...) } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: ...) => ...)[]; metadata: { openapi: { description: ...; responses: ... } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ... }, $strip>; use: ((...) | (...))[]; metadata: { openapi: { description: ...; responses: ... } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ...; name: ... }, $strip>; use: ((...) | (...))[]; metadata: { openapi: { description: ...; responses: ... } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: ...; field: ... }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined })[]];
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
           strategy?: "jwt" | "compact" | "jwe";
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
     verification?: BetterAuthDBOptions<"verification", "createdAt" | "updatedAt" | "id" | "expiresAt" | "value" | "identifier"> & {
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
        fields?: Partial<Record<"name" | "createdAt" | "updatedAt" | "email" | "emailVerified" | "image", string>>;
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
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<{ email: ZodString; type: ZodEnum<(...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { otp: null } | { otp: string }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<{ email: ZodString; type: ZodEnum<(...)>; otp: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString }, $strip>; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean; token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> } | { status: boolean; token: null; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } & Record<(...), (...)> }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<ZodObject<{ email: ...; otp: ...; name: ...; image: ... }, $strip>, ZodRecord<ZodString, ZodAny>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { token: string; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<{ email: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<{ email: ZodString; otp: ZodString; password: ZodString }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<{ newEmail: ZodString; otp: ZodString }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void> }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; query: ZodOptional<ZodObject<{ authenticatorAttachment: ...; name: ...; context: ... }, $strip>>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } } } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<{ response: ZodAny; name: ZodOptional<(...)> }, $strip>; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { operationId: string; description: string; responses: { 200: ...; 400: ... } } } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<{ response: ZodRecord<(...), (...)> }, $strip>; metadata: { openapi: { operationId: string; description: string; responses: { 200: ... } }; $Infer: { body: { response: ... } } } }, { session: { id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string | null } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: ((inputContext: MiddlewareInputContext<(...)>) => Promise<(...)>)[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<{ id: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<{ id: ZodString; name: ZodString }, $strip>; use: (((inputContext: ...) => ...) | ((inputContext: ...) => ...))[]; metadata: { openapi: { description: string; responses: { 200: ... } } } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: "string"; required: false }; publicKey: { type: "string"; required: true }; userId: { type: "string"; references: { model: string; field: string }; required: true; index: true }; credentialID: { type: "string"; required: true; index: true }; counter: { type: "number"; required: true }; deviceType: { type: "string"; required: true }; backedUp: { type: "boolean"; required: true }; transports: { type: "string"; required: false }; createdAt: { type: "date"; required: false }; aaguid: { type: "string"; required: false } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined })[]];
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
           strategy?: "jwt" | "compact" | "jwe";
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
     verification?: BetterAuthDBOptions<"verification", "createdAt" | "updatedAt" | "id" | "expiresAt" | "value" | "identifier"> & {
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
        fields?: Partial<Record<"name" | "createdAt" | "updatedAt" | "email" | "emailVerified" | "image", string>>;
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
     }, ...(BetterAuthPlugin | { id: "email-otp"; version: string; init: any; endpoints: { sendVerificationOTP: StrictEndpoint<"/email-otp/send-verification-otp", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; createVerificationOTP: StrictEndpoint<string, { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, string>; getVerificationOTP: StrictEndpoint<string, { method: "GET"; query: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { otp: ... } | { otp: ... }>; checkVerificationOTP: StrictEndpoint<"/email-otp/check-verification-otp", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; verifyEmailOTP: StrictEndpoint<"/email-otp/verify-email", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { status: ...; token: ...; user: ... } | { status: ...; token: ...; user: ... }>; signInEmailOTP: StrictEndpoint<"/sign-in/email-otp", { method: "POST"; body: ZodIntersection<(...), (...)>; metadata: { openapi: ... } }, { token: string; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } }>; requestPasswordResetEmailOTP: StrictEndpoint<"/email-otp/request-password-reset", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; forgetPasswordEmailOTP: StrictEndpoint<"/forget-password/email-otp", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; resetPasswordEmailOTP: StrictEndpoint<"/email-otp/reset-password", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ... } }, { success: boolean }>; requestEmailChangeEmailOTP: StrictEndpoint<"/email-otp/request-email-change", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }>; changeEmailEmailOTP: StrictEndpoint<"/email-otp/change-email", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { success: boolean }> }; hooks: { after: { matcher: any; handler: (inputContext: ...) => ... }[] }; rateLimit: ({ pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number } | { pathMatcher: any; window: number; max: number })[]; options: EmailOTPOptions; $ERROR_CODES: { OTP_EXPIRED: RawError<"OTP_EXPIRED">; INVALID_OTP: RawError<"INVALID_OTP">; TOO_MANY_ATTEMPTS: RawError<"TOO_MANY_ATTEMPTS"> } } | { id: "passkey"; version: string; endpoints: { generatePasskeyRegistrationOptions: StrictEndpoint<"/passkey/generate-register-options", { method: "GET"; use: (...)[]; query: ZodOptional<(...)>; metadata: { openapi: ... } }, PublicKeyCredentialCreationOptionsJSON>; generatePasskeyAuthenticationOptions: StrictEndpoint<"/passkey/generate-authenticate-options", { method: "GET"; metadata: { openapi: ... } }, PublicKeyCredentialRequestOptionsJSON>; verifyPasskeyRegistration: StrictEndpoint<"/passkey/verify-registration", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, Passkey>; verifyPasskeyAuthentication: StrictEndpoint<"/passkey/verify-authentication", { method: "POST"; body: ZodObject<(...), (...)>; metadata: { openapi: ...; $Infer: ... } }, { session: { id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... }; user: { id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... } }>; listPasskeys: StrictEndpoint<"/passkey/list-user-passkeys", { method: "GET"; use: (...)[]; metadata: { openapi: ... } }, Passkey[]>; deletePasskey: StrictEndpoint<"/passkey/delete-passkey", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { status: boolean }>; updatePasskey: StrictEndpoint<"/passkey/update-passkey", { method: "POST"; body: ZodObject<(...), (...)>; use: (...)[]; metadata: { openapi: ... } }, { passkey: Passkey }> }; schema: { passkey: { fields: { name: { type: ...; required: ... }; publicKey: { type: ...; required: ... }; userId: { type: ...; references: ...; required: ...; index: ... }; credentialID: { type: ...; required: ...; index: ... }; counter: { type: ...; required: ... }; deviceType: { type: ...; required: ... }; backedUp: { type: ...; required: ... }; transports: { type: ...; required: ... }; createdAt: { type: ...; required: ... }; aaguid: { type: ...; required: ... } } } }; $ERROR_CODES: { CHALLENGE_NOT_FOUND: RawError<"CHALLENGE_NOT_FOUND">; YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: RawError<"YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY">; FAILED_TO_VERIFY_REGISTRATION: RawError<"FAILED_TO_VERIFY_REGISTRATION">; PASSKEY_NOT_FOUND: RawError<"PASSKEY_NOT_FOUND">; AUTHENTICATION_FAILED: RawError<"AUTHENTICATION_FAILED">; UNABLE_TO_CREATE_SESSION: RawError<"UNABLE_TO_CREATE_SESSION">; FAILED_TO_UPDATE_PASSKEY: RawError<"FAILED_TO_UPDATE_PASSKEY">; PREVIOUSLY_REGISTERED: RawError<"PREVIOUSLY_REGISTERED">; REGISTRATION_CANCELLED: RawError<"REGISTRATION_CANCELLED">; AUTH_CANCELLED: RawError<"AUTH_CANCELLED">; UNKNOWN_ERROR: RawError<"UNKNOWN_ERROR">; SESSION_REQUIRED: RawError<"SESSION_REQUIRED">; RESOLVE_USER_REQUIRED: RawError<"RESOLVE_USER_REQUIRED">; RESOLVED_USER_INVALID: RawError<"RESOLVED_USER_INVALID"> }; options: PasskeyOptions | undefined })[]];
  }>;
  getAuthUser: RegisteredQuery<"public", {
  }, Promise<MaybeMakeLooseDataModel<{ [TableName in string]: Schema["tables"][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<(...) & (...)>; fieldPaths: "_id" | ExtractFieldPaths<(...)>; indexes: Expand<(...) & (...)>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]>["user"]["document"]>>;
}
```

| Name | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| `authComponent` | \{ `adapter`: (`ctx`) => `AdapterFactory`\<`BetterAuthOptions`\>; `getAuth`: \<`T`\>(`createAuth`, `ctx`) => `Promise`\<\{ `auth`: `ReturnType`\<`T`\>; `headers`: `Headers`; \}\>; `getHeaders`: (`ctx`) => `Promise`\<`Headers`\>; `safeGetAuthUser`: (`ctx`) => `Promise`\< \| `MaybeMakeLooseDataModel`\<`{ [TableName in string]: (...)[(...)] extends TableDefinition<(...), (...), (...), (...)> ? { document: ...; fieldPaths: ...; indexes: ...; searchIndexes: ...; vectorIndexes: ... } : never }`, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\] \| `undefined`\>; `getAuthUser`: (`ctx`) => `Promise`\<`MaybeMakeLooseDataModel`\<\{ \[TableName in string\]: (...)\[(...)\]\[TableName\] extends TableDefinition\<DocumentType, Indexes, SearchIndexes, VectorIndexes\> ? \{ document: Expand\<(...)\>; fieldPaths: (...) \| (...); indexes: Expand\<(...)\>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes \} : never \}, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\]\>; `getAnyUserById`: (`ctx`, `id`) => `Promise`\< \| `MaybeMakeLooseDataModel`\<`{ [TableName in string]: (...)[(...)] extends TableDefinition<(...), (...), (...), (...)> ? { document: ...; fieldPaths: ...; indexes: ...; searchIndexes: ...; vectorIndexes: ... } : never }`, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\] \| `null`\>; `setUserId`: (`ctx`, `authId`, `userId`) => `Promise`\<`void`\>; `clientApi`: () => \{ `getAuthUser`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<`MaybeMakeLooseDataModel`\<`{ [TableName in string]: (...) extends (...) ? (...) : (...) }`, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\]\>\>; \}; `triggersApi`: () => \{ `onCreate`: `RegisteredMutation`\<`"internal"`, \{ `model`: `string`; `doc`: `any`; \}, `Promise`\<`void`\>\>; `onUpdate`: `RegisteredMutation`\<`"internal"`, \{ `model`: `string`; `oldDoc`: `any`; `newDoc`: `any`; \}, `Promise`\<`void`\>\>; `onDelete`: `RegisteredMutation`\<`"internal"`, \{ `model`: `string`; `doc`: `any`; \}, `Promise`\<`void`\>\>; \}; `registerRoutes`: (`http`, `createAuth`, `opts?`) => `void`; `registerRoutesLazy`: \<`T`\>(`http`, `createAuth`, `opts?`) => `void`; \} | - | - | [src/convex/client/index.ts:651](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L651) |
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
| `createAuthOptions()` | (`ctx`) => \{ `appName?`: `string`; `baseURL?`: `BaseURLConfig`; `secret?`: `string`; `secrets?`: \{ `version`: `number`; `value`: `string`; \}[]; `secondaryStorage?`: `SecondaryStorage`; `emailVerification?`: \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \}; `socialProviders?`: `SocialProviders`; `session?`: `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"jwt"` \| `"compact"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: ... \| ...; \}; `version?`: \| `string` \| ((`session`, `user`) => `string`) \| ((`session`, `user`) => `Promise`\<...\>); \}; `freshAge?`: `number`; \}; `account?`: `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: `LiteralUnion`\<..., ...\>[] \| ((`request?`) => `Awaitable`\<...\>); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \}; `verification?`: `BetterAuthDBOptions`\<`"verification"`, `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>; \}; `storeInDatabase?`: `boolean`; \}; `trustedOrigins?`: \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>); `rateLimit?`: `BetterAuthRateLimitOptions`; `advanced?`: `BetterAuthAdvancedOptions`; `logger?`: `Logger`; `databaseHooks?`: \{ `user?`: \{ `create?`: \{ `before?`: (`user`, `context`) => ...; `after?`: (`user`, `context`) => ...; \}; `update?`: \{ `before?`: (`user`, `context`) => ...; `after?`: (`user`, `context`) => ...; \}; `delete?`: \{ `before?`: (`user`, `context`) => ...; `after?`: (`user`, `context`) => ...; \}; \}; `session?`: \{ `create?`: \{ `before?`: (`session`, `context`) => ...; `after?`: (`session`, `context`) => ...; \}; `update?`: \{ `before?`: (`session`, `context`) => ...; `after?`: (`session`, `context`) => ...; \}; `delete?`: \{ `before?`: (`session`, `context`) => ...; `after?`: (`session`, `context`) => ...; \}; \}; `account?`: \{ `create?`: \{ `before?`: (`account`, `context`) => ...; `after?`: (`account`, `context`) => ...; \}; `update?`: \{ `before?`: (`account`, `context`) => ...; `after?`: (`account`, `context`) => ...; \}; `delete?`: \{ `before?`: (`account`, `context`) => ...; `after?`: (`account`, `context`) => ...; \}; \}; `verification?`: \{ `create?`: \{ `before?`: (`verification`, `context`) => ...; `after?`: (`verification`, `context`) => ...; \}; `update?`: \{ `before?`: (`verification`, `context`) => ...; `after?`: (`verification`, `context`) => ...; \}; `delete?`: \{ `before?`: (`verification`, `context`) => ...; `after?`: (`verification`, `context`) => ...; \}; \}; \}; `onAPIError?`: \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \}; `hooks?`: \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \}; `disabledPaths?`: `string`[]; `telemetry?`: \{ `enabled?`: `boolean`; `debug?`: `boolean`; \}; `experimental?`: \{ `joins?`: `boolean`; \}; `basePath`: `string`; `database`: `AdapterFactory`\<`BetterAuthOptions`\>; `emailAndPassword`: \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \}; `user`: \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \}; `plugins`: \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => `Promise`\<...\>; \} \| \{ `matcher`: (`ctx`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<...\>; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<`unknown`\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: ...; \}; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => `Promise`\<...\>[]; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: ...; \}; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ...; type: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ...; type: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ...; type: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ...; type: ...; otp: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ...; otp: ... \}, $strip\>; metadata: \{ openapi: \{ description: ...; responses: ... \} \} \}, \{ status: boolean; token: string; user: (...) & (...) \} \| \{ status: boolean; token: null; user: (...) & (...) \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<(...), (...)\>, ZodRecord\<(...), (...)\>\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ...; otp: ...; password: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ...; otp: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ...; otp: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: ...) =\> ...)\[\]; query: ZodOptional\<ZodObject\<(...), (...)\>\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ...; name: ... \}, $strip\>; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ... \}, $strip\>; metadata: \{ openapi: \{ operationId: ...; description: ...; responses: ... \}; $Infer: \{ body: ... \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: (...) \| (...) \| (...); userAgent?: (...) \| (...) \| (...) \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: (...) \| (...) \| (...) \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: ...) =\> ...)\[\]; metadata: \{ openapi: \{ description: ...; responses: ... \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ... \}, $strip\>; use: ((...) \| (...))\[\]; metadata: \{ openapi: \{ description: ...; responses: ... \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ...; name: ... \}, $strip\>; use: ((...) \| (...))\[\]; metadata: \{ openapi: \{ description: ...; responses: ... \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: ...; field: ... \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \})\[\]\]; \} | `createAuthOptionsForContext` | - | [src/convex/client/index.ts:652](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L652) |
| `options` | \{ `appName?`: `string`; `baseURL?`: `BaseURLConfig`; `secret?`: `string`; `secrets?`: \{ `version`: `number`; `value`: `string`; \}[]; `secondaryStorage?`: `SecondaryStorage`; `emailVerification?`: \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \}; `socialProviders?`: `SocialProviders`; `session?`: `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"jwt"` \| `"compact"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: `number`; \}; `version?`: \| `string` \| ((`session`, `user`) => `string`) \| ((`session`, `user`) => `Promise`\<`string`\>); \}; `freshAge?`: `number`; \}; `account?`: `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: \| `LiteralUnion`\< \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ..., `string`\>[] \| ((`request?`) => `Awaitable`\<...[]\>); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \}; `verification?`: `BetterAuthDBOptions`\<`"verification"`, `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>; \}; `storeInDatabase?`: `boolean`; \}; `trustedOrigins?`: \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>); `rateLimit?`: `BetterAuthRateLimitOptions`; `advanced?`: `BetterAuthAdvancedOptions`; `logger?`: `Logger`; `databaseHooks?`: \{ `user?`: \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; \}; `session?`: \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; \}; `account?`: \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; \}; `verification?`: \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; \}; \}; `onAPIError?`: \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \}; `hooks?`: \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \}; `disabledPaths?`: `string`[]; `telemetry?`: \{ `enabled?`: `boolean`; `debug?`: `boolean`; \}; `experimental?`: \{ `joins?`: `boolean`; \}; `basePath`: `string`; `database`: `AdapterFactory`\<`BetterAuthOptions`\>; `emailAndPassword`: \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \}; `user`: \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \}; `plugins`: \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => `Promise`\<... \| ...\>; \} \| \{ `matcher`: (`ctx`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<\{ `context`: ...; \}\>; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<`unknown`\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: ...; `content`: ...; \}; \}; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => `Promise`\<\{ `session`: ...; \}\>[]; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: ...; `content`: ...; \}; \}; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean; token: string; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \} \| \{ status: boolean; token: null; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ...; otp: ...; name: ...; image: ... \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ...; name: ...; context: ... \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ...; 400: ... \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<(...), (...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ response: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \})\[\]\]; \} | - | - | [src/convex/client/index.ts:653](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L653) |
| `options.appName?` | `string` | - | The name of your application. Used as a display name in contexts where your app needs to be identified — for example, as the default issuer name in authenticator apps when users set up 2FA/TOTP. Can also be set via the `APP_NAME` environment variable. **Default** `"Better Auth"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:357 |
| `options.baseURL?` | `BaseURLConfig` | - | Base URL for the Better Auth. This is typically the root URL where your application server is hosted. Can be configured as: - A static string: `"https://myapp.com"` - A dynamic config with allowed hosts for multi-domain deployments If not explicitly set, the system will check environment variables: `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, etc. **Example** `// Static URL baseURL: "https://myapp.com" // Dynamic with allowed hosts (for Vercel, multi-domain, etc.) baseURL: { allowedHosts: ["myapp.com", "*.vercel.app", "preview-*.myapp.com"], fallback: "https://myapp.com" }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:381 |
| `options.secret?` | `string` | - | The secret to use for encryption, signing and hashing. By default Better Auth will look for the following environment variables: process.env.BETTER_AUTH_SECRET, process.env.AUTH_SECRET If none of these environment variables are set, it will default to "better-auth-secret-123456789". on production if it's not set it will throw an error. you can generate a good secret using the following command: **Example** `openssl rand -base64 32` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:413 |
| `options.secrets?` | \{ `version`: `number`; `value`: `string`; \}[] | - | Versioned secrets for non-destructive secret rotation. When set, encryption uses an envelope format with key IDs. First entry is the current key used for new encryption. Remaining entries are decryption-only (previous rotations). Can also be set via BETTER_AUTH_SECRETS env var: `BETTER_AUTH_SECRETS=2:base64secret,1:base64secret` When set, `secret` is only used as legacy fallback for decrypting bare-hex payloads that predate the envelope format. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:426 |
| `options.secondaryStorage?` | `SecondaryStorage` | - | Secondary storage configuration This is used to store session and rate limit data. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:491 |
| `options.emailVerification?` | \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \} | - | Email verification configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:495 |
| `options.emailVerification.sendVerificationEmail()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:501 |
| `options.emailVerification.sendOnSignUp?` | `boolean` | - | Send a verification email automatically after sign up. - `true`: Always send verification email on sign up - `false`: Never send verification email on sign up - `undefined`: Follows `requireEmailVerification` behavior **Default** `undefined` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:527 |
| `options.emailVerification.sendOnSignIn?` | `boolean` | - | Send a verification email automatically on sign in when the user's email is not verified **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:534 |
| `options.emailVerification.autoSignInAfterVerification?` | `boolean` | - | Auto signin the user after they verify their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:538 |
| `options.emailVerification.expiresIn?` | `number` | - | Number of seconds the verification token is valid for. **Default** `3600 seconds (1 hour)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:544 |
| `options.emailVerification.beforeEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user verifies their email | node\_modules/@better-auth/core/dist/types/init-options.d.mts:550 |
| `options.emailVerification.afterEmailVerification()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called when a user's email is updated to verified | node\_modules/@better-auth/core/dist/types/init-options.d.mts:556 |
| `options.socialProviders?` | `SocialProviders` | - | list of social providers | node\_modules/@better-auth/core/dist/types/init-options.d.mts:707 |
| `options.session?` | `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"jwt"` \| `"compact"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: `number`; \}; `version?`: \| `string` \| ((`session`, `user`) => `string`) \| ((`session`, `user`) => `Promise`\<`string`\>); \}; `freshAge?`: `number`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:782 |
| `options.account?` | `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: \| `LiteralUnion`\< \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ..., `string`\>[] \| ((`request?`) => `Awaitable`\<...[]\>); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:910 |
| `options.verification?` | `BetterAuthDBOptions`\<`"verification"`, `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<`string`, `StoreIdentifierOption`\>; \}; `storeInDatabase?`: `boolean`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1046 |
| `options.trustedOrigins?` | \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>) | - | Additional trusted origins. By default, Better Auth trusts your app's [baseURL](#setupauth-2). Use this option to allow additional origins (e.g. a separate frontend domain). Can be a static array, a function that returns origins dynamically, or use wildcard patterns (e.g. `"https://*.example.com"`). **Param** **request** The request object. It'll be undefined if no request was made. Like during a create context call or `auth.api` call. Trusted origins will be dynamically calculated based on the request. **Example** `trustedOrigins: async (request) => { return [ "https://better-auth.com", "https://*.better-auth.com", request.headers.get("x-custom-origin") ]; }` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1097 |
| `options.rateLimit?` | `BetterAuthRateLimitOptions` | - | Rate limiting configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1101 |
| `options.advanced?` | `BetterAuthAdvancedOptions` | - | Advanced options | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1105 |
| `options.logger?` | `Logger` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1106 |
| `options.databaseHooks?` | \{ `user?`: \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; \}; `session?`: \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; \}; `account?`: \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; \}; `verification?`: \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; \}; \} | - | allows you to define custom hooks that can be executed during lifecycle of core database operations. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1112 |
| `options.databaseHooks.user?` | \{ `create?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \}; \} | - | User hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1116 |
| `options.databaseHooks.user.create?` | \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1117 |
| `options.databaseHooks.user.create.before()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called before a user is created. if the hook returns false, the user will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1123 |
| `options.databaseHooks.user.create.after()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called after a user is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1129 |
| `options.databaseHooks.user.update?` | \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1131 |
| `options.databaseHooks.user.update.before()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called before a user is updated. if the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1137 |
| `options.databaseHooks.user.update.after()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called after a user is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1143 |
| `options.databaseHooks.user.delete?` | \{ `before?`: (`user`, `context`) => `Promise`\<...\>; `after?`: (`user`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1145 |
| `options.databaseHooks.user.delete.before()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called before a user is deleted. if the hook returns false, the user will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1150 |
| `options.databaseHooks.user.delete.after()?` | (`user`, `context`) => `Promise`\<...\> | - | Hook that is called after a user is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1154 |
| `options.databaseHooks.session?` | \{ `create?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \}; \} | - | Session Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1160 |
| `options.databaseHooks.session.create?` | \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1161 |
| `options.databaseHooks.session.create.before()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called before a session is created. if the hook returns false, the session will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1167 |
| `options.databaseHooks.session.create.after()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called after a session is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1173 |
| `options.databaseHooks.session.update?` | \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1178 |
| `options.databaseHooks.session.update.before()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called before a user is updated. if the hook returns false, the session will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1184 |
| `options.databaseHooks.session.update.after()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called after a session is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1190 |
| `options.databaseHooks.session.delete?` | \{ `before?`: (`session`, `context`) => `Promise`\<...\>; `after?`: (`session`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1192 |
| `options.databaseHooks.session.delete.before()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called before a session is deleted. if the hook returns false, the session will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1197 |
| `options.databaseHooks.session.delete.after()?` | (`session`, `context`) => `Promise`\<...\> | - | Hook that is called after a session is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1201 |
| `options.databaseHooks.account?` | \{ `create?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \}; \} | - | Account Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1207 |
| `options.databaseHooks.account.create?` | \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1208 |
| `options.databaseHooks.account.create.before()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called before a account is created. If the hook returns false, the account will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1214 |
| `options.databaseHooks.account.create.after()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called after a account is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1220 |
| `options.databaseHooks.account.update?` | \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \} | - | Update hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1225 |
| `options.databaseHooks.account.update.before()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called before a account is update. If the hook returns false, the user will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1231 |
| `options.databaseHooks.account.update.after()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called after a account is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1237 |
| `options.databaseHooks.account.delete?` | \{ `before?`: (`account`, `context`) => `Promise`\<...\>; `after?`: (`account`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1239 |
| `options.databaseHooks.account.delete.before()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called before an account is deleted. if the hook returns false, the account will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1244 |
| `options.databaseHooks.account.delete.after()?` | (`account`, `context`) => `Promise`\<...\> | - | Hook that is called after an account is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1248 |
| `options.databaseHooks.verification?` | \{ `create?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `update?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; `delete?`: \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \}; \} | - | Verification Hook | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1254 |
| `options.databaseHooks.verification.create?` | \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1255 |
| `options.databaseHooks.verification.create.before()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called before a verification is created. if the hook returns false, the verification will not be created. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1261 |
| `options.databaseHooks.verification.create.after()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called after a verification is created. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1267 |
| `options.databaseHooks.verification.update?` | \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1269 |
| `options.databaseHooks.verification.update.before()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called before a verification is updated. if the hook returns false, the verification will not be updated. If the hook returns an object, it'll be used instead of the original data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1275 |
| `options.databaseHooks.verification.update.after()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called after a verification is updated. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1281 |
| `options.databaseHooks.verification.delete?` | \{ `before?`: (`verification`, `context`) => `Promise`\<...\>; `after?`: (`verification`, `context`) => `Promise`\<...\>; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1283 |
| `options.databaseHooks.verification.delete.before()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called before a verification is deleted. if the hook returns false, the verification will not be deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1288 |
| `options.databaseHooks.verification.delete.after()?` | (`verification`, `context`) => `Promise`\<...\> | - | Hook that is called after a verification is deleted. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1292 |
| `options.onAPIError?` | \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \} | - | API error handling | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1299 |
| `options.onAPIError.throw?` | `boolean` | - | Throw an error on API error **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1305 |
| `options.onAPIError.onError()?` | (`error`, `ctx`) => `void` \| `Promise`\<`void`\> | - | Custom error handler | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1312 |
| `options.onAPIError.errorURL?` | `string` | - | The URL to redirect to on error When errorURL is provided, the error will be added to the URL as a query parameter and the user will be redirected to the errorURL. **Default** `- "/api/auth/error"` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1321 |
| `options.onAPIError.customizeDefaultErrorPage?` | \{ `colors?`: \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \}; `size?`: \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \}; `font?`: \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \} | - | Configure the default error page provided by Better-Auth Start your dev server and go to /api/auth/error to see the error page. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1326 |
| `options.onAPIError.customizeDefaultErrorPage.colors?` | \{ `background?`: `string`; `foreground?`: `string`; `primary?`: `string`; `primaryForeground?`: `string`; `mutedForeground?`: `string`; `border?`: `string`; `destructive?`: `string`; `titleBorder?`: `string`; `titleColor?`: `string`; `gridColor?`: `string`; `cardBackground?`: `string`; `cornerBorder?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1327 |
| `options.onAPIError.customizeDefaultErrorPage.colors.background?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1328 |
| `options.onAPIError.customizeDefaultErrorPage.colors.foreground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1329 |
| `options.onAPIError.customizeDefaultErrorPage.colors.primary?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1330 |
| `options.onAPIError.customizeDefaultErrorPage.colors.primaryForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1331 |
| `options.onAPIError.customizeDefaultErrorPage.colors.mutedForeground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1332 |
| `options.onAPIError.customizeDefaultErrorPage.colors.border?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1333 |
| `options.onAPIError.customizeDefaultErrorPage.colors.destructive?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1334 |
| `options.onAPIError.customizeDefaultErrorPage.colors.titleBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1335 |
| `options.onAPIError.customizeDefaultErrorPage.colors.titleColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1336 |
| `options.onAPIError.customizeDefaultErrorPage.colors.gridColor?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1337 |
| `options.onAPIError.customizeDefaultErrorPage.colors.cardBackground?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1338 |
| `options.onAPIError.customizeDefaultErrorPage.colors.cornerBorder?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1339 |
| `options.onAPIError.customizeDefaultErrorPage.size?` | \{ `radiusSm?`: `string`; `radiusMd?`: `string`; `radiusLg?`: `string`; `textSm?`: `string`; `text2xl?`: `string`; `text4xl?`: `string`; `text6xl?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1341 |
| `options.onAPIError.customizeDefaultErrorPage.size.radiusSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1342 |
| `options.onAPIError.customizeDefaultErrorPage.size.radiusMd?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1343 |
| `options.onAPIError.customizeDefaultErrorPage.size.radiusLg?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1344 |
| `options.onAPIError.customizeDefaultErrorPage.size.textSm?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1345 |
| `options.onAPIError.customizeDefaultErrorPage.size.text2xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1346 |
| `options.onAPIError.customizeDefaultErrorPage.size.text4xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1347 |
| `options.onAPIError.customizeDefaultErrorPage.size.text6xl?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1348 |
| `options.onAPIError.customizeDefaultErrorPage.font?` | \{ `defaultFamily?`: `string`; `monoFamily?`: `string`; \} | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1350 |
| `options.onAPIError.customizeDefaultErrorPage.font.defaultFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1351 |
| `options.onAPIError.customizeDefaultErrorPage.font.monoFamily?` | `string` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1352 |
| `options.onAPIError.customizeDefaultErrorPage.disableTitleBorder?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1354 |
| `options.onAPIError.customizeDefaultErrorPage.disableCornerDecorations?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1355 |
| `options.onAPIError.customizeDefaultErrorPage.disableBackgroundGrid?` | `boolean` | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1356 |
| `options.hooks?` | \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \} | - | Hooks | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1362 |
| `options.hooks.before()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | Before a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1366 |
| `options.hooks.after()?` | (`inputContext`) => `Promise`\<`unknown`\> | - | After a request is processed | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1370 |
| `options.disabledPaths?` | `string`[] | - | Disabled paths Paths you want to disable. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1377 |
| `options.telemetry?` | \{ `enabled?`: `boolean`; `debug?`: `boolean`; \} | - | Telemetry configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1381 |
| `options.telemetry.enabled?` | `boolean` | - | Enable telemetry collection **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1387 |
| `options.telemetry.debug?` | `boolean` | - | Enable debug mode **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1393 |
| `options.experimental?` | \{ `joins?`: `boolean`; \} | - | Experimental features | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1398 |
| `options.experimental.joins?` | `boolean` | - | Enable experimental joins for your database adapter. 	Please read the adapter documentation for more information regarding joins before enabling this. 	Not all adapters support joins. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:1407 |
| `options.basePath` | `string` | `resolvedBasePath` | - | [src/convex/client/index.ts:496](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L496) |
| `options.database` | `AdapterFactory`\<`BetterAuthOptions`\> | - | - | [src/convex/client/index.ts:497](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L497) |
| `options.emailAndPassword` | \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \} | - | - | [src/convex/client/index.ts:499](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L499) |
| `options.emailAndPassword.disableSignUp?` | `boolean` | - | Disable email and password sign up **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:573 |
| `options.emailAndPassword.requireEmailVerification?` | `boolean` | - | Require email verification before a session can be created for the user. if the user is not verified, the user will not be able to sign in and on sign in attempts, the user will be prompted to verify their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:581 |
| `options.emailAndPassword.maxPasswordLength?` | `number` | - | The maximum length of the password. **Default** `128` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:587 |
| `options.emailAndPassword.minPasswordLength?` | `number` | - | The minimum length of the password. **Default** `8` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:593 |
| `options.emailAndPassword.sendResetPassword()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | send reset password | node\_modules/@better-auth/core/dist/types/init-options.d.mts:597 |
| `options.emailAndPassword.resetPasswordTokenExpiresIn?` | `number` | - | Number of seconds the reset password token is valid for. **Default** `1 hour (60 * 60)` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:619 |
| `options.emailAndPassword.onPasswordReset()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user's password is changed successfully. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:624 |
| `options.emailAndPassword.password?` | \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \} | - | Password hashing and verification By default Scrypt is used for password hashing and verification. You can provide your own hashing and verification function. if you want to use a different algorithm. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:635 |
| `options.emailAndPassword.password.hash()?` | (`password`) => `Promise`\<`string`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:636 |
| `options.emailAndPassword.password.verify()?` | (`data`) => `Promise`\<`boolean`\> | - | - | node\_modules/@better-auth/core/dist/types/init-options.d.mts:637 |
| `options.emailAndPassword.autoSignIn?` | `boolean` | - | Automatically sign in the user after sign up **Default** `true` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:647 |
| `options.emailAndPassword.revokeSessionsOnPasswordReset?` | `boolean` | - | Whether to revoke all other sessions when resetting password **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:652 |
| `options.emailAndPassword.onExistingUserSignUp()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | A callback function that is triggered when a user tries to sign up with an email that already exists. Useful for notifying the existing user that someone attempted to register with their email. This is only called when `requireEmailVerification: true` or `autoSignIn: false`. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:660 |
| `options.emailAndPassword.customSyntheticUser()?` | (`params`) => `Record`\<`string`, `unknown`\> | - | Build a custom synthetic user for email enumeration protection. When a sign-up attempt is made with an email that already exists, this function is called to build the fake user response. Use this when plugins add fields to the user table (e.g. admin plugin adds `role`, `banned`, etc.) to ensure the fake response is indistinguishable from a real sign-up. **Example** `customSyntheticUser: ({ coreFields, additionalFields, id }) => ({ ...coreFields, role: "user", banned: false, banReason: null, banExpires: null, ...additionalFields, id, })` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:691 |
| `options.emailAndPassword.enabled` | `boolean` | `false` | Enable email and password authentication **Default** `false` | [src/convex/client/index.ts:500](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L500) |
| `options.user` | \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \} | - | - | [src/convex/client/index.ts:505](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L505) |
| `options.user.modelName?` | `"user"` \| `LiteralString` | - | The name of the model. Defaults to the model name. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:125 |
| `options.user.fields?` | `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\> | - | Map fields to database columns | node\_modules/@better-auth/core/dist/types/init-options.d.mts:129 |
| `options.user.additionalFields?` | \{ \[`key`: `string`\]: `DBFieldAttribute`; \} | - | Additional fields for the model | node\_modules/@better-auth/core/dist/types/init-options.d.mts:133 |
| `options.user.changeEmail?` | \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \} | - | Changing email configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:719 |
| `options.user.changeEmail.enabled` | `boolean` | - | Enable changing email **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:724 |
| `options.user.changeEmail.sendChangeEmailConfirmation()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a confirmation email to the old email address when the user changes their email. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:730 |
| `options.user.changeEmail.updateEmailWithoutVerification?` | `boolean` | - | Update the email without verification if the user is not verified. **Default** `false` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:740 |
| `options.user.deleteUser?` | \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \} | - | User deletion configuration | node\_modules/@better-auth/core/dist/types/init-options.d.mts:745 |
| `options.user.deleteUser.enabled?` | `boolean` | - | Enable user deletion | node\_modules/@better-auth/core/dist/types/init-options.d.mts:749 |
| `options.user.deleteUser.sendDeleteAccountVerification()?` | (`data`, `request?`) => `Promise`\<`void`\> | - | Send a verification email when the user deletes their account. if this is not set, the user will be deleted immediately. | node\_modules/@better-auth/core/dist/types/init-options.d.mts:757 |
| `options.user.deleteUser.beforeDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called before a user is deleted. to interrupt with error you can throw `APIError` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:767 |
| `options.user.deleteUser.afterDelete()?` | (`user`, `request?`) => `Promise`\<`void`\> | - | A function that is called after a user is deleted. This is useful for cleaning up user data | node\_modules/@better-auth/core/dist/types/init-options.d.mts:773 |
| `options.user.deleteUser.deleteTokenExpiresIn?` | `number` | - | The expiration time for the delete token. **Default** `1 day (60 * 60 * 24) in seconds` | node\_modules/@better-auth/core/dist/types/init-options.d.mts:779 |
| `options.plugins` | \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => `Promise`\<... \| ...\>; \} \| \{ `matcher`: (`ctx`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<\{ `context`: ...; \}\>; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<`unknown`\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: ...; `content`: ...; \}; \}; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: `string`; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => `Promise`\<\{ `session`: ...; \}\>[]; `metadata`: \{ `openapi`: \{ `description`: `string`; `responses`: \{ `200`: \{ `description`: ...; `content`: ...; \}; \}; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ otp: null \} \| \{ otp: string \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; type: ZodEnum\<(...)\>; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString \}, $strip\>; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean; token: string; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \} \| \{ status: boolean; token: null; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} & Record\<(...), (...)\> \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<ZodObject\<\{ email: ...; otp: ...; name: ...; image: ... \}, $strip\>, ZodRecord\<ZodString, ZodAny\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ token: string; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<\{ email: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<\{ email: ZodString; otp: ZodString; password: ZodString \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<\{ newEmail: ZodString; otp: ZodString \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: MiddlewareInputContext\<MiddlewareOptions\>) =\> Promise\<void\> \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; query: ZodOptional\<ZodObject\<\{ authenticatorAttachment: ...; name: ...; context: ... \}, $strip\>\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \} \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<\{ response: ZodAny; name: ZodOptional\<(...)\> \}, $strip\>; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ...; 400: ... \} \} \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<\{ response: ZodRecord\<(...), (...)\> \}, $strip\>; metadata: \{ openapi: \{ operationId: string; description: string; responses: \{ 200: ... \} \}; $Infer: \{ body: \{ response: ... \} \} \} \}, \{ session: \{ id: string; createdAt: Date; updatedAt: Date; userId: string; expiresAt: Date; token: string; ipAddress?: string \| null; userAgent?: string \| null \}; user: \{ id: string; createdAt: Date; updatedAt: Date; email: string; emailVerified: boolean; name: string; image?: string \| null \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: ((inputContext: MiddlewareInputContext\<(...)\>) =\> Promise\<(...)\>)\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<\{ id: ZodString; name: ZodString \}, $strip\>; use: (((inputContext: ...) =\> ...) \| ((inputContext: ...) =\> ...))\[\]; metadata: \{ openapi: \{ description: string; responses: \{ 200: ... \} \} \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: "string"; required: false \}; publicKey: \{ type: "string"; required: true \}; userId: \{ type: "string"; references: \{ model: string; field: string \}; required: true; index: true \}; credentialID: \{ type: "string"; required: true; index: true \}; counter: \{ type: "number"; required: true \}; deviceType: \{ type: "string"; required: true \}; backedUp: \{ type: "boolean"; required: true \}; transports: \{ type: "string"; required: false \}; createdAt: \{ type: "date"; required: false \}; aaguid: \{ type: "string"; required: false \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \})\[\]\] | - | - | [src/convex/client/index.ts:520](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L520) |
| `createAuth()` | (`ctx`) => `Auth`\<\{ `appName?`: `string`; `baseURL?`: `BaseURLConfig`; `secret?`: `string`; `secrets?`: \{ `version`: `number`; `value`: `string`; \}[]; `secondaryStorage?`: `SecondaryStorage`; `emailVerification?`: \{ `sendVerificationEmail?`: (`data`, `request?`) => `Promise`\<`void`\>; `sendOnSignUp?`: `boolean`; `sendOnSignIn?`: `boolean`; `autoSignInAfterVerification?`: `boolean`; `expiresIn?`: `number`; `beforeEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterEmailVerification?`: (`user`, `request?`) => `Promise`\<`void`\>; \}; `socialProviders?`: `SocialProviders`; `session?`: `BetterAuthDBOptions`\<`"session"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"`\> & \{ `expiresIn?`: `number`; `updateAge?`: `number`; `disableSessionRefresh?`: `boolean`; `deferSessionRefresh?`: `boolean`; `storeSessionInDatabase?`: `boolean`; `preserveSessionInDatabase?`: `boolean`; `cookieCache?`: \{ `maxAge?`: `number`; `enabled?`: `boolean`; `strategy?`: `"jwt"` \| `"compact"` \| `"jwe"`; `refreshCache?`: \| `boolean` \| \{ `updateAge?`: ...; \}; `version?`: `string` \| ((`session`, `user`) => ...) \| ((`session`, `user`) => ...); \}; `freshAge?`: `number`; \}; `account?`: `BetterAuthDBOptions`\<`"account"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"id"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\> & \{ `updateAccountOnSignIn?`: `boolean`; `accountLinking?`: \{ `enabled?`: `boolean`; `disableImplicitLinking?`: `boolean`; `requireLocalEmailVerified?`: `boolean`; `trustedProviders?`: ...[] \| ((`request?`) => ...); `allowDifferentEmails?`: `boolean`; `allowUnlinkingAll?`: `boolean`; `updateUserInfoOnLink?`: `boolean`; \}; `encryptOAuthTokens?`: `boolean`; `skipStateCookieCheck?`: `boolean`; `storeStateStrategy?`: `"database"` \| `"cookie"`; `storeAccountCookie?`: `boolean`; \}; `verification?`: `BetterAuthDBOptions`\<`"verification"`, `"createdAt"` \| `"updatedAt"` \| `"id"` \| `"expiresAt"` \| `"value"` \| `"identifier"`\> & \{ `disableCleanup?`: `boolean`; `storeIdentifier?`: \| `StoreIdentifierOption` \| \{ `default`: `StoreIdentifierOption`; `overrides?`: `Record`\<..., ...\>; \}; `storeInDatabase?`: `boolean`; \}; `trustedOrigins?`: \| `string`[] \| ((`request?`) => `Awaitable`\<(`string` \| `null` \| `undefined`)[]\>); `rateLimit?`: `BetterAuthRateLimitOptions`; `advanced?`: `BetterAuthAdvancedOptions`; `logger?`: `Logger`; `databaseHooks?`: \{ `user?`: \{ `create?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `update?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `delete?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; \}; `session?`: \{ `create?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `update?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `delete?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; \}; `account?`: \{ `create?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `update?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `delete?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; \}; `verification?`: \{ `create?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `update?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; `delete?`: \{ `before?`: ... \| ...; `after?`: ... \| ...; \}; \}; \}; `onAPIError?`: \{ `throw?`: `boolean`; `onError?`: (`error`, `ctx`) => `void` \| `Promise`\<`void`\>; `errorURL?`: `string`; `customizeDefaultErrorPage?`: \{ `colors?`: \{ `background?`: ... \| ...; `foreground?`: ... \| ...; `primary?`: ... \| ...; `primaryForeground?`: ... \| ...; `mutedForeground?`: ... \| ...; `border?`: ... \| ...; `destructive?`: ... \| ...; `titleBorder?`: ... \| ...; `titleColor?`: ... \| ...; `gridColor?`: ... \| ...; `cardBackground?`: ... \| ...; `cornerBorder?`: ... \| ...; \}; `size?`: \{ `radiusSm?`: ... \| ...; `radiusMd?`: ... \| ...; `radiusLg?`: ... \| ...; `textSm?`: ... \| ...; `text2xl?`: ... \| ...; `text4xl?`: ... \| ...; `text6xl?`: ... \| ...; \}; `font?`: \{ `defaultFamily?`: ... \| ...; `monoFamily?`: ... \| ...; \}; `disableTitleBorder?`: `boolean`; `disableCornerDecorations?`: `boolean`; `disableBackgroundGrid?`: `boolean`; \}; \}; `hooks?`: \{ `before?`: (`inputContext`) => `Promise`\<`unknown`\>; `after?`: (`inputContext`) => `Promise`\<`unknown`\>; \}; `disabledPaths?`: `string`[]; `telemetry?`: \{ `enabled?`: `boolean`; `debug?`: `boolean`; \}; `experimental?`: \{ `joins?`: `boolean`; \}; `basePath`: `string`; `database`: `AdapterFactory`\<`BetterAuthOptions`\>; `emailAndPassword`: \{ `disableSignUp?`: `boolean`; `requireEmailVerification?`: `boolean`; `maxPasswordLength?`: `number`; `minPasswordLength?`: `number`; `sendResetPassword?`: (`data`, `request?`) => `Promise`\<`void`\>; `resetPasswordTokenExpiresIn?`: `number`; `onPasswordReset?`: (`data`, `request?`) => `Promise`\<`void`\>; `password?`: \{ `hash?`: (`password`) => `Promise`\<`string`\>; `verify?`: (`data`) => `Promise`\<`boolean`\>; \}; `autoSignIn?`: `boolean`; `revokeSessionsOnPasswordReset?`: `boolean`; `onExistingUserSignUp?`: (`data`, `request?`) => `Promise`\<`void`\>; `customSyntheticUser?`: (`params`) => `Record`\<`string`, `unknown`\>; `enabled`: `boolean`; \}; `user`: \{ `modelName?`: `"user"` \| `LiteralString`; `fields?`: `Partial`\<`Record`\<`"name"` \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"image"`, `string`\>\>; `additionalFields?`: \{ \[`key`: `string`\]: `DBFieldAttribute`; \}; `changeEmail?`: \{ `enabled`: `boolean`; `sendChangeEmailConfirmation?`: (`data`, `request?`) => `Promise`\<`void`\>; `updateEmailWithoutVerification?`: `boolean`; \}; `deleteUser?`: \{ `enabled?`: `boolean`; `sendDeleteAccountVerification?`: (`data`, `request?`) => `Promise`\<`void`\>; `beforeDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `afterDelete?`: (`user`, `request?`) => `Promise`\<`void`\>; `deleteTokenExpiresIn?`: `number`; \}; \}; `plugins`: \[\{ `id`: `"convex"`; `version`: `string`; `init`: (`ctx`) => `void`; `hooks`: \{ `before`: ( \| \{ `matcher`: `boolean`; `handler`: (`inputContext`) => ...; \} \| \{ `matcher`: (`ctx`) => ...; `handler`: (`inputContext`) => ...; \})[]; `after`: \{ `matcher`: (`context`) => `boolean`; `handler`: (`inputContext`) => `Promise`\<...\>; \}[]; \}; `endpoints`: \{ `getOpenIdConfig`: `StrictEndpoint`\<`"/convex/.well-known/openid-configuration"`, \{ `method`: `"GET"`; `metadata`: \{ `isAction`: `false`; \}; \}, `OIDCMetadata`\>; `getJwks`: `StrictEndpoint`\<`"/convex/jwks"`, \{ `method`: `"GET"`; `metadata`: \{ `openapi`: \{ `description`: ...; `responses`: ...; \}; \}; \}, `JSONWebKeySet`\>; `getLatestJwks`: `StrictEndpoint`\<`"/convex/latest-jwks"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: ...; \}; \}; \}, `any`[]\>; `rotateKeys`: `StrictEndpoint`\<`"/convex/rotate-keys"`, \{ `isAction`: `boolean`; `method`: `"POST"`; `metadata`: \{ `SERVER_ONLY`: `true`; `openapi`: \{ `description`: ...; \}; \}; \}, `any`[]\>; `getToken`: `StrictEndpoint`\<`"/convex/token"`, \{ `method`: `"GET"`; `requireHeaders`: `true`; `use`: (`inputContext`) => ...[]; `metadata`: \{ `openapi`: \{ `description`: ...; `responses`: ...; \}; \}; \}, \{ `token`: `string`; \}\>; \}; `schema`: \{ `jwks`: \{ `fields`: \{ `publicKey`: \{ `type`: `"string"`; `required`: `true`; \}; `privateKey`: \{ `type`: `"string"`; `required`: `true`; \}; `createdAt`: \{ `type`: `"date"`; `required`: `true`; \}; `expiresAt`: \{ `type`: `"date"`; `required`: `false`; \}; \}; \}; `user`: \{ `fields`: \{ `userId`: \{ `type`: `"string"`; `required`: `false`; `input`: `false`; \}; \}; \}; \}; \}, ...(BetterAuthPlugin \| \{ id: "email-otp"; version: string; init: any; endpoints: \{ sendVerificationOTP: StrictEndpoint\<"/email-otp/send-verification-otp", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; createVerificationOTP: StrictEndpoint\<string, \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, string\>; getVerificationOTP: StrictEndpoint\<string, \{ method: "GET"; query: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ otp: ... \} \| \{ otp: ... \}\>; checkVerificationOTP: StrictEndpoint\<"/email-otp/check-verification-otp", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; verifyEmailOTP: StrictEndpoint\<"/email-otp/verify-email", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ status: ...; token: ...; user: ... \} \| \{ status: ...; token: ...; user: ... \}\>; signInEmailOTP: StrictEndpoint\<"/sign-in/email-otp", \{ method: "POST"; body: ZodIntersection\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ token: string; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} \}\>; requestPasswordResetEmailOTP: StrictEndpoint\<"/email-otp/request-password-reset", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; forgetPasswordEmailOTP: StrictEndpoint\<"/forget-password/email-otp", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; resetPasswordEmailOTP: StrictEndpoint\<"/email-otp/reset-password", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; requestEmailChangeEmailOTP: StrictEndpoint\<"/email-otp/request-email-change", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\>; changeEmailEmailOTP: StrictEndpoint\<"/email-otp/change-email", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ success: boolean \}\> \}; hooks: \{ after: \{ matcher: any; handler: (inputContext: ...) =\> ... \}\[\] \}; rateLimit: (\{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \} \| \{ pathMatcher: any; window: number; max: number \})\[\]; options: EmailOTPOptions; $ERROR\_CODES: \{ OTP\_EXPIRED: RawError\<"OTP\_EXPIRED"\>; INVALID\_OTP: RawError\<"INVALID\_OTP"\>; TOO\_MANY\_ATTEMPTS: RawError\<"TOO\_MANY\_ATTEMPTS"\> \} \} \| \{ id: "passkey"; version: string; endpoints: \{ generatePasskeyRegistrationOptions: StrictEndpoint\<"/passkey/generate-register-options", \{ method: "GET"; use: (...)\[\]; query: ZodOptional\<(...)\>; metadata: \{ openapi: ... \} \}, PublicKeyCredentialCreationOptionsJSON\>; generatePasskeyAuthenticationOptions: StrictEndpoint\<"/passkey/generate-authenticate-options", \{ method: "GET"; metadata: \{ openapi: ... \} \}, PublicKeyCredentialRequestOptionsJSON\>; verifyPasskeyRegistration: StrictEndpoint\<"/passkey/verify-registration", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, Passkey\>; verifyPasskeyAuthentication: StrictEndpoint\<"/passkey/verify-authentication", \{ method: "POST"; body: ZodObject\<(...), (...)\>; metadata: \{ openapi: ...; $Infer: ... \} \}, \{ session: \{ id: ...; createdAt: ...; updatedAt: ...; userId: ...; expiresAt: ...; token: ...; ipAddress?: ...; userAgent?: ... \}; user: \{ id: ...; createdAt: ...; updatedAt: ...; email: ...; emailVerified: ...; name: ...; image?: ... \} \}\>; listPasskeys: StrictEndpoint\<"/passkey/list-user-passkeys", \{ method: "GET"; use: (...)\[\]; metadata: \{ openapi: ... \} \}, Passkey\[\]\>; deletePasskey: StrictEndpoint\<"/passkey/delete-passkey", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ status: boolean \}\>; updatePasskey: StrictEndpoint\<"/passkey/update-passkey", \{ method: "POST"; body: ZodObject\<(...), (...)\>; use: (...)\[\]; metadata: \{ openapi: ... \} \}, \{ passkey: Passkey \}\> \}; schema: \{ passkey: \{ fields: \{ name: \{ type: ...; required: ... \}; publicKey: \{ type: ...; required: ... \}; userId: \{ type: ...; references: ...; required: ...; index: ... \}; credentialID: \{ type: ...; required: ...; index: ... \}; counter: \{ type: ...; required: ... \}; deviceType: \{ type: ...; required: ... \}; backedUp: \{ type: ...; required: ... \}; transports: \{ type: ...; required: ... \}; createdAt: \{ type: ...; required: ... \}; aaguid: \{ type: ...; required: ... \} \} \} \}; $ERROR\_CODES: \{ CHALLENGE\_NOT\_FOUND: RawError\<"CHALLENGE\_NOT\_FOUND"\>; YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY: RawError\<"YOU\_ARE\_NOT\_ALLOWED\_TO\_REGISTER\_THIS\_PASSKEY"\>; FAILED\_TO\_VERIFY\_REGISTRATION: RawError\<"FAILED\_TO\_VERIFY\_REGISTRATION"\>; PASSKEY\_NOT\_FOUND: RawError\<"PASSKEY\_NOT\_FOUND"\>; AUTHENTICATION\_FAILED: RawError\<"AUTHENTICATION\_FAILED"\>; UNABLE\_TO\_CREATE\_SESSION: RawError\<"UNABLE\_TO\_CREATE\_SESSION"\>; FAILED\_TO\_UPDATE\_PASSKEY: RawError\<"FAILED\_TO\_UPDATE\_PASSKEY"\>; PREVIOUSLY\_REGISTERED: RawError\<"PREVIOUSLY\_REGISTERED"\>; REGISTRATION\_CANCELLED: RawError\<"REGISTRATION\_CANCELLED"\>; AUTH\_CANCELLED: RawError\<"AUTH\_CANCELLED"\>; UNKNOWN\_ERROR: RawError\<"UNKNOWN\_ERROR"\>; SESSION\_REQUIRED: RawError\<"SESSION\_REQUIRED"\>; RESOLVE\_USER\_REQUIRED: RawError\<"RESOLVE\_USER\_REQUIRED"\>; RESOLVED\_USER\_INVALID: RawError\<"RESOLVED\_USER\_INVALID"\> \}; options: PasskeyOptions \| undefined \})\[\]\]; \}\> | `createAuthForContext` | - | [src/convex/client/index.ts:654](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L654) |
| `getAuthUser` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<`MaybeMakeLooseDataModel`\<\{ \[TableName in string\]: Schema\["tables"\]\[TableName\] extends TableDefinition\<DocumentType, Indexes, SearchIndexes, VectorIndexes\> ? \{ document: Expand\<(...) & (...)\>; fieldPaths: "\_id" \| ExtractFieldPaths\<(...)\>; indexes: Expand\<(...) & (...)\>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes \} : never \}, `Schema`\[`"strictTableNameTypes"`\]\>\[`"user"`\]\[`"document"`\]\>\> | - | - | [src/convex/client/index.ts:655](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/client/index.ts#L655) |

#### Example

```ts
import { setupAuth } from 'nuxt-backend/convex'
import { components } from './_generated/api'
import { query } from './_generated/server'

export const { authComponent, createAuth, getAuthUser } = setupAuth(
  components.backend, query,
)
```
