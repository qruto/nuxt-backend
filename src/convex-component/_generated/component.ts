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
    adapter: {
      create: FunctionReference<
        "mutation",
        "internal",
        { input: any; onCreateHandle?: string; select?: any },
        any,
        Name
      >;
      deleteMany: FunctionReference<
        "mutation",
        "internal",
        { input: any; onDeleteHandle?: string; paginationOpts: any },
        any,
        Name
      >;
      deleteOne: FunctionReference<
        "mutation",
        "internal",
        { input: any; onDeleteHandle?: string },
        any,
        Name
      >;
      findMany: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          limit?: number;
          model: any;
          offset?: number;
          paginationOpts: any;
          select?: any;
          sortBy?: any;
          where?: any;
        },
        any,
        Name
      >;
      findOne: FunctionReference<
        "query",
        "internal",
        { join?: any; model: any; select?: any; where?: any },
        any,
        Name
      >;
      updateMany: FunctionReference<
        "mutation",
        "internal",
        { input: any; onUpdateHandle?: string; paginationOpts: any },
        any,
        Name
      >;
      updateOne: FunctionReference<
        "mutation",
        "internal",
        { input: any; onUpdateHandle?: string },
        any,
        Name
      >;
    };
  };
