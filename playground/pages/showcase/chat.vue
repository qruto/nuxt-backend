<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { api } from '../../backend/_generated/api'

definePageMeta({ middleware: 'auth' })

const { session } = useAuth()
const myEmail = computed(() => session.value.data?.user.email ?? '')

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
    <header class="page-header">
      <div class="api-tag">useQuery · useMutation</div>
      <h1>Realtime chat</h1>
      <p class="subtitle">
        Every tab subscribes to <code>api.messages.list</code>.
        Open a second window and send a message — both update instantly.
      </p>
    </header>

    <div class="chat-panel">
      <!-- Thread -->
      <div
        ref="listEl"
        class="thread"
      >
        <template v-if="messages === undefined">
          <div class="thread-state">
            <span class="spinner" /> Loading…
          </div>
        </template>
        <template v-else-if="messages.length === 0">
          <div class="thread-state empty">
            <span class="empty-icon">◈</span>
            <p>No messages yet. Send the first one!</p>
          </div>
        </template>
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
              <p class="msg-text">{{ m.text }}</p>
            </div>
          </div>
        </template>
      </div>

      <!-- Input -->
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
          class="send-btn"
          :disabled="pending || !text.trim()"
        >
          {{ pending ? '…' : '↑' }}
        </button>
      </form>
    </div>

    <div class="toolbar">
      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>
      <button
        type="button"
        class="ghost-btn"
        @click="clear()"
      >
        Clear thread
      </button>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 680px; }

/* Header */
.page-header { margin-bottom: 1.25rem; }
.api-tag {
  font-size: 0.68rem; font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.06em; color: var(--muted-color); text-transform: uppercase; margin-bottom: 0.4rem;
}
h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.3rem; letter-spacing: -0.02em; }
.subtitle { color: var(--muted-color); font-size: 0.875rem; margin: 0; }
code {
  font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.85em;
  color: var(--accent); background: var(--accent-dim); padding: 0.1rem 0.35rem; border-radius: 3px;
}

/* Chat panel */
.chat-panel {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--card-bg);
  margin-bottom: 0.625rem;
}

.thread {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 380px;
  overflow-y: auto;
  padding: 1rem;
  scroll-behavior: smooth;
}

/* Scrollbar */
.thread::-webkit-scrollbar { width: 4px; }
.thread::-webkit-scrollbar-track { background: transparent; }
.thread::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px; }

.thread-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.5rem;
  color: var(--muted-color);
  font-size: 0.875rem;
}
.empty .empty-icon { font-size: 1.75rem; opacity: 0.3; }
.empty p { margin: 0; }

/* Message */
.msg {
  display: flex;
  gap: 0.625rem;
  align-items: flex-start;
}
.avatar {
  flex-shrink: 0;
  width: 30px; height: 30px;
  border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 0.7rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-color);
  margin-top: 1px;
}
.msg-body { flex: 1; min-width: 0; }
.msg-meta {
  display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.15rem;
}
.msg-meta strong { font-size: 0.8rem; font-weight: 600; }
.msg-meta time { font-size: 0.7rem; color: var(--muted-color); }
.msg-text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Input row */
.input-row {
  display: flex;
  gap: 0;
  border-top: 1px solid var(--border-color);
}
.input-row input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  color: var(--text-color);
  font-size: 0.875rem;
  outline: none;
}
.input-row input::placeholder { color: var(--muted-color); }
.input-row input:disabled { opacity: 0.5; }
.send-btn {
  width: 48px;
  background: var(--accent);
  color: white;
  border: none;
  border-left: 1px solid var(--border-color);
  cursor: pointer;
  font-size: 1.1rem;
  transition: background var(--transition);
  flex-shrink: 0;
}
.send-btn:hover:not(:disabled) { background: var(--accent-hover); }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Toolbar */
.toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 1rem;
}
.error { margin: 0; font-size: 0.8rem; color: var(--danger-color); }
.ghost-btn {
  background: none; border: none;
  color: var(--muted-color); cursor: pointer; font-size: 0.8rem;
  padding: 0;
}
.ghost-btn:hover { color: var(--danger-color); }

/* Spinner */
.spinner {
  display: inline-block;
  width: 12px; height: 12px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
</style>
