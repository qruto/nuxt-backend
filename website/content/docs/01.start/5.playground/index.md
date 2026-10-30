---
title: Try the demo
description: Panels, the tutorial's comic-strip app, running live at /playground against this site's own deployment in sandbox mode, with nothing to install; what the demo refuses, and how to run it yourself.
kind: how-to
capability: tools
playground: /playground
navigation:
  title: Try the demo
  icon: i-lucide-flask-conical
---

The [demo](/playground) is Panels, the comic-strip maker the [tutorial](/docs/start/tutorial) builds, running against this site's own deployment. People sign in, buy credits, add a photo, and turn an idea into a three-panel strip a model draws. The deployment runs in sandbox mode (`BACKEND_ENVIRONMENT=sandbox`): every provider stays in its test mode, so nobody is charged or mailed for real. Beside Panels' own pages, the module's pages mount under `/playground` too: [pricing](/playground/pricing), [settings](/playground/settings), [profile](/playground/profile), [security](/playground/security) and [gifts](/playground/gifts).

::steps{level="3"}

### Sign in with a sandbox address

Open [/playground](/playground) and follow **Sign in to start a strip**. The sign-in page takes only a generated sandbox address: press **Create a sandbox identity** for one of the form `delivered+…@resend.dev`, with a long random label. The email provider accepts these in test mode, and no real inbox is involved. Once you ask for a code, it shows under the form, read back from the [dev inbox](/docs/develop/dev-inbox). This device remembers your last five addresses, and an address is the only way back into its account, so keep the one you use.

### Start a strip

On [your strips](/playground/strips), pick one of the ideas under **Start from an idea**. An idea marked **(free)** was drawn once for the demo: your strip copies its panels at 0 credits, with no model call. Drawing anything else costs 30 credits.

### Pay with the test card

Credits and plans come from the billing provider's sandbox: on the [pricing page](/playground/pricing), pay with `4242 4242 4242 4242`, any future expiry and any CVC. Nothing is charged. The Studio plan's `priority_queue` feature gives its strips a head start in the queue.

::

## What the demo refuses

The demo is open to anyone, and its model calls are real. So Panels holds itself to a public demo when its deployment is a sandbox (`backend/demo.ts` in the template), and the package adds the rules of every sandbox deployment:

- **Generated sandbox addresses only.** Sign-in, sign-up, workspace invitations and an email change accept only `delivered+<label>@resend.dev` with a label of 16 or more lowercase letters and digits. Any other address is refused with a message that says the demo is a sandbox.
- **An idea of your own needs a passkey sign-in.** Typing your own idea is refused as `forbidden`, reason `passkey_required`, unless this session signed in with a passkey. Add a passkey on the [security page](/playground/security), then sign in with it. The canned ideas need no passkey.
- **No share links.** A strip's page says sharing is off: on a public demo, a link would publish whatever anyone drew.
- **A daily AI spend limit.** Panels sets `spendLimit: { usdPerDay: 5 }` in `setupAi`. Once a UTC day's model calls cost that much, the `pause_ai` kill switch turns on, and a strip that needs the model is refused until the day ends ([Cap the daily spend](/docs/build/ai/models#cap-the-daily-spend)). A free canned strip still copies.
- **A nightly reset.** At 03:00 UTC every strip older than a day is deleted, with its photo, its panels, its share link and its notifications. Accounts stay, and so do the canned ideas' panels.
- **The administrator signs in with passkeys only.** On a sandbox, the `admin` tier, the admin console and Better Auth's `/admin/*` routes refuse an administrator whose account is not [passkey-only](/docs/build/auth/sign-in#passkey-only-accounts), or who did not sign in to this session with a passkey, as `forbidden`, reason `passkey_only_admin`. The administrator draws the canned ideas from the admin console's Demo tab.
- **The dev inbox hides some mail.** It shows nothing for an administrator's address or a passkey-only account's. Anyone who knows a sandbox address can read its sign-in codes, so the random label is what keeps an account yours. To close that door, turn on passkey-only sign-in on the security page: the account then refuses sign-in codes.

Panels' other rules hold everywhere, not only on the demo: a photo is JPEG, PNG or WebP up to 8 MB, its metadata is stripped, a moderation model refuses a flagged one, and each workspace keeps at most 200 files and 500 MB. Every drawing also waits for room in the `ai` rate limit and enough credits.

## Run it yourself

The demo is the Panels template: the same code, whose demo rules turn on only when its deployment is a sandbox.

```bash
npm create nuxt@latest my-panels -- -t gh:qruto/nuxt-backend/templates/panels
```

[Templates & examples](/docs/start/templates#panels) says what it needs to run, and the [tutorial](/docs/start/tutorial) builds it part by part. `npx nuxt-backend deploy --sandbox` runs your copy as a public demo of its own ([Deploy a demo or staging app](/docs/ship/deploy/staging)). To try every feature on your machine with a seeded account for each kind of user, run `pnpm try` in a clone of the repository: [Try everything](/docs/start/playground/try-everything) is its checklist.

## Related

- [Build a creative app](/docs/start/tutorial): the tutorial that builds Panels.
- [Deploy a demo or staging app](/docs/ship/deploy/staging): what every sandbox deployment refuses, and how to run one.
- [Try everything](/docs/start/playground/try-everything): the playground on your machine, with personas and a checklist.
- [Develop on real sandboxes](/docs/develop/sandboxes): the providers' test modes the demo runs on.
