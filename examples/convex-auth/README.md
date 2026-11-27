# Convex Auth example

[`nuxt-backend`](https://nuxt-backend.dev) in Convex Auth mode (`backend.auth: 'convex-auth'`):
people sign in through [`@convex-dev/auth`](https://docs.convex.dev/auth/convex-auth) with a
username and a password, sessions live in httpOnly cookies, and pages render signed in on the
server.

The mode is sign-in only, and experimental. The package's pages, its page guard, workspaces,
billing, AI credits and the account features run on Better Auth's accounts, so they are off here.
To try those, start from [`templates/panels`](../../templates/panels) or
[`templates/starter`](../../templates/starter). [Sign in with Convex
Auth](https://nuxt-backend.dev/docs/build/auth/convex-auth) says what runs and what is off.

## Create it

```bash
npm create nuxt@latest my-app -- -t gh:qruto/nuxt-backend/examples/convex-auth
cd my-app
npm run dev
```

The first run sets up a Convex dev deployment (log in, or start without an account). Open `/login`,
create an account, and `/account` shows it. Signed out, `/account` sends you to `/login` and back.
Convex Auth signs its access tokens with the deployment's own key, so there is no key to set.

## What is where

| File | What it does |
|---|---|
| `nuxt.config.ts` | `backend.auth: 'convex-auth'` |
| `backend/convex.config.ts` | Convex Auth's components: the core as `auth`, the password and the username ones |
| `backend/auth.config.ts` | The deployment trusts the tokens Convex Auth signs |
| `backend/auth.ts` | The session functions and the username and password sign-in |
| `backend/users.ts`, `backend/schema.ts` | The app's own `users` table: made at sign-up, read on `/account` |
| `server/convex-auth.ts` | Cookie sessions, and the functions that may start one |
| `app/pages/login.vue` | Sign in and sign up, with `useSignInWithUsernamePassword` |
| `app/pages/account.vue` | A page guarded by the `convex-auth` middleware |

Other sign-in methods (an emailed link, OAuth, passkeys) are added the same way: their components
in `backend/convex.config.ts`, their functions in `backend/auth.ts` and in `signIn` of
`server/convex-auth.ts`.
