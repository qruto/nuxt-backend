/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as admin from "../admin.js";
import type * as ai from "../ai.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as counter from "../counter.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as email from "../email.js";
import type * as flags from "../flags.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as notifications from "../notifications.js";
import type * as personas from "../personas.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as routes from "../routes.js";
import type * as storage from "../storage.js";
import type * as strips from "../strips.js";
import type * as webhooks from "../webhooks.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  admin: typeof admin;
  ai: typeof ai;
  audit: typeof audit;
  auth: typeof auth;
  billing: typeof billing;
  counter: typeof counter;
  crons: typeof crons;
  demo: typeof demo;
  email: typeof email;
  flags: typeof flags;
  functions: typeof functions;
  http: typeof http;
  jobs: typeof jobs;
  notifications: typeof notifications;
  personas: typeof personas;
  rateLimiter: typeof rateLimiter;
  routes: typeof routes;
  storage: typeof storage;
  strips: typeof strips;
  webhooks: typeof webhooks;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  backend: import("nuxt-backend/_generated/component.js").ComponentApi<"backend">;
  persistentTextStreaming: import("@convex-dev/persistent-text-streaming/_generated/component.js").ComponentApi<"persistentTextStreaming">;
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  shardedCounter: import("@convex-dev/sharded-counter/_generated/component.js").ComponentApi<"shardedCounter">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  workpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
};
