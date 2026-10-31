---
title: Measure growth
description: "First-party, cookie-free growth funnels in the admin console, from waitlist to paid, broken down by invite, campaign, referral, promotion and the how-did-you-hear answer, with cohort retention counted next to your data."
kind: how-to
capability: analytics
api: /docs/reference/api/admin
source: src/convex/components/backend/funnel.ts
navigation:
  title: Funnel
  icon: i-lucide-filter
---

See where customers come from and where people drop off. The admin console's **Analytics** tab has a **Growth** view that shows your app's funnel, counted inside your deployment from the events it already records. It is the `analytics` [capability](/docs/start/concepts/capabilities), with the [Revenue](/docs/build/growth/measure/revenue) and [Experiments](/docs/build/growth/measure/experiments) views beside it.

**What powers it natively:** the event path every feature records on, and Convex's aggregate component, which keeps counts current as rows arrive (checked on 2026-10-25). There is no hosted analytics product and no tracking script.

**What the package adds:** the funnel steps, attribution from links and from one optional question, cohorts, and the Growth view.

## The funnel

Waitlist → admitted → sign-up → activation → trial → paid. Each step is counted when its event lands on the [event path](/docs/build/auth/admin/audit-log):

| Step | The event that counts it |
|---|---|
| Waitlist | `waitlist.joined` |
| Admitted | `waitlist.admitted` and `access.admitted`, by how many each admitted |
| Sign-up | `account.created`, recorded as each account is made |
| Activation | `account.activated`, recorded once per account (below) |
| Trial | a `billing.subscription_created` that starts with a trial, or `billing.trial_pass_started` |
| Paid | the first `billing.order_paid` |

A workspace's billing step counts for its owner. A person's steps all count in the week they signed up, so a week's row reads as that week's sign-ups and how far they got. Each person step can be broken down by:

- **Invite**: the invite code, access link or label that admitted the person ([Hand out invite codes and access links](/docs/build/growth/launch/invites)).
- **Campaign**: the UTM parameters of the link they arrived through ([Share campaign links](/docs/build/growth/offers/campaign-links)).
- **Referral**: who referred them ([Run a referral program](/docs/build/growth/offers/referrals)).
- **Promotion**: the discount they bought with ([Run a promotion](/docs/build/growth/offers)).
- **Answer**: what they said when asked how they heard about you (below).
- **Cohort**: the week they signed up, with how many are still active in the weeks after.

## Name your activation event

Activation is the moment a person first got value from your app, which only you can name. In Panels it is the first published strip. Name it in `setupAudit`:

```ts [backend/audit.ts]
import { setupAudit } from 'nuxt-backend/audit'
import { components } from './_generated/api'

export const audit = setupAudit(components, {
  activation: 'app.strip_published',
})
```

Record the event where it happens, with your own `app.*` kind ([Record and review activity](/docs/build/auth/admin/audit-log)). Until you name one, a person's first `app.*` event counts. It counts when the person records it, or when the app does for them (a job, a webhook); never when someone else acts on the account, nor during an administrator's visit. The first time it counts, the account's trail gains `account.activated`, which starts the [`reviewAsk` email](/docs/build/growth/engage/lifecycle-emails) a week later. The [activation checklist](/docs/build/growth/engage/activation) leads people to this moment, and the funnel shows how many get there.

## Show it

The Growth view appears once `backend/admin.ts` re-exports `getFunnel`, and the question below once `backend/audit.ts` re-exports `getSource` and `recordSource`, as the scaffold does:

```ts [backend/admin.ts]
export const { listUsers, getUser, listWorkspaces, getWorkspace, getFunnel } = admin.api
```

```ts [backend/audit.ts]
export const {
  // …the other audit functions
  getSource,
  recordSource,
} = audit.api
```

`getFunnel({ weeks, until })` is a live query for administrators: `weeks` is 1 to 26, and `until` any moment of the last week (the view passes now; without it, the newest week anything was counted in). It answers each step's count, `breakdowns` by dimension, `cohorts` with each week's active people, and `otherAnswers`, what people typed under "Somewhere else". Pick the last 4, 12 or 26 weeks in the view.

## Ask how people found you

UTM parameters only see the links you tagged. Word of mouth, a podcast or an AI assistant's answer leave no parameter. `<HowDidYouHear>` asks once, right after sign-up, and stores the answer next to the first-touch campaign:

