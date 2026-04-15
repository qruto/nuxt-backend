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
 * A utility for referencing the backend Convex component's exposed API.
 *
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.adapter.findOne, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    adapter: {
      create: FunctionReference<"mutation", "internal", any, any, Name>;
      findOne: FunctionReference<"query", "internal", any, any, Name>;
      findMany: FunctionReference<"query", "internal", any, any, Name>;
      updateOne: FunctionReference<"mutation", "internal", any, any, Name>;
      updateMany: FunctionReference<"mutation", "internal", any, any, Name>;
      deleteOne: FunctionReference<"mutation", "internal", any, any, Name>;
      deleteMany: FunctionReference<"mutation", "internal", any, any, Name>;
    };
  };
