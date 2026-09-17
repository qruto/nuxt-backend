---
navigation: true
---

# convex/components/backend/schema

## Variables

### tables

```ts
const tables: {
  user: TableDefinition<VObject<{
     image?: string | null;
     role?: string | null;
     banReason?: string | null;
     banned?: boolean | null;
     banExpires?: number | null;
     createdAt: number;
     updatedAt: number;
     email: string;
     emailVerified: boolean;
     name: string;
   }, {
     name: VString<string, "required">;
     email: VString<string, "required">;
     emailVerified: VBoolean<boolean, "required">;
     image: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
     role: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     banned: VUnion<boolean | null | undefined, [VNull<null, "required">, VBoolean<boolean, "required">], "optional", never>;
     banReason: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     banExpires: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "email"
     | "emailVerified"
     | "name"
     | "image"
     | "role"
     | "banReason"
     | "banned"
     | "banExpires">, {
     email_name: ["email", "name", "_creationTime"];
     name: ["name", "_creationTime"];
   }, {
   }, {
  }>;
  session: TableDefinition<VObject<{
     ipAddress?: string | null;
     userAgent?: string | null;
     activeOrganizationId?: string | null;
     impersonatedBy?: string | null;
     createdAt: number;
     updatedAt: number;
     userId: string;
     expiresAt: number;
     token: string;
   }, {
     expiresAt: VFloat64<number, "required">;
     token: VString<string, "required">;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
     ipAddress: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userAgent: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userId: VString<string, "required">;
     impersonatedBy: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     activeOrganizationId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "expiresAt"
     | "token"
     | "ipAddress"
     | "userAgent"
     | "activeOrganizationId"
     | "impersonatedBy">, {
     expiresAt: ["expiresAt", "_creationTime"];
     expiresAt_userId: ["expiresAt", "userId", "_creationTime"];
     token: ["token", "_creationTime"];
     userId: ["userId", "_creationTime"];
     userId_expiresAt: ["userId", "expiresAt", "_creationTime"];
   }, {
   }, {
  }>;
  account: TableDefinition<VObject<{
     password?: string | null;
     accessToken?: string | null;
     refreshToken?: string | null;
     idToken?: string | null;
     accessTokenExpiresAt?: number | null;
     refreshTokenExpiresAt?: number | null;
     scope?: string | null;
     createdAt: number;
     updatedAt: number;
     userId: string;
     accountId: string;
     providerId: string;
   }, {
     accountId: VString<string, "required">;
     providerId: VString<string, "required">;
     userId: VString<string, "required">;
     accessToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     refreshToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     idToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     accessTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     refreshTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     scope: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     password: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "password"
     | "accountId"
     | "providerId"
     | "accessToken"
     | "refreshToken"
     | "idToken"
     | "accessTokenExpiresAt"
     | "refreshTokenExpiresAt"
     | "scope">, {
     accountId: ["accountId", "_creationTime"];
     accountId_providerId: ["accountId", "providerId", "_creationTime"];
     providerId_userId: ["providerId", "userId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  verification: TableDefinition<VObject<{
     value: string;
     createdAt: number;
     updatedAt: number;
     expiresAt: number;
     identifier: string;
   }, {
     identifier: VString<string, "required">;
     value: VString<string, "required">;
     expiresAt: VFloat64<number, "required">;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
   }, "required", "value" | "createdAt" | "updatedAt" | "expiresAt" | "identifier">, {
     expiresAt: ["expiresAt", "_creationTime"];
     identifier: ["identifier", "_creationTime"];
   }, {
   }, {
  }>;
  rateLimit: TableDefinition<VObject<{
     key: string;
     count: number;
     lastRequest: number;
   }, {
     key: VString<string, "required">;
     count: VFloat64<number, "required">;
     lastRequest: VFloat64<number, "required">;
   }, "required", "key" | "count" | "lastRequest">, {
     key: ["key", "_creationTime"];
   }, {
   }, {
  }>;
  passkey: TableDefinition<VObject<{
     createdAt?: number | null;
     name?: string | null;
     transports?: string | null;
     aaguid?: string | null;
     userId: string;
     publicKey: string;
     credentialID: string;
     counter: number;
     deviceType: string;
     backedUp: boolean;
   }, {
     name: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     publicKey: VString<string, "required">;
     userId: VString<string, "required">;
     credentialID: VString<string, "required">;
     counter: VFloat64<number, "required">;
     deviceType: VString<string, "required">;
     backedUp: VBoolean<boolean, "required">;
     transports: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     aaguid: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "name"
     | "userId"
     | "publicKey"
     | "credentialID"
     | "counter"
     | "deviceType"
     | "backedUp"
     | "transports"
     | "aaguid">, {
     credentialID: ["credentialID", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  jwks: TableDefinition<VObject<{
     expiresAt?: number | null;
     createdAt: number;
     publicKey: string;
     privateKey: string;
   }, {
     publicKey: VString<string, "required">;
     privateKey: VString<string, "required">;
     createdAt: VFloat64<number, "required">;
     expiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", "createdAt" | "expiresAt" | "publicKey" | "privateKey">, {
   }, {
   }, {
  }>;
  organization: TableDefinition<VObject<{
     metadata?: string | null;
     logo?: string | null;
     createdAt: number;
     name: string;
     slug: string;
   }, {
     name: VString<string, "required">;
     slug: VString<string, "required">;
     logo: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VFloat64<number, "required">;
     metadata: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
   }, "required", "createdAt" | "name" | "metadata" | "slug" | "logo">, {
     name: ["name", "_creationTime"];
     slug: ["slug", "_creationTime"];
   }, {
   }, {
  }>;
  member: TableDefinition<VObject<{
     createdAt: number;
     userId: string;
     organizationId: string;
     role: string;
   }, {
     organizationId: VString<string, "required">;
     userId: VString<string, "required">;
     role: VString<string, "required">;
     createdAt: VFloat64<number, "required">;
   }, "required", "createdAt" | "userId" | "organizationId" | "role">, {
     organizationId: ["organizationId", "_creationTime"];
     organizationId_userId: ["organizationId", "userId", "_creationTime"];
     userId: ["userId", "_creationTime"];
     role: ["role", "_creationTime"];
   }, {
   }, {
  }>;
  invitation: TableDefinition<VObject<{
     role?: string | null;
     createdAt: number;
     email: string;
     expiresAt: number;
     organizationId: string;
     status: string;
     inviterId: string;
   }, {
     organizationId: VString<string, "required">;
     email: VString<string, "required">;
     role: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     status: VString<string, "required">;
     expiresAt: VFloat64<number, "required">;
     createdAt: VFloat64<number, "required">;
     inviterId: VString<string, "required">;
   }, "required", 
     | "createdAt"
     | "email"
     | "expiresAt"
     | "organizationId"
     | "role"
     | "status"
     | "inviterId">, {
     organizationId: ["organizationId", "_creationTime"];
     email: ["email", "_creationTime"];
     role: ["role", "_creationTime"];
     status: ["status", "_creationTime"];
     inviterId: ["inviterId", "_creationTime"];
   }, {
   }, {
  }>;
  oauthApplication: TableDefinition<VObject<{
     type?: string | null;
     createdAt?: number | null;
     updatedAt?: number | null;
     name?: string | null;
     userId?: string | null;
     metadata?: string | null;
     icon?: string | null;
     clientId?: string | null;
     clientSecret?: string | null;
     redirectUrls?: string | null;
     disabled?: boolean | null;
   }, {
     name: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     icon: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     metadata: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     clientId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     clientSecret: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     redirectUrls: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     type: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     disabled: VUnion<boolean | null | undefined, [VNull<null, "required">, VBoolean<boolean, "required">], "optional", never>;
     userId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     updatedAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", 
     | "type"
     | "createdAt"
     | "updatedAt"
     | "name"
     | "userId"
     | "metadata"
     | "icon"
     | "clientId"
     | "clientSecret"
     | "redirectUrls"
     | "disabled">, {
     clientId: ["clientId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  oauthAccessToken: TableDefinition<VObject<{
     createdAt?: number | null;
     updatedAt?: number | null;
     userId?: string | null;
     accessToken?: string | null;
     refreshToken?: string | null;
     accessTokenExpiresAt?: number | null;
     refreshTokenExpiresAt?: number | null;
     clientId?: string | null;
     scopes?: string | null;
   }, {
     accessToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     refreshToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     accessTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     refreshTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     clientId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     scopes: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     updatedAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "accessToken"
     | "refreshToken"
     | "accessTokenExpiresAt"
     | "refreshTokenExpiresAt"
     | "clientId"
     | "scopes">, {
     accessToken: ["accessToken", "_creationTime"];
     refreshToken: ["refreshToken", "_creationTime"];
     clientId: ["clientId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  oauthConsent: TableDefinition<VObject<{
     createdAt?: number | null;
     updatedAt?: number | null;
     userId?: string | null;
     clientId?: string | null;
     scopes?: string | null;
     consentGiven?: boolean | null;
   }, {
     clientId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     scopes: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     updatedAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     consentGiven: VUnion<boolean | null | undefined, [VNull<null, "required">, VBoolean<boolean, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "clientId"
     | "scopes"
     | "consentGiven">, {
     clientId_userId: ["clientId", "userId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
};
```