```vue [app/pages/welcome.vue]
<script setup lang="ts">
definePageMeta({ auth: true })
// The page the person was headed for, else where sign-in lands.
const back = useReturnPath()
</script>

<template>
  <OnboardingFlow :steps="['profile', 'source', 'workspace']" @done="navigateTo(back)">
    <template #source="{ next }">
      <HowDidYouHear
        :options="['friend', 'search', 'ai-assistant', 'social', 'podcast', 'other']"
        @done="next"
      />
    </template>
  </OnboardingFlow>
</template>
```

- **Optional.** One question, a "Skip" button, and a free-text field for "Other". Nobody is asked twice.
- **AI assistants count as a channel.** People hear about apps from ChatGPT, Claude or Perplexity, and no referrer shows it. The `ai-assistant` option makes that channel visible.
- **Both sources, side by side.** The Growth view breaks the funnel down by the stated answer and by the tracked campaign, so you see where they differ.

Each option's text is a label (`source.options.<name in camel case>`), so it reads in the person's language ([Change labels](/docs/build/ui/customize/labels)). An option of your own reads its name until you give it a label.

The tracked campaign is the first campaign link the person arrived through. The sign-in returns them to the address they left, query included, and the first page they open signed in with `utm_*` parameters sends the campaign once (`recordSource`). It is kept only within a day of the sign-up, like a [referral's claim](/docs/build/growth/offers/referrals#claim-a-referral), and nothing is stored on the device.

## Why it is counted here

The counts live next to your data, updated as each event is recorded:

- **First-party and cookie-free.** Nothing is stored on the visitor's device. Attribution travels in the link, with an explicit claim step ([Guardrails on growth features](/docs/start/concepts/principles#guardrails-on-growth-features)).
- **No personal data leaves the deployment.** There is no third party to list in your privacy policy for it.
- **Erasure keeps the counts.** Erasing an account removes who it was and keeps that it was counted, so the funnel never changes under you.

## What happens when…

| Situation | Result |
|---|---|
| A non-administrator opens the Growth view or calls `getFunnel` | Refused as `forbidden`, reason `admin_only` ([Errors](/docs/reference/backend/errors#forbidden)); an administrator's visit to an account, reason `impersonating` |
| `activation` names no event kind | `setupAudit` throws when the deployment loads |
| `activation` names a kind no code records | The activation step stays at zero, and `doctor` warns ([`analytics-activation`](/docs/reference/cli/diagnostics#analytics-activation)) |
| A campaign link is opened more than a day after the sign-up | Nothing changes: the first campaign stays |
| A person arrives with no UTM and skips the question | They count under "Direct or unknown" |
| An account is erased | Its events lose their subject and stay counted |

## Limits

- **Counting starts at sign-up.** Page views before sign-up are not counted, since there is no visitor id. For traffic, pair it with a cookieless web analytics product, such as Vercel's ([Vercel](/docs/services/vercel)).
- **First touch, not multi-touch.** A person is attributed to the first campaign they arrived through, within a day of signing up.
- **Weekly cohorts.** Retention is counted per sign-up week (from Monday, 00:00 UTC), for up to the last 26 weeks. A person is active in a week when an event of their own is recorded in it: one they did, or the app did for them. An administrator acting on their account, or visiting it, makes no week active.
- **Twenty values per breakdown.** Each dimension lists apart the 20 values that brought the most people (campaigns, answers, invites, codes, promotions); the rest count under "Everything else". A value earns its place by the people it brought, not by arriving first, so accounts made to name new campaigns never push a real one out.
- **Accounts older than the funnel.** An account made before your deployment counted anything joins it at its first event, counted in the week it was created.

## Test it

```ts [backend/funnel.test.ts]
import { asUser, defineBackendTestApp } from 'nuxt-backend/test'
import { expect, test } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const testApp = defineBackendTestApp(schema, import.meta.glob('./**/*.ts'))

test('a published strip counts as activation', async () => {
  const t = testApp()
  const ada = await asUser(t)
  await ada.mutation(api.strips.publish, { title: 'First strip' })
  const admin = await asUser(t, { role: 'admin' })
  const funnel = await admin.query(api.admin.getFunnel, { weeks: 1 })
  expect(funnel.activation).toBe(1)
})
```

## Related

- [Run an experiment](/docs/build/growth/measure/experiments): compare two versions on one funnel step.
- [Read revenue and usage](/docs/build/growth/measure/revenue): Polar's metrics in the same console.
- [Guide people to their first result](/docs/build/growth/engage/activation): the checklist that leads to activation.
- [Record and review activity](/docs/build/auth/admin/audit-log): the events the funnel counts.
- [Share campaign links](/docs/build/growth/offers/campaign-links): the UTM parameters attribution reads.
