<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// Two trigger-maintained aggregates over the messages table
// (backend/aggregates.ts): a count and a sum of text lengths. Neither reads
// the table — the aggregate component keeps a denormalized tree that the
// `withTriggers` mutation wrapper updates in the same transaction as every
// insert and delete, so both numbers are O(log n) and reactive.
const { data: messageCount, isLoading: countLoading } = useAggregate(api.aggregates.countMessages)
const { data: totalCharacters, isLoading: sumLoading } = useAggregate(api.aggregates.totalCharacters)
const averageLength = computed(() =>
  messageCount.value ? Math.round((totalCharacters.value ?? 0) / messageCount.value) : 0)

// The list is yours (messages.list filters by the signed-in user); the
// aggregates are table-wide, which is why the count can run ahead of the
// rows below when someone else is sending too.
const mine = useQuery(api.messages.list)
const recent = computed(() => (mine.value ?? []).slice(-6).reverse())

// A trace of the count — the reactive query pushes a point on every
// trigger-maintained change. Starts flat and fills after mount so the
// server-rendered SVG matches the client's first paint.
const countHistory = ref<number[]>(Array.from({ length: 40 }, () => 0))
function record(value: number) {
  countHistory.value = [...countHistory.value.slice(1), value]
}
// Only real reads go on the trace: no point while the count is still loading.
onMounted(() => {
  if (messageCount.value !== undefined) record(messageCount.value)
})
watch(messageCount, (value) => {
  if (value !== undefined) record(value)
})

// The writes go through the trigger-wrapped `mutation` from aggregates.ts —
// that wrapper is what keeps the numbers above honest.
const send = useMutation(api.messages.send)
const clear = useMutation(api.messages.clear)
const draft = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

async function sendMessage() {
  const text = draft.value.trim()
  if (!text) return
  pending.value = true
  error.value = null
  try {
    await send({ text })
    draft.value = ''
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Send failed'
  }
  finally { pending.value = false }
}

async function clearMine() {
  pending.value = true
  error.value = null
  try {
    await clear({})
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Clear failed'
  }
  finally { pending.value = false }
}

const readout = computed(() => ({
  'useAggregate(api.aggregates.countMessages).data': messageCount.value,
  'useAggregate(api.aggregates.totalCharacters).data': totalCharacters.value,
}))
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useAggregate"
      title="Aggregates"
      live
    >
      Denormalized counts and sums kept in sync by write triggers, read
      reactively — no table scan, no stale cache. Send a message and the count
      moves in the same transaction as the insert; clear yours and it moves
      back.
    </PageHeader>

    <div class="grid-auto">
      <MetricCard
        label="messages"
        :value="messageCount"
        :loading="countLoading"
        tone="ok"
        hint="useAggregate · messagesCount.count()"
      />
      <MetricCard
        label="characters stored"
        :value="totalCharacters"
        :loading="sumLoading"
        tone="ok"
        hint="useAggregate · messagesSize.sum()"
      />
      <MetricCard
        label="avg length"
        :value="averageLength"
        unit="chars"
        hint="derived client-side"
      />
    </div>

    <LabPanel
      label="live · countMessages"
      title="Count over time"
      tone="ok"
    >
      <template #actions>
        <StatusRing
          tone="ok"
          pulse
          size="sm"
        >
          subscribed
        </StatusRing>
      </template>
      <LiveTrace
        :values="countHistory"
        tone="ok"
        :height="64"
      />
      <p class="hint trace-note">
        Every point is a push from the reactive query — open this page in a
        second tab, send from there, and both traces step together.
      </p>
    </LabPanel>

    <div class="grid-2">
      <LabPanel
        label="messages.send · messages.clear"
        title="Move the aggregate"
      >
        <form
          class="row"
          @submit.prevent="sendMessage"
        >
          <input
            v-model="draft"
            class="input send-input"
            placeholder="Send a message — the count bumps live"
            :disabled="pending"
          >
          <LabButton
            variant="primary"
            type="submit"
            :loading="pending"
            :disabled="!draft.trim()"
          >
            Send
          </LabButton>
        </form>
        <div class="row clear-row">
          <LabButton
            variant="danger"
            size="sm"
            :disabled="pending || !mine?.length"
            @click="clearMine"
          >
            Clear my messages
          </LabButton>
          <span class="hint">deletes go through the same trigger — watch the count drop</span>
        </div>
        <p
          v-if="error"
          class="msg err mono"
        >
          {{ error }}
        </p>
        <ul
          v-if="recent.length"
          class="feed"
        >
          <li
            v-for="message in recent"
            :key="message._id"
            class="fade-up"
          >
            <span class="feed-author mono">{{ message.author.split(/[\s@]+/)[0] }}</span>
            <span class="feed-text">{{ message.text }}</span>
            <span class="feed-len mono">{{ message.text.length }}</span>
          </li>
        </ul>
        <p
          v-else-if="mine !== undefined"
          class="hint"
        >
          No messages of yours yet — the table-wide count above may still be
          non-zero.
        </p>
      </LabPanel>

      <LabPanel
        label="readout"
        title="What the composables return"
        variant="well"
      >
        <StateReadout
          :value="readout"
          tone="ok"
        />
        <p class="hint readout-note">
          Each <code>data</code> is <code>undefined</code> until its first read
          lands, then a number; <code>isLoading</code> and <code>error</code> sit
          beside it, and a failed read never throws out of the page.
        </p>
        <p class="hint">
          On the server: one <code>TableAggregate</code> per number (with
          <code>sortKey</code>, plus <code>sumValue</code> for the sum), a
          <code>triggers.register('messages', aggregate.trigger())</code> per
          aggregate, and every write on the table goes through the
          <code>withTriggers(mutation, triggers)</code> wrapper. Full-text
          search over the same table lives on
          <NuxtLink to="/playground/client/search">Search &amp; counts</NuxtLink>.
        </p>
      </LabPanel>
    </div>
  </div>
</template>

<style scoped>
.trace-note { margin-top: 0.6rem; }
.send-input { flex: 1; width: auto; }
.clear-row { margin-top: 0.7rem; }
.msg { margin: 0.7rem 0 0; font-size: 0.78rem; }
.msg.err { color: var(--err); }
.feed { list-style: none; margin: 0.9rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.feed li {
  display: flex; align-items: baseline; gap: 0.55rem; font-size: 0.8rem;
  padding: 0.45rem 0.65rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
}
.feed-author { font-size: 0.68rem; color: var(--ink-dim); flex-shrink: 0; }
.feed-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-len { font-size: 0.66rem; color: var(--ink-faint); flex-shrink: 0; }
.readout-note { margin: 0.8rem 0 0.5rem; }
</style>
