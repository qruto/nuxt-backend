/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _clearAll from "../_clearAll.js";
import type * as aggregates from "../aggregates.js";
import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as counter from "../counter.js";
import type * as demo from "../demo.js";
import type * as email from "../email.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as files from "../files.js";
import type * as functions from "../functions.js";
import type * as guards from "../guards.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as logs from "../logs.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as todos from "../todos.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _clearAll: typeof _clearAll;
  aggregates: typeof aggregates;
  ai: typeof ai;
  auth: typeof auth;
  billing: typeof billing;
  counter: typeof counter;
  demo: typeof demo;
  email: typeof email;
  emailTemplates: typeof emailTemplates;
  files: typeof files;
  functions: typeof functions;
  guards: typeof guards;
  http: typeof http;
  lib: typeof lib;
  logs: typeof logs;
  messages: typeof messages;
  migrations: typeof migrations;
  rateLimiter: typeof rateLimiter;
  search: typeof search;
  seed: typeof seed;
  todos: typeof todos;
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
  backend: import("nuxt-backend/component/_generated/component.js").ComponentApi<"backend">;
  aggregate: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregate">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  persistentTextStreaming: import("@convex-dev/persistent-text-streaming/_generated/component.js").ComponentApi<"persistentTextStreaming">;
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
