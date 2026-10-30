/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as account from "../account.js";
import type * as adapter from "../adapter.js";
import type * as ai from "../ai.js";
import type * as alerts from "../alerts.js";
import type * as announcements from "../announcements.js";
import type * as audit from "../audit.js";
import type * as billing from "../billing.js";
import type * as consents from "../consents.js";
import type * as costs from "../costs.js";
import type * as crons from "../crons.js";
import type * as devices from "../devices.js";
import type * as email from "../email.js";
import type * as erasures from "../erasures.js";
import type * as flags from "../flags.js";
import type * as funnel from "../funnel.js";
import type * as gifts from "../gifts.js";
import type * as inbound from "../inbound.js";
import type * as jobs from "../jobs.js";
import type * as keys from "../keys.js";
import type * as lifecycle from "../lifecycle.js";
import type * as lifecycleActivity from "../lifecycleActivity.js";
import type * as maintenance from "../maintenance.js";
import type * as migrations from "../migrations.js";
import type * as monitoring from "../monitoring.js";
import type * as notifications from "../notifications.js";
import type * as onboarding from "../onboarding.js";
import type * as parties from "../parties.js";
import type * as posture from "../posture.js";
import type * as preferences from "../preferences.js";
import type * as push from "../push.js";
import type * as referrals from "../referrals.js";
import type * as reports from "../reports.js";
import type * as storage from "../storage.js";
import type * as subscriptions from "../subscriptions.js";
import type * as suppressions from "../suppressions.js";
import type * as waitlist from "../waitlist.js";
import type * as wake from "../wake.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  access: typeof access;
  account: typeof account;
  adapter: typeof adapter;
  ai: typeof ai;
  alerts: typeof alerts;
  announcements: typeof announcements;
  audit: typeof audit;
  billing: typeof billing;
  consents: typeof consents;
  costs: typeof costs;
  crons: typeof crons;
  devices: typeof devices;
  email: typeof email;
  erasures: typeof erasures;
  flags: typeof flags;
  funnel: typeof funnel;
  gifts: typeof gifts;
  inbound: typeof inbound;
  jobs: typeof jobs;
  keys: typeof keys;
  lifecycle: typeof lifecycle;
  lifecycleActivity: typeof lifecycleActivity;
  maintenance: typeof maintenance;
  migrations: typeof migrations;
  monitoring: typeof monitoring;
  notifications: typeof notifications;
  onboarding: typeof onboarding;
  parties: typeof parties;
  posture: typeof posture;
  preferences: typeof preferences;
  push: typeof push;
  referrals: typeof referrals;
  reports: typeof reports;
  storage: typeof storage;
  subscriptions: typeof subscriptions;
  suppressions: typeof suppressions;
  waitlist: typeof waitlist;
  wake: typeof wake;
  webhooks: typeof webhooks;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  waitlistRank: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"waitlistRank">;
  waitlistMirror: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"waitlistMirror">;
  funnelCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"funnelCounts">;
};
