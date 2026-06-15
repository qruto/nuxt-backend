# TypeScript Tips — full catalog

Source: https://github.com/AllThingsSmitty/typescript-tips-everyone-should-know

The 15 tips, each with the rule and a before/after. The recurring theme: prefer constructs that *add*
type information (inference, `satisfies`, `as const`, predicates, derivation) over `as`, which *removes*
checks.

## Table of contents

1. [Prefer `unknown` Over `any`](#1-prefer-unknown-over-any)
2. [Let Type Inference Do the Work](#2-let-type-inference-do-the-work)
3. [Prefer `satisfies` Over `as`](#3-prefer-satisfies-over-as)
4. [Derive Types From Values](#4-derive-types-from-values)
5. [Model Impossible States With Discriminated Unions](#5-model-impossible-states-with-discriminated-unions)
6. [Use Exhaustive Checks With `never`](#6-use-exhaustive-checks-with-never)
7. [Use `as const` for Constants](#7-use-as-const-for-constants)
8. [Use Type Predicates](#8-use-type-predicates)
9. [Build Types From Existing Types](#9-build-types-from-existing-types)
10. [Validate External Data at Runtime](#10-validate-external-data-at-runtime)
11. [Avoid `enum` in Most Cases](#11-avoid-enum-in-most-cases)
12. [Prefer Inferable Generics](#12-prefer-inferable-generics)
13. [Enable Strict Compiler Options](#13-enable-strict-compiler-options)
14. [Learn Template Literal Types](#14-learn-template-literal-types)
15. [Type Safety ≠ Runtime Safety](#15-type-safety--runtime-safety)

---

## 1. Prefer `unknown` Over `any`

`any` disables type checking and spreads silently; `unknown` keeps the value opaque until you narrow it,
so the compiler still protects you.

```ts
function parse(input: any) { return input.foo.bar }      // no protection, propagates `any`
function parse(input: unknown) {                          // must narrow before use
  if (typeof input === 'object' && input && 'foo' in input) { /* … */ }
}
```

## 2. Let Type Inference Do the Work

Don't annotate what the compiler already knows. Redundant annotations are noise that can drift from the
real type.

```ts
const count: number = 5          // redundant
const count = 5                  // inferred as number (literal 5 in const position)
const doubled = items.map(i => i * 2) // return type inferred — no need to annotate
```

Annotate at boundaries you want to *pin* (public function params/returns, exported types); let internals
infer.

## 3. Prefer `satisfies` Over `as`

`satisfies` validates a value against a type **without widening it or discarding the inferred literal
types**, and it catches missing/extra/wrong fields. `as` does none of that — it asserts.

```ts
// Worse — widens values to `string`; a typo'd key compiles.
const routes = { home: '/', about: '/about' } as Record<string, string>
routes.home // string

// Better — verifies the shape, keeps literals, catches mistakes.
const routes = { home: '/', about: '/about' } satisfies Record<string, string>
routes.home // '/'
```

When a function already declares its return type, you often don't even need `satisfies` — just return the
literal and let the declared type check it.

## 4. Derive Types From Values

Keep runtime values and their types in sync by extracting the type from the value instead of maintaining
both by hand.

```ts
const roles = ['admin', 'user', 'guest'] as const
type Role = (typeof roles)[number] // 'admin' | 'user' | 'guest'

const config = { retries: 3, baseUrl: '/api' }
type Config = typeof config
```

## 5. Model Impossible States With Discriminated Unions

Give each variant a literal discriminant so illegal combinations can't be constructed and narrowing is
automatic.

```ts
type Result<T> =
  | { status: 'pending' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

function render<T>(r: Result<T>) {
  if (r.status === 'success') r.data   // narrowed; r.error is not accessible here
}
```

## 6. Use Exhaustive Checks With `never`

Force the compiler to error when a new union member is added but not handled.

```ts
function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.r ** 2
    case 'square': return s.side ** 2
    default: {
      const _exhaustive: never = s // errors if a new kind is added
      return _exhaustive
    }
  }
}
```

## 7. Use `as const` for Constants

`as const` narrows to literal types and makes the value deeply readonly. Unlike a plain `as`, it *adds*
information rather than removing checks — these are the good assertions.

```ts
const theme = { mode: 'dark' }            // mode: string
const theme = { mode: 'dark' } as const   // mode: 'dark', readonly
```

## 8. Use Type Predicates

Connect a runtime check to compile-time narrowing with an `x is T` return type, so the narrow is *earned*
by a real check rather than asserted with `as`.

```ts
function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && 'id' in value
}

if (isUser(data)) data.id // narrowed to User — no cast needed
```

## 9. Build Types From Existing Types

Transform existing types with utilities and indexed access instead of duplicating definitions.

```ts
type UserPreview = Pick<User, 'id' | 'name'>
type WithoutId = Omit<User, 'id'>
type Name = User['name']            // indexed access
type Ret = ReturnType<typeof getUser>
```

## 10. Validate External Data at Runtime

Data crossing a trust boundary (network, storage, user input) has no compile-time guarantee. Validate it
(predicate or schema) instead of asserting its shape.

```ts
// Asserting only — compiles, but a malformed payload slips straight through.
const user = (await res.json()) as User
// Validate — the type is earned.
const json = await res.json()
if (!isUser(json)) throw new Error('bad payload')
const user = json // User
```

## 11. Avoid `enum` in Most Cases

`enum` emits runtime code and has surprising semantics. A `const` object + derived union (Tip 4) is
usually clearer and erases at compile time.

```ts
const Direction = { Up: 'up', Down: 'down' } as const
type Direction = (typeof Direction)[number] // or (typeof Direction)[keyof typeof Direction]
```

## 12. Prefer Inferable Generics

Design generic functions so call-site inference fills the type parameters; don't force callers to spell
them out.

```ts
function first<T>(arr: T[]): T | undefined { return arr[0] }
first([1, 2, 3]) // T inferred as number — no explicit <number> needed
```

## 13. Enable Strict Compiler Options

`strict` (and friends like `noUncheckedIndexedAccess`) catch whole classes of bugs at compile time. Turn
them on; treat the errors as findings, not noise.

## 14. Learn Template Literal Types

Build precise string types for routes, events, and keys.

```ts
type ApiRoute = `/api/${string}`
type EventName = `on${Capitalize<'click' | 'focus'>}` // 'onClick' | 'onFocus'
```

## 15. Type Safety ≠ Runtime Safety

The biggest reason to distrust `as`: types are erased at runtime. An assertion changes what the compiler
believes, never what the value actually is. At boundaries, pair types with runtime validation (Tip 10).