Defined in: [src/convex/components/backend/schema.ts:16](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L16)

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-user"></a> `user` | `TableDefinition`\<`VObject`\<\{ `image?`: `string` \| `null`; `role?`: `string` \| `null`; `banReason?`: `string` \| `null`; `banned?`: `boolean` \| `null`; `banExpires?`: `number` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `email`: `string`; `emailVerified`: `boolean`; `name`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `emailVerified`: `VBoolean`\<`boolean`, `"required"`\>; `image`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `role`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `banned`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; `banReason`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `banExpires`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"email"` \| `"emailVerified"` \| `"name"` \| `"image"` \| `"role"` \| `"banReason"` \| `"banned"` \| `"banExpires"`\>, \{ `email_name`: \[`"email"`, `"name"`, `"_creationTime"`\]; `name`: \[`"name"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:17](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L17) |
| <a id="property-session"></a> `session` | `TableDefinition`\<`VObject`\<\{ `ipAddress?`: `string` \| `null`; `userAgent?`: `string` \| `null`; `activeOrganizationId?`: `string` \| `null`; `impersonatedBy?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `expiresAt`: `number`; `token`: `string`; \}, \{ `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `token`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; `ipAddress`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userAgent`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VString`\<`string`, `"required"`\>; `impersonatedBy`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `activeOrganizationId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"expiresAt"` \| `"token"` \| `"ipAddress"` \| `"userAgent"` \| `"activeOrganizationId"` \| `"impersonatedBy"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `expiresAt_userId`: \[`"expiresAt"`, `"userId"`, `"_creationTime"`\]; `token`: \[`"token"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; `userId_expiresAt`: \[`"userId"`, `"expiresAt"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:32](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L32) |
| <a id="property-account"></a> `account` | `TableDefinition`\<`VObject`\<\{ `password?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `idToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `scope?`: `string` \| `null`; `createdAt`: `number`; `updatedAt`: `number`; `userId`: `string`; `accountId`: `string`; `providerId`: `string`; \}, \{ `accountId`: `VString`\<`string`, `"required"`\>; `providerId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `idToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `scope`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `password`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"password"` \| `"accountId"` \| `"providerId"` \| `"accessToken"` \| `"refreshToken"` \| `"idToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"scope"`\>, \{ `accountId`: \[`"accountId"`, `"_creationTime"`\]; `accountId_providerId`: \[`"accountId"`, `"providerId"`, `"_creationTime"`\]; `providerId_userId`: \[`"providerId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L51) |
| <a id="property-verification"></a> `verification` | `TableDefinition`\<`VObject`\<\{ `value`: `string`; `createdAt`: `number`; `updatedAt`: `number`; `expiresAt`: `number`; `identifier`: `string`; \}, \{ `identifier`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"value"` \| `"createdAt"` \| `"updatedAt"` \| `"expiresAt"` \| `"identifier"`\>, \{ `expiresAt`: \[`"expiresAt"`, `"_creationTime"`\]; `identifier`: \[`"identifier"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:69](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L69) |
| <a id="property-ratelimit"></a> `rateLimit` | `TableDefinition`\<`VObject`\<\{ `key`: `string`; `count`: `number`; `lastRequest`: `number`; \}, \{ `key`: `VString`\<`string`, `"required"`\>; `count`: `VFloat64`\<`number`, `"required"`\>; `lastRequest`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"key"` \| `"count"` \| `"lastRequest"`\>, \{ `key`: \[`"key"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:78](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L78) |
| <a id="property-passkey"></a> `passkey` | `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `name?`: `string` \| `null`; `transports?`: `string` \| `null`; `aaguid?`: `string` \| `null`; `userId`: `string`; `publicKey`: `string`; `credentialID`: `string`; `counter`: `number`; `deviceType`: `string`; `backedUp`: `boolean`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `publicKey`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `credentialID`: `VString`\<`string`, `"required"`\>; `counter`: `VFloat64`\<`number`, `"required"`\>; `deviceType`: `VString`\<`string`, `"required"`\>; `backedUp`: `VBoolean`\<`boolean`, `"required"`\>; `transports`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `aaguid`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"name"` \| `"userId"` \| `"publicKey"` \| `"credentialID"` \| `"counter"` \| `"deviceType"` \| `"backedUp"` \| `"transports"` \| `"aaguid"`\>, \{ `credentialID`: \[`"credentialID"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:85](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L85) |
| <a id="property-jwks"></a> `jwks` | `TableDefinition`\<`VObject`\<\{ `expiresAt?`: `number` \| `null`; `createdAt`: `number`; `publicKey`: `string`; `privateKey`: `string`; \}, \{ `publicKey`: `VString`\<`string`, `"required"`\>; `privateKey`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `expiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"expiresAt"` \| `"publicKey"` \| `"privateKey"`\>, \{ \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:100](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L100) |
| <a id="property-organization"></a> `organization` | `TableDefinition`\<`VObject`\<\{ `metadata?`: `string` \| `null`; `logo?`: `string` \| `null`; `createdAt`: `number`; `name`: `string`; `slug`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `slug`: `VString`\<`string`, `"required"`\>; `logo`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `metadata`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, `"createdAt"` \| `"name"` \| `"metadata"` \| `"slug"` \| `"logo"`\>, \{ `name`: \[`"name"`, `"_creationTime"`\]; `slug`: \[`"slug"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:107](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L107) |
| <a id="property-member"></a> `member` | `TableDefinition`\<`VObject`\<\{ `createdAt`: `number`; `userId`: `string`; `organizationId`: `string`; `role`: `string`; \}, \{ `organizationId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `role`: `VString`\<`string`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"createdAt"` \| `"userId"` \| `"organizationId"` \| `"role"`\>, \{ `organizationId`: \[`"organizationId"`, `"_creationTime"`\]; `organizationId_userId`: \[`"organizationId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; `role`: \[`"role"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:116](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L116) |
| <a id="property-invitation"></a> `invitation` | `TableDefinition`\<`VObject`\<\{ `role?`: `string` \| `null`; `createdAt`: `number`; `email`: `string`; `expiresAt`: `number`; `organizationId`: `string`; `status`: `string`; `inviterId`: `string`; \}, \{ `organizationId`: `VString`\<`string`, `"required"`\>; `email`: `VString`\<`string`, `"required"`\>; `role`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `status`: `VString`\<`string`, `"required"`\>; `expiresAt`: `VFloat64`\<`number`, `"required"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `inviterId`: `VString`\<`string`, `"required"`\>; \}, `"required"`, \| `"createdAt"` \| `"email"` \| `"expiresAt"` \| `"organizationId"` \| `"role"` \| `"status"` \| `"inviterId"`\>, \{ `organizationId`: \[`"organizationId"`, `"_creationTime"`\]; `email`: \[`"email"`, `"_creationTime"`\]; `role`: \[`"role"`, `"_creationTime"`\]; `status`: \[`"status"`, `"_creationTime"`\]; `inviterId`: \[`"inviterId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:128](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L128) |
| <a id="property-oauthapplication"></a> `oauthApplication` | `TableDefinition`\<`VObject`\<\{ `type?`: `string` \| `null`; `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `name?`: `string` \| `null`; `userId?`: `string` \| `null`; `metadata?`: `string` \| `null`; `icon?`: `string` \| `null`; `clientId?`: `string` \| `null`; `clientSecret?`: `string` \| `null`; `redirectUrls?`: `string` \| `null`; `disabled?`: `boolean` \| `null`; \}, \{ `name`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `icon`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `metadata`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `clientSecret`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `redirectUrls`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `type`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `disabled`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"type"` \| `"createdAt"` \| `"updatedAt"` \| `"name"` \| `"userId"` \| `"metadata"` \| `"icon"` \| `"clientId"` \| `"clientSecret"` \| `"redirectUrls"` \| `"disabled"`\>, \{ `clientId`: \[`"clientId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:148](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L148) |
| <a id="property-oauthaccesstoken"></a> `oauthAccessToken` | `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `userId?`: `string` \| `null`; `accessToken?`: `string` \| `null`; `refreshToken?`: `string` \| `null`; `accessTokenExpiresAt?`: `number` \| `null`; `refreshTokenExpiresAt?`: `number` \| `null`; `clientId?`: `string` \| `null`; `scopes?`: `string` \| `null`; \}, \{ `accessToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `refreshToken`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `accessTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `refreshTokenExpiresAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `scopes`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"accessToken"` \| `"refreshToken"` \| `"accessTokenExpiresAt"` \| `"refreshTokenExpiresAt"` \| `"clientId"` \| `"scopes"`\>, \{ `accessToken`: \[`"accessToken"`, `"_creationTime"`\]; `refreshToken`: \[`"refreshToken"`, `"_creationTime"`\]; `clientId`: \[`"clientId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:163](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L163) |
| <a id="property-oauthconsent"></a> `oauthConsent` | `TableDefinition`\<`VObject`\<\{ `createdAt?`: `number` \| `null`; `updatedAt?`: `number` \| `null`; `userId?`: `string` \| `null`; `clientId?`: `string` \| `null`; `scopes?`: `string` \| `null`; `consentGiven?`: `boolean` \| `null`; \}, \{ `clientId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `userId`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `scopes`: `VUnion`\<`string` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VString`\<`string`, `"required"`\>\], `"optional"`, `never`\>; `createdAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `updatedAt`: `VUnion`\<`number` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"optional"`, `never`\>; `consentGiven`: `VUnion`\<`boolean` \| `null` \| `undefined`, \[`VNull`\<`null`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"optional"`, `never`\>; \}, `"required"`, \| `"createdAt"` \| `"updatedAt"` \| `"userId"` \| `"clientId"` \| `"scopes"` \| `"consentGiven"`\>, \{ `clientId_userId`: \[`"clientId"`, `"userId"`, `"_creationTime"`\]; `userId`: \[`"userId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:178](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L178) |

***

### vEntitlementBenefit

```ts
const vEntitlementBenefit: VObject<{
  metadata?: Record<string, string | number | boolean>;
  type: string;
  id: string;
  benefitId: string;
}, {
  id: VString<string, "required">;
  benefitId: VString<string, "required">;
  type: VString<string, "required">;
  metadata: VRecord<Record<string, string | number | boolean> | undefined, VString<string, "required">, VUnion<string | number | boolean, [VString<string, "required">, VFloat64<number, "required">, VBoolean<boolean, "required">], "required", never>, "optional", string>;
}, "required", "type" | "id" | "metadata" | "benefitId" | `metadata.${string}`>;
```

Defined in: [src/convex/components/backend/schema.ts:204](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L204)

Billing entitlement cache — the current user's active plans, granted benefits
(feature-gating) and credit-meter balances, synced from Polar by `setupBilling`
(see `src/convex/integrations/billing.ts`) and served reactively to
`useFeatures()` / `useCredits()`.

Kept inside this component so consumers add **nothing** to their own schema —
the same "ships out of the box" rationale as the nested Resend email. The
validators are shared with the component's billing functions (`billing.ts`) and
the app-level cache mutation, so the shape is defined once.

Intentionally NOT part of the auth-only `tables` export above (which is spread
into consumer schemas for local installs) — billing data is the component's own.

***

### vEntitlementMeter

```ts
const vEntitlementMeter: VObject<{
  cycleStart?: number;
  cycleEnd?: number;
  rollover?: boolean;
  meterId: string;
  consumedUnits: number;
  creditedUnits: number;
  balance: number;
}, {
  meterId: VString<string, "required">;
  consumedUnits: VFloat64<number, "required">;
  creditedUnits: VFloat64<number, "required">;
  balance: VFloat64<number, "required">;
  cycleStart: VFloat64<number | undefined, "optional">;
  cycleEnd: VFloat64<number | undefined, "optional">;
  rollover: VBoolean<boolean | undefined, "optional">;
}, "required", 
  | "meterId"
  | "consumedUnits"
  | "creditedUnits"
  | "balance"
  | "cycleStart"
  | "cycleEnd"
| "rollover">;
```

Defined in: [src/convex/components/backend/schema.ts:213](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L213)

***

### vPendingSpend

```ts
const vPendingSpend: VObject<{
  releaseJobId?: string;
  at: number;
  meterId: string;
  amount: number;
  externalId: string;
}, {
  meterId: VString<string, "required">;
  amount: VFloat64<number, "required">;
  externalId: VString<string, "required">;
  at: VFloat64<number, "required">;
  releaseJobId: VString<string | undefined, "optional">;
}, "required", "at" | "meterId" | "amount" | "externalId" | "releaseJobId">;
```

Defined in: [src/convex/components/backend/schema.ts:247](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L247)

An in-flight credit reservation (reserve → run → settle): `debit` records
it while atomically decrementing the cached balance, `settle` drops it once
the provider event is ingested (releasing the unspent remainder when the
final amount came in under the estimate), `release` re-credits on failure.
`upsert` subtracts still-active reservations from freshly synced provider
state so a webhook refresh can't resurrect balance that is being spent.
Entries outlive their usefulness after PENDING\_SPEND\_TTL\_MS
(crashed flows) and are pruned on every touch — the cache stays a cache,
never a ledger.

***

### vGift

```ts
const vGift: VObject<{
  message?: string;
  purchaserEmail?: string;
  purchaserName?: string;
  billingOrderId?: string;
  claimedByUserId?: string;
  claimedEntityId?: string;
  paidAt?: number;
  notifiedAt?: number;
  claimedAt?: number;
  id: string;
  createdAt: number;
  status: string;
  recipientEmail: string;
  purchaserUserId: string;
  productIds: string[];
  billingCustomerId: string;
}, {
  id: VString<string, "required">;
  recipientEmail: VString<string, "required">;
  purchaserUserId: VString<string, "required">;
  purchaserEmail: VString<string | undefined, "optional">;
  purchaserName: VString<string | undefined, "optional">;
  productIds: VArray<string[], VString<string, "required">, "required">;
  message: VString<string | undefined, "optional">;
  status: VString<string, "required">;
  billingCustomerId: VString<string, "required">;
  billingOrderId: VString<string | undefined, "optional">;
  claimedByUserId: VString<string | undefined, "optional">;
  claimedEntityId: VString<string | undefined, "optional">;
  createdAt: VFloat64<number, "required">;
  paidAt: VFloat64<number | undefined, "optional">;
  notifiedAt: VFloat64<number | undefined, "optional">;
  claimedAt: VFloat64<number | undefined, "optional">;
}, "required", 
  | "id"
  | "createdAt"
  | "message"
  | "status"
  | "recipientEmail"
  | "purchaserUserId"
  | "purchaserEmail"
  | "purchaserName"
  | "productIds"
  | "billingCustomerId"
  | "billingOrderId"
  | "claimedByUserId"
  | "claimedEntityId"
  | "paidAt"
  | "notifiedAt"
| "claimedAt">;
```

Defined in: [src/convex/components/backend/schema.ts:269](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L269)

A gift purchase: one user pays for products (credit packs, plans) that a
recipient — identified by email — receives. Created at gift checkout, marked
`paid` by the billing webhook, and `claimed` once the entitlement is attached
to the recipient's billing entity (automatically when the recipient already
has an account, otherwise on their first sign-in).

***

### billingTables

```ts
const billingTables: {
  billingEntitlements: TableDefinition<VObject<{
     customerId?: string;
     pendingSpends?: {
        releaseJobId?: string;
        at: number;
        meterId: string;
        amount: number;
        externalId: string;
     }[];
     updatedAt: number;
     userId: string;
     activeProductIds: string[];
     benefits: {
        metadata?: Record<string, string | number | boolean>;
        type: string;
        id: string;
        benefitId: string;
     }[];
     meters: {
        cycleStart?: number;
        cycleEnd?: number;
        rollover?: boolean;
        meterId: string;
        consumedUnits: number;
        creditedUnits: number;
        balance: number;
     }[];
   }, {
     userId: VString<string, "required">;
     customerId: VString<string | undefined, "optional">;
     activeProductIds: VArray<string[], VString<string, "required">, "required">;
     benefits: VArray<{
        metadata?: Record<string, string | number | boolean>;
        type: string;
        id: string;
        benefitId: string;
      }[], VObject<{
        metadata?: Record<string, string | number | boolean>;
        type: string;
        id: string;
        benefitId: string;
      }, {
        id: VString<string, "required">;
        benefitId: VString<string, "required">;
        type: VString<string, "required">;
        metadata: VRecord<Record<string, ... | ... | ... | ...> | undefined, VString<string, "required">, VUnion<string | number | boolean, [VString<..., ...>, VFloat64<..., ...>, VBoolean<..., ...>], "required", never>, "optional", string>;
     }, "required", "type" | "id" | "metadata" | "benefitId" | `metadata.${string}`>, "required">;
     meters: VArray<{
        cycleStart?: number;
        cycleEnd?: number;
        rollover?: boolean;
        meterId: string;
        consumedUnits: number;
        creditedUnits: number;
        balance: number;
      }[], VObject<{
        cycleStart?: number;
        cycleEnd?: number;
        rollover?: boolean;
        meterId: string;
        consumedUnits: number;
        creditedUnits: number;
        balance: number;
      }, {
        meterId: VString<string, "required">;
        consumedUnits: VFloat64<number, "required">;
        creditedUnits: VFloat64<number, "required">;
        balance: VFloat64<number, "required">;
        cycleStart: VFloat64<number | undefined, "optional">;
        cycleEnd: VFloat64<number | undefined, "optional">;
        rollover: VBoolean<boolean | undefined, "optional">;
      }, "required", 
        | "meterId"
        | "consumedUnits"
        | "creditedUnits"
        | "balance"
        | "cycleStart"
        | "cycleEnd"
       | "rollover">, "required">;
     pendingSpends: VArray<
        | {
        releaseJobId?: string;
        at: number;
        meterId: string;
        amount: number;
        externalId: string;
      }[]
        | undefined, VObject<{
        releaseJobId?: string;
        at: number;
        meterId: string;
        amount: number;
        externalId: string;
      }, {
        meterId: VString<string, "required">;
        amount: VFloat64<number, "required">;
        externalId: VString<string, "required">;
        at: VFloat64<number, "required">;
        releaseJobId: VString<string | undefined, "optional">;
     }, "required", "at" | "meterId" | "amount" | "externalId" | "releaseJobId">, "optional">;
     updatedAt: VFloat64<number, "required">;
   }, "required", 
     | "updatedAt"
     | "userId"
     | "customerId"
     | "activeProductIds"
     | "benefits"
     | "meters"
     | "pendingSpends">, {
     userId: ["userId", "_creationTime"];
     customerId: ["customerId", "_creationTime"];
   }, {
   }, {
  }>;
  billingBenefitMetadata: TableDefinition<VObject<{
     updatedAt: number;
     metadata: Record<string, string | number | boolean>;
     benefitId: string;
   }, {
     benefitId: VString<string, "required">;
     metadata: VRecord<Record<string, string | number | boolean>, VString<string, "required">, VUnion<string | number | boolean, [VString<string, "required">, VFloat64<number, "required">, VBoolean<boolean, "required">], "required", never>, "required", string>;
     updatedAt: VFloat64<number, "required">;
   }, "required", "updatedAt" | "metadata" | "benefitId" | `metadata.${string}`>, {
     benefitId: ["benefitId", "_creationTime"];
   }, {
   }, {
  }>;
  billingGifts: TableDefinition<VObject<{
     message?: string;
     purchaserEmail?: string;
     purchaserName?: string;
     billingOrderId?: string;
     claimedByUserId?: string;
     claimedEntityId?: string;
     paidAt?: number;
     notifiedAt?: number;
     claimedAt?: number;
     createdAt: number;
     status: string;
     recipientEmail: string;
     purchaserUserId: string;
     productIds: string[];
     billingCustomerId: string;
   }, {
     recipientEmail: VString<string, "required">;
     purchaserUserId: VString<string, "required">;
     purchaserEmail: VString<string | undefined, "optional">;
     purchaserName: VString<string | undefined, "optional">;
     productIds: VArray<string[], VString<string, "required">, "required">;
     message: VString<string | undefined, "optional">;
     status: VString<string, "required">;
     billingCustomerId: VString<string, "required">;
     billingOrderId: VString<string | undefined, "optional">;
     claimedByUserId: VString<string | undefined, "optional">;
     claimedEntityId: VString<string | undefined, "optional">;
     createdAt: VFloat64<number, "required">;
     paidAt: VFloat64<number | undefined, "optional">;
     notifiedAt: VFloat64<number | undefined, "optional">;
     claimedAt: VFloat64<number | undefined, "optional">;
   }, "required", 
     | "createdAt"
     | "message"
     | "status"
     | "recipientEmail"
     | "purchaserUserId"
     | "purchaserEmail"
     | "purchaserName"
     | "productIds"
     | "billingCustomerId"
     | "billingOrderId"
     | "claimedByUserId"
     | "claimedEntityId"
     | "paidAt"
     | "notifiedAt"
     | "claimedAt">, {
     recipientEmail: ["recipientEmail", "_creationTime"];
     recipientEmail_status: ["recipientEmail", "status", "_creationTime"];
     status: ["status", "_creationTime"];
   }, {
   }, {
  }>;
};
```

Defined in: [src/convex/components/backend/schema.ts:288](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L288)

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-billingentitlements"></a> `billingEntitlements` | `TableDefinition`\<`VObject`\<\{ `customerId?`: `string`; `pendingSpends?`: \{ `releaseJobId?`: `string`; `at`: `number`; `meterId`: `string`; `amount`: `number`; `externalId`: `string`; \}[]; `updatedAt`: `number`; `userId`: `string`; `activeProductIds`: `string`[]; `benefits`: \{ `metadata?`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; `type`: `string`; `id`: `string`; `benefitId`: `string`; \}[]; `meters`: \{ `cycleStart?`: `number`; `cycleEnd?`: `number`; `rollover?`: `boolean`; `meterId`: `string`; `consumedUnits`: `number`; `creditedUnits`: `number`; `balance`: `number`; \}[]; \}, \{ `userId`: `VString`\<`string`, `"required"`\>; `customerId`: `VString`\<`string` \| `undefined`, `"optional"`\>; `activeProductIds`: `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>; `benefits`: `VArray`\<\{ `metadata?`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; `type`: `string`; `id`: `string`; `benefitId`: `string`; \}[], `VObject`\<\{ `metadata?`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; `type`: `string`; `id`: `string`; `benefitId`: `string`; \}, \{ `id`: `VString`\<`string`, `"required"`\>; `benefitId`: `VString`\<`string`, `"required"`\>; `type`: `VString`\<`string`, `"required"`\>; `metadata`: `VRecord`\<`Record`\<`string`, ... \| ... \| ... \| ...\> \| `undefined`, `VString`\<`string`, `"required"`\>, `VUnion`\<`string` \| `number` \| `boolean`, \[`VString`\<..., ...\>, `VFloat64`\<..., ...\>, `VBoolean`\<..., ...\>\], `"required"`, `never`\>, `"optional"`, `string`\>; \}, `"required"`, `"type"` \| `"id"` \| `"metadata"` \| `"benefitId"` \| `` `metadata.${string}` ``\>, `"required"`\>; `meters`: `VArray`\<\{ `cycleStart?`: `number`; `cycleEnd?`: `number`; `rollover?`: `boolean`; `meterId`: `string`; `consumedUnits`: `number`; `creditedUnits`: `number`; `balance`: `number`; \}[], `VObject`\<\{ `cycleStart?`: `number`; `cycleEnd?`: `number`; `rollover?`: `boolean`; `meterId`: `string`; `consumedUnits`: `number`; `creditedUnits`: `number`; `balance`: `number`; \}, \{ `meterId`: `VString`\<`string`, `"required"`\>; `consumedUnits`: `VFloat64`\<`number`, `"required"`\>; `creditedUnits`: `VFloat64`\<`number`, `"required"`\>; `balance`: `VFloat64`\<`number`, `"required"`\>; `cycleStart`: `VFloat64`\<`number` \| `undefined`, `"optional"`\>; `cycleEnd`: `VFloat64`\<`number` \| `undefined`, `"optional"`\>; `rollover`: `VBoolean`\<`boolean` \| `undefined`, `"optional"`\>; \}, `"required"`, \| `"meterId"` \| `"consumedUnits"` \| `"creditedUnits"` \| `"balance"` \| `"cycleStart"` \| `"cycleEnd"` \| `"rollover"`\>, `"required"`\>; `pendingSpends`: `VArray`\< \| \{ `releaseJobId?`: `string`; `at`: `number`; `meterId`: `string`; `amount`: `number`; `externalId`: `string`; \}[] \| `undefined`, `VObject`\<\{ `releaseJobId?`: `string`; `at`: `number`; `meterId`: `string`; `amount`: `number`; `externalId`: `string`; \}, \{ `meterId`: `VString`\<`string`, `"required"`\>; `amount`: `VFloat64`\<`number`, `"required"`\>; `externalId`: `VString`\<`string`, `"required"`\>; `at`: `VFloat64`\<`number`, `"required"`\>; `releaseJobId`: `VString`\<`string` \| `undefined`, `"optional"`\>; \}, `"required"`, `"at"` \| `"meterId"` \| `"amount"` \| `"externalId"` \| `"releaseJobId"`\>, `"optional"`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"updatedAt"` \| `"userId"` \| `"customerId"` \| `"activeProductIds"` \| `"benefits"` \| `"meters"` \| `"pendingSpends"`\>, \{ `userId`: \[`"userId"`, `"_creationTime"`\]; `customerId`: \[`"customerId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:289](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L289) |
| <a id="property-billingbenefitmetadata"></a> `billingBenefitMetadata` | `TableDefinition`\<`VObject`\<\{ `updatedAt`: `number`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; `benefitId`: `string`; \}, \{ `benefitId`: `VString`\<`string`, `"required"`\>; `metadata`: `VRecord`\<`Record`\<`string`, `string` \| `number` \| `boolean`\>, `VString`\<`string`, `"required"`\>, `VUnion`\<`string` \| `number` \| `boolean`, \[`VString`\<`string`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>, `VBoolean`\<`boolean`, `"required"`\>\], `"required"`, `never`\>, `"required"`, `string`\>; `updatedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"updatedAt"` \| `"metadata"` \| `"benefitId"` \| `` `metadata.${string}` ``\>, \{ `benefitId`: \[`"benefitId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:308](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L308) |
| <a id="property-billinggifts"></a> `billingGifts` | `TableDefinition`\<`VObject`\<\{ `message?`: `string`; `purchaserEmail?`: `string`; `purchaserName?`: `string`; `billingOrderId?`: `string`; `claimedByUserId?`: `string`; `claimedEntityId?`: `string`; `paidAt?`: `number`; `notifiedAt?`: `number`; `claimedAt?`: `number`; `createdAt`: `number`; `status`: `string`; `recipientEmail`: `string`; `purchaserUserId`: `string`; `productIds`: `string`[]; `billingCustomerId`: `string`; \}, \{ `recipientEmail`: `VString`\<`string`, `"required"`\>; `purchaserUserId`: `VString`\<`string`, `"required"`\>; `purchaserEmail`: `VString`\<`string` \| `undefined`, `"optional"`\>; `purchaserName`: `VString`\<`string` \| `undefined`, `"optional"`\>; `productIds`: `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>; `message`: `VString`\<`string` \| `undefined`, `"optional"`\>; `status`: `VString`\<`string`, `"required"`\>; `billingCustomerId`: `VString`\<`string`, `"required"`\>; `billingOrderId`: `VString`\<`string` \| `undefined`, `"optional"`\>; `claimedByUserId`: `VString`\<`string` \| `undefined`, `"optional"`\>; `claimedEntityId`: `VString`\<`string` \| `undefined`, `"optional"`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; `paidAt`: `VFloat64`\<`number` \| `undefined`, `"optional"`\>; `notifiedAt`: `VFloat64`\<`number` \| `undefined`, `"optional"`\>; `claimedAt`: `VFloat64`\<`number` \| `undefined`, `"optional"`\>; \}, `"required"`, \| `"createdAt"` \| `"message"` \| `"status"` \| `"recipientEmail"` \| `"purchaserUserId"` \| `"purchaserEmail"` \| `"purchaserName"` \| `"productIds"` \| `"billingCustomerId"` \| `"billingOrderId"` \| `"claimedByUserId"` \| `"claimedEntityId"` \| `"paidAt"` \| `"notifiedAt"` \| `"claimedAt"`\>, \{ `recipientEmail`: \[`"recipientEmail"`, `"_creationTime"`\]; `recipientEmail_status`: \[`"recipientEmail"`, `"status"`, `"_creationTime"`\]; `status`: \[`"status"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:314](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L314) |

***

### aiTables

```ts
const aiTables: {
  aiRequests: TableDefinition<VObject<{
     meterId?: string;
     args: string;
     createdAt: number;
     name: string;
     userId: string;
     status: "reserved" | "settled" | "released";
     streamId: string;
     externalId: string;
     entityId: string;
     cost: number;
   }, {
     streamId: VString<string, "required">;
     name: VString<string, "required">;
     entityId: VString<string, "required">;
     userId: VString<string, "required">;
     args: VString<string, "required">;
     meterId: VString<string | undefined, "optional">;
     cost: VFloat64<number, "required">;
     externalId: VString<string, "required">;
     status: VUnion<"reserved" | "settled" | "released", [VLiteral<"reserved", "required">, VLiteral<"settled", "required">, VLiteral<"released", "required">], "required", never>;
     createdAt: VFloat64<number, "required">;
   }, "required", 
     | "args"
     | "createdAt"
     | "name"
     | "userId"
     | "status"
     | "streamId"
     | "meterId"
     | "externalId"
     | "entityId"
     | "cost">, {
     streamId: ["streamId", "_creationTime"];
   }, {
   }, {
  }>;
};
```

Defined in: [src/convex/components/backend/schema.ts:349](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L349)

Metered-stream request plumbing for `setupAi().stream` — the HTTP stream
endpoint can't carry Convex args, so `start` records the request (args,
billing entity, reservation) and the HTTP dispatcher loads it by stream id.
Status mirrors the credit reservation: `reserved` → `settled` (event
ingested) or `released` (failed — nothing charged). Rows are plumbing, not
a usage ledger — the provider event is the durable record; they are safe to
prune.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-airequests"></a> `aiRequests` | `TableDefinition`\<`VObject`\<\{ `meterId?`: `string`; `args`: `string`; `createdAt`: `number`; `name`: `string`; `userId`: `string`; `status`: `"reserved"` \| `"settled"` \| `"released"`; `streamId`: `string`; `externalId`: `string`; `entityId`: `string`; `cost`: `number`; \}, \{ `streamId`: `VString`\<`string`, `"required"`\>; `name`: `VString`\<`string`, `"required"`\>; `entityId`: `VString`\<`string`, `"required"`\>; `userId`: `VString`\<`string`, `"required"`\>; `args`: `VString`\<`string`, `"required"`\>; `meterId`: `VString`\<`string` \| `undefined`, `"optional"`\>; `cost`: `VFloat64`\<`number`, `"required"`\>; `externalId`: `VString`\<`string`, `"required"`\>; `status`: `VUnion`\<`"reserved"` \| `"settled"` \| `"released"`, \[`VLiteral`\<`"reserved"`, `"required"`\>, `VLiteral`\<`"settled"`, `"required"`\>, `VLiteral`\<`"released"`, `"required"`\>\], `"required"`, `never`\>; `createdAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, \| `"args"` \| `"createdAt"` \| `"name"` \| `"userId"` \| `"status"` \| `"streamId"` \| `"meterId"` \| `"externalId"` \| `"entityId"` \| `"cost"`\>, \{ `streamId`: \[`"streamId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:350](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L350) |

***

### webhookTables

```ts
const webhookTables: {
  webhookDeliveries: TableDefinition<VObject<{
     type?: string;
     note?: string;
     service: string;
     deliveryId: string;
     outcome:   | "duplicate"
        | "ok"
        | "invalid_signature"
        | "unknown_type"
        | "handler_error"
        | "oversized"
        | "missing_secret";
     receivedAt: number;
   }, {
     service: VString<string, "required">;
     deliveryId: VString<string, "required">;
     type: VString<string | undefined, "optional">;
     outcome: VUnion<
        | "duplicate"
        | "ok"
        | "invalid_signature"
        | "unknown_type"
        | "handler_error"
        | "oversized"
       | "missing_secret", [VLiteral<"ok", "required">, VLiteral<"invalid_signature", "required">, VLiteral<"unknown_type", "required">, VLiteral<"handler_error", "required">, VLiteral<"duplicate", "required">, VLiteral<"oversized", "required">, VLiteral<"missing_secret", "required">], "required", never>;
     note: VString<string | undefined, "optional">;
     receivedAt: VFloat64<number, "required">;
   }, "required", "type" | "service" | "deliveryId" | "outcome" | "note" | "receivedAt">, {
     receivedAt: ["receivedAt", "_creationTime"];
     service_deliveryId: ["service", "deliveryId", "_creationTime"];
   }, {
   }, {
  }>;
};
```

Defined in: [src/convex/components/backend/schema.ts:375](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L375)

Webhook delivery ring buffer (see `webhooks.ts`): one row per inbound
delivery with its outcome — powers redelivery dedupe, doctor's "last
webhook received", and the DevTools feed. Capped, prunable, never a source
of truth.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-webhookdeliveries"></a> `webhookDeliveries` | `TableDefinition`\<`VObject`\<\{ `type?`: `string`; `note?`: `string`; `service`: `string`; `deliveryId`: `string`; `outcome`: \| `"duplicate"` \| `"ok"` \| `"invalid_signature"` \| `"unknown_type"` \| `"handler_error"` \| `"oversized"` \| `"missing_secret"`; `receivedAt`: `number`; \}, \{ `service`: `VString`\<`string`, `"required"`\>; `deliveryId`: `VString`\<`string`, `"required"`\>; `type`: `VString`\<`string` \| `undefined`, `"optional"`\>; `outcome`: `VUnion`\< \| `"duplicate"` \| `"ok"` \| `"invalid_signature"` \| `"unknown_type"` \| `"handler_error"` \| `"oversized"` \| `"missing_secret"`, \[`VLiteral`\<`"ok"`, `"required"`\>, `VLiteral`\<`"invalid_signature"`, `"required"`\>, `VLiteral`\<`"unknown_type"`, `"required"`\>, `VLiteral`\<`"handler_error"`, `"required"`\>, `VLiteral`\<`"duplicate"`, `"required"`\>, `VLiteral`\<`"oversized"`, `"required"`\>, `VLiteral`\<`"missing_secret"`, `"required"`\>\], `"required"`, `never`\>; `note`: `VString`\<`string` \| `undefined`, `"optional"`\>; `receivedAt`: `VFloat64`\<`number`, `"required"`\>; \}, `"required"`, `"type"` \| `"service"` \| `"deliveryId"` \| `"outcome"` \| `"note"` \| `"receivedAt"`\>, \{ `receivedAt`: \[`"receivedAt"`, `"_creationTime"`\]; `service_deliveryId`: \[`"service"`, `"deliveryId"`, `"_creationTime"`\]; \}, \{ \}, \{ \}\> | [src/convex/components/backend/schema.ts:376](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L376) |

***

### authSchema

```ts
const authSchema: SchemaDefinition<{
  user: TableDefinition<VObject<{
     image?: string | null;
     role?: string | null;
     banReason?: string | null;
     banned?: boolean | null;
     banExpires?: number | null;
     createdAt: number;
     updatedAt: number;
     email: string;
     emailVerified: boolean;
     name: string;
   }, {
     name: VString<string, "required">;
     email: VString<string, "required">;
     emailVerified: VBoolean<boolean, "required">;
     image: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
     role: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     banned: VUnion<boolean | null | undefined, [VNull<null, "required">, VBoolean<boolean, "required">], "optional", never>;
     banReason: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     banExpires: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "email"
     | "emailVerified"
     | "name"
     | "image"
     | "role"
     | "banReason"
     | "banned"
     | "banExpires">, {
     email_name: ["email", "name", "_creationTime"];
     name: ["name", "_creationTime"];
   }, {
   }, {
  }>;
  session: TableDefinition<VObject<{
     ipAddress?: string | null;
     userAgent?: string | null;
     activeOrganizationId?: string | null;
     impersonatedBy?: string | null;
     createdAt: number;
     updatedAt: number;
     userId: string;
     expiresAt: number;
     token: string;
   }, {
     expiresAt: VFloat64<number, "required">;
     token: VString<string, "required">;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
     ipAddress: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userAgent: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userId: VString<string, "required">;
     impersonatedBy: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     activeOrganizationId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "expiresAt"
     | "token"
     | "ipAddress"
     | "userAgent"
     | "activeOrganizationId"
     | "impersonatedBy">, {
     expiresAt: ["expiresAt", "_creationTime"];
     expiresAt_userId: ["expiresAt", "userId", "_creationTime"];
     token: ["token", "_creationTime"];
     userId: ["userId", "_creationTime"];
     userId_expiresAt: ["userId", "expiresAt", "_creationTime"];
   }, {
   }, {
  }>;
  account: TableDefinition<VObject<{
     password?: string | null;
     accessToken?: string | null;
     refreshToken?: string | null;
     idToken?: string | null;
     accessTokenExpiresAt?: number | null;
     refreshTokenExpiresAt?: number | null;
     scope?: string | null;
     createdAt: number;
     updatedAt: number;
     userId: string;
     accountId: string;
     providerId: string;
   }, {
     accountId: VString<string, "required">;
     providerId: VString<string, "required">;
     userId: VString<string, "required">;
     accessToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     refreshToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     idToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     accessTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     refreshTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     scope: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     password: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "password"
     | "accountId"
     | "providerId"
     | "accessToken"
     | "refreshToken"
     | "idToken"
     | "accessTokenExpiresAt"
     | "refreshTokenExpiresAt"
     | "scope">, {
     accountId: ["accountId", "_creationTime"];
     accountId_providerId: ["accountId", "providerId", "_creationTime"];
     providerId_userId: ["providerId", "userId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  verification: TableDefinition<VObject<{
     value: string;
     createdAt: number;
     updatedAt: number;
     expiresAt: number;
     identifier: string;
   }, {
     identifier: VString<string, "required">;
     value: VString<string, "required">;
     expiresAt: VFloat64<number, "required">;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
   }, "required", "value" | "createdAt" | "updatedAt" | "expiresAt" | "identifier">, {
     expiresAt: ["expiresAt", "_creationTime"];
     identifier: ["identifier", "_creationTime"];
   }, {
   }, {
  }>;
  rateLimit: TableDefinition<VObject<{
     key: string;
     count: number;
     lastRequest: number;
   }, {
     key: VString<string, "required">;
     count: VFloat64<number, "required">;
     lastRequest: VFloat64<number, "required">;
   }, "required", "key" | "count" | "lastRequest">, {
     key: ["key", "_creationTime"];
   }, {
   }, {
  }>;
  passkey: TableDefinition<VObject<{
     createdAt?: number | null;
     name?: string | null;
     transports?: string | null;
     aaguid?: string | null;
     userId: string;
     publicKey: string;
     credentialID: string;
     counter: number;
     deviceType: string;
     backedUp: boolean;
   }, {
     name: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     publicKey: VString<string, "required">;
     userId: VString<string, "required">;
     credentialID: VString<string, "required">;
     counter: VFloat64<number, "required">;
     deviceType: VString<string, "required">;
     backedUp: VBoolean<boolean, "required">;
     transports: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     aaguid: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "name"
     | "userId"
     | "publicKey"
     | "credentialID"
     | "counter"
     | "deviceType"
     | "backedUp"
     | "transports"
     | "aaguid">, {
     credentialID: ["credentialID", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  jwks: TableDefinition<VObject<{
     expiresAt?: number | null;
     createdAt: number;
     publicKey: string;
     privateKey: string;
   }, {
     publicKey: VString<string, "required">;
     privateKey: VString<string, "required">;
     createdAt: VFloat64<number, "required">;
     expiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", "createdAt" | "expiresAt" | "publicKey" | "privateKey">, {
   }, {
   }, {
  }>;
  organization: TableDefinition<VObject<{
     metadata?: string | null;
     logo?: string | null;
     createdAt: number;
     name: string;
     slug: string;
   }, {
     name: VString<string, "required">;
     slug: VString<string, "required">;
     logo: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VFloat64<number, "required">;
     metadata: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
   }, "required", "createdAt" | "name" | "metadata" | "slug" | "logo">, {
     name: ["name", "_creationTime"];
     slug: ["slug", "_creationTime"];
   }, {
   }, {
  }>;
  member: TableDefinition<VObject<{
     createdAt: number;
     userId: string;
     organizationId: string;
     role: string;
   }, {
     organizationId: VString<string, "required">;
     userId: VString<string, "required">;
     role: VString<string, "required">;
     createdAt: VFloat64<number, "required">;
   }, "required", "createdAt" | "userId" | "organizationId" | "role">, {
     organizationId: ["organizationId", "_creationTime"];
     organizationId_userId: ["organizationId", "userId", "_creationTime"];
     userId: ["userId", "_creationTime"];
     role: ["role", "_creationTime"];
   }, {
   }, {
  }>;
  invitation: TableDefinition<VObject<{
     role?: string | null;
     createdAt: number;
     email: string;
     expiresAt: number;
     organizationId: string;
     status: string;
     inviterId: string;
   }, {
     organizationId: VString<string, "required">;
     email: VString<string, "required">;
     role: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     status: VString<string, "required">;
     expiresAt: VFloat64<number, "required">;
     createdAt: VFloat64<number, "required">;
     inviterId: VString<string, "required">;
   }, "required", 
     | "createdAt"
     | "email"
     | "expiresAt"
     | "organizationId"
     | "role"
     | "status"
     | "inviterId">, {
     organizationId: ["organizationId", "_creationTime"];
     email: ["email", "_creationTime"];
     role: ["role", "_creationTime"];
     status: ["status", "_creationTime"];
     inviterId: ["inviterId", "_creationTime"];
   }, {
   }, {
  }>;
  oauthApplication: TableDefinition<VObject<{
     type?: string | null;
     createdAt?: number | null;
     updatedAt?: number | null;
     name?: string | null;
     userId?: string | null;
     metadata?: string | null;
     icon?: string | null;
     clientId?: string | null;
     clientSecret?: string | null;
     redirectUrls?: string | null;
     disabled?: boolean | null;
   }, {
     name: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     icon: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     metadata: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     clientId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     clientSecret: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     redirectUrls: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     type: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     disabled: VUnion<boolean | null | undefined, [VNull<null, "required">, VBoolean<boolean, "required">], "optional", never>;
     userId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     updatedAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", 
     | "type"
     | "createdAt"
     | "updatedAt"
     | "name"
     | "userId"
     | "metadata"
     | "icon"
     | "clientId"
     | "clientSecret"
     | "redirectUrls"
     | "disabled">, {
     clientId: ["clientId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  oauthAccessToken: TableDefinition<VObject<{
     createdAt?: number | null;
     updatedAt?: number | null;
     userId?: string | null;
     accessToken?: string | null;
     refreshToken?: string | null;
     accessTokenExpiresAt?: number | null;
     refreshTokenExpiresAt?: number | null;
     clientId?: string | null;
     scopes?: string | null;
   }, {
     accessToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     refreshToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     accessTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     refreshTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     clientId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     scopes: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     updatedAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "accessToken"
     | "refreshToken"
     | "accessTokenExpiresAt"
     | "refreshTokenExpiresAt"
     | "clientId"
     | "scopes">, {
     accessToken: ["accessToken", "_creationTime"];
     refreshToken: ["refreshToken", "_creationTime"];
     clientId: ["clientId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  oauthConsent: TableDefinition<VObject<{
     createdAt?: number | null;
     updatedAt?: number | null;
     userId?: string | null;
     clientId?: string | null;
     scopes?: string | null;
     consentGiven?: boolean | null;
   }, {
     clientId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     scopes: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     updatedAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     consentGiven: VUnion<boolean | null | undefined, [VNull<null, "required">, VBoolean<boolean, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "clientId"
     | "scopes"
     | "consentGiven">, {
     clientId_userId: ["clientId", "userId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
}, true>;
```

Defined in: [src/convex/components/backend/schema.ts:398](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L398)

Auth-only schema — passed to Better Auth's `createApi` in `adapter.ts`.

***

### default

```ts
default: SchemaDefinition<{
  user: TableDefinition<VObject<{
     image?: string | null;
     role?: string | null;
     banReason?: string | null;
     banned?: boolean | null;
     banExpires?: number | null;
     createdAt: number;
     updatedAt: number;
     email: string;
     emailVerified: boolean;
     name: string;
   }, {
     name: VString<string, "required">;
     email: VString<string, "required">;
     emailVerified: VBoolean<boolean, "required">;
     image: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
     role: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     banned: VUnion<boolean | null | undefined, [VNull<null, "required">, VBoolean<boolean, "required">], "optional", never>;
     banReason: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     banExpires: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "email"
     | "emailVerified"
     | "name"
     | "image"
     | "role"
     | "banReason"
     | "banned"
     | "banExpires">, {
     email_name: ["email", "name", "_creationTime"];
     name: ["name", "_creationTime"];
   }, {
   }, {
  }>;
  session: TableDefinition<VObject<{
     ipAddress?: string | null;
     userAgent?: string | null;
     activeOrganizationId?: string | null;
     impersonatedBy?: string | null;
     createdAt: number;
     updatedAt: number;
     userId: string;
     expiresAt: number;
     token: string;
   }, {
     expiresAt: VFloat64<number, "required">;
     token: VString<string, "required">;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
     ipAddress: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userAgent: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userId: VString<string, "required">;
     impersonatedBy: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     activeOrganizationId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "expiresAt"
     | "token"
     | "ipAddress"
     | "userAgent"
     | "activeOrganizationId"
     | "impersonatedBy">, {
     expiresAt: ["expiresAt", "_creationTime"];
     expiresAt_userId: ["expiresAt", "userId", "_creationTime"];
     token: ["token", "_creationTime"];
     userId: ["userId", "_creationTime"];
     userId_expiresAt: ["userId", "expiresAt", "_creationTime"];
   }, {
   }, {
  }>;
  account: TableDefinition<VObject<{
     password?: string | null;
     accessToken?: string | null;
     refreshToken?: string | null;
     idToken?: string | null;
     accessTokenExpiresAt?: number | null;
     refreshTokenExpiresAt?: number | null;
     scope?: string | null;
     createdAt: number;
     updatedAt: number;
     userId: string;
     accountId: string;
     providerId: string;
   }, {
     accountId: VString<string, "required">;
     providerId: VString<string, "required">;
     userId: VString<string, "required">;
     accessToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     refreshToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     idToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     accessTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     refreshTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     scope: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     password: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "password"
     | "accountId"
     | "providerId"
     | "accessToken"
     | "refreshToken"
     | "idToken"
     | "accessTokenExpiresAt"
     | "refreshTokenExpiresAt"
     | "scope">, {
     accountId: ["accountId", "_creationTime"];
     accountId_providerId: ["accountId", "providerId", "_creationTime"];
     providerId_userId: ["providerId", "userId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  verification: TableDefinition<VObject<{
     value: string;
     createdAt: number;
     updatedAt: number;
     expiresAt: number;
     identifier: string;
   }, {
     identifier: VString<string, "required">;
     value: VString<string, "required">;
     expiresAt: VFloat64<number, "required">;
     createdAt: VFloat64<number, "required">;
     updatedAt: VFloat64<number, "required">;
   }, "required", "value" | "createdAt" | "updatedAt" | "expiresAt" | "identifier">, {
     expiresAt: ["expiresAt", "_creationTime"];
     identifier: ["identifier", "_creationTime"];
   }, {
   }, {
  }>;
  rateLimit: TableDefinition<VObject<{
     key: string;
     count: number;
     lastRequest: number;
   }, {
     key: VString<string, "required">;
     count: VFloat64<number, "required">;
     lastRequest: VFloat64<number, "required">;
   }, "required", "key" | "count" | "lastRequest">, {
     key: ["key", "_creationTime"];
   }, {
   }, {
  }>;
  passkey: TableDefinition<VObject<{
     createdAt?: number | null;
     name?: string | null;
     transports?: string | null;
     aaguid?: string | null;
     userId: string;
     publicKey: string;
     credentialID: string;
     counter: number;
     deviceType: string;
     backedUp: boolean;
   }, {
     name: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     publicKey: VString<string, "required">;
     userId: VString<string, "required">;
     credentialID: VString<string, "required">;
     counter: VFloat64<number, "required">;
     deviceType: VString<string, "required">;
     backedUp: VBoolean<boolean, "required">;
     transports: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     aaguid: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "name"
     | "userId"
     | "publicKey"
     | "credentialID"
     | "counter"
     | "deviceType"
     | "backedUp"
     | "transports"
     | "aaguid">, {
     credentialID: ["credentialID", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  jwks: TableDefinition<VObject<{
     expiresAt?: number | null;
     createdAt: number;
     publicKey: string;
     privateKey: string;
   }, {
     publicKey: VString<string, "required">;
     privateKey: VString<string, "required">;
     createdAt: VFloat64<number, "required">;
     expiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", "createdAt" | "expiresAt" | "publicKey" | "privateKey">, {
   }, {
   }, {
  }>;
  organization: TableDefinition<VObject<{
     metadata?: string | null;
     logo?: string | null;
     createdAt: number;
     name: string;
     slug: string;
   }, {
     name: VString<string, "required">;
     slug: VString<string, "required">;
     logo: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VFloat64<number, "required">;
     metadata: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
   }, "required", "createdAt" | "name" | "metadata" | "slug" | "logo">, {
     name: ["name", "_creationTime"];
     slug: ["slug", "_creationTime"];
   }, {
   }, {
  }>;
  member: TableDefinition<VObject<{
     createdAt: number;
     userId: string;
     organizationId: string;
     role: string;
   }, {
     organizationId: VString<string, "required">;
     userId: VString<string, "required">;
     role: VString<string, "required">;
     createdAt: VFloat64<number, "required">;
   }, "required", "createdAt" | "userId" | "organizationId" | "role">, {
     organizationId: ["organizationId", "_creationTime"];
     organizationId_userId: ["organizationId", "userId", "_creationTime"];
     userId: ["userId", "_creationTime"];
     role: ["role", "_creationTime"];
   }, {
   }, {
  }>;
  invitation: TableDefinition<VObject<{
     role?: string | null;
     createdAt: number;
     email: string;
     expiresAt: number;
     organizationId: string;
     status: string;
     inviterId: string;
   }, {
     organizationId: VString<string, "required">;
     email: VString<string, "required">;
     role: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     status: VString<string, "required">;
     expiresAt: VFloat64<number, "required">;
     createdAt: VFloat64<number, "required">;
     inviterId: VString<string, "required">;
   }, "required", 
     | "createdAt"
     | "email"
     | "expiresAt"
     | "organizationId"
     | "role"
     | "status"
     | "inviterId">, {
     organizationId: ["organizationId", "_creationTime"];
     email: ["email", "_creationTime"];
     role: ["role", "_creationTime"];
     status: ["status", "_creationTime"];
     inviterId: ["inviterId", "_creationTime"];
   }, {
   }, {
  }>;
  oauthApplication: TableDefinition<VObject<{
     type?: string | null;
     createdAt?: number | null;
     updatedAt?: number | null;
     name?: string | null;
     userId?: string | null;
     metadata?: string | null;
     icon?: string | null;
     clientId?: string | null;
     clientSecret?: string | null;
     redirectUrls?: string | null;
     disabled?: boolean | null;
   }, {
     name: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     icon: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     metadata: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     clientId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     clientSecret: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     redirectUrls: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     type: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     disabled: VUnion<boolean | null | undefined, [VNull<null, "required">, VBoolean<boolean, "required">], "optional", never>;
     userId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     updatedAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", 
     | "type"
     | "createdAt"
     | "updatedAt"
     | "name"
     | "userId"
     | "metadata"
     | "icon"
     | "clientId"
     | "clientSecret"
     | "redirectUrls"
     | "disabled">, {
     clientId: ["clientId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  oauthAccessToken: TableDefinition<VObject<{
     createdAt?: number | null;
     updatedAt?: number | null;
     userId?: string | null;
     accessToken?: string | null;
     refreshToken?: string | null;
     accessTokenExpiresAt?: number | null;
     refreshTokenExpiresAt?: number | null;
     clientId?: string | null;
     scopes?: string | null;
   }, {
     accessToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     refreshToken: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     accessTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     refreshTokenExpiresAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     clientId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     scopes: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     updatedAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "accessToken"
     | "refreshToken"
     | "accessTokenExpiresAt"
     | "refreshTokenExpiresAt"
     | "clientId"
     | "scopes">, {
     accessToken: ["accessToken", "_creationTime"];
     refreshToken: ["refreshToken", "_creationTime"];
     clientId: ["clientId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  oauthConsent: TableDefinition<VObject<{
     createdAt?: number | null;
     updatedAt?: number | null;
     userId?: string | null;
     clientId?: string | null;
     scopes?: string | null;
     consentGiven?: boolean | null;
   }, {
     clientId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     userId: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     scopes: VUnion<string | null | undefined, [VNull<null, "required">, VString<string, "required">], "optional", never>;
     createdAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     updatedAt: VUnion<number | null | undefined, [VNull<null, "required">, VFloat64<number, "required">], "optional", never>;
     consentGiven: VUnion<boolean | null | undefined, [VNull<null, "required">, VBoolean<boolean, "required">], "optional", never>;
   }, "required", 
     | "createdAt"
     | "updatedAt"
     | "userId"
     | "clientId"
     | "scopes"
     | "consentGiven">, {
     clientId_userId: ["clientId", "userId", "_creationTime"];
     userId: ["userId", "_creationTime"];
   }, {
   }, {
  }>;
  billingEntitlements: TableDefinition<VObject<{
     customerId?: string;
     pendingSpends?: {
        releaseJobId?: string;
        at: number;
        meterId: string;
        amount: number;
        externalId: string;
     }[];
     updatedAt: number;
     userId: string;
     activeProductIds: string[];
     benefits: {
        metadata?: Record<string, string | number | boolean>;
        type: string;
        id: string;
        benefitId: string;
     }[];
     meters: {
        cycleStart?: number;
        cycleEnd?: number;
        rollover?: boolean;
        meterId: string;
        consumedUnits: number;
        creditedUnits: number;
        balance: number;
     }[];
   }, {
     userId: VString<string, "required">;
     customerId: VString<string | undefined, "optional">;
     activeProductIds: VArray<string[], VString<string, "required">, "required">;
     benefits: VArray<{
        metadata?: Record<string, ... | ... | ... | ...>;
        type: string;
        id: string;
        benefitId: string;
      }[], VObject<{
        metadata?: Record<string, ... | ... | ... | ...>;
        type: string;
        id: string;
        benefitId: string;
      }, {
        id: VString<string, "required">;
        benefitId: VString<string, "required">;
        type: VString<string, "required">;
        metadata: VRecord<Record<..., ...> | undefined, VString<string, "required">, VUnion<... | ... | ... | ..., [..., ..., ...], "required", never>, "optional", string>;
     }, "required", "type" | "id" | "metadata" | "benefitId" | `metadata.${string}`>, "required">;
     meters: VArray<{
        cycleStart?: number;
        cycleEnd?: number;
        rollover?: boolean;
        meterId: string;
        consumedUnits: number;
        creditedUnits: number;
        balance: number;
      }[], VObject<{
        cycleStart?: number;
        cycleEnd?: number;
        rollover?: boolean;
        meterId: string;
        consumedUnits: number;
        creditedUnits: number;
        balance: number;
      }, {
        meterId: VString<string, "required">;
        consumedUnits: VFloat64<number, "required">;
        creditedUnits: VFloat64<number, "required">;
        balance: VFloat64<number, "required">;
        cycleStart: VFloat64<number | undefined, "optional">;
        cycleEnd: VFloat64<number | undefined, "optional">;
        rollover: VBoolean<boolean | undefined, "optional">;
      }, "required", 
        | "meterId"
        | "consumedUnits"
        | "creditedUnits"
        | "balance"
        | "cycleStart"
        | "cycleEnd"
       | "rollover">, "required">;
     pendingSpends: VArray<
        | {
        releaseJobId?: string;
        at: number;
        meterId: string;
        amount: number;
        externalId: string;
      }[]
        | undefined, VObject<{
        releaseJobId?: string;
        at: number;
        meterId: string;
        amount: number;
        externalId: string;
      }, {
        meterId: VString<string, "required">;
        amount: VFloat64<number, "required">;
        externalId: VString<string, "required">;
        at: VFloat64<number, "required">;
        releaseJobId: VString<string | undefined, "optional">;
     }, "required", "at" | "meterId" | "amount" | "externalId" | "releaseJobId">, "optional">;
     updatedAt: VFloat64<number, "required">;
   }, "required", 
     | "updatedAt"
     | "userId"
     | "customerId"
     | "activeProductIds"
     | "benefits"
     | "meters"
     | "pendingSpends">, {
     userId: ["userId", "_creationTime"];
     customerId: ["customerId", "_creationTime"];
   }, {
   }, {
  }>;
  billingBenefitMetadata: TableDefinition<VObject<{
     updatedAt: number;
     metadata: Record<string, string | number | boolean>;
     benefitId: string;
   }, {
     benefitId: VString<string, "required">;
     metadata: VRecord<Record<string, string | number | boolean>, VString<string, "required">, VUnion<string | number | boolean, [VString<string, "required">, VFloat64<number, "required">, VBoolean<boolean, "required">], "required", never>, "required", string>;
     updatedAt: VFloat64<number, "required">;
   }, "required", "updatedAt" | "metadata" | "benefitId" | `metadata.${string}`>, {
     benefitId: ["benefitId", "_creationTime"];
   }, {
   }, {
  }>;
  billingGifts: TableDefinition<VObject<{
     message?: string;
     purchaserEmail?: string;
     purchaserName?: string;
     billingOrderId?: string;
     claimedByUserId?: string;
     claimedEntityId?: string;
     paidAt?: number;
     notifiedAt?: number;
     claimedAt?: number;
     createdAt: number;
     status: string;
     recipientEmail: string;
     purchaserUserId: string;
     productIds: string[];
     billingCustomerId: string;
   }, {
     recipientEmail: VString<string, "required">;
     purchaserUserId: VString<string, "required">;
     purchaserEmail: VString<string | undefined, "optional">;
     purchaserName: VString<string | undefined, "optional">;
     productIds: VArray<string[], VString<string, "required">, "required">;
     message: VString<string | undefined, "optional">;
     status: VString<string, "required">;
     billingCustomerId: VString<string, "required">;
     billingOrderId: VString<string | undefined, "optional">;
     claimedByUserId: VString<string | undefined, "optional">;
     claimedEntityId: VString<string | undefined, "optional">;
     createdAt: VFloat64<number, "required">;
     paidAt: VFloat64<number | undefined, "optional">;
     notifiedAt: VFloat64<number | undefined, "optional">;
     claimedAt: VFloat64<number | undefined, "optional">;
   }, "required", 
     | "createdAt"
     | "message"
     | "status"
     | "recipientEmail"
     | "purchaserUserId"
     | "purchaserEmail"
     | "purchaserName"
     | "productIds"
     | "billingCustomerId"
     | "billingOrderId"
     | "claimedByUserId"
     | "claimedEntityId"
     | "paidAt"
     | "notifiedAt"
     | "claimedAt">, {
     recipientEmail: ["recipientEmail", "_creationTime"];
     recipientEmail_status: ["recipientEmail", "status", "_creationTime"];
     status: ["status", "_creationTime"];
   }, {
   }, {
  }>;
  aiRequests: TableDefinition<VObject<{
     meterId?: string;
     args: string;
     createdAt: number;
     name: string;
     userId: string;
     status: "reserved" | "settled" | "released";
     streamId: string;
     externalId: string;
     entityId: string;
     cost: number;
   }, {
     streamId: VString<string, "required">;
     name: VString<string, "required">;
     entityId: VString<string, "required">;
     userId: VString<string, "required">;
     args: VString<string, "required">;
     meterId: VString<string | undefined, "optional">;
     cost: VFloat64<number, "required">;
     externalId: VString<string, "required">;
     status: VUnion<"reserved" | "settled" | "released", [VLiteral<"reserved", "required">, VLiteral<"settled", "required">, VLiteral<"released", "required">], "required", never>;
     createdAt: VFloat64<number, "required">;
   }, "required", 
     | "args"
     | "createdAt"
     | "name"
     | "userId"
     | "status"
     | "streamId"
     | "meterId"
     | "externalId"
     | "entityId"
     | "cost">, {
     streamId: ["streamId", "_creationTime"];
   }, {
   }, {
  }>;
  webhookDeliveries: TableDefinition<VObject<{
     type?: string;
     note?: string;
     service: string;
     deliveryId: string;
     outcome:   | "duplicate"
        | "ok"
        | "invalid_signature"
        | "unknown_type"
        | "handler_error"
        | "oversized"
        | "missing_secret";
     receivedAt: number;
   }, {
     service: VString<string, "required">;
     deliveryId: VString<string, "required">;
     type: VString<string | undefined, "optional">;
     outcome: VUnion<
        | "duplicate"
        | "ok"
        | "invalid_signature"
        | "unknown_type"
        | "handler_error"
        | "oversized"
       | "missing_secret", [VLiteral<"ok", "required">, VLiteral<"invalid_signature", "required">, VLiteral<"unknown_type", "required">, VLiteral<"handler_error", "required">, VLiteral<"duplicate", "required">, VLiteral<"oversized", "required">, VLiteral<"missing_secret", "required">], "required", never>;
     note: VString<string | undefined, "optional">;
     receivedAt: VFloat64<number, "required">;
   }, "required", "type" | "service" | "deliveryId" | "outcome" | "note" | "receivedAt">, {
     receivedAt: ["receivedAt", "_creationTime"];
     service_deliveryId: ["service", "deliveryId", "_creationTime"];
   }, {
   }, {
  }>;
}, true>;
```

Defined in: [src/convex/components/backend/schema.ts:401](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/schema.ts#L401)

Full component schema: auth + billing cache + AI plumbing + webhook log.
