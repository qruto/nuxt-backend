---
title: Keep content safe
description: "Check prompts and uploads with a safety model through the gateway before you spend on them, let people report what slipped through, and review reports in the admin console's Reports tab."
kind: how-to
status: experimental
capability: protection
navigation:
  title: Content safety
  icon: i-lucide-shield-alert
---

- **You get:** prompts and uploads checked before you spend on them, a report button for what slips through, a review queue, and guidance against prompt injection.
- **Powered by:** a safety classifier model through the gateway (neither gateway has a moderation endpoint), and the admin console.
- **The package adds:** `moderate` on every kind of AI call, `ai.requireSafe` for uploads, `reportContent` with its rate limit, and the Reports tab.

When people can type prompts and upload photos, some of it will break your terms. Content safety catches what it can in three places. A safety model checks prompts and uploads before your app spends anything on them. People report what slipped through, in a click. Your administrators review those reports in the admin console and act on them. The checks run through the same gateway as every model call, and the reports and decisions stay in your deployment. A classifier misses some content and flags some that is fine, so the reports are there for what it gets wrong.

## What powers it

- **A safety classifier model through the gateway.** Neither gateway has a moderation endpoint of its own, so the check is a model call to a classifier. The default is Meta's [Llama Guard 4](https://www.llama.com/docs/model-cards-and-prompt-formats/llama-guard-4/), `meta-llama/llama-guard-4-12b`, which reads text and images and names the hazard categories it finds.
- **The admin console** holds the report queue, beside the users and the activity trail ([Admin console](/docs/build/auth/admin)).
- **The package adds** the check on each kind of call, the report flow with its rate limit, and the Reports tab.

## Check prompts

