---
navigation: true
---

# convex/auth.config

## Interfaces

### DefineBackendAuthConfigOptions

Defined in: [src/convex/auth.config.ts:5](https://github.com/qruto/nuxt-backend/blob/main/src/convex/auth.config.ts#L5)

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="basepath"></a> `basePath?` | `string` | [src/convex/auth.config.ts:6](https://github.com/qruto/nuxt-backend/blob/main/src/convex/auth.config.ts#L6) |
| <a id="jwks"></a> `jwks?` | `string` | [src/convex/auth.config.ts:7](https://github.com/qruto/nuxt-backend/blob/main/src/convex/auth.config.ts#L7) |

## Variables

### default

```ts
default: AuthConfig;
```

Defined in: [src/convex/auth.config.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/convex/auth.config.ts#L21)

## Functions

### defineBackendAuthConfig()

```ts
function defineBackendAuthConfig(options?): AuthConfig;
```

Defined in: [src/convex/auth.config.ts:10](https://github.com/qruto/nuxt-backend/blob/main/src/convex/auth.config.ts#L10)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`DefineBackendAuthConfigOptions`](#definebackendauthconfigoptions) |

#### Returns

`AuthConfig`
