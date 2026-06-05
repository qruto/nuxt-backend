<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { api } from '../../backend/_generated/api'

definePageMeta({ middleware: 'auth' })

const messages = useQuery(api.messages.list, {})
const send = useMutation(api.messages.send)
const clear = useMutation(api.messages.clear)

const text = ref('')
const pending = ref(false)
const error = ref<string | null>(null)
const listEl = ref<HTMLElement | null>(null)

watch(messages, async () => {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
})

function initials(author: string): string {
  return author.split(/[\s@]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('')
}
function relTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function submit() {
  const value = text.value.trim()
  if (!value) return
  pending.value = true
  error.value = null
  try {
    await send({ text: value })
    text.value = ''
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to send'
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="page">
    <PageHeader
      tag="useQuery · useMutation"
      title="Realtime chat"
      live
    >
      Every tab subscribes to <code>api.messages.list</code>. Open a second
      window and send a message — both update instantly over the WebSocket.
    </PageHeader>

    <LabPanel
      label="stream"
      title="messages.list"
      tone="signal"
      flush
    >
      <template #actions>
        <button
          type="button"
          class="clear"
          @click="clear()"
        >
          clear thread
        </button>
      </template>

      <div
        ref="listEl"
        class="thread"
      >
        <div
          v-if="messages === undefined"
          class="thread-state"
        >
          <span class="spinner" /> loading…
        </div>
        <div
          v-else-if="messages.length === 0"
          class="thread-state"
        >
          <span class="empty-glyph">◈</span>
          <p>No messages yet. Send the first one.</p>
        </div>
        <template v-else>
          <div
            v-for="m in messages"
            :key="m._id"
            class="msg fade-up"
          >
            <span class="avatar">{{ initials(m.author) }}</span>
            <div class="msg-body">
              <div class="msg-meta">
                <strong>{{ m.author }}</strong>
                <time>{{ relTime(m._creationTime) }}</time>
              </div>
              <p class="msg-text">
                {{ m.text }}
              </p>
            </div>
          </div>
        </template>
      </div>

      <form
        class="input-row"
        @submit.prevent="submit"
      >
        <input
          v-model="text"
          maxlength="500"
          placeholder="Type a message and press Enter…"
          :disabled="pending"
          autocomplete="off"
        >
        <button
          type="submit"
          class="send"
          :disabled="pending || !text.trim()"
        >
          {{ pending ? '…' : '↑' }}
        </button>
      </form>
    </LabPanel>

    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.page { max-width: 680px; }

.clear {
  background: none;
  border: none;
  color: var(--ink-dim);
  cursor: pointer;
  font-family: var(--mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.clear:hover { color: var(--err); }

.thread {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  height: 380px;
  overflow-y: auto;
  padding: 1rem;
  scroll-behavior: smooth;
}
.thread-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.5rem;
  color: var(--ink-dim);
  font-size: 0.85rem;
}
.empty-glyph { font-size: 1.75rem; opacity: 0.3; }
.thread-state p { margin: 0; }

.msg { display: flex; gap: 0.6rem; align-items: flex-start; }
.avatar {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: var(--signal-dim);
  color: var(--signal);
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--signal) 22%, transparent);
  margin-top: 1px;
}
.msg-body { flex: 1; min-width: 0; }
.msg-meta { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.1rem; }
.msg-meta strong { font-size: 0.8rem; font-weight: 600; }
.msg-meta time { font-size: 0.68rem; color: var(--ink-dim); font-family: var(--mono); }
.msg-text { margin: 0; font-size: 0.875rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }

.input-row { display: flex; border-top: 1px solid var(--edge); }
.input-row input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  color: var(--ink);
  font-size: 0.875rem;
  outline: none;
}
.input-row input::placeholder { color: var(--ink-faint); }
.send {
  width: 48px;
  background: var(--signal);
  color: var(--on-signal);
  border: none;
  border-left: 1px solid var(--edge);
  cursor: pointer;
  font-size: 1.1rem;
  flex-shrink: 0;
  transition: background var(--transition);
}
.send:hover:not(:disabled) { background: var(--signal-soft); }
.send:disabled { opacity: 0.4; cursor: not-allowed; }

.error { margin: 0.75rem 0 0; font-size: 0.8rem; color: var(--err); }

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--edge);
  border-top-color: var(--signal);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--signal);
  background: var(--signal-dim);
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
}
</style>
