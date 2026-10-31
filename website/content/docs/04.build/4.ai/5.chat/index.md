---
title: Add chat
description: "Give each person chat threads with a model that knows your instructions, every reply streamed to the page, kept on the server and paid for in credits: ai.chat on the backend and useChat in a page, on Convex's Agent component."
kind: how-to
capability: ai
status: experimental
api: /docs/reference/api/ai
source: src/convex/integrations/ai/chat.ts
navigation:
  title: Chat
  icon: i-lucide-messages-square
---

- **You get:** threads each person keeps, with a model that follows your instructions, every reply streamed, kept on the server and paid for in credits.
- **Powered by:** Convex's [Agent component](https://docs.convex.dev/agents) for threads, context and streaming, and the AI SDK through the gateway.
- **The package adds:** the metering, the ownership and workspace checks, chats the app pays for, export and erasure, and `useChat` for Vue: the Agent component ships React hooks only.

Chat gives each person a running conversation with a model that follows your instructions: a writing helper, a guide to your product, a coach. Every reply is paid for in credits the way a [metered action](/docs/build/ai/metered-actions) is: reserved before it runs, settled at what the model cost, and released when it fails. Replies stream into the page and are kept in your deployment, so a reload, or a second device, shows the same thread. Each thread belongs to the person who started it, inside the workspace that pays. `ai.chat` sets it up on the backend, and `useChat` drives it from a page.

## What powers it