`moderate` on a metered action, a stream, a chat or a job names what to check. A prompt the policy blocks ([Set a moderation policy](#set-a-moderation-policy)) is refused with `invalid_input` and reason `content_blocked`, and the person pays nothing for it:

```ts [backend/ai.ts]
export const { start: startCaption, body: captionBody } = ai.stream({
  name: 'caption',
  meter: 'credits',
  cost: { estimate: 5, creditsPerUsd: 1000, round: 'up', minimum: 1 },
  moderate: ({ prompt }) => ({ text: prompt }),
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }, { append }) => {
    const result = streamText({ model: ctx.model(), prompt })
    for await (const chunk of result.textStream) await append(chunk)
  },
})
```

| On | `moderate` | When the check runs |
|---|---|---|
| `ai.meteredAction`, `ai.stream` | `(args) => ({ text?, images? })` | After the rate limit, before the budget and the reservation |
| `ai.chat` | `true`, to check each message | In the reply's action, before the model: a flagged message gets no reply, its reservation is released, and it is hidden from the thread and from later replies' context |
| `jobs.define` | `(args) => ({ text?, images?, subject?, stage? })` | As the job's first step, before the charge: a blocked job fails, and its hold is released |

The check is a model call on your gateway bill: the person's credits pay for nothing until it passes. By default the classifier follows the gateway that answers. Through the Convex AI Gateway it is Llama Guard 4 (`meta-llama/llama-guard-4-12b`), which reads text and images. Through the Vercel AI Gateway, which serves no Llama Guard, it is `openai/gpt-oss-safeguard-20b`, which reads text only: a check with images is then refused `unavailable` with reason `not_configured`, never passed as safe. That covers a pinned `inferenceRegion` and a Vercel-first order with the key. A classifier you name on `setupAi` is always the one called. `doctor` reports a moderation model with no route, as it does any model, and `ai-moderation-images` warns when your image checks would be refused:

```ts [backend/ai.ts]
export const ai = setupAi(components, {
  billing,
  rateLimiter,
  moderation: { model: 'meta-llama/llama-guard-4-12b' },
})
```

## Set a moderation policy

Llama Guard names a hazard category for each thing it finds, `S1` to `S14`. Some refuse content outright; others trip on harmless material, such as a house number (privacy, `S7`) or a cartoon character on a T-shirt (intellectual property, `S8`) in a family photo. `moderation` on `setupAi` says what each category does:

```ts [backend/ai.ts]
export const ai = setupAi(components, {
  billing,
  rateLimiter,
  moderation: {
    // Refused: violent and sex crimes, child safety, weapons, hate, self-harm, sexual content.
    block: ['S1', 'S3', 'S4', 'S9', 'S10', 'S11', 'S12'],
    // Held back for an administrator: each is one of block's too.
    escalate: ['S4'],
    log: { days: 365 },
  },
})

// The admin console's Moderation tab reads this.
export const { getCosts, listModerationFlags } = ai.api
```

To check images with a provider made for it, match known abuse material, or give people a statement of reasons, see [Choose moderation providers](/docs/build/ai/content-safety/providers).

- **`block`** lists the categories that refuse content, as the shared categories (`sexual`, `hate`) or Llama Guard's codes `S1` to `S14` (`S4`), alike: `requireSafe`, every `moderate` option and a job's check throw on them. Content flagged only in other categories is let through and recorded. Default `'all'`: any flag refuses. A flag that names no category, or a code beyond `S14`, is refused under any policy, and `setupAi` refuses a list with any other word in it, such as `'s04'` or `'csam'`. Another provider's own codes, such as Azure's `Sexual:4`, are not policy words: name their shared category.
- **`escalate`** lists the categories an administrator looks at. Their content is refused like `block`'s, and `setupAi` refuses an entry here that `block` does not cover, by the same word, or by the category a code reads as (`S4` and `minors_sexual`), unless `block` is `'all'`: nothing waiting for an administrator is published meanwhile. Their flags read `escalate`, stand out in the Moderation tab, and log `ai.content_escalated` as an error, with the subject, the stage and the flag's id, which reaches your [error monitoring](/docs/ship/operate/monitoring). An escalation needs `log`.
- **`log`** keeps a record of every flagged check for `days`, 183 by default, the six months the DSA gives a person to complain about a decision (Art. 20): categories, who, what and where, the policy it was judged under, whether it was blocked, never the content. `log: false` keeps none. The maintenance pass prunes a record once its days are over. An account's erasure deletes the records about it, but for those on legal hold: an escalated flag, or child sexual exploitation (`minors_sexual`, `S4`, a known-abuse match) refused. Those stay until their days are over, the account and its deleted workspaces replaced by a pseudonym, as evidence you may be obliged to keep (GDPR Art. 17(3)(b) and (e)).

`ai.moderate` answers the policy's view beside the classifier's: `blocked` and `escalate`, and an escalated verdict is always `blocked`. A third argument names what was checked in your words, for its record: `{ subject, stage }`, and `userId` or `owner` when the content is not the signed-in person's:

```ts [backend/comics.ts]
const { blocked } = await ai.moderate(ctx, { text: title }, { subject: comicId, stage: 'title' })
if (blocked) throw backendError('invalid_input', { field: 'title', reason: 'content_blocked' })
```

A metered call's record says `stage: 'prompt'`, a chat's `'chat'` with the thread, and a job's `'job'` with its id, unless its `moderate` returns `subject` and `stage` beside `text` and `images`.

In a job's step (`jobs.step`) nobody is signed in: `ai.moderate` and `ai.requireSafe` called there name the job's starter as `userId` and the job's owner as `owner`, from `ctx.job`, unless the call names its own. A drawn page checked before it joins the comic is then recorded against the person who asked for it:

```ts [backend/comics.ts]
export const checkPage = jobs.step({
  args: { comicId: v.id('comics'), imageId: v.string(), page: v.number() },
  handler: async (ctx, { comicId, imageId, page }) => {
    // The flag names ctx.job.userId and ctx.job.owner.
    await ai.requireSafe(ctx, { images: [imageId] }, { subject: comicId, stage: `output:${page}` })
  },
})
```

## Check uploads

An upload is checked where your code accepts it, before you keep it. `ai.requireSafe` throws the same refusal as a flagged prompt, and `ai.moderate` returns the verdict for you to decide:

```ts [backend/photos.ts]
import { v } from 'convex/values'
import { ai } from './ai'
import { authed } from './functions'

export const attach = authed.action({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    await ai.requireSafe(ctx, { images: [storageId] })
    // …now keep it: see Checked uploads
  },
})
```

`storage.acceptUpload` runs `requireSafe` between your own check and the mutation that keeps the upload, and deletes an upload it refuses at once ([Check, moderate and keep an upload in one call](/docs/build/data/files/checked-uploads#check-moderate-and-keep-an-upload-in-one-call)).

`ai.moderate(ctx, { text?, images? })` returns `{ flagged, categories, codes, scores, providers }`: `categories` are the shared categories at or above their threshold, such as `sexual` or `hate`, and `codes` the classifier's own, such as Llama Guard's `S1` to `S14` ([Choose moderation providers](/docs/build/ai/content-safety/providers#read-the-categories)). Both run in an action. Images are file storage ids, up to 8: an upload not yet claimed is read from the component's storage with `storage.bytes(ctx, id)`, and a file of your own storage, such as an image a model made, is read too. A file that is no image is refused `invalid_input` with reason `unsupported_type`, and one that is gone with `upload_gone`. `requireSafe` refuses flagged text on `prompt`, and flagged images sent alone on `images`. Both are refused while `pause_ai` is on (`unavailable`, reason `ai_paused`), and on a `sandbox` deployment without a `spendLimit`, as any model call is.

A classifier that answers anything but a verdict refuses the content as unchecked: `unavailable` with reason `provider_refused`, and the log line `ai.moderation_unreadable`. So does a classifier call that fails, with the log line `ai.moderation_failed` naming the provider's error when the gateway passed one on, and one that gives no answer within 30 seconds: the check stops waiting, so a hung gateway never holds your action until it times out. Both may pass when tried again. Images checked alone go to the classifier with a few neutral words beside them, which Llama Guard on the Convex AI Gateway needs to read them.

In your own tests, `nuxt-backend/test` answers the classifier for you: `unsafe` and `S1` for text or an image whose bytes contain `[[unsafe]]`, the codes you choose for `[[unsafe:S7]]` (`TEST_UNSAFE_CODE('S7')`), `safe` for anything else, with no key and no network ([Test AI calls](/docs/develop/testing/functions#test-ai-calls)). Size and type checks are cheaper than a model call, so a file over [`maxSize`](/docs/build/data/files/checked-uploads) is better refused by the claim.

## Guard against prompt injection

A classifier checks whether content is harmful. Prompt injection is a different attack: text that tells the model to do something you did not ask for. It arrives in anything your app passes to a model, not only in what people type: a caption in an uploaded photo, a sentence in a [knowledge](/docs/build/ai/chat/knowledge-search) document, an [inbound email](/docs/build/email/inbound). OWASP ranks it first among LLM risks ([LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)), and no model or filter stops all of it. Design so a successful injection does little harm:

- **Keep secrets out of prompts.** Instructions, keys and other people's data in the context can be read back by a clever prompt. Assume anything in the context can reach the person.
- **Give the model nothing that writes.** A model that can call a tool which deletes, sends or pays can be talked into it. The package's chat calls no tools of yours; if you add your own, make them read-only, scoped to the caller, or behind the person's own confirmation.
- **Treat the answer as untrusted input.** Render it as text, never as HTML. Validate any structure you parse from it, such as JSON for a panel layout, with a validator before you store it.
- **Quote what you did not write.** Put uploaded and retrieved text in its own message, marked as material to work on, apart from your instructions. The package does this for knowledge passages. It lowers the success rate; it does not prevent injection.
- **Cap the blast radius.** Credits, rate limits and the `aiGlobal` window bound what a hijacked prompt can spend ([LLM10, unbounded consumption](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/)).

For images, an injection is text drawn in the picture. Check uploads with `ai.requireSafe`, and never let an image's text decide what your code does next.

## Let people report content

Pass `reports` to `setupAdmin` in the scaffold's `backend/admin.ts` ([Review reports](#review-reports)), and it exports `reportContent`, a mutation any signed-in person may call with what they are reporting and why:

```vue [app/components/ReportButton.vue]
<script setup lang="ts">
import { api } from '#backend/api'

const props = defineProps<{ stripId: string }>()
const report = useMutation(api.admin.reportContent)
const sent = ref(false)

async function send(reason: 'abuse' | 'sexual' | 'violence' | 'spam' | 'other') {
  await report({ subject: { table: 'strips', id: props.stripId }, reason })
  sent.value = true
}
</script>

<template>
  <p v-if="sent">
    Thanks. Our team will look at it.
  </p>
  <button v-else @click="send('abuse')">
    Report this strip
  </button>
</template>
```

- **One open report per person and subject.** Reporting the same strip twice updates the first report.
- **A rate limit**, `report`, caps each person at 10 reports an hour, so nobody floods the queue.
- **The reporter stays private.** The subject's author never learns who reported it, and the Reports tab shows how many people reported a subject and why, never who.
- **The reasons** are `abuse`, `sexual`, `violence`, `spam`, `intimate`, `child_abuse`, `illegal` and `other`. An optional `details` says more, up to 4,000 characters.
- **A subject `describe` answers `null` for is refused** as `invalid_input` on `subject`.

## Review reports

The admin console's **Reports** tab, at `/admin?tab=reports`, lists open reports grouped by subject: requests to remove an intimate image first, by their 48-hour deadline, then the most reported. Tell the console how to show a subject and how to hide it, on `setupAdmin`, with the app's `email` for the emails a decision sends:

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
      return strip && { title: strip.idea, url: `/strips/${id}`, authorId: strip.authorId, files: strip.photoId ? [strip.photoId] : [] }
    },
    hide: async (ctx, { id }) => ctx.db.patch('strips', id, { hidden: true }),
    restore: async (ctx, { id }) => ctx.db.patch('strips', id, { hidden: false }),
  },
})

export const {
  listUsers, getUser, listWorkspaces, getWorkspace,
  reportContent, sendNotice, getAppeal, appealDecision,
  getReports, decideReport, flagCrime, decideAppeal,
} = admin.api
```

| Option | What it does |
|---|---|
| `describe(ctx, { table, id })` | What a subject is: its `title`, `url`, `authorId` and `files` (storage ids), or `null`. The id comes from the person reporting, checked only as an id of `table`: answer `null` for a table people may not report. |
| `hide(ctx, { table, id })` | Hides the subject, in the decision's mutation. |
| `restore(ctx, { table, id })` | Optional. Shows it again when an appeal reverses the decision, unless it was reported or hidden again since. |
| `locate(ctx, url)` | Optional. The subject a notice's link points at, for a notice sent from the form without one: `{ table, id }` or `null`. |

The console shows the Reports tab once `backend/admin.ts` passes `reports`.

For each subject an administrator writes a reason, picks the ground (the app's terms, or the law), and can:

- **Hide it**, which runs your `hide` and closes its reports. Its author gets a statement of reasons with a link to appeal ([Moderate user content](/docs/ship/compliance/moderation)).
- **Dismiss the reports**, when the content is fine.
- **Flag a suspected crime** that threatens someone's life or safety, for you to report.
- **Find the author** in the Users tab, by the address the tab shows, to ban the account ([Admin console](/docs/build/auth/admin#what-an-administrator-may-do)).

Each decision asks for a recent sign-in, and the activity trail records it as `report.decided` with the subject and the start of the reason, never the reporter.

## Limits

- **A classifier is wrong both ways.** It misses some harmful content and flags some that is fine, so the report queue and an appeal stay necessary.
- **Llama Guard 4 is served by the Convex AI Gateway only.** Through the Vercel AI Gateway the default is `openai/gpt-oss-safeguard-20b`, which reads text only, so a check with images is refused there.
- **Checks cost you.** Each check is a model call on your gateway bill, never on the person's credits. Its cost is recorded like any run's, so the Costs tab and `spendLimit` count it.
- **Legal duties go further.** A public notice form, statements of reasons and removal deadlines are on [Moderate user content](/docs/ship/compliance/moderation). That page is not legal advice.

## Related

- [AI gateway](/docs/services/ai-gateway): the route the classifier runs on.
- [Admin console](/docs/build/auth/admin): who can open it, and its other tabs.
- [Checked uploads](/docs/build/data/files/checked-uploads): type and size checks, before the safety check.
- [Turn on bot protection](/docs/build/auth/sign-in/bots): stop scripted abuse before it reaches a model.
- [Moderate user content](/docs/ship/compliance/moderation): the notice form and the duties behind it.
