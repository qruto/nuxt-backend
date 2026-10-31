/**
 * The try kit's personas: the accounts `pnpm try` seeds on the local
 * deployment, so every feature of Panels (the app the site serves under
 * /playground) can be clicked through as the person it is for. Each signs
 * in like any visitor, by email code: its address is a test identity
 * (`delivered+<label>@resend.dev`), whose code the sign-in page reads back
 * through the dev inbox. An administrator's mail, and a passkey-only
 * account's, never shows there: the admin's code prints in the terminal.
 *
 * What a persona has beyond its account (a plan, a credit pack, a gift, its
 * strips, an experiment, an answer) is given by the seed steps in
 * `seeds.mjs`, each claiming the persona fields it reads. A paid state costs
 * a payment, which Polar's sandbox takes at its checkout only: the kit lists
 * the purchase to make. A feature that needs someone new adds the persona
 * here and the step that seeds its state there;
 * test/unit/try-personas.test.ts fails while a field has no step, or a
 * persona is missing from the Try everything guide.
 *
 * Fields:
 * - `key`, `label`, `name`, `email`, `summary`: who it is (every persona);
 * - `role`: the app-wide role (`admin`);
 * - `passkeyOnly`: the account signs in with a passkey only, as the public
 *   demo's administrators must: a code asked for it is never sent;
 * - `locale`: the language the account reads in (`user.locale`), which
 *   every email the package sends it is written in;
 * - `workspace`: the name of a team workspace it owns (otherwise a personal
 *   workspace, as a sign-up gets);
 * - `joins`: `{ persona, role }`, a member of that persona's workspace, and
 *   of none of its own;
 * - `plan`: a plan of Panels' catalog its workspace subscribes to, once paid
 *   for;
 * - `pack`: a credit pack of the catalog its workspace buys;
 * - `gift`: `{ pack, to, message }`, a gift of that pack bought for another
 *   persona, who has not claimed it;
 * - `strips`: its strips, in its workspace: `{ idea, status, captions,
 *   reportedBy }`. A `ready` one is drawn with the fixture panels
 *   (`fixtures/`) and announced through Panels' `app.strip_ready`
 *   notification; a `queued` one waits in line; `reportedBy` names the
 *   persona who reported it;
 * - `experiments`: the app's experiments (flags with variants,
 *   `backend/flags.ts`) its account is put in and exposed to;
 * - `source`: its answer to "How did you hear about us?" (`friend`,
 *   `search`, `ai-assistant`, `social`, `podcast` or `other`).
 */

/** @type {readonly import('./personas.d.mts').TryPersona[]} */
export const PERSONAS = [
  {
    key: 'admin',
    label: 'Admin',
    name: 'Ada Admin',
    email: 'delivered+tryplaygroundadmin@resend.dev',
    summary: 'The app-wide admin role: the admin console with its Reports, Queue, Flags, Analytics and Demo tabs. The dev inbox never shows an administrator\'s mail, so its sign-in code prints in the `pnpm try` terminal.',
    role: 'admin',
  },
  {
    key: 'passkeyAdmin',
    label: 'Passkey-only admin',
    name: 'Pia Passkey',
    email: 'delivered+trypasskeyonlyadmin@resend.dev',
    summary: 'An administrator who signs in with a passkey only, as the public demo requires of its admins. It has no passkey here, so nobody signs in as it: a code asked for it is never sent, and the admin console marks it passkey-only.',
    role: 'admin',
    passkeyOnly: true,
  },
  {
    key: 'owner',
    label: 'Owner on Studio',
    name: 'Olive Owner',
    email: 'delivered+tryworkspaceowner@resend.dev',
    summary: 'Owns the Acme workspace, which starts on the free plan with a drawn strip and its "ready" notification. Subscribe Acme to Studio with the test card for the paid plan: 400 credits a month and the queue\'s head start.',
    workspace: 'Acme',
    plan: 'studio',
    strips: [{ idea: 'Two pigeons open a café', status: 'ready', captions: ['The pigeons hang a sign: open.', 'The first customer orders crumbs.', 'Business is booming on the windowsill.'] }],
  },
  {
    key: 'member',
    label: 'Member',
    name: 'Milo Member',
    email: 'delivered+tryworkspacemember@resend.dev',
    summary: 'A member of Acme: shares its plan, credits and strips, and cannot manage its billing or its members. Its strip waits in line.',
    joins: { persona: 'owner', role: 'member' },
    strips: [{ idea: 'The office plant plots a takeover', status: 'queued' }],
  },
  {
    key: 'free',
    label: 'Free user',
    name: 'Fern Free',
    email: 'delivered+tryfreeplanpersona@resend.dev',
    summary: 'A personal workspace on the free plan, with its 30 credits a month: one strip. Its drawn strip has been reported. It is in the example-ideas experiment, and heard of Panels on a podcast.',
    strips: [{ idea: 'A snail enters a marathon', status: 'ready', captions: ['The snail laces up.', 'Everyone else has gone home.', 'A personal best, by a week.'], reportedBy: 'owner' }],
    experiments: ['ideaExamples'],
    source: 'podcast',
  },
  {
    key: 'purchaser',
    label: 'Gift purchaser',
    name: 'Gus Giver',
    email: 'delivered+trygiftpurchaser@resend.dev',
    summary: 'Buys a credit pack with the test card, then gives one to the gift recipient: order history, invoices and sent gifts.',
    pack: 'credits100',
    gift: { pack: 'credits100', to: 'recipient', message: 'Enjoy the credits!' },
  },
  {
    key: 'recipient',
    label: 'Gift recipient',
    name: 'Rita Recipient',
    email: 'delivered+trygiftrecipient@resend.dev',
    summary: 'Has a credit pack gift waiting once the purchaser has paid for it, unclaimed: the gift banner and claiming it. Reads German: the gift email arrives in German.',
    locale: 'de',
  },
  {
    key: 'leaving',
    label: 'Leaving user',
    name: 'Lee Leaving',
    email: 'delivered+tryleavingpersona@resend.dev',
    summary: 'A personal workspace and nothing else, there to be deleted: the data export, and the account deletion that erases it everywhere. Seeding again brings it back.',
  },
]
