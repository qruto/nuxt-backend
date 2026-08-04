---
navigation: true
---

# runtime/vue/composables/use-auth

## Interfaces

### UseBackendAuthService

Defined in: [nuxt-backend/src/runtime/vue/composables/use-auth.ts:8](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L8)

The backend identity service: the base Convex + Better Auth service
extended with this package's passwordless flows and authorization reads.

#### Extends

- `UseAuthService`

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="signout"></a> `signOut` | () => `Promise`\<`unknown`\> | Sign the current user out. | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:11](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L11) |
| <a id="sendotp"></a> `sendOtp` | (`email`, `type?`) => `Promise`\<`unknown`\> | Send a sign-in / verification OTP code to an email. | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:13](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L13) |
| <a id="signinwithotp"></a> `signInWithOtp` | (`args`) => `Promise`\<`unknown`\> | Complete sign-in (or passwordless sign-up) with an emailed OTP code. | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:15](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L15) |
| <a id="signinwithpasskey"></a> `signInWithPasskey` | () => `Promise`\<`unknown`\> | Sign in with a passkey (WebAuthn). | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:17](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L17) |
| <a id="registerpasskey"></a> `registerPasskey` | (`context?`) => `Promise`\<`unknown`\> | Register a passkey — pass `{ email, name }` (JSON) for pre-auth registration. | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:19](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L19) |
| <a id="changeemail"></a> `changeEmail` | (`newEmail`, `callbackURL?`) => `Promise`\<`unknown`\> | Change the account email (confirmed via email). | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:22](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L22) |
| <a id="deleteaccount"></a> `deleteAccount` | () => `Promise`\<`unknown`\> | Delete the account (confirmed via email). | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:24](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L24) |
| <a id="role"></a> `role` | `ComputedRef`\<`string`\> | The app-wide role; `'user'` when signed out or unset. | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:27](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L27) |
| <a id="hasrole"></a> `hasRole` | (`role`) => `boolean` | Whether the user has (any of) the given app-wide role(s). | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:29](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L29) |
| <a id="can"></a> `can` | (`permissions`) => `boolean` | Check permission statements (e.g. `{ user: ['ban'] }`) against the user's role — sync and local. | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:31](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L31) |
| <a id="banned"></a> `banned` | `ComputedRef`\<`boolean`\> | Whether the account is banned. | - | [nuxt-backend/src/runtime/vue/composables/use-auth.ts:33](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L33) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | - | `UseAuthService.isLoading` | [nuxt-convex-module/src/runtime/better-auth/vue/use-auth.ts:37](https://github.com/qruto/nuxt-convex-module/blob/26ea0fc004a2dcef3ad31568d8f881bccd846eb1/src/runtime/better-auth/vue/use-auth.ts#L37) |
| <a id="isauthenticated"></a> `isAuthenticated` | `ComputedRef`\<`boolean`\> | - | `UseAuthService.isAuthenticated` | [nuxt-convex-module/src/runtime/better-auth/vue/use-auth.ts:38](https://github.com/qruto/nuxt-convex-module/blob/26ea0fc004a2dcef3ad31568d8f881bccd846eb1/src/runtime/better-auth/vue/use-auth.ts#L38) |
| <a id="fetchaccesstoken"></a> `fetchAccessToken` | `AuthTokenFetcher` | - | `UseAuthService.fetchAccessToken` | [nuxt-convex-module/src/runtime/better-auth/vue/use-auth.ts:39](https://github.com/qruto/nuxt-convex-module/blob/26ea0fc004a2dcef3ad31568d8f881bccd846eb1/src/runtime/better-auth/vue/use-auth.ts#L39) |
| <a id="client"></a> `client` | `AuthClient` | - | `UseAuthService.client` | [nuxt-convex-module/src/runtime/better-auth/vue/use-auth.ts:43](https://github.com/qruto/nuxt-convex-module/blob/26ea0fc004a2dcef3ad31568d8f881bccd846eb1/src/runtime/better-auth/vue/use-auth.ts#L43) |
| <a id="session"></a> `session` | `any` | - | `UseAuthService.session` | [nuxt-convex-module/src/runtime/better-auth/vue/use-auth.ts:44](https://github.com/qruto/nuxt-convex-module/blob/26ea0fc004a2dcef3ad31568d8f881bccd846eb1/src/runtime/better-auth/vue/use-auth.ts#L44) |
| <a id="user"></a> `user` | `ComputedRef`\<`AuthUser` \| `null`\> | The current user, or `null` when signed out / still loading. | `UseAuthService.user` | [nuxt-convex-module/src/runtime/better-auth/vue/use-auth.ts:46](https://github.com/qruto/nuxt-convex-module/blob/26ea0fc004a2dcef3ad31568d8f881bccd846eb1/src/runtime/better-auth/vue/use-auth.ts#L46) |
| <a id="authversion"></a> `authVersion` | `ComputedRef`\<`string` \| `null`\> | - | `UseAuthService.authVersion` | [nuxt-convex-module/src/runtime/better-auth/vue/use-auth.ts:47](https://github.com/qruto/nuxt-convex-module/blob/26ea0fc004a2dcef3ad31568d8f881bccd846eb1/src/runtime/better-auth/vue/use-auth.ts#L47) |

## Functions

### useAuth()

```ts
function useAuth(initialToken?): UseBackendAuthService;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-auth.ts:48](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/runtime/vue/composables/use-auth.ts#L48)

The backend identity composable — the base Better Auth service
(`isLoading`, `isAuthenticated`, `fetchAccessToken`, `client`, `session`,
`user`, `authVersion`) extended with the passwordless flows and
authorization reads this package is opinionated about. Everything else
(admin/organization management, …) lives on the fully-typed `client`.

Registered with import priority over the base module's `useAuth`, so this
is what `useAuth()` resolves to in apps using `nuxt-backend`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `initialToken?` | `string` \| `null` | Optional preloaded token (SSR), forwarded to the base. |

#### Returns

[`UseBackendAuthService`](#usebackendauthservice)
