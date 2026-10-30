/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    access: {
      admission: FunctionReference<
        "query",
        "internal",
        { email?: string; tokenHash?: string; workspaceInvitations?: number },
        {
          invite: null | {
            kind?: "code" | "link";
            label?: string;
            status: "valid" | "expired" | "used-up" | "revoked" | "unknown";
          };
          phase: null | string;
          ticket: null | { kind: string; label?: string };
        },
        Name
      >;
      admissionEmails: FunctionReference<
        "query",
        "internal",
        { ids: Array<string> },
        Array<{ email: string; id: string }>,
        Name
      >;
      admit: FunctionReference<
        "mutation",
        "internal",
        {
          createdBy?: string;
          emails: Array<string>;
          expiresAt: number;
          label?: string;
          source: "invitation" | "waitlist";
        },
        {
          admitted: Array<string>;
          ids: Array<string>;
          skipped: Array<{ email: string; reason: string }>;
        },
        Name
      >;
      attachUser: FunctionReference<
        "mutation",
        "internal",
        { email: string; userId: string },
        null | { label?: string; ticket: string },
        Name
      >;
      bookInvitationEmails: FunctionReference<
        "mutation",
        "internal",
        { count: number },
        { gapMs: number; start: number },
        Name
      >;
      consoleRows: FunctionReference<
        "query",
        "internal",
        {},
        {
          admissions: Array<{
            createdAt: number;
            email: string;
            expiresAt: number;
            id: string;
            label: null | string;
            source: "invitation" | "waitlist";
            usedAt: null | number;
          }>;
          invites: Array<{
            createdAt: number;
            expiresAt: null | number;
            id: string;
            kind: "code" | "link";
            label: string;
            maxUses: number;
            status: "valid" | "expired" | "used-up" | "revoked" | "unknown";
            uses: number;
          }>;
        },
        Name
      >;
      createInvite: FunctionReference<
        "mutation",
        "internal",
        {
          createdBy?: string;
          expiresAt?: number;
          keyVersion?: number;
          kind: "code" | "link";
          label: string;
          maxUses: number;
          tokenHash: string;
        },
        string,
        Name
      >;
      getPhase: FunctionReference<"query", "internal", {}, null | string, Name>;
      recordTicket: FunctionReference<
        "mutation",
        "internal",
        { email: string; ticket: string },
        null,
        Name
      >;
      redeem: FunctionReference<
        "mutation",
        "internal",
        { email: string; tokenHash?: string; workspaceInvitations?: number },
        | { label?: string; ticket: string }
        | { refused: "valid" | "expired" | "used-up" | "revoked" | "unknown" },
        Name
      >;
      rekeyInvite: FunctionReference<
        "mutation",
        "internal",
        { from: string; keyVersion?: number; to: string },
        boolean,
        Name
      >;
      revoke: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null | "invite" | "admission" | "used",
        Name
      >;
      setPhase: FunctionReference<
        "mutation",
        "internal",
        { phase: string },
        null | string,
        Name
      >;
      ticketOf: FunctionReference<
        "query",
        "internal",
        { userId: string },
        null | { kind: string; label?: string },
        Name
      >;
    };
    account: {
      bundleFiles: FunctionReference<
        "action",
        "internal",
        {
          exportId: string;
          files: Array<{ name: string; size: number; storageId: string }>;
        },
        Array<{ bytes: number; files: Array<string>; url: string }>,
        Name
      >;
      cancelDeletion: FunctionReference<
        "mutation",
        "internal",
        { tokenHash?: string; userId?: string },
        { userId: string } | null,
        Name
      >;
      deletion: FunctionReference<
        "query",
        "internal",
        { userId: string },
        { deletesAt: number; requestedAt: number } | null,
        Name
      >;
      exportData: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any,
        Name
      >;
      exportStatus: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          latest: {
            createdAt: number;
            expiresAt: number;
            parts: Array<{ bytes: number; files: number; url: string }>;
            url: string;
          } | null;
          remaining: number;
        },
        Name
      >;
      failedErasures: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          attempts: number;
          error: string | null;
          failedAt: number;
          step: string;
          userId: string | null;
        }>,
        Name
      >;
      forget: FunctionReference<
        "mutation",
        "internal",
        { email?: string; userId?: string },
        { deleted: Array<string>; email?: string; left: Array<string> },
        Name
      >;
      forgetDue: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        | { deleted: Array<string>; email?: string; left: Array<string> }
        | null
        | { deletesAt: number; postponed: Array<string> },
        Name
      >;
      isDeleting: FunctionReference<
        "query",
        "internal",
        { entityId: string },
        boolean,
        Name
      >;
      reportFailure: FunctionReference<
        "mutation",
        "internal",
        { attempts: number; source: string },
        null,
        Name
      >;
      requestDeletion: FunctionReference<
        "mutation",
        "internal",
        { graceMs: number; tokenHash: string; userId: string },
        { created: boolean; deletesAt: number; requestedAt: number },
        Name
      >;
      soleOwnerships: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<string>,
        Name
      >;
      startExport: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        { createdAt: number; expiresAt: number; exportId: string },
        Name
      >;
      storeExport: FunctionReference<
        "action",
        "internal",
        { data: string; exportId: string },
        { url: string } | null,
        Name
      >;
    };
    adapter: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                data: {
                  activationDismissedAt?: null | number;
                  banExpires?: null | number;
                  banReason?: null | string;
                  banned?: null | boolean;
                  createdAt: number;
                  email: string;
                  emailVerified: boolean;
                  image?: null | string;
                  lastLoginMethod?: null | string;
                  locale?: null | string;
                  name: string;
                  onboardedAt?: null | number;
                  passkeyOnly?: null | boolean;
                  recoveryCodeHash?: null | string;
                  role?: null | string;
                  updatedAt: number;
                  userId?: null | string;
                };
                model: "user";
              }
            | {
                data: {
                  activeOrganizationId?: null | string;
                  createdAt: number;
                  expiresAt: number;
                  impersonatedBy?: null | string;
                  ipAddress?: null | string;
                  passkeyRecovery?: null | boolean;
                  signInMethod?: null | string;
                  token: string;
                  updatedAt: number;
                  userAgent?: null | string;
                  userId: string;
                };
                model: "session";
              }
            | {
                data: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId: string;
                  createdAt: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt: number;
                  userId: string;
                };
                model: "account";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  identifier: string;
                  updatedAt: number;
                  value: string;
                };
                model: "verification";
              }
            | {
                data: { count: number; key: string; lastRequest: number };
                model: "rateLimit";
              }
            | {
                data: {
                  aaguid?: null | string;
                  backedUp: boolean;
                  counter: number;
                  createdAt?: null | number;
                  credentialID: string;
                  deviceType: string;
                  name?: null | string;
                  publicKey: string;
                  transports?: null | string;
                  userId: string;
                };
                model: "passkey";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt?: null | number;
                  privateKey: string;
                  publicKey: string;
                };
                model: "jwks";
              }
            | {
                data: {
                  createdAt: number;
                  logo?: null | string;
                  metadata?: null | string;
                  name: string;
                  slug: string;
                };
                model: "organization";
              }
            | {
                data: {
                  createdAt: number;
                  organizationId: string;
                  role: string;
                  userId: string;
                };
                model: "member";
              }
            | {
                data: {
                  createdAt: number;
                  email: string;
                  expiresAt: number;
                  inviterId: string;
                  organizationId: string;
                  role?: null | string;
                  status: string;
                };
                model: "invitation";
              };
          onCreateHandle?: string;
          select?: Array<string>;
        },
        any,
        Name
      >;
      deleteMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "role"
                    | "banned"
                    | "banReason"
                    | "banExpires"
                    | "lastLoginMethod"
                    | "locale"
                    | "passkeyOnly"
                    | "recoveryCodeHash"
                    | "onboardedAt"
                    | "activationDismissedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "impersonatedBy"
                    | "activeOrganizationId"
                    | "passkeyRecovery"
                    | "signInMethod"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "publicKey"
                    | "privateKey"
                    | "createdAt"
                    | "expiresAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "organization";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    "name" | "slug" | "logo" | "createdAt" | "metadata" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "member";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    "organizationId" | "userId" | "role" | "createdAt" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invitation";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "email"
                    | "role"
                    | "status"
                    | "expiresAt"
                    | "createdAt"
                    | "inviterId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any,
        Name
      >;
      deleteOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "role"
                    | "banned"
                    | "banReason"
                    | "banExpires"
                    | "lastLoginMethod"
                    | "locale"
                    | "passkeyOnly"
                    | "recoveryCodeHash"
                    | "onboardedAt"
                    | "activationDismissedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "impersonatedBy"
                    | "activeOrganizationId"
                    | "passkeyRecovery"
                    | "signInMethod"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "publicKey"
                    | "privateKey"
                    | "createdAt"
                    | "expiresAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "organization";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    "name" | "slug" | "logo" | "createdAt" | "metadata" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "member";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    "organizationId" | "userId" | "role" | "createdAt" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invitation";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "email"
                    | "role"
                    | "status"
                    | "expiresAt"
                    | "createdAt"
                    | "inviterId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
        },
        any,
        Name
      >;
      findMany: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          limit?: number;
          model:
            | "user"
            | "session"
            | "account"
            | "verification"
            | "rateLimit"
            | "passkey"
            | "jwks"
            | "organization"
            | "member"
            | "invitation";
          offset?: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          select?: Array<string>;
          sortBy?: { direction: "asc" | "desc"; field: string };
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            mode?: "sensitive" | "insensitive";
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              string | number | boolean | Array<string> | Array<number> | null;
          }>;
        },
        any,
        Name
      >;
      findOne: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          model:
            | "user"
            | "session"
            | "account"
            | "verification"
            | "rateLimit"
            | "passkey"
            | "jwks"
            | "organization"
            | "member"
            | "invitation";
          select?: Array<string>;
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            mode?: "sensitive" | "insensitive";
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              string | number | boolean | Array<string> | Array<number> | null;
          }>;
        },
        any,
        Name
      >;
      updateMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  activationDismissedAt?: null | number;
                  banExpires?: null | number;
                  banReason?: null | string;
                  banned?: null | boolean;
                  createdAt?: number;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  lastLoginMethod?: null | string;
                  locale?: null | string;
                  name?: string;
                  onboardedAt?: null | number;
                  passkeyOnly?: null | boolean;
                  recoveryCodeHash?: null | string;
                  role?: null | string;
                  updatedAt?: number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "role"
                    | "banned"
                    | "banReason"
                    | "banExpires"
                    | "lastLoginMethod"
                    | "locale"
                    | "passkeyOnly"
                    | "recoveryCodeHash"
                    | "onboardedAt"
                    | "activationDismissedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  activeOrganizationId?: null | string;
                  createdAt?: number;
                  expiresAt?: number;
                  impersonatedBy?: null | string;
                  ipAddress?: null | string;
                  passkeyRecovery?: null | boolean;
                  signInMethod?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "impersonatedBy"
                    | "activeOrganizationId"
                    | "passkeyRecovery"
                    | "signInMethod"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                update: { count?: number; key?: string; lastRequest?: number };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                update: {
                  aaguid?: null | string;
                  backedUp?: boolean;
                  counter?: number;
                  createdAt?: null | number;
                  credentialID?: string;
                  deviceType?: string;
                  name?: null | string;
                  publicKey?: string;
                  transports?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  expiresAt?: null | number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "publicKey"
                    | "privateKey"
                    | "createdAt"
                    | "expiresAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "organization";
                update: {
                  createdAt?: number;
                  logo?: null | string;
                  metadata?: null | string;
                  name?: string;
                  slug?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    "name" | "slug" | "logo" | "createdAt" | "metadata" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "member";
                update: {
                  createdAt?: number;
                  organizationId?: string;
                  role?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    "organizationId" | "userId" | "role" | "createdAt" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invitation";
                update: {
                  createdAt?: number;
                  email?: string;
                  expiresAt?: number;
                  inviterId?: string;
                  organizationId?: string;
                  role?: null | string;
                  status?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "email"
                    | "role"
                    | "status"
                    | "expiresAt"
                    | "createdAt"
                    | "inviterId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any,
        Name
      >;
      updateOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  activationDismissedAt?: null | number;
                  banExpires?: null | number;
                  banReason?: null | string;
                  banned?: null | boolean;
                  createdAt?: number;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  lastLoginMethod?: null | string;
                  locale?: null | string;
                  name?: string;
                  onboardedAt?: null | number;
                  passkeyOnly?: null | boolean;
                  recoveryCodeHash?: null | string;
                  role?: null | string;
                  updatedAt?: number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "role"
                    | "banned"
                    | "banReason"
                    | "banExpires"
                    | "lastLoginMethod"
                    | "locale"
                    | "passkeyOnly"
                    | "recoveryCodeHash"
                    | "onboardedAt"
                    | "activationDismissedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  activeOrganizationId?: null | string;
                  createdAt?: number;
                  expiresAt?: number;
                  impersonatedBy?: null | string;
                  ipAddress?: null | string;
                  passkeyRecovery?: null | boolean;
                  signInMethod?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "impersonatedBy"
                    | "activeOrganizationId"
                    | "passkeyRecovery"
                    | "signInMethod"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                update: { count?: number; key?: string; lastRequest?: number };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                update: {
                  aaguid?: null | string;
                  backedUp?: boolean;
                  counter?: number;
                  createdAt?: null | number;
                  credentialID?: string;
                  deviceType?: string;
                  name?: null | string;
                  publicKey?: string;
                  transports?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  expiresAt?: null | number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "publicKey"
                    | "privateKey"
                    | "createdAt"
                    | "expiresAt"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "organization";
                update: {
                  createdAt?: number;
                  logo?: null | string;
                  metadata?: null | string;
                  name?: string;
                  slug?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    "name" | "slug" | "logo" | "createdAt" | "metadata" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "member";
                update: {
                  createdAt?: number;
                  organizationId?: string;
                  role?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    "organizationId" | "userId" | "role" | "createdAt" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invitation";
                update: {
                  createdAt?: number;
                  email?: string;
                  expiresAt?: number;
                  inviterId?: string;
                  organizationId?: string;
                  role?: null | string;
                  status?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "email"
                    | "role"
                    | "status"
                    | "expiresAt"
                    | "createdAt"
                    | "inviterId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
        },
        any,
        Name
      >;
    };
    ai: {
      claimRequest: FunctionReference<
        "mutation",
        "internal",
        { streamId: string },
        boolean,
        Name
      >;
      clear: FunctionReference<
        "mutation",
        "internal",
        { beforeMs?: number },
        null,
        Name
      >;
      createDocument: FunctionReference<
        "mutation",
        "internal",
        {
          addedBy: string;
          characters: number;
          key?: string;
          namespaces?: string;
          owner: string;
          read: string;
          remove: string;
          removeNamespace?: string;
          store: string;
          title: string;
        },
        string,
        Name
      >;
      createRequest: FunctionReference<
        "mutation",
        "internal",
        {
          args: string;
          cost: number;
          entityId: string;
          externalId: string;
          meterId?: string;
          name: string;
          streamId: string;
          userId: string;
        },
        null,
        Name
      >;
      createThread: FunctionReference<
        "mutation",
        "internal",
        {
          chat: string;
          owner: string;
          read: string;
          remove: string;
          threadId: string;
          title: string;
          userId: string;
        },
        null,
        Name
      >;
      deleteDocument: FunctionReference<
        "mutation",
        "internal",
        { documentId: string },
        null,
        Name
      >;
      deleteThread: FunctionReference<
        "mutation",
        "internal",
        { threadId: string },
        null,
        Name
      >;
      getByStream: FunctionReference<
        "query",
        "internal",
        { streamId: string },
        {
          args: string;
          cost: number;
          createdAt: number;
          entityId: string;
          externalId: string;
          meterId?: string;
          name: string;
          status: "reserved" | "streaming" | "settled" | "released";
          streamId: string;
          userId: string;
        } | null,
        Name
      >;
      getDocument: FunctionReference<
        "query",
        "internal",
        { documentId: string },
        {
          addedBy: string;
          characters: number;
          createdAt: number;
          entryId?: string;
          id: string;
          key?: string;
          namespaces?: string;
          owner: string;
          read: string;
          remove: string;
          removeNamespace?: string;
          status: "pending" | "ready" | "failed";
          store: string;
          title: string;
        } | null,
        Name
      >;
      getProvenance: FunctionReference<
        "query",
        "internal",
        { storageId: string },
        {
          finishedAt: number;
          inputs: Array<string>;
          models: Array<string>;
        } | null,
        Name
      >;
      getThread: FunctionReference<
        "query",
        "internal",
        { threadId: string },
        {
          chat: string;
          owner: string;
          read: string;
          remove: string;
          threadId: string;
          title: string;
          updatedAt: number;
          userId: string;
        } | null,
        Name
      >;
      jobProvenanceInputs: FunctionReference<
        "query",
        "internal",
        { jobId: string },
        Array<string>,
        Name
      >;
      listDocuments: FunctionReference<
        "query",
        "internal",
        {
          owner: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          store: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            addedBy: string;
            characters: number;
            createdAt: number;
            entryId?: string;
            id: string;
            key?: string;
            namespaces?: string;
            owner: string;
            read: string;
            remove: string;
            removeNamespace?: string;
            status: "pending" | "ready" | "failed";
            store: string;
            title: string;
          }>;
        },
        Name
      >;
      listThreads: FunctionReference<
        "query",
        "internal",
        { chat: string; limit: number; owner: string; userId: string },
        Array<{ threadId: string; title: string; updatedAt: number }>,
        Name
      >;
      markReleased: FunctionReference<
        "mutation",
        "internal",
        { streamId: string },
        null,
        Name
      >;
      markSettled: FunctionReference<
        "mutation",
        "internal",
        { streamId: string },
        null,
        Name
      >;
      settleDocument: FunctionReference<
        "mutation",
        "internal",
        { documentId: string; entryId?: string; status: "ready" | "failed" },
        { replaced: Array<string> } | null,
        Name
      >;
      storeGeneratedImage: FunctionReference<
        "action",
        "internal",
        {
          bytes: ArrayBuffer;
          contentType?: string;
          inputs: Array<string>;
          jobId?: string;
          manifest?: string;
          models: Array<string>;
          owner?: string;
          sourceType:
            "trainedAlgorithmicMedia" | "compositeWithTrainedAlgorithmicMedia";
          userId?: string;
        },
        string,
        Name
      >;
      storeImage: FunctionReference<
        "mutation",
        "internal",
        {
          bytes: ArrayBuffer;
          contentType?: string;
          inputs: Array<string>;
          jobId?: string;
          manifest?: string;
          models: Array<string>;
          owner?: string;
          sourceType:
            "trainedAlgorithmicMedia" | "compositeWithTrainedAlgorithmicMedia";
          userId?: string;
        },
        string,
        Name
      >;
      touchThread: FunctionReference<
        "mutation",
        "internal",
        { threadId: string },
        null,
        Name
      >;
    };
    announcements: {
      broadcastCancelled: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        boolean,
        Name
      >;
      broadcastCreated: FunctionReference<
        "mutation",
        "internal",
        { id: string; providerId: string },
        null,
        Name
      >;
      broadcastSent: FunctionReference<
        "mutation",
        "internal",
        { id: string; sendAt: number; sentBy: string },
        boolean,
        Name
      >;
      cancelBroadcast: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        { cancelled: boolean; providerId: string | null },
        Name
      >;
      claimBroadcast: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        | { next: "none" }
        | { next: "busy" }
        | { next: "done"; sendAt?: number }
        | {
            audience: "accounts" | "waitlist";
            body: string;
            next: "create";
            subject: string;
            topic?: string;
          }
        | { next: "send"; providerId: string },
        Name
      >;
      dismiss: FunctionReference<
        "mutation",
        "internal",
        { id: string; userId: string },
        null,
        Name
      >;
      end: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        boolean,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          broadcast?: {
            audience: "accounts" | "waitlist";
            body: string;
            sendAt?: number;
            state: "draft" | "creating" | "created" | "sent" | "cancelled";
            subject: string;
            topic?: string;
          };
          endedAt?: number;
          expiresAt: number;
          id: string;
          link?: { label?: string; url: string };
          message: string;
          publishedAt: number;
        }>,
        Name
      >;
      live: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          expiresAt: number;
          id: string;
          link?: { label?: string; url: string };
          message: string;
          publishedAt: number;
        }>,
        Name
      >;
      publish: FunctionReference<
        "mutation",
        "internal",
        {
          broadcast?: {
            audience: "accounts" | "waitlist";
            body: string;
            subject: string;
            topic?: string;
          };
          expiresAt: number;
          link?: { label?: string; url: string };
          message: string;
          publishedBy: string;
        },
        string,
        Name
      >;
      releaseBroadcast: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null,
        Name
      >;
    };
    audit: {
      firstEvents: FunctionReference<
        "query",
        "internal",
        {
          tasks: Array<{
            key: string;
            kind: string;
            scope: "person" | "workspace";
          }>;
          userId: string;
          workspaceId?: string;
        },
        Array<{ at: number | null; key: string }>,
        Name
      >;
      forgetSubject: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          view:
            | { kind: "subject"; userId: string }
            | { kind: "workspace"; viewerId: string; workspaceId: string }
            | { kind: "all"; viewerId: string };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            actor: {
              id: string | null;
              kind: "you" | "user" | "administrator" | "app" | "erased";
              name: string | null;
            };
            at: number;
            data: Record<string, string | number | boolean | Array<string>>;
            id: string;
            impersonated: boolean;
            subject: {
              id: string | null;
              kind: "you" | "user" | "administrator" | "app" | "erased";
              name: string | null;
            } | null;
            targetId: string | null;
            type: string;
            workspace: { id: string; name: string | null } | null;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        {
          activation?: string;
          deliver?: string;
          event: {
            actorId?: string;
            data?: Record<string, string | number | boolean | Array<string>>;
            entityId?: string;
            impersonatorId?: string;
            subjectId?: string;
            targetId?: string;
            type: string;
          };
          forward?: string;
          notify?: { channels: Array<"app" | "email" | "push">; link?: string };
        },
        { deliveries: { email: boolean; inApp: boolean }; id: string },
        Name
      >;
    };
    billing: {
      attachReleaseJob: FunctionReference<
        "mutation",
        "internal",
        { externalId: string; jobId: string; userId: string },
        null,
        Name
      >;
      claimTrial: FunctionReference<
        "mutation",
        "internal",
        { entityId: string; holdMs: number; ownerUserId: string },
        boolean,
        Name
      >;
      clear: FunctionReference<"mutation", "internal", {}, null, Name>;
      clearPendingSpends: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        null,
        Name
      >;
      credit: FunctionReference<
        "mutation",
        "internal",
        { amount: number; meterId: string; userId: string },
        null,
        Name
      >;
      debit: FunctionReference<
        "mutation",
        "internal",
        {
          allowOverage?: boolean;
          amount: number;
          externalId: string;
          hold?: number;
          meterId: string;
          userId: string;
        },
        {
          balance: number;
          ok: boolean;
          reason?: "no-row" | "no-meter" | "insufficient";
        },
        Name
      >;
      deleteByUser: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        null,
        Name
      >;
      entityProfile: FunctionReference<
        "query",
        "internal",
        { entityId: string },
        null | {
          name: string;
          ownedEntityIds: Array<string>;
          owner: null | {
            email: string;
            emailVerified: boolean;
            name: string;
            userId: string;
          };
          personal: boolean;
        },
        Name
      >;
      finalize: FunctionReference<
        "mutation",
        "internal",
        { externalId: string; finalAmount?: number; userId: string },
        {
          balance: number;
          balanceBefore: number;
          releaseJobId?: string;
          released: number;
          settled: boolean;
        },
        Name
      >;
      getBenefitMetadata: FunctionReference<
        "query",
        "internal",
        { benefitIds: Array<string> },
        Array<{
          benefitId: string;
          description?: string;
          metadata: Record<string, string | number | boolean>;
          updatedAt: number;
        }>,
        Name
      >;
      getByUser: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          activeProductIds: Array<string>;
          benefits: Array<{
            benefitId: string;
            files?: number;
            grantedAt?: number;
            id: string;
            licenseKey?: string;
            metadata?: Record<string, string | number | boolean>;
            repository?: string;
            type: string;
          }>;
          customerId: string | null;
          meters: Array<{
            balance: number;
            consumedUnits: number;
            creditedUnits: number;
            cycleEnd?: number;
            cycleStart?: number;
            meterId: string;
            rollover?: boolean;
          }>;
        } | null,
        Name
      >;
      markTrialUsed: FunctionReference<
        "mutation",
        "internal",
        { entityId: string; ownerUserId: string },
        null,
        Name
      >;
      quotaKeys: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<string>,
        Name
      >;
      recordQuotaKey: FunctionReference<
        "mutation",
        "internal",
        { key: string; userId: string },
        null,
        Name
      >;
      recordSubscriptionChange: FunctionReference<
        "mutation",
        "internal",
        {
          modifiedAt: number;
          pendingChange: null | { appliesAt: number; productId: string };
          resumesAt: null | number;
          subscriptionId: string;
          userId: string;
        },
        null,
        Name
      >;
      release: FunctionReference<
        "mutation",
        "internal",
        { externalId: string; userId: string },
        null,
        Name
      >;
      releaseDiscountCode: FunctionReference<
        "mutation",
        "internal",
        { userId: string; windowStart: number },
        null,
        Name
      >;
      reserveDiscountCode: FunctionReference<
        "mutation",
        "internal",
        { max: number; userId: string; windowMs: number },
        | { reserved: true; windowStart: number }
        | { reserved: false; retryAfter: number },
        Name
      >;
      settle: FunctionReference<
        "mutation",
        "internal",
        { externalId: string; finalAmount?: number; userId: string },
        null,
        Name
      >;
      subscriptionChanges: FunctionReference<
        "query",
        "internal",
        { subscriptionIds: Array<string> },
        Array<{
          modifiedAt: number;
          pendingChange: null | { appliesAt: number; productId: string };
          resumesAt: null | number;
          subscriptionId: string;
        }>,
        Name
      >;
      upsert: FunctionReference<
        "mutation",
        "internal",
        {
          activeProductIds: Array<string>;
          benefits: Array<{
            benefitId: string;
            files?: number;
            grantedAt?: number;
            id: string;
            licenseKey?: string;
            metadata?: Record<string, string | number | boolean>;
            repository?: string;
            type: string;
          }>;
          customerId?: string;
          meters: Array<{
            balance: number;
            consumedUnits: number;
            creditedUnits: number;
            cycleEnd?: number;
            cycleStart?: number;
            meterId: string;
            rollover?: boolean;
          }>;
          userId: string;
        },
        null,
        Name
      >;
      upsertBenefitMetadata: FunctionReference<
        "mutation",
        "internal",
        {
          entries: Array<{
            benefitId: string;
            description?: string;
            metadata: Record<string, string | number | boolean>;
          }>;
        },
        null,
        Name
      >;
      userByCustomer: FunctionReference<
        "query",
        "internal",
        { customerId: string },
        string | null,
        Name
      >;
    };
    consents: {
      history: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          at: number;
          granted: boolean;
          kind: string;
          reference?: string;
          source: string;
          text?: string;
          version: string;
        }>,
        Name
      >;
      latest: FunctionReference<
        "query",
        "internal",
        { kind: string; userId: string },
        { at: number; granted: boolean; kind: string; version: string } | null,
        Name
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          entries: Array<{
            granted: boolean;
            kind: string;
            reference?: string;
            source: string;
            text?: string;
            version: string;
          }>;
          userId?: string;
        },
        Array<{
          granted: boolean;
          kind: string;
          reference?: string;
          source: string;
          text?: string;
          version: string;
        }>,
        Name
      >;
      recordSignUp: FunctionReference<
        "mutation",
        "internal",
        {
          email: string;
          entries: Array<{
            granted: boolean;
            kind: string;
            reference?: string;
            source: string;
            text?: string;
            version: string;
          }>;
          userId: string;
        },
        {
          carried: Array<{
            at: number;
            granted: boolean;
            kind: string;
            version: string;
          }>;
          recorded: Array<{
            granted: boolean;
            kind: string;
            reference?: string;
            source: string;
            text?: string;
            version: string;
          }>;
        },
        Name
      >;
      state: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{ at: number; granted: boolean; kind: string; version: string }>,
        Name
      >;
    };
    costs: {
      record: FunctionReference<
        "mutation",
        "internal",
        {
          owner: string;
          spendLimitUsd?: number;
          usage: {
            cached: number;
            input: number;
            output: number;
            usd?: number;
          };
          userId?: string;
        },
        null,
        Name
      >;
      summary: FunctionReference<
        "query",
        "internal",
        { since: number },
        {
          days: Array<{ day: number; runs: number; usd: number }>;
          people: Array<{
            email?: string;
            input: number;
            name?: string;
            output: number;
            runs: number;
            usd: number;
            who: string;
          }>;
          runs: number;
          since: number;
          truncated: boolean;
          usd: number;
        },
        Name
      >;
    };
    devices: {
      alerts: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          at: number;
          browser?: string;
          os?: string;
          recovery: boolean;
          sessionId?: string;
        }>,
        Name
      >;
      see: FunctionReference<
        "mutation",
        "internal",
        {
          browser?: string;
          device: string;
          fingerprint: string;
          os?: string;
          previous?: Array<{ device: string; fingerprint: string }>;
          recovery?: boolean;
          sessionId?: string;
          userId: string;
        },
        { alert: boolean; email: boolean },
        Name
      >;
    };
    email: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { emailId: string },
        null,
        Name
      >;
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { olderThanMs?: number },
        null,
        Name
      >;
      cleanupAbandoned: FunctionReference<
        "mutation",
        "internal",
        { olderThanMs?: number },
        null,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { emailId: string },
        {
          bcc?: Array<string>;
          bounced: boolean;
          cc?: Array<string>;
          clicked: boolean;
          complained: boolean;
          createdAt: number;
          deliveryDelayed: boolean;
          errorMessage: string | null;
          failed: boolean;
          finalizedAt: number;
          from: string;
          headers?: Array<{ name: string; value: string }>;
          html?: string;
          opened: boolean;
          replyTo: Array<string>;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
          subject?: string;
          template?: {
            id: string;
            variables?: Record<string, string | number>;
          };
          text?: string;
          to: Array<string>;
        } | null,
        Name
      >;
      handleWebhook: FunctionReference<
        "action",
        "internal",
        { body: string; headers: Record<string, string> },
        { body: string; status: number; type?: string },
        Name
      >;
      inbox: FunctionReference<
        "action",
        "internal",
        { address: string },
        Array<{
          from: string;
          html?: string;
          receivedAt: number;
          subject: string;
          text?: string;
        }>,
        Name
      >;
      send: FunctionReference<
        "mutation",
        "internal",
        {
          bcc?: string | Array<string>;
          cc?: string | Array<string>;
          deliverAt?: number;
          expiresAt?: number;
          from?: string;
          headers?: Array<{ name: string; value: string }>;
          hold?: {
            contactId: string;
            topic: { key: string; subscribedByDefault: boolean };
          };
          html?: string;
          idempotencyKey?: string;
          replyTo?: Array<string>;
          retention?: { abandonedMs?: number; finalizedMs?: number };
          subject?: string;
          template?: {
            id: string;
            variables?: Record<string, string | number>;
          };
          text?: string;
          to: string | Array<string>;
        },
        string | null,
        Name
      >;
      sendSecret: FunctionReference<
        "mutation",
        "internal",
        {
          bcc?: string | Array<string>;
          cc?: string | Array<string>;
          deliverAt?: number;
          expiresAt?: number;
          from?: string;
          headers?: Array<{ name: string; value: string }>;
          hold?: {
            contactId: string;
            topic: { key: string; subscribedByDefault: boolean };
          };
          html?: string;
          idempotencyKey?: string;
          replyTo?: Array<string>;
          retention?: { abandonedMs?: number; finalizedMs?: number };
          subject?: string;
          template?: {
            id: string;
            variables?: Record<string, string | number>;
          };
          text?: string;
          to: string | Array<string>;
        },
        string | null,
        Name
      >;
      status: FunctionReference<
        "query",
        "internal",
        { emailId: string },
        {
          bounced: boolean;
          clicked: boolean;
          complained: boolean;
          deliveryDelayed: boolean;
          errorMessage: string | null;
          failed: boolean;
          opened: boolean;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "delivery_delayed"
            | "bounced"
            | "failed";
        } | null,
        Name
      >;
    };
    erasures: {
      clearFailure: FunctionReference<
        "mutation",
        "internal",
        { email?: string; userId?: string },
        null,
        Name
      >;
      failure: FunctionReference<
        "query",
        "internal",
        { email?: string; userId?: string },
        {
          deleted: Array<string>;
          done: Array<string>;
          email?: string;
          failed: Array<string>;
          failedAt: number;
          left: Array<string>;
          rounds: number;
          userId?: string;
        } | null,
        Name
      >;
      failures: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          deleted: Array<string>;
          done: Array<string>;
          email?: string;
          failed: Array<string>;
          failedAt: number;
          left: Array<string>;
          rounds: number;
          userId?: string;
        }>,
        Name
      >;
      keepFailure: FunctionReference<
        "mutation",
        "internal",
        {
          deleted: Array<string>;
          done: Array<string>;
          email?: string;
          failed: Array<string>;
          left: Array<string>;
          rounds: number;
          userId?: string;
        },
        null,
        Name
      >;
    };
    flags: {
      forgetUser: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        null,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: string },
        null | {
          key: string;
          override: {
            enabled?: boolean;
            message?: string;
            plans?: Array<string>;
            rollout?: number;
            users?: Array<string>;
            winner?: string;
            workspaces?: Array<string>;
          };
          updatedAt: number;
        },
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          key: string;
          override: {
            enabled?: boolean;
            message?: string;
            plans?: Array<string>;
            rollout?: number;
            users?: Array<string>;
            winner?: string;
            workspaces?: Array<string>;
          };
          updatedAt: number;
        }>,
        Name
      >;
      set: FunctionReference<
        "mutation",
        "internal",
        {
          key: string;
          override: null | {
            enabled?: boolean;
            message?: string;
            plans?: Array<string>;
            rollout?: number;
            users?: Array<string>;
            winner?: string;
            workspaces?: Array<string>;
          };
        },
        null,
        Name
      >;
    };
    funnel: {
      experimentCounts: FunctionReference<
        "query",
        "internal",
        { experiment: string; kinds: Array<string>; variants: Array<string> },
        {
          startedAt: number | null;
          variants: Array<{
            exposed: number;
            kinds: Record<string, number>;
            name: string;
          }>;
        },
        Name
      >;
      expose: FunctionReference<
        "mutation",
        "internal",
        {
          by: "user" | "workspace";
          experiment: string;
          goal?: string;
          guardrails: Array<string>;
          subject: string;
          userId: string;
          variant: string;
          variants: Array<string>;
        },
        { exposed: boolean; variant: string },
        Name
      >;
      recordSource: FunctionReference<
        "mutation",
        "internal",
        {
          answer?: string | null;
          detail?: string;
          touch?: {
            campaign?: string;
            content?: string;
            medium?: string;
            source?: string;
            term?: string;
          };
          userId: string;
        },
        { answer: string | null; asked: boolean; campaign: string | null },
        Name
      >;
      report: FunctionReference<
        "query",
        "internal",
        { until?: number; weeks: number },
        {
          activation: number;
          admitted: number;
          breakdowns: {
            answer: Array<{
              counts: {
                activation: number;
                paid: number;
                signup: number;
                trial: number;
              };
              label?: string;
              value: string;
            }>;
            campaign: Array<{
              counts: {
                activation: number;
                paid: number;
                signup: number;
                trial: number;
              };
              label?: string;
              value: string;
            }>;
            invite: Array<{
              counts: {
                activation: number;
                paid: number;
                signup: number;
                trial: number;
              };
              label?: string;
              value: string;
            }>;
            promotion: Array<{
              counts: {
                activation: number;
                paid: number;
                signup: number;
                trial: number;
              };
              label?: string;
              value: string;
            }>;
            referral: Array<{
              counts: {
                activation: number;
                paid: number;
                signup: number;
                trial: number;
              };
              label?: string;
              value: string;
            }>;
          };
          cohorts: Array<{ active: Array<number>; size: number; week: number }>;
          otherAnswers: Array<string>;
          paid: number;
          signup: number;
          since: number;
          trial: number;
          until: number;
          waitlist: number;
          weeks: number;
        },
        Name
      >;
      source: FunctionReference<
        "query",
        "internal",
        { userId: string },
        { answer: string | null; asked: boolean; campaign: string | null },
        Name
      >;
    };
    gifts: {
      activePass: FunctionReference<
        "query",
        "internal",
        { entityId: string },
        {
          endsAt: number;
          id: string;
          months?: number;
          plan: string;
          rewardId?: string;
          startedAt: number;
          subscriptionId?: string;
          trial?: true;
        } | null,
        Name
      >;
      beginCancel: FunctionReference<
        "mutation",
        "internal",
        { giftId: string; until: number },
        boolean,
        Name
      >;
      countBought: FunctionReference<
        "query",
        "internal",
        {
          excludeGiftId?: string;
          pendingSince: number;
          purchaserUserId: string;
          since: number;
        },
        { count: number; oldest: number | null },
        Name
      >;
      countToAddress: FunctionReference<
        "query",
        "internal",
        {
          email: string;
          excludeGiftId?: string;
          pendingSince: number;
          since: number;
        },
        number,
        Name
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          deliverAt?: number;
          giftProductId?: string;
          message?: string;
          months?: number;
          pack?: string;
          plan?: string;
          productIds: Array<string>;
          purchaserEntityId?: string;
          purchaserName?: string;
          purchaserUserId: string;
          recipientEmail: string;
        },
        string,
        Name
      >;
      due: FunctionReference<
        "query",
        "internal",
        { limit?: number; now: number },
        {
          more: boolean;
          tasks: Array<{
            giftId: string;
            kind:
              | "deliver"
              | "remind"
              | "schedule_return"
              | "end_pass"
              | "pass_notice";
          }>;
        },
        Name
      >;
      endCancel: FunctionReference<
        "mutation",
        "internal",
        { giftId: string },
        null,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { giftId: string },
        {
          amount?: number;
          billingCustomerId?: string;
          billingOrderId?: string;
          claimOrderId?: string;
          claimedAt?: number;
          claimedByUserId?: string;
          claimedEntityId?: string;
          claimingEntityId?: string;
          claimingUserId?: string;
          createdAt: number;
          currency?: string;
          deliverAt?: number;
          deliveredAt?: number;
          discountId?: string;
          giftProductId?: string;
          id: string;
          message?: string;
          months?: number;
          noticeCount?: number;
          noticedAt?: number;
          notifiedAt?: number;
          pack?: string;
          paidAt?: number;
          passEndedAt?: number;
          passEndsAt?: number;
          passNoticedAt?: number;
          passReturnScheduledAt?: number;
          passStartedAt?: number;
          passSubscriptionId?: string;
          plan?: string;
          productIds: Array<string>;
          purchaserEmail?: string;
          purchaserEntityId?: string;
          purchaserName?: string;
          purchaserUserId: string;
          recipientChanges?: number;
          recipientEmail: string;
          refundedAt?: number;
          remindedAt?: number;
          reverseTrial?: boolean;
          status: string;
        } | null,
        Name
      >;
      listByEmail: FunctionReference<
        "query",
        "internal",
        { email: string; status?: "paid" | "claimed" },
        Array<{
          amount?: number;
          billingCustomerId?: string;
          billingOrderId?: string;
          claimOrderId?: string;
          claimedAt?: number;
          claimedByUserId?: string;
          claimedEntityId?: string;
          claimingEntityId?: string;
          claimingUserId?: string;
          createdAt: number;
          currency?: string;
          deliverAt?: number;
          deliveredAt?: number;
          discountId?: string;
          giftProductId?: string;
          id: string;
          message?: string;
          months?: number;
          noticeCount?: number;
          noticedAt?: number;
          notifiedAt?: number;
          pack?: string;
          paidAt?: number;
          passEndedAt?: number;
          passEndsAt?: number;
          passNoticedAt?: number;
          passReturnScheduledAt?: number;
          passStartedAt?: number;
          passSubscriptionId?: string;
          plan?: string;
          productIds: Array<string>;
          purchaserEmail?: string;
          purchaserEntityId?: string;
          purchaserName?: string;
          purchaserUserId: string;
          recipientChanges?: number;
          recipientEmail: string;
          refundedAt?: number;
          remindedAt?: number;
          reverseTrial?: boolean;
          status: string;
        }>,
        Name
      >;
      listByPurchaser: FunctionReference<
        "query",
        "internal",
        { purchaserUserId: string },
        Array<{
          amount?: number;
          billingCustomerId?: string;
          billingOrderId?: string;
          claimOrderId?: string;
          claimedAt?: number;
          claimedByUserId?: string;
          claimedEntityId?: string;
          claimingEntityId?: string;
          claimingUserId?: string;
          createdAt: number;
          currency?: string;
          deliverAt?: number;
          deliveredAt?: number;
          discountId?: string;
          giftProductId?: string;
          id: string;
          message?: string;
          months?: number;
          noticeCount?: number;
          noticedAt?: number;
          notifiedAt?: number;
          pack?: string;
          paidAt?: number;
          passEndedAt?: number;
          passEndsAt?: number;
          passNoticedAt?: number;
          passReturnScheduledAt?: number;
          passStartedAt?: number;
          passSubscriptionId?: string;
          plan?: string;
          productIds: Array<string>;
          purchaserEmail?: string;
          purchaserEntityId?: string;
          purchaserName?: string;
          purchaserUserId: string;
          recipientChanges?: number;
          recipientEmail: string;
          refundedAt?: number;
          remindedAt?: number;
          reverseTrial?: boolean;
          status: string;
        }>,
        Name
      >;
      markClaimed: FunctionReference<
        "mutation",
        "internal",
        {
          claimOrderId?: string;
          entityId: string;
          giftId: string;
          userId: string;
        },
        null,
        Name
      >;
      markDelivered: FunctionReference<
        "mutation",
        "internal",
        { giftId: string },
        boolean,
        Name
      >;
      markNotified: FunctionReference<
        "mutation",
        "internal",
        { giftId: string },
        boolean,
        Name
      >;
      markPaid: FunctionReference<
        "mutation",
        "internal",
        {
          amount?: number;
          billingOrderId?: string;
          currency?: string;
          giftId: string;
        },
        null,
        Name
      >;
      markRefunded: FunctionReference<
        "mutation",
        "internal",
        { giftId: string },
        boolean,
        Name
      >;
      noteNotice: FunctionReference<
        "mutation",
        "internal",
        { giftId: string; reminder?: boolean },
        null,
        Name
      >;
      notePass: FunctionReference<
        "mutation",
        "internal",
        { giftId: string; step: "return_scheduled" | "noticed" | "ended" },
        boolean,
        Name
      >;
      personalEntity: FunctionReference<
        "query",
        "internal",
        { userId: string },
        string | null,
        Name
      >;
      registerSweep: FunctionReference<
        "mutation",
        "internal",
        { wake: string },
        null,
        Name
      >;
      releasePass: FunctionReference<
        "mutation",
        "internal",
        { giftId: string },
        null,
        Name
      >;
      reservePass: FunctionReference<
        "mutation",
        "internal",
        { entityId: string; giftId: string; until: number; userId: string },
        "reserved" | "busy" | "taken" | "closed",
        Name
      >;
      setDeliverAt: FunctionReference<
        "mutation",
        "internal",
        { deliverAt: number; giftId: string },
        boolean,
        Name
      >;
      setDiscount: FunctionReference<
        "mutation",
        "internal",
        { discountId: string; giftId: string },
        boolean,
        Name
      >;
      setRecipient: FunctionReference<
        "mutation",
        "internal",
        { giftId: string; recipientEmail: string },
        boolean,
        Name
      >;
      startClaim: FunctionReference<
        "mutation",
        "internal",
        { entityId: string; giftId: string; userId: string },
        boolean,
        Name
      >;
      startPass: FunctionReference<
        "mutation",
        "internal",
        {
          endsAt: number;
          entityId: string;
          giftId: string;
          returnFrom: number;
          subscriptionId: string;
          userId: string;
        },
        boolean,
        Name
      >;
      startRewardPass: FunctionReference<
        "mutation",
        "internal",
        {
          endsAt: number;
          entityId: string;
          months: number;
          plan: string;
          productId: string;
          returnFrom: number;
          rewardId: string;
          subscriptionId: string;
          userId: string;
        },
        boolean,
        Name
      >;
      startTrialPass: FunctionReference<
        "mutation",
        "internal",
        {
          address: string;
          endsAt: number;
          entityId: string;
          plan: string;
          productId: string;
          returnFrom: number;
          subscriptionId: string;
          userId: string;
        },
        boolean,
        Name
      >;
      trialPassTaken: FunctionReference<
        "query",
        "internal",
        { address: string },
        boolean,
        Name
      >;
    };
    inbound: {
      consoleRows: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          at: number;
          attachments: Array<{ name: string; size?: number }>;
          canReply: boolean;
          delivery: "support" | "copy" | "kept" | "held" | "failed" | null;
          from: string | null;
          id: string;
          kind: "contact" | "reply" | "workspace" | "support";
          name: string | null;
          repliedAt: number | null;
          subject: string | null;
          text: string;
          thread: string | null;
          threadId: string | null;
          userId: string | null;
          workspaceId: string | null;
        }>,
        Name
      >;
      linkContact: FunctionReference<
        "mutation",
        "internal",
        { inboxEmailId: string; ref: string; threadId: string },
        boolean,
        Name
      >;
      markHandled: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null,
        Name
      >;
      markReplied: FunctionReference<
        "mutation",
        "internal",
        { by: string; id: string; kind: "contact" | "inbound" },
        null,
        Name
      >;
      recordInbound: FunctionReference<
        "mutation",
        "internal",
        {
          message: {
            attachments: Array<{ name: string; size?: number }>;
            emailId: string;
            from: string;
            fromName?: string;
            inboxEmailId?: string;
            receivedAt: number;
            route: "reply" | "workspace" | "support";
            subject: string;
            text?: string;
            thread?: string;
            threadId?: string;
            to: string;
            userId?: string;
            workspaceId?: string;
          };
        },
        { fresh: boolean; handled: boolean; id: string },
        Name
      >;
      replyOf: FunctionReference<
        "query",
        "internal",
        { token: string },
        { thread: string; userId: string } | null,
        Name
      >;
      replyTarget: FunctionReference<
        "query",
        "internal",
        { id: string; kind: "contact" | "inbound" },
        {
          inboxEmailId: string;
          kind: "contact" | "support";
          threadId: string;
        } | null,
        Name
      >;
      replyToken: FunctionReference<
        "mutation",
        "internal",
        { thread: string; userId: string },
        string,
        Name
      >;
      storeContact: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          locale?: string;
          message: string;
          name?: string;
          support?: string;
          to?: string;
          userId?: string;
        },
        {
          delivery: "support" | "copy" | "kept" | "held" | "failed";
          id: string;
          ref: string;
        },
        Name
      >;
    };
    jobs: {
      attachWorkflow: FunctionReference<
        "mutation",
        "internal",
        { jobId: string; workflowId: string },
        null,
        Name
      >;
      cancel: FunctionReference<
        "mutation",
        "internal",
        { by: string; jobId: string; refund: boolean },
        any,
        Name
      >;
      claimCharge: FunctionReference<
        "mutation",
        "internal",
        { jobId: string },
        "claimed" | "charged" | "ended",
        Name
      >;
      claimVisitor: FunctionReference<
        "mutation",
        "internal",
        { userId: string; visitor: string },
        number,
        Name
      >;
      countBudget: FunctionReference<
        "mutation",
        "internal",
        {
          cost: number;
          force?: boolean;
          owner: string;
          units?: number;
          windowStart: number;
        },
        { ok: boolean; used: number },
        Name
      >;
      discard: FunctionReference<
        "mutation",
        "internal",
        { jobId: string },
        boolean,
        Name
      >;
      finish: FunctionReference<
        "mutation",
        "internal",
        {
          error?: any;
          jobId: string;
          outcome: "done" | "failed" | "canceled";
          result?: any;
        },
        any,
        Name
      >;
      get: FunctionReference<"query", "internal", { jobId: string }, any, Name>;
      join: FunctionReference<
        "mutation",
        "internal",
        {
          args: any;
          budgetCounted: number;
          budgetWindow?: number;
          cost: number;
          hold?: {
            externalId: string;
            meter?: string;
            meterId?: string;
            reserved: boolean;
            value: number;
          };
          kind: string;
          meter?: string;
          owner: string;
          policy: {
            concurrency: number;
            perOwner: number;
            stallAfter: number;
            tiers: Array<{
              budget?: { period: number; units: number };
              dedicated?: number;
              feature?: string;
              headStart?: number;
              name: string;
              perOwner?: number;
            }>;
          };
          userId?: string;
          visitor?: string;
          wake?: string;
        },
        string,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          deadLetters?: boolean;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any,
        Name
      >;
      mark: FunctionReference<
        "mutation",
        "internal",
        { charged: true; jobId: string },
        { refund: boolean },
        Name
      >;
      modelLimit: FunctionReference<
        "query",
        "internal",
        {
          defaults?: { max: number; min: number; perMinute: number };
          model: string;
        },
        { max: number; min: number; perMinute: number },
        Name
      >;
      moveClaimed: FunctionReference<
        "mutation",
        "internal",
        { owner: string; userId: string },
        Array<string>,
        Name
      >;
      overview: FunctionReference<
        "query",
        "internal",
        {
          models: Array<{
            max: number;
            min: number;
            model: string;
            perMinute: number;
          }>;
          policy: {
            concurrency: number;
            perOwner: number;
            stallAfter: number;
            tiers: Array<{
              budget?: { period: number; units: number };
              dedicated?: number;
              feature?: string;
              headStart?: number;
              name: string;
              perOwner?: number;
            }>;
          };
        },
        any,
        Name
      >;
      ownerState: FunctionReference<
        "query",
        "internal",
        {
          owner: string;
          policy: {
            concurrency: number;
            perOwner: number;
            stallAfter: number;
            tiers: Array<{
              budget?: { period: number; units: number };
              dedicated?: number;
              feature?: string;
              headStart?: number;
              name: string;
              perOwner?: number;
            }>;
          };
          windowStart?: number;
        },
        {
          rank: number;
          tier?: string;
          tiers: Array<{ feature?: string; name: string; units?: number }>;
          used: number;
        },
        Name
      >;
      pick: FunctionReference<
        "mutation",
        "internal",
        {
          pausedAi: boolean;
          policy: {
            concurrency: number;
            perOwner: number;
            stallAfter: number;
            tiers: Array<{
              budget?: { period: number; units: number };
              dedicated?: number;
              feature?: string;
              headStart?: number;
              name: string;
              perOwner?: number;
            }>;
          };
          wake?: string;
        },
        {
          running: number;
          started: Array<{ args: any; jobId: string; kind: string }>;
          waiting: number;
        },
        Name
      >;
      recordError: FunctionReference<
        "mutation",
        "internal",
        { error: any; jobId: string; lastError?: string },
        null,
        Name
      >;
      recordModel: FunctionReference<
        "mutation",
        "internal",
        {
          defaults?: { max: number; min: number; perMinute: number };
          model: string;
          outcome: "ok" | "throttled" | "error";
        },
        null,
        Name
      >;
      refundTried: FunctionReference<
        "mutation",
        "internal",
        {
          at?: number;
          jobId: string;
          outcome: "refunded" | "retry" | "given_up";
        },
        boolean,
        Name
      >;
      requeue: FunctionReference<
        "mutation",
        "internal",
        {
          budgetCounted: number;
          budgetWindow?: number;
          carry?: boolean;
          hold?: {
            externalId: string;
            meter?: string;
            meterId?: string;
            reserved: boolean;
            value: number;
          };
          jobId: string;
          policy: {
            concurrency: number;
            perOwner: number;
            stallAfter: number;
            tiers: Array<{
              budget?: { period: number; units: number };
              dedicated?: number;
              feature?: string;
              headStart?: number;
              name: string;
              perOwner?: number;
            }>;
          };
        },
        any,
        Name
      >;
      setQueue: FunctionReference<
        "mutation",
        "internal",
        {
          concurrency?: number | null;
          model?: {
            max: number;
            min: number;
            model: string;
            perMinute: number;
          };
          paused?: boolean;
          tier?: {
            budgetUnits?: number | null;
            dedicated?: number | null;
            name: string;
            perOwner?: number | null;
          };
        },
        null,
        Name
      >;
      stalled: FunctionReference<
        "query",
        "internal",
        { now: number },
        Array<{ jobId: string; workflowId?: string }>,
        Name
      >;
      standing: FunctionReference<
        "query",
        "internal",
        {
          jobId: string;
          now: number;
          pausedAi: boolean;
          policy: {
            concurrency: number;
            perOwner: number;
            stallAfter: number;
            tiers: Array<{
              budget?: { period: number; units: number };
              dedicated?: number;
              feature?: string;
              headStart?: number;
              name: string;
              perOwner?: number;
            }>;
          };
        },
        null | {
          estimatedWait?: number;
          position: number | null;
          waitingOn: string;
        },
        Name
      >;
      touch: FunctionReference<
        "mutation",
        "internal",
        {
          attempt?: boolean;
          jobId: string;
          lastError?: string;
          progress?: { done: number; label?: string; total: number };
          spendLimitUsd?: number;
          until: number;
          usage?: {
            cached: number;
            input: number;
            models: Array<string>;
            output: number;
            usd?: number;
          };
        },
        null,
        Name
      >;
      visitorJobs: FunctionReference<
        "query",
        "internal",
        { visitor: string },
        number,
        Name
      >;
    };
    lifecycle: {
      configure: FunctionReference<
        "mutation",
        "internal",
        {
          caps: {
            perWeek: number | null;
            quietHours: { end: number; start: number } | null;
            sunsetAfterMs: number;
          };
          flows: Array<{
            delays: Array<number>;
            eventName: string;
            explicit: boolean;
            flow: string;
            kind: "transactional" | "lifecycle" | "marketing";
            once: boolean;
            start: string;
            stopOn: Array<string>;
            topic?: { key: string; subscribedByDefault: boolean };
          }>;
        },
        null,
        Name
      >;
      settings: FunctionReference<
        "query",
        "internal",
        {},
        null | {
          caps: {
            perWeek: number | null;
            quietHours: { end: number; start: number } | null;
            sunsetAfterMs: number;
          };
          flows: Array<{
            delays: Array<number>;
            eventName: string;
            explicit: boolean;
            flow: string;
            kind: "transactional" | "lifecycle" | "marketing";
            once: boolean;
            start: string;
            stopOn: Array<string>;
            topic?: { key: string; subscribedByDefault: boolean };
          }>;
          syncedAt: number;
        },
        Name
      >;
      signal: FunctionReference<
        "mutation",
        "internal",
        {
          data?: Record<string, any>;
          email?: string;
          entityId?: string;
          type: string;
          userId?: string;
        },
        { welcome: boolean },
        Name
      >;
      track: FunctionReference<
        "mutation",
        "internal",
        {
          email: string;
          event: string;
          payload?: Record<string, any>;
          userId?: string;
        },
        null,
        Name
      >;
    };
    maintenance: {
      status: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          error?: string;
          finishedAt?: number;
          pruned?: number;
          startedAt: number;
          task: string;
          totalPruned: number;
        }>,
        Name
      >;
    };
    notifications: {
      channelOpen: FunctionReference<
        "mutation",
        "internal",
        { channel: "app" | "email" | "push"; type: string; userId: string },
        boolean,
        Name
      >;
      choose: FunctionReference<
        "mutation",
        "internal",
        {
          channel: "app" | "email" | "push";
          enabled: boolean;
          type: string;
          userId: string;
        },
        null,
        Name
      >;
      forget: FunctionReference<
        "mutation",
        "internal",
        { targetId: string; type: string },
        { deleted: number; done: boolean },
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          userId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            actor: {
              kind: "you" | "user" | "administrator" | "app" | "erased";
              name: string | null;
            };
            at: number;
            channels: Array<string>;
            data: Record<string, string | number | boolean | Array<string>>;
            id: string;
            link: string | null;
            readAt: number | null;
            targetId: string | null;
            type: string;
            workspace: { id: string; name: string | null } | null;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      listChoices: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          channel: "app" | "email" | "push";
          enabled: boolean;
          type: string;
        }>,
        Name
      >;
      markAllRead: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        { done: boolean; marked: number },
        Name
      >;
      markRead: FunctionReference<
        "mutation",
        "internal",
        { ids: Array<string>; userId: string },
        number,
        Name
      >;
      recipient: FunctionReference<
        "query",
        "internal",
        {
          actorId?: string;
          channel: "app" | "email" | "push";
          entityId?: string;
          impersonated?: boolean;
          type: string;
          userId: string;
        },
        null | {
          actor: {
            kind: "you" | "user" | "administrator" | "app" | "erased";
            name: string | null;
          };
          email: string | null;
          locale: string | null;
          wanted: boolean;
          workspace: string | null;
        },
        Name
      >;
      unread: FunctionReference<
        "query",
        "internal",
        { userId: string },
        { count: number; more: boolean },
        Name
      >;
    };
    onboarding: {
      complete: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        number | null,
        Name
      >;
      dismissActivation: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        number | null,
        Name
      >;
      marks: FunctionReference<
        "query",
        "internal",
        { userId: string },
        { activationDismissedAt: number | null; onboardedAt: number | null },
        Name
      >;
    };
    preferences: {
      choose: FunctionReference<
        "mutation",
        "internal",
        {
          email: string;
          reference?: string;
          source: string;
          subscribe: boolean;
          topic: {
            consent?: { text: string; version: string };
            doubleOptIn: boolean;
            key: string;
            subscribedByDefault: boolean;
          };
          userId?: string;
        },
        {
          changed: boolean;
          contactId: string;
          state: "subscribed" | "unsubscribed" | "pending";
        },
        Name
      >;
      confirm: FunctionReference<
        "mutation",
        "internal",
        {
          contactId: string;
          topic: {
            consent?: { text: string; version: string };
            key: string;
            subscribedByDefault: boolean;
          };
        },
        "confirmed" | "nothing",
        Name
      >;
      engaged: FunctionReference<
        "mutation",
        "internal",
        { email?: string; userId?: string },
        null,
        Name
      >;
      gate: FunctionReference<
        "mutation",
        "internal",
        {
          caps: {
            perWeek: number | null;
            quietHours: { end: number; start: number } | null;
            sunsetAfterMs: number;
          };
          email: string;
          sunset?: boolean;
          topic?: { key: string; subscribedByDefault: boolean };
          userId?: string;
        },
        | { at: number | null; contactId: string; outcome: "send" }
        | { outcome: "skipped"; reason: "unsubscribed" | "capped" | "sunset" },
        Name
      >;
      providerContact: FunctionReference<
        "mutation",
        "internal",
        {
          at?: number;
          email: string;
          topics: Array<{
            consent?: { text: string; version: string };
            key: string;
            subscribedByDefault: boolean;
          }>;
          unsubscribed: boolean;
        },
        number,
        Name
      >;
      providerIds: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          key: string;
          kind: "topic" | "segment";
          providerId: string;
          version?: string;
        }>,
        Name
      >;
      providerTopics: FunctionReference<
        "mutation",
        "internal",
        {
          at?: number;
          email: string;
          topics: Array<{ id: string; subscription: string }>;
        },
        number,
        Name
      >;
      quietUntil: FunctionReference<
        "query",
        "internal",
        { quietHours: { end: number; start: number } | null; userId: string },
        number | null,
        Name
      >;
      read: FunctionReference<
        "query",
        "internal",
        {
          email?: string;
          topics: Array<{ key: string; subscribedByDefault: boolean }>;
          userId?: string;
        },
        {
          contactId: string | null;
          topics: Array<{
            key: string;
            state: "subscribed" | "unsubscribed" | "pending";
          }>;
        },
        Name
      >;
      readContact: FunctionReference<
        "query",
        "internal",
        {
          contactId: string;
          topics: Array<{ key: string; subscribedByDefault: boolean }>;
        },
        null | Array<{
          key: string;
          state: "subscribed" | "unsubscribed" | "pending";
        }>,
        Name
      >;
      saveProviderIds: FunctionReference<
        "mutation",
        "internal",
        {
          ids: Array<{
            key: string;
            kind: "topic" | "segment";
            providerId: string;
            version?: string;
          }>;
        },
        null,
        Name
      >;
      seen: FunctionReference<
        "mutation",
        "internal",
        { email: string; timeZone?: string; userId: string },
        null,
        Name
      >;
      unsubscribe: FunctionReference<
        "mutation",
        "internal",
        {
          contactId?: string;
          source: string;
          topic: string;
          topics: Array<{
            consent?: { text: string; version: string };
            key: string;
            subscribedByDefault: boolean;
          }>;
          userId?: string;
        },
        boolean,
        Name
      >;
    };
    push: {
      devices: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{ auth: string; endpoint: string; id: string; p256dh: string }>,
        Name
      >;
      drop: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null,
        Name
      >;
      has: FunctionReference<
        "query",
        "internal",
        { endpoint: string; userId: string },
        boolean,
        Name
      >;
      subscribe: FunctionReference<
        "mutation",
        "internal",
        { auth: string; endpoint: string; p256dh: string; userId: string },
        null,
        Name
      >;
      unsubscribe: FunctionReference<
        "mutation",
        "internal",
        { endpoint: string; userId: string },
        boolean,
        Name
      >;
    };
    referrals: {
      beginReward: FunctionReference<
        "mutation",
        "internal",
        { id: string; now: number },
        "grant" | "capped" | "skip",
        Name
      >;
      claim: FunctionReference<
        "mutation",
        "internal",
        {
          code: string;
          terms: {
            caps: { perMonth: null | number; perReferrer: null | number };
            holdMs: number;
            referred?: { discount: string } | { trialDays: number };
            referrer?: { pack: string } | { months: number; plan?: string };
          };
          userId: string;
        },
        | { claimed: true; id: string; referrerId: string }
        | {
            claimed: false;
            reason:
              | "invalid"
              | "own_code"
              | "already_claimed"
              | "too_late"
              | "self_referral";
          },
        Name
      >;
      closeUnrewarded: FunctionReference<
        "mutation",
        "internal",
        { id: string; now: number },
        boolean,
        Name
      >;
      codeFor: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        { code: string; sharePages: boolean },
        Name
      >;
      consoleRows: FunctionReference<
        "query",
        "internal",
        { referrerId?: string },
        {
          flagged: Array<{
            capped: boolean;
            claimedAt: number;
            flags: Array<string>;
            holdUntil: null | number;
            id: string;
            paidAt: null | number;
            referrerId: string;
            released: boolean;
            rewardedAt: null | number;
            state: "claimed" | "held" | "rewarded" | "voided";
            voidedFor: null | string;
          }>;
          history: Array<{
            capped: boolean;
            claimedAt: number;
            flags: Array<string>;
            holdUntil: null | number;
            id: string;
            paidAt: null | number;
            referrerId: string;
            released: boolean;
            rewardedAt: null | number;
            state: "claimed" | "held" | "rewarded" | "voided";
            voidedFor: null | string;
          }>;
          top: Array<{
            name: null | string;
            referrals: number;
            referrerId: string;
            rewarded: number;
          }>;
          totals: {
            capped: number;
            claimed: number;
            flagged: number;
            held: number;
            rewarded: number;
            voided: number;
          };
        },
        Name
      >;
      deferReward: FunctionReference<
        "mutation",
        "internal",
        { id: string; until: number },
        null,
        Name
      >;
      due: FunctionReference<
        "query",
        "internal",
        { limit?: number; now: number },
        { ids: Array<string>; more: boolean },
        Name
      >;
      finishReward: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        boolean,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { id: string },
        null | {
          entityId: string;
          grant?: { discountId?: string; done?: boolean; endsAt?: number };
          id: string;
          orderId: string;
          referredId: string;
          referrerId: string;
          state: string;
          terms: {
            caps: { perMonth: null | number; perReferrer: null | number };
            holdMs: number;
            referred?: { discount: string } | { trialDays: number };
            referrer?: { pack: string } | { months: number; plan?: string };
          };
        },
        Name
      >;
      mine: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          claimed: number;
          held: number;
          referrals: Array<{
            claimedAt: number;
            id: string;
            rewardedAt: null | number;
            state: "claimed" | "held" | "rewarded" | "voided";
          }>;
          rewarded: number;
        },
        Name
      >;
      noteGrant: FunctionReference<
        "mutation",
        "internal",
        {
          grant: { discountId?: string; done?: boolean; endsAt?: number };
          id: string;
        },
        null,
        Name
      >;
      offerFor: FunctionReference<
        "query",
        "internal",
        { userId: string },
        null | { discount?: string; id: string; trialDays?: number },
        Name
      >;
      orderPaid: FunctionReference<
        "mutation",
        "internal",
        { entityId: string; orderId: string; ownerId: string },
        null | { holdUntil: number; id: string },
        Name
      >;
      orderRefunded: FunctionReference<
        "mutation",
        "internal",
        { orderId: string },
        null | string,
        Name
      >;
      peekCode: FunctionReference<
        "query",
        "internal",
        { userId: string },
        null | { code: string; sharePages: boolean },
        Name
      >;
      preview: FunctionReference<
        "query",
        "internal",
        { code: string },
        null | { inviter: null | string },
        Name
      >;
      registerSweep: FunctionReference<
        "mutation",
        "internal",
        { wake: string },
        null,
        Name
      >;
      resolveFlag: FunctionReference<
        "mutation",
        "internal",
        { id: string; resolution: "release" | "void" },
        boolean,
        Name
      >;
      setSharing: FunctionReference<
        "mutation",
        "internal",
        { share: boolean; userId: string },
        null,
        Name
      >;
      voidReferral: FunctionReference<
        "mutation",
        "internal",
        { id: string; reason: "refunded" | "administrator" | "account_erased" },
        boolean,
        Name
      >;
    };
    reports: {
      appealOf: FunctionReference<
        "query",
        "internal",
        { tokenHash: string },
        {
          action: "hidden" | "dismissed";
          appeal: {
            createdAt: number;
            reason: string | null;
            status: "open" | "upheld" | "reversed";
          } | null;
          at: number;
          authorId: string | null;
          decisionId: string;
          ground: "illegal" | "terms";
          reason: string;
          subject: { id: string; table: string } | null;
          until: number;
        } | null,
        Name
      >;
      decide: FunctionReference<
        "mutation",
        "internal",
        {
          action: "hidden" | "dismissed";
          appealTokenHash?: string;
          authorId?: string;
          by: string;
          ground: "illegal" | "terms";
          notice?: string;
          notices?: Array<string>;
          reason: string;
          subject?: { id: string; table: string };
        },
        {
          decisionId: string;
          intimate: boolean;
          notice: boolean;
          notifiers: Array<{
            email: string;
            locale?: string;
            name?: string;
            url?: string;
          }>;
          reports: number;
        } | null,
        Name
      >;
      decideAppeal: FunctionReference<
        "mutation",
        "internal",
        {
          appeal: string;
          by: string;
          outcome: "upheld" | "reversed";
          reason: string;
        },
        {
          action: "hidden" | "dismissed";
          authorId: string | null;
          restore: boolean;
          subject: { id: string; table: string } | null;
        } | null,
        Name
      >;
      fileAppeal: FunctionReference<
        "mutation",
        "internal",
        { text: string; tokenHash: string },
        "appealed" | "unknown" | "expired" | "appealed_already",
        Name
      >;
      fileNotice: FunctionReference<
        "mutation",
        "internal",
        {
          details: string;
          notifier: { email?: string; locale?: string; name?: string };
          reason:
            | "abuse"
            | "sexual"
            | "violence"
            | "spam"
            | "intimate"
            | "child_abuse"
            | "illegal"
            | "other";
          signature?: string;
          subject?: { id: string; table: string };
          url: string;
        },
        string,
        Name
      >;
      fileReport: FunctionReference<
        "mutation",
        "internal",
        {
          details?: string;
          reason:
            | "abuse"
            | "sexual"
            | "violence"
            | "spam"
            | "intimate"
            | "child_abuse"
            | "illegal"
            | "other";
          reporterId: string;
          subject: { id: string; table: string };
        },
        null,
        Name
      >;
      flagCrime: FunctionReference<
        "mutation",
        "internal",
        {
          by: string;
          note?: string;
          notice?: string;
          subject?: { id: string; table: string };
        },
        boolean,
        Name
      >;
      reportsConsole: FunctionReference<
        "query",
        "internal",
        {},
        {
          appeals: Array<{
            createdAt: number;
            decision: {
              action: "hidden" | "dismissed";
              at: number;
              authorId: string | null;
              reason: string;
            };
            id: string;
            subject: { id: string; table: string } | null;
            text: string;
          }>;
          notices: Array<{
            createdAt: number;
            crime: { at: number; by: string; note?: string } | null;
            details: string | null;
            hint: { id: string; table: string } | null;
            id: string;
            kind: "report" | "notice";
            notifier: { email: string | null; name: string | null } | null;
            reason:
              | "abuse"
              | "sexual"
              | "violence"
              | "spam"
              | "intimate"
              | "child_abuse"
              | "illegal"
              | "other";
            signature: string | null;
            url: string | null;
          }>;
          subjects: Array<{
            crime: { at: number; by: string; note?: string } | null;
            id: string;
            intimateAt: number | null;
            notices: Array<{
              createdAt: number;
              crime: { at: number; by: string; note?: string } | null;
              details: string | null;
              id: string;
              kind: "report" | "notice";
              notifier: { email: string | null; name: string | null } | null;
              reason:
                | "abuse"
                | "sexual"
                | "violence"
                | "spam"
                | "intimate"
                | "child_abuse"
                | "illegal"
                | "other";
              signature: string | null;
              url: string | null;
            }>;
            open: number;
            reasons: Record<string, number>;
            table: string;
            updatedAt: number;
          }>;
        },
        Name
      >;
      unplacedNotices: FunctionReference<
        "query",
        "internal",
        {},
        Array<{ id: string; url: string | null }>,
        Name
      >;
    };
    storage: {
      bytes: FunctionReference<
        "action",
        "internal",
        { storageId: string },
        ArrayBuffer | null,
        Name
      >;
      claim: FunctionReference<
        "mutation",
        "internal",
        {
          check: { accept: Array<string>; strip: boolean };
          counters?: { bytes?: string; files?: string };
          holder: string;
          limits: { bytes?: number; files?: number };
          maxSize: number;
          owner: { userId: string; workspaceId?: string };
          storageId: string;
        },
        | { size: number }
        | { invalid: "missing" | "claimed" | "too_large" }
        | {
            refused: {
              amount: number;
              limit: number;
              quota: "files" | "bytes";
              used: number;
            };
          },
        Name
      >;
      discard: FunctionReference<
        "mutation",
        "internal",
        { storageId: string },
        boolean,
        Name
      >;
      enableShare: FunctionReference<
        "mutation",
        "internal",
        { rowId: string; table: string; tokenHash: string; userId: string },
        { sharedAt: number; sharedBy: string },
        Name
      >;
      generateUploadUrl: FunctionReference<
        "mutation",
        "internal",
        {},
        string,
        Name
      >;
      getShare: FunctionReference<
        "query",
        "internal",
        { rowId: string; table: string },
        { sharedAt: number; sharedBy: string } | null,
        Name
      >;
      isReady: FunctionReference<
        "query",
        "internal",
        { storageId: string },
        boolean,
        Name
      >;
      quotaUsage: FunctionReference<
        "query",
        "internal",
        { holder: string },
        Record<string, number>,
        Name
      >;
      release: FunctionReference<
        "mutation",
        "internal",
        { storageId: string },
        boolean,
        Name
      >;
      removeCopies: FunctionReference<
        "mutation",
        "internal",
        { decision?: string; storageIds: Array<string> },
        number,
        Name
      >;
      resolveShare: FunctionReference<
        "query",
        "internal",
        { table: string; tokenHash: string },
        { rowId: string; sharedBy: string } | null,
        Name
      >;
      revokeShare: FunctionReference<
        "mutation",
        "internal",
        { rowId: string; table: string },
        boolean,
        Name
      >;
      served: FunctionReference<
        "query",
        "internal",
        { storageId: string },
        { contentType: string; size: number; url: string } | null,
        Name
      >;
      store: FunctionReference<
        "mutation",
        "internal",
        {
          bytes: ArrayBuffer;
          contentType: string;
          counters?: { bytes?: string; files?: string };
          holder: string;
          limits: { bytes?: number; files?: number };
          owner: { userId: string; workspaceId?: string };
        },
        | { storageId: string }
        | {
            refused: {
              amount: number;
              limit: number;
              quota: "files" | "bytes";
              used: number;
            };
          }
        | { blocked: true },
        Name
      >;
      url: FunctionReference<
        "query",
        "internal",
        { storageId: string; userId?: string },
        string | null,
        Name
      >;
    };
    subscriptions: {
      confirmConsent: FunctionReference<
        "mutation",
        "internal",
        { at: number; checkoutId: string; subscriptionId: string },
        boolean,
        Name
      >;
      consents: FunctionReference<
        "query",
        "internal",
        { entityId: string },
        Array<{
          amount: number;
          consentedAt: number;
          currency: string;
          interval: string;
          intervalCount: number;
          productId: string;
          subscriptionId?: string;
          termsVersion?: string;
          userId?: string;
        }>,
        Name
      >;
      lastOffer: FunctionReference<
        "query",
        "internal",
        { entityId: string; since: number },
        number | null,
        Name
      >;
      lifecycleConsole: FunctionReference<
        "query",
        "internal",
        { entityId?: string },
        {
          consents: Array<{
            amount: number;
            consentedAt: number;
            currency: string;
            entityId: string;
            interval: string;
            intervalCount: number;
            productId: string;
            subscriptionId?: string;
            termsVersion?: string;
            userId?: string;
          }>;
          saveOffers: Array<{
            acceptedAt?: number;
            entityId: string;
            id: string;
            madeAt: number;
            offer: {
              discount?: string;
              kind: "pause" | "downgrade" | "discount";
              months?: number;
              plan?: string;
              productId?: string;
              resumesAt?: number;
            };
            reason: string;
            subscriptionId: string;
          }>;
          withdrawals: Array<{
            at: number;
            entityId: string;
            productId: string;
            subscriptionId: string;
            userId: string;
          }>;
        },
        Name
      >;
      markOnce: FunctionReference<
        "mutation",
        "internal",
        { every?: number; key: string },
        boolean,
        Name
      >;
      offerCounts: FunctionReference<
        "query",
        "internal",
        { since: number; until: number },
        { accepted: number; made: number; truncated: boolean },
        Name
      >;
      purchasedAt: FunctionReference<
        "query",
        "internal",
        { subscriptionId: string },
        number | null,
        Name
      >;
      recordConsent: FunctionReference<
        "mutation",
        "internal",
        {
          amount: number;
          checkoutId: string;
          currency: string;
          entityId: string;
          interval: string;
          intervalCount: number;
          productId: string;
          termsVersion?: string;
          userId?: string;
        },
        null,
        Name
      >;
      recordOffer: FunctionReference<
        "mutation",
        "internal",
        {
          entityId: string;
          offer: {
            discount?: string;
            kind: "pause" | "downgrade" | "discount";
            months?: number;
            plan?: string;
            productId?: string;
            resumesAt?: number;
          };
          reason: string;
          since: number;
          subscriptionId: string;
        },
        string | null,
        Name
      >;
      recordWithdrawal: FunctionReference<
        "mutation",
        "internal",
        {
          at: number;
          entityId: string;
          productId: string;
          subscriptionId: string;
          userId: string;
        },
        boolean,
        Name
      >;
      releaseOffer: FunctionReference<
        "mutation",
        "internal",
        { offerId: string },
        null,
        Name
      >;
      takeOffer: FunctionReference<
        "mutation",
        "internal",
        { entityId: string; offerId: string },
        {
          acceptedAt?: number;
          entityId: string;
          id: string;
          madeAt: number;
          offer: {
            discount?: string;
            kind: "pause" | "downgrade" | "discount";
            months?: number;
            plan?: string;
            productId?: string;
            resumesAt?: number;
          };
          reason: string;
          subscriptionId: string;
        } | null,
        Name
      >;
      unmark: FunctionReference<
        "mutation",
        "internal",
        { key: string },
        null,
        Name
      >;
      withdrawalOf: FunctionReference<
        "query",
        "internal",
        { subscriptionId: string },
        { at: number; userId: string } | null,
        Name
      >;
    };
    suppressions: {
      isSuppressed: FunctionReference<
        "query",
        "internal",
        { email: string },
        boolean,
        Name
      >;
      lift: FunctionReference<
        "mutation",
        "internal",
        { at: number; email: string },
        "bounce" | "complaint" | "manual" | "dropped" | null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            email: string;
            origin: "bounce" | "complaint" | "manual" | "dropped";
            suppressedAt: number;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        {
          at: number;
          email: string;
          origin: "bounce" | "complaint" | "manual" | "dropped";
        },
        boolean,
        Name
      >;
    };
    waitlist: {
      admit: FunctionReference<
        "mutation",
        "internal",
        {
          createdBy?: string;
          ids: Array<string>;
          label?: string;
          max?: number;
        },
        Array<{ email: string; id: string; locale: null | string }>,
        Name
      >;
      audience: FunctionReference<
        "query",
        "internal",
        {},
        null | { segmentId: string; topicId: string },
        Name
      >;
      consoleRows: FunctionReference<
        "query",
        "internal",
        {
          answer?: string;
          domain?: string;
          question?: string;
          source?: string;
          status?: "waiting" | "admitted" | "declined" | "joined";
        },
        {
          counts: {
            admitted: number;
            declined: number;
            joined: number;
            waiting: number;
          };
          entries: Array<{
            answers: Record<string, string>;
            boost: number;
            declinedFor: null | string;
            email: string;
            id: string;
            launchNews: boolean;
            locale: null | string;
            mirror: null | string;
            note: null | string;
            source: string;
            status: "waiting" | "admitted" | "declined" | "joined";
            verifiedAt: number;
          }>;
          mirror: { drift: number; pending: number };
        },
        Name
      >;
      decline: FunctionReference<
        "mutation",
        "internal",
        { abuse?: boolean; ids: Array<string> },
        number,
        Name
      >;
      leave: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null,
        Name
      >;
      lookup: FunctionReference<
        "query",
        "internal",
        { email: string },
        null | {
          id: string;
          status: "waiting" | "admitted" | "declined" | "joined";
        },
        Name
      >;
      note: FunctionReference<
        "mutation",
        "internal",
        { id: string; note: string },
        null,
        Name
      >;
      place: FunctionReference<
        "query",
        "internal",
        { id: string },
        null | {
          boost: number;
          launchNews: boolean;
          position: null | number;
          shareCode: string;
          status: "waiting" | "admitted" | "declined" | "joined";
          total: number;
          verifiedAt: number;
        },
        Name
      >;
      queue: FunctionReference<
        "query",
        "internal",
        { limit: number },
        Array<string>,
        Name
      >;
      stage: FunctionReference<
        "mutation",
        "internal",
        {
          answers?: Record<string, string>;
          email: string;
          key: string;
          launchNews?: { text: string };
          locale?: string;
          ref?: string;
          source: string;
        },
        null,
        Name
      >;
      verify: FunctionReference<
        "mutation",
        "internal",
        {
          boost: { cap: number; days: number };
          email: string;
          join?: string;
          locale?: string;
          source?: string;
        },
        {
          created: boolean;
          id: string;
          news: boolean;
          referred: boolean;
          source: string;
          status: "waiting" | "admitted" | "declined" | "joined";
        },
        Name
      >;
    };
    webhooks: {
      entry: FunctionReference<
        "query",
        "internal",
        { deliveryId: string; service: string },
        {
          outcome:
            | "ok"
            | "invalid_signature"
            | "unknown_type"
            | "handler_error"
            | "duplicate"
            | "oversized"
            | "missing_secret";
          receivedAt: number;
          replayedAt?: number;
          type?: string;
        } | null,
        Name
      >;
      find: FunctionReference<
        "query",
        "internal",
        { deliveryId: string; service: string },
        {
          outcome:
            | "ok"
            | "invalid_signature"
            | "unknown_type"
            | "handler_error"
            | "duplicate"
            | "oversized"
            | "missing_secret";
          receivedAt: number;
        } | null,
        Name
      >;
      listRecent: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          count?: number;
          deliveryId: string;
          note?: string;
          outcome:
            | "ok"
            | "invalid_signature"
            | "unknown_type"
            | "handler_error"
            | "duplicate"
            | "oversized"
            | "missing_secret";
          receivedAt: number;
          replayedAt?: number;
          service: string;
          type?: string;
        }>,
        Name
      >;
      markReplayed: FunctionReference<
        "mutation",
        "internal",
        { deliveryId: string; service: string },
        number | null,
        Name
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        {
          deliveryId: string;
          note?: string;
          outcome:
            | "ok"
            | "invalid_signature"
            | "unknown_type"
            | "handler_error"
            | "duplicate"
            | "oversized"
            | "missing_secret";
          service: string;
          type?: string;
        },
        null,
        Name
      >;
    };
  };