- **Convex's [Agent component](https://docs.convex.dev/agents)** keeps the threads and messages, builds each reply's context from the thread's recent messages, and saves the reply as it streams, so every open page follows it live.
- **The AI SDK** runs the model, through the [same route](/docs/build/ai/models#where-a-model-id-goes) as every other call: the Convex AI Gateway, or the Vercel AI Gateway with `AI_GATEWAY_API_KEY`.
- **The package adds** the metering, the ownership checks, the workspace scoping, export and erasure, and `useChat`, a Vue composable: the Agent component ships React hooks only.

Install the component and mount it beside the others:

```bash
npm install @convex-dev/agent
```

```ts [backend/convex.config.ts]
import agent from '@convex-dev/agent/convex.config'

// After the scaffold's other app.use() calls:
app.use(agent)
```

## Define a chat

`ai.chat` declares one chat in its own file, and returns the four functions a page calls and the reply they schedule. Export all five under the names they come with:

```ts [backend/chat.ts]
import { ai } from './ai'

export const { threads, messages, send, remove, reply } = ai.chat({
  name: 'helper',
  model: 'anthropic/claude-sonnet-4.5',
  instructions: 'You help people plan comic strips: a premise, the characters and a punchline over four to six panels. Answer in two paragraphs at most.',
  meter: 'credits',
  cost: { estimate: 20, creditsPerUsd: 1000, round: 'up', minimum: 1 },
})
```

::field-group
  :::field{name="name" type="string" required}
  The chat's name, unique per app. Each reply's usage event records it, so the billing provider shows what each chat costs.
  :::

  :::field{name="model" type="AiModel"}
  The model that replies, named as on `setupAi`: a `provider/model` id, or a model object of your own. Defaults to `setupAi`'s.
  :::

  :::field{name="instructions" type="string"}
  The system prompt every reply starts from.
  :::

  :::field{name="meter / cost / limit / allowOverage"}
  What a reply costs and which limit it counts against, as on a [metered action](/docs/build/ai/metered-actions#define-a-metered-action). `cost: { estimate, creditsPerUsd }` settles each reply at what the gateway reported, the usual choice.
  :::

  :::field{name="maxOutputTokens" type="number"}
  The longest reply, in tokens. Default `1000`. With the thread's last 20 messages as the most a reply reads, it bounds what one reply can cost you.
  :::

  :::field{name="knowledge" type="Knowledge"}
  An [`ai.knowledge`](/docs/build/ai/chat/knowledge-search) instance. Each reply first searches it for the person's message and puts the closest passages in the model's context: the workspace's documents for a chat the workspace pays for, the app's own for one the app pays for.
  :::

  :::field{name="billTo" type="'entity' | 'app'"}
  Who pays for a reply: the billing entity, the default, or the app itself. See [Chat the app pays for](#chat-the-app-pays-for).
  :::
::

The returned functions:

| Function | Kind | What it does |
|---|---|---|
| `threads` | Query | The caller's threads in the active workspace, newest first, each with its title and when it last changed |
| `messages` | Query | One thread's messages, newest first, paginated, with the reply being written |
| `send` | Mutation | Saves a message, in a new thread or an existing one, and starts the reply |
| `remove` | Mutation | Deletes one of the caller's threads, with its messages |
| `reply` | Internal action | Writes the reply. `send` schedules it by its name in the same file, so it is exported beside `send`; no client can call it |

## Show it in a page

`useChat` takes the chat's functions, here the whole `api.chat` module, and keeps the page in step with the server:

```vue [app/pages/helper.vue]
<script setup lang="ts">
import { api } from '#backend/api'

definePageMeta({ auth: true })

const route = useRoute()
const chat = useChat(api.chat, { threadId: () => route.query.thread as string | undefined })
const draft = ref('')

async function submit() {
  const text = draft.value
  draft.value = ''
  await chat.send(text).catch(() => { draft.value = text })
}
</script>

<template>
  <ol aria-live="polite">
    <li v-for="message in chat.messages.value" :key="message.id" :data-role="message.role">
      {{ message.text }}
    </li>
  </ol>
  <p v-if="chat.error.value" role="alert">
    {{ chat.error.value.message }}
  </p>
  <form @submit.prevent="submit">
    <textarea v-model="draft" />
    <button :aria-disabled="chat.status.value === 'streaming' || undefined">
      Send
    </button>
  </form>
</template>
```

`useChat(chat, options?)` returns:

::field-group
  :::field{name="threads" type="ComputedRef<ChatThread[]>"}
  The person's threads in the active workspace, live: `{ id, title, updatedAt }`. A thread's title is the start of its first message.
  :::

  :::field{name="threadId" type="Ref<string | undefined>"}
  The open thread. Set it to open another; `options.threadId` sets the first one, from a ref or a getter.
  :::

  :::field{name="messages" type="ComputedRef<ChatMessage[]>"}
  The open thread's messages, oldest first, live: `{ id, role, text, status }`. A reply being written grows word by word, with `status: 'streaming'`; a finished one reads `'done'`, and one that could not be written `'failed'`.
  :::

  :::field{name="send(text)" type="Promise<string>"}
  Sends a message to the open thread, or starts a thread when none is open, and resolves with the thread's id. A refusal, such as `insufficient_credits`, rejects with what the server threw, and the message is not saved.
  :::

  :::field{name="newThread() / remove(threadId)"}
  Clear the open thread, so the next `send` starts one. Delete a thread for good.
  :::

  :::field{name="loadMore() / canLoadMore"}
  Loads older messages of a long thread, 20 more each time. Only the newest 20 load first. `canLoadMore` says whether older ones are left.
  :::

  :::field{name="status" type="ComputedRef<'idle' | 'sending' | 'streaming' | 'error'>"}
  Where the last message stands. `error` holds why it failed, as a catalog error.
  :::
::

## How a reply is paid for

1. **The person sends a message.** `send` runs the checks of a metered action: signed in, a member of the paying workspace, not an administrator acting as them, `pause_ai` off, then the chat's limit and the credit budget ([What happens on each call](/docs/build/ai/metered-actions#what-happens-on-each-call)).
2. **The estimate is reserved** from the workspace's balance, in the same transaction that saves the message. Too few credits refuses it with `insufficient_credits`, and the thread stays as it was.
3. **The model replies** in a scheduled action, with the thread's last 20 messages as context. The reply streams into the thread as it is written.
4. **The reply settles** at what the model reported it cost, at your `creditsPerUsd`, and the rest of the estimate goes back to the balance. A reply that fails releases the whole reservation, and shows `status: 'failed'`: the person pays nothing for it, and can send again.

The usage event carries the reply's model cost and token counts, never the message or the reply. The messages stay in the thread, in your deployment.

## Who can read a thread

A thread belongs to the person who started it, inside the workspace that pays for it. Only that person reads, writes and deletes it, and only while they are a member. Membership is checked on every call, so someone removed from the workspace loses its threads with it. Switching workspace switches the list of threads. An administrator acting as the person can read their threads but cannot send in them.

## Chat the app pays for

Some chats are yours to pay for: a guide in onboarding before anyone has bought credits, or a help assistant for your product. `billTo: 'app'` charges no one's credits:

```ts [backend/guide.ts]
import { ai } from './ai'
import { knowledge } from './knowledge'

export const { threads, messages, send, remove, reply } = ai.chat({
  name: 'guide',
  billTo: 'app',
  model: 'openai/gpt-5-mini',
  instructions: 'You answer questions about this app, from its help articles only.',
  knowledge,
})
```

| | A chat the workspace pays for | A chat the app pays for |
|---|---|---|
| Who pays for a reply | The workspace's credits, or the person's under `billTo: 'user'` | You, on your gateway bill |
| What caps it | The `ai` limit, the credit budget and the balance | The `ai` limit per person, and the `aiGlobal` limit across the whole app |
| Who can use it | Signed-in members | Signed-in people, in any workspace |

The `aiGlobal` limit is one window shared by every reply of every app-paid chat, 300 replies an hour by default, set like any limit in [`setupRateLimiter`](/docs/ship/security/rate-limits). Over it, a reply is refused with `rate_limited`, and the page says the guide is busy. These limits are all that caps the chat, so it needs `rateLimiter` on `setupAi`: without one, `ai.chat` throws where the chat is defined. Before you open one to everyone:

- **Give each person a smaller share.** Name a limit of your own in `limit`, such as 10 replies an hour per person, so one account cannot spend the window for everyone else.
- **Keep replies short** with `maxOutputTokens`, and ground them in the [app's own documents](/docs/build/ai/chat/knowledge-search#the-apps-own-namespace).
- **Cap the spend at the team.** Your Convex team's spending limit stops the gateway's spend without stopping the app. A `disable` usage limit would pause the whole deployment ([Cap what the gateway spends](/docs/build/ai/models#cap-what-the-gateway-spends)).

## Data, export and erasure

A person's threads are part of what the package keeps for them: the account's data export includes them, and its erasure removes them. Deleting a workspace removes the threads kept in it. See [Export and erase account data](/docs/build/auth/accounts/data).

## Develop and test

- **Development** runs against real models, through the same route as production, and spends sandbox credits ([Develop and test](/docs/build/ai/models#develop-and-test)).
- **Tests** under Vitest get the mock model `nuxt-backend/test` sets up, and the Agent component registered under `agent` when it is installed, so a test of a thread makes no network call.
- **Check each message** with [content safety](/docs/build/ai/content-safety) when anyone can type into your chat, and keep [prompt injection](/docs/build/ai/content-safety#guard-against-prompt-injection) in mind: a message can tell the model to ignore your instructions.

## Related

- [AI gateway](/docs/services/ai-gateway): the model route and its spending cap.
- [Add knowledge search](/docs/build/ai/chat/knowledge-search): answers grounded in each workspace's documents.
- [Meter an AI action](/docs/build/ai/metered-actions): the checks and the reservation every reply goes through.
- [Stream a response](/docs/build/ai/streaming): one streamed answer with no thread, for a single generation.
