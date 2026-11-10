---
title: Moderate user content
description: "What the DSA and the TAKE IT DOWN Act ask of an app that hosts what people upload: a notice form anyone can use, statements of reasons, an appeal, reports of crimes and the 48-hour removal. Not legal advice."
kind: how-to
capability: protection
navigation:
  title: Moderation
  icon: i-lucide-flag
---

When people upload photos or publish strips in your app, you host their content. In the EU, the Digital Services Act asks every host for a notice form anyone can use, a reasoned decision told to the person affected, and a report to the police when a notice points at a threat to life. In the US, the TAKE IT DOWN Act asks a platform to remove intimate images shared without consent within 48 hours of a valid request. The package serves the public notice form at `/report`, emails statements of reasons, offers an appeal and flags suspected crimes. Your administrators still read each notice and decide it, on time.

::warning
**Not legal advice.** This summarizes [Regulation (EU) 2022/2065](https://eur-lex.europa.eu/eli/reg/2022/2065/oj) (the DSA) and the [TAKE IT DOWN Act](https://www.congress.gov/bill/119th-congress/senate-bill/146) as they read on 2026-10-25. Which duties reach you depends on your service and your size.
::

## What the laws ask

### Every host in the EU

| Article | Asks |
|---|---|
| Art. 11, 12 | A single point of contact for authorities and for users, named publicly |
| Art. 13 | A legal representative in the EU, when your company is outside it |
| Art. 14 | Terms that say what content you restrict and how you decide, including any automated tools |
| Art. 16 | An electronic form anyone can use to tell you about illegal content. A notice gives the reasons, the exact location, the notifier's name and email (except for child abuse material), and a good-faith statement. You confirm receipt, decide in a timely, diligent and objective way, and tell the notifier the outcome and how to seek redress. |
| Art. 17 | A statement of reasons to the person whose content you remove, hide or demote, or whose account you suspend: the facts, whether automation was used, the legal or contractual ground, and how to challenge it |
| Art. 18 | When you learn of a suspected crime that threatens someone's life or safety, tell the police or judicial authority of the country concerned at once |

### Online platforms

When people share content publicly in your app, you are likely an online platform. Platforms also owe an internal complaint system for six months after a decision (Art. 20), and must act against repeated misuse (Art. 23). A micro or small enterprise is exempt from those platform duties (Art. 19), unless it is a very large platform. Articles 11 to 18 apply to every host, whatever its size.

### Intimate images in the US

Under the TAKE IT DOWN Act, a covered platform, a public site or app that mainly hosts user content, must:

- give people a clear way to request removal of an intimate image of them published without consent;
- remove it within 48 hours of a valid request, and make reasonable efforts to remove known identical copies;
- accept requests that identify the image, say in good faith that it was published without consent, and give contact details and a signature.

The FTC has [enforced it since 2026-05-19](https://www.ftc.gov/news-events/news/press-releases/2026/05/ftc-begins-enforcing-take-it-down-act). A failure to comply counts as an unfair or deceptive practice.

## Who answers for what

| The package | You |
|---|---|
| The public notice form at `/report`, open to people without an account | Link it from every page that shows user content, and from your footer |
| The fields Art. 16 and the TAKE IT DOWN Act ask for, with an intimate-image category | Read every notice, and decide it on time |
| Notices and reports in the admin console's Reports tab | Staff the queue; nothing pages you when a notice arrives |
| Statement-of-reasons emails to the author, with the decision and its ground | Write your terms, so each decision can cite a ground |
| An appeal from that email, for six months | Review each appeal with a person |
| Identical copies of a removed intimate image matched by hash, and refused if uploaded again | Look for altered copies yourself |
| A flag for suspected crimes on a report | Tell the authority |
| The activity trail of every decision | Name your points of contact, and your EU representative if you need one |

## Handle a notice

::steps{level="3"}

### Tell the console how to show and hide content

The Reports tab needs to know what each subject is, whose it is and how to hide it. Pass `reports` to `setupAdmin`, with the app's `email`, which sends the receipts, outcomes and statements of reasons ([Keep content safe](/docs/build/ai/content-safety#review-reports)):

```ts [backend/admin.ts]
import { setupAdmin } from 'nuxt-backend/admin'
import { components } from './_generated/api'
import { email } from './email'

const admin = setupAdmin(components, {
  email,
  reports: {
    describe: async (ctx, { table, id }) => {
      if (table !== 'strips') return null
      const strip = await ctx.db.get('strips', id)
      return strip && { title: strip.caption, url: `/strips/${id}`, authorId: strip.authorId, files: strip.photoId ? [strip.photoId] : [] }
    },
    hide: async (ctx, { id }) => ctx.db.patch('strips', id, { hidden: true }),
    restore: async (ctx, { id }) => ctx.db.patch('strips', id, { hidden: false }),
    locate: (ctx, url) => {
      const match = /^\/strips\/([^/]+)$/.exec(url.pathname)
      return match ? { table: 'strips', id: match[1]! } : null
    },
  },
})

export const {
  listUsers, getUser, listWorkspaces, getWorkspace,
  reportContent, sendNotice, getAppeal, appealDecision,
  getReports, decideReport, flagCrime, decideAppeal,
} = admin.api
```

- `authorId` is who gets the statement of reasons when an administrator hides the strip.
- `files` are the uploads the strip shows: removing an intimate image removes their identical copies.
- `restore` shows the strip again when an appeal reverses the decision, unless it was reported or hidden again since.
- `locate` files a notice sent with only a link under the strip it points at. Without it, such a notice waits on its own in the Reports tab.
- A notice is filed under a strip only once `describe` knows it: the strip a notice names comes from whoever sent it. A notice naming nothing `describe` knows waits on its own.

### Link the notice form

The form is the packaged `report` page, at `/report` by default (module option `pages.report`). Link it beside user content, naming the strip, and from your footer:

```vue [app/components/StripFooter.vue]
<script setup lang="ts">
const props = defineProps<{ stripId: string }>()
const report = useBackendPagePath('report')
</script>

<template>
  <NuxtLink :to="{ path: report, query: { table: 'strips', id: props.stripId } }">
    Report this strip
  </NuxtLink>
</template>
```

The form asks for the content's link (`?url=` fills it in), the reason, why, the notifier's name and email (both optional for child sexual abuse material), a typed signature for an intimate-image request, and a good-faith statement. It sends with the bot check ([Stop bots](/docs/build/auth/sign-in/bots)), under the `report` limit per mailbox (`me+1@` counts as `me@`) and `reportGlobal` across the app. A notice without an address counts against `reportGlobal` alone, so nobody can use up the anonymous channel for everyone. The form confirms receipt by email, and repeats the content's link only when it points into your app. Its hint under **Why** tells notifiers that what they write is kept with the decision: a notice's text stays even after its notifier is erased ([When a person is erased](#when-a-person-is-erased)), so they should leave out personal details you don't need.

Signed-in people can also report in one click with `reportContent`. The form is for everyone else, and for notices that need the legal details.

### Build the report form into your own pages

`useReportForm(subject)` is the notice form without its markup, for a report button beside each thing people share. By default it sends a notice: everything Art. 16 asks a notice to carry, through `sendNotice`, with the bot check, a receipt by email and the decision once your team made it. The content's address is filled in from the page the form is on.

| Field | Bound with | Required |
|---|---|---|
| The reason | `bind.reason(reason)` on each radio, `bind.reasons` on the fieldset | Always |
| Why the content is illegal or breaks your terms | `bind.details` | Always |
| The content's exact address | `bind.urlInput` | Always: `options.url`, the item's permalink, else the `?url=` the report page was opened with, else the page the form is on |
| The reporter's name and address | `bind.nameInput`, `bind.emailInput` | Except for child sexual abuse material (`contactRequired`) |
| A signature | `bind.signatureInput` | For an intimate image (`signatureRequired`) |
| The good-faith statement | `bind.goodFaithInput` | Always |

```vue [app/components/ReportForm.vue]
<script setup lang="ts">
const props = defineProps<{ stripId: string }>()
const report = useReportForm(() => ({ table: 'strips', id: props.stripId }), {
  url: () => `${useRequestURL().origin}/strips/${props.stripId}`, // the strip's own permalink
})
const { t } = report.labels
</script>

<template>
  <form v-bind="report.bind.root.value">
    <fieldset v-bind="report.bind.reasons.value">
      <legend>{{ t('reason') }}</legend>
      <label v-for="reason in report.reasons.value" :key="reason">
        <input v-bind="report.bind.reason(reason)"> {{ t(`reasons.${reason}`) }}
      </label>
    </fieldset>
    <label>{{ t('url') }} <input v-bind="report.bind.urlInput.value"></label>
    <label>{{ t('details') }} <textarea v-bind="report.bind.details.value" /></label>
    <label>{{ t('name') }} <input v-bind="report.bind.nameInput.value"></label>
    <label>{{ t('email') }} <input v-bind="report.bind.emailInput.value"></label>
    <label v-if="report.signatureRequired.value">{{ t('signature') }} <input v-bind="report.bind.signatureInput.value"></label>
    <label><input v-bind="report.bind.goodFaithInput.value"> {{ t('goodFaith') }}</label>
    <div v-bind="report.bind.honeypot.value"><input v-bind="report.bind.honeypotInput.value"></div>
    <p v-if="report.error.value" v-bind="report.bind.errorText.value">{{ report.labels.errorMessage(report.error.value) }}</p>
    <button v-bind="report.bind.submit.value">{{ report.isPending.value ? t('sending') : t('send') }}</button>
    <p v-bind="report.bind.status.value">{{ report.announcement.value }}</p>
  </form>
</template>
```

Every `bind.*` is a computed ref, spread with `.value`, except `bind.reason(reason)`, a function that returns the radio button's attributes. `send()` never rejects: a refusal lands in `error` and names its field (`errorField`), and the `report` limit reads as `rate_limited` with `retryAfter` in seconds. Put the honeypot input inside `bind.honeypot`, which hides its wrapper from people and assistive technology; its name is one no browser fills on its own. A form that filled it is told only that it was received, never that a decision follows, and the deployment files, mails and counts nothing, logging `reports.honeypot`.

Give `url` wherever one page shows several items, such as a feed with a form per item: the page's own address would name the feed, not the item.

`useReportForm(subject, { mode: 'quick' })` is a signed-in person's one-click report instead, through `reportContent`: a reason and optional details, straight into the Reports tab, with no receipt. It is not a notice, so keep the notice form within reach: signed out, `noticePath` is the report page with the thing and its address in the query (`?table=&id=&url=`), which the page fills its form from. Render it once `isLoading` is `false`, so a signed-in reader never sees the notice link while the session is read; a press before then waits for it. The panels template's `ReportStrip` does both.

### Name your points of contact and how you moderate

Every host in the EU names a single point of contact for authorities (Art. 11) and one for the people who use it (Art. 12), with the languages it answers in, and its terms say how it moderates content, automated tools included (Art. 14). Put them in app config, and the packaged terms page prints both:

```ts [app/app.config.ts]
export default defineAppConfig({
  backend: {
    legal: {
      contact: 'support@panels.example',
      contactPoints: { authorities: 'dsa@panels.example', languages: ['en', 'fr'] },
      moderation: [
        { name: 'Llama Guard (through the Convex AI Gateway)', checks: 'Photos, titles and drawn pages, as they are added.', decides: true },
      ],
    },
  },
})
```

- **Contact points.** `users` defaults to `legal.contact`. `<LegalContactPoints>` lists them in a page of yours, a Content page included.
- **Moderation.** The terms say that a person on your team decides every report, every notice and every appeal: the Reports tab only acts on an administrator's decision. Each tool you list says what it checks, and whether its verdict takes effect on its own (`decides: true`, reviewed by a person on appeal) or flags content for a person. `<LegalModeration>` prints the same in a page of yours.
- **A report from every shared page.** France's LCEN (art. 6) asks for a way to report content from the content itself: put the report form, or a link to the report page with the thing in its address, beside everything people share.

This page and these components are not legal advice: they put the facts the package knows where the law asks for them. Your terms, your content rules and what you owe in your own country are yours to have a lawyer check.

### Decide, and say why

An administrator opens the subject in **Reports**, then hides it or dismisses the notice, with a reason. Only a subject `describe` knows can be hidden: one that is gone is dismissed. On a decision:

- the notifier gets the outcome by email, with where they may take it (Art. 16(5));
- the author of hidden content gets the statement of reasons by email: what was hidden, why, whether a notice led to it, that a person decided, the ground, and a link to appeal for six months (Art. 17);
- the activity trail records who decided what, and when, never who reported.

The appeal link opens the `report` page with the decision's token in its fragment. The author writes why the decision should change, once, and the appeal waits in the Reports tab. An administrator keeps or reverses it with a reason, and the author hears the outcome by email. Reversing a decision that hid content runs your `restore`, and lets the bytes of an intimate image it removed be uploaded again. If the content was reported or hidden again since, reversing leaves it hidden: decide the new reports first, and show it again yourself if you dismiss them.

You should see the strip hidden and the email in your [dev inbox](/docs/develop/dev-inbox).

### Build the appeal into your own report page

A `/report` page of your own replaces the packaged one, and the appeal link still opens it. `useReportAppeal()` is the appeal half without its markup: it reads the token from the page's `#appeal=<token>` fragment once mounted (or takes one, `useReportAppeal(() => token)`), then the decision through `getAppeal`, and sends the appeal through `appealDecision`. `useReportForm()` stays the notice half of the same page.

| `state` | What the author sees |
|---|---|
| `none` | No token in the address: show the notice form |
| `checking` | The decision is being read |
| `unknown` | The link names no decision: ask them to copy all of it from the email |
| `form` | The decision (`decision.value`: `action`, `title`, `reason`, `at`) and the box for why it should change, until `decision.value.until` |
| `expired` | Six months have passed: the decision can no longer be appealed |
| `open`, `upheld`, `reversed` | The appeal was sent, and the outcome once a person decided |

```vue [app/pages/report.vue]
<script setup lang="ts">
const appeal = useReportAppeal()
const { t } = appeal.labels
</script>

<template>
  <section v-if="appeal.state.value !== 'none'" aria-labelledby="appeal-title">
    <h1 id="appeal-title">{{ t('appeal.title') }}</h1>
    <template v-if="appeal.decision.value">
      <p>{{ t(`appeal.${appeal.decision.value.action}`, { date: appeal.formatDate(appeal.decision.value.at), title: appeal.decision.value.title ?? t('appeal.untitled') }) }}</p>
      <form v-if="appeal.state.value === 'form'" @submit.prevent="appeal.send()">
        <label>{{ t('appeal.text') }} <textarea v-model="appeal.text.value" maxlength="4000" required /></label>
        <p v-if="appeal.error.value" role="alert">{{ appeal.labels.errorMessage(appeal.error.value) }}</p>
        <button :aria-disabled="appeal.isPending.value || undefined">{{ t(appeal.isPending.value ? 'appeal.sending' : 'appeal.send') }}</button>
      </form>
      <p v-else role="status">{{ t(`appeal.${appeal.state.value}`) }}</p>
    </template>
    <p v-else-if="appeal.state.value === 'checking' || appeal.state.value === 'unknown'" role="status">{{ t(`appeal.${appeal.state.value}`) }}</p>
  </section>
  <ReportForm v-else />
</template>
```

`send()` never rejects: it resolves `true` once the deployment took the appeal, and a refusal lands in `error`. An author appeals a decision once: once sent, `state` follows the appeal, live.

### Meet the 48-hour clock

An intimate-image request starts a 48-hour clock under the TAKE IT DOWN Act. The Reports tab lists those requests first, with the time each must be decided by. A request the app could not place on a thing has its own deadline and sorts among them by it. Such a notice hides nothing of yours and matches no identical copies, so its action reads **Mark handled**: use it once you removed the content yourself, and its sender hears that you acted on it, never that the content was removed. Pass `locate` so requests land on the thing they name. Check the queue at least daily, or alert your team on new reports. Once you hide the image, every upload with the same bytes as its `files` is removed too, and the same bytes are refused if someone uploads them again (`invalid_input` on `file`, reason `removed_copy`). A file still being checked goes when its check ends, with the copies of its stripped bytes. A file `setupStorage` does not keep is not matched, and the log says `reports.copies_unmatched`.

### Report a threat to life

When a report shows a suspected crime that threatens someone's life or safety, flag it in the console and tell the authority of the country concerned (Art. 18). The flag records when you did, and the activity trail records it as `report.crime_flagged`. The package doesn't contact anyone for you.

::

## When a person is erased

You answer for every notice and decision, so an [erasure](/docs/ship/compliance/privacy#the-erasure-cascade) keeps them and removes the person:

- **A notifier.** The notice loses their name, address, language and signature. Its reason, link and text stay, so you can still decide it. Nobody gets the outcome email. For someone without an account, erase the address they gave ([Requests about personal data](/docs/ship/compliance/privacy#requests-about-personal-data)).
- **A reporter.** Their one-click report loses its text, and their id becomes a pseudonym. It still counts on the subject.
- **An author.** The decision keeps its statement of reasons, its ground and the appeal's outcome. Their id becomes a pseudonym, and the appeal loses its text. You can still answer an open appeal, and nobody is emailed.
- **An administrator.** Their id becomes a pseudonym on what they decided, answered and flagged.

A removed intimate image's hash stays. It names no one, and it keeps the same image from being uploaded again.

## How long the records stay

The hourly maintenance pass deletes a closed report or notice 548 days (18 months) after it was closed, and a decision with its appeal 548 days after it was made: the six months a decision may be appealed (Art. 20(1)), then a year for the appeal's answer, a dispute settlement body (Art. 21) and your yearly transparency report (Art. 15). A decision whose appeal is still open waits for its answer. The subject's record goes with its last decision, unless someone reported it again, and a removed image's hash stays without it ([Limits and retention](/docs/reference/backend/limits#windows-and-lifetimes)).

## Limits

- **Exact copies only.** Hash matching finds identical files among your [checked uploads](/docs/build/data/files/checked-uploads). A cropped or re-encoded copy needs a perceptual match the package doesn't do, and a file your own code stored outside `setupStorage` isn't matched.
- **Child abuse material is a separate duty.** A US provider must report apparent child sexual abuse material to NCMEC ([18 U.S.C. § 2258A](https://www.law.cornell.edu/uscode/text/18/2258A)), and EU law has its own rules. The package doesn't detect or report it.
- **Transparency reports.** Platforms above the small-enterprise size publish yearly reports on moderation (Art. 15 and 24). The activity trail holds the data. The report is yours to write.
- **No out-of-court body.** People may take a decision to a certified dispute settlement body (Art. 21). Name it in your terms when you have one.

## Related

- [Keep content safe](/docs/build/ai/content-safety): check prompts and uploads before you keep them, and the Reports tab.
- [Admin console](/docs/build/auth/admin): who can decide, and the activity trail.
- [Disclose AI-generated content](/docs/ship/compliance/ai-transparency): label what a model made.
- [Privacy, GDPR and cookies](/docs/ship/compliance/privacy): what a report stores, and the terms page.
- [Compliance](/docs/ship/compliance): who answers for what.
