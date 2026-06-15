---
name: typescript-tips
description: Pragmatic everyday TypeScript best practices — derive types from values, prefer `satisfies` and `as const` over `as`, discriminated unions, type predicates, and runtime validation at boundaries. Use whenever writing or reviewing TypeScript, and ESPECIALLY whenever you see or are about to write an `as` type assertion, type a function return value, shape a config/constant object, or handle external data (JSON, API results). Consult this BEFORE reaching for `as` to decide whether the cast is avoidable.
metadata:
  source: https://github.com/AllThingsSmitty/typescript-tips-everyone-should-know
---

# TypeScript Tips

Everyday type hygiene. This is the *pragmatic* companion to
[[typescript-advanced-types]] (which covers the type-system machinery — generics, conditional/mapped
types). Here the focus is writing types that stay correct with the least ceremony, and in particular
**not lying to the compiler with `as`**.

A type assertion (`as`) tells the compiler "trust me." It silences errors instead of solving them, so
when the underlying value drifts the assertion keeps compiling while the runtime breaks. Most `as` in a
codebase is avoidable — the compiler already knows the type, or a better tool (`satisfies`, an explicit
generic, a type predicate, a declared return type) expresses the same intent *without* discarding
checks. The goal isn't zero `as`; it's that every remaining `as` is one the compiler genuinely can't
derive, with a comment saying why.

## The `as`-removal decision (use this first)

When you see or are tempted to write `as X`, walk this list top to bottom and stop at the first that fits:

1. **Is it already that type?** Then the cast is a no-op — delete it. If a function returns `T` and you
   cast the result to `T`, the cast adds nothing.
2. **Is it an object literal you're validating against a type?** Use `satisfies X`, not `as X`.
   `satisfies` checks compatibility *and* keeps the narrow inferred type; `as` widens and can hide a
   missing/wrong field. (Tip 3.)
3. **Does a function/variable already declare the target type?** Let the declared type validate the
   literal — drop the cast entirely. A real mismatch then surfaces instead of being silenced.
4. **Is it a constant whose literal types you want to keep?** Use `as const`, not `as SomeType`. (Tip 7.)
5. **Can you pass a generic explicitly instead?** `fn<TargetType>(arg)` beats `fn(arg) as TargetType`
   when the function is generic. An explicit type parameter guides inference without discarding checks.
6. **Are you narrowing `unknown`/a union at runtime?** Write a type predicate (`x is T`) so the narrow
   is earned by a real check, not asserted. (Tip 8.)
7. **Could the type be derived instead of asserted?** Derive it from the value (`typeof`,
   `(typeof arr)[number]`) or from an existing type (`Pick`/`Omit`/`ReturnType`/indexed access). (Tips 4, 9.)

If none apply, the cast may be genuinely necessary — see the next section.

## When `as` is genuinely necessary (and how to do it well)

Some casts are unavoidable because **you know something the compiler can't**. Keep them, but: keep them
*narrow*, prefer `as X` over `as unknown as X`, never reach for `as any`, and **leave a one-line
comment explaining the knowledge the compiler lacks**. The legitimate categories:

- **External data boundaries.** `JSON.parse(...)`, `response.json()`, and similar calls return
  `any`/`unknown`. The shape is a runtime contract the compiler can't see. Cast at the boundary — and
  remember Tip 15: the cast does *not* make the data safe, so validate untrusted input rather than just
  asserting it.
- **Generic library APIs returning a broad type.** When a function returns a wider type than needed and
  no generic overload exists, a narrow cast is the only option. Prefer the generic form where one
  exists (decision step 5).
- **Unresolved generic conditional types.** Some library functions return conditional types
  (`T extends Foo ? A : B`) that don't reduce for an unconstrained generic `T`. These are known
  compiler limitations — leave the cast and comment it.
- **Union narrowing where the runtime guarantees a variant.** When type invariance prevents direct
  assignment and you know a specific union member can't occur at runtime, an `as` is the only tool.
  Document *why* the excluded variant can't happen.

## The four most impactful tips

**Derive types from values (Tip 4)** — don't write the value and the type twice; they drift.
```ts
const roles = ['admin', 'user', 'guest'] as const
type Role = (typeof roles)[number] // 'admin' | 'user' | 'guest'
```

**Prefer `satisfies` over `as` (Tip 3)** — validate without widening or losing inference.
```ts
// `as` widens: routes.home is `string`, and a typo'd key would be silently allowed.
const routes = { home: '/', about: '/about' } as Record<string, string>
// `satisfies` checks the shape but keeps `home: '/'` literal — and catches missing/extra keys.
const routes = { home: '/', about: '/about' } satisfies Record<string, string>
```

**Use `as const` for constants (Tip 7)** — narrows to literals so unions stay precise. `as const` is a
*good* assertion; it adds information rather than discarding checks.

**Type Safety ≠ Runtime Safety (Tip 15)** — `(await res.json()) as User` compiles but proves nothing at
runtime. At trust boundaries, validate (a predicate or schema), don't assert.

## The full catalog

All 15 tips with before/after examples live in [references/tips.md](references/tips.md). Read it when
the four above aren't enough, or when you need a tip not covered here (discriminated unions, exhaustive
`never` checks, type predicates, building types from existing types, runtime validation, avoiding
`enum`, inferable generics, strict compiler options, template literal types).

## Reviewing a diff for `as`

When reviewing TypeScript changes:

- Flag every new `as` and ask "which decision-list step makes this avoidable?" Most will be steps 1–3.
- `as any` and `as unknown as X` get extra scrutiny — they discard the most information. Push for a
  predicate, a narrower cast, or a real type.
- An unavoidable cast without an explaining comment is incomplete — request the comment.
- Don't churn legitimate boundary casts (external data, unavoidable library APIs). Removing them just
  to hit "zero `as`" trades a documented, necessary assertion for a broken or noisier alternative.
