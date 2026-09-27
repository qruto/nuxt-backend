<script setup lang="ts">
import { computed } from 'vue'
import { isSandboxIdentity, normalizeTestEmail } from '../utils/testEmail'

// The sign-in code for a sandbox identity, read live from the package's
// sandbox inbox: nobody can open a delivered+…@resend.dev mailbox, so its
// mail shows up here. Text only — a message's HTML is never rendered.
const props = defineProps<{ email: string }>()
const emit = defineEmits<{ fill: [code: string] }>()

const address = computed(() => isSandboxIdentity(props.email) ? normalizeTestEmail(props.email) : undefined)
const inbox = useSandboxInbox(address)
</script>

<template>
  <section
    v-if="address"
    class="inbox"
    aria-live="polite"
  >
    <span class="lab-label">sandbox inbox</span>
    <p
      v-if="inbox.isLoading.value"
      class="hint"
    >
      Checking the inbox…
    </p>
    <template v-else-if="inbox.latest.value">
      <p class="subject">
        {{ inbox.latest.value.subject }}
      </p>
      <div
        v-if="inbox.code.value"
        class="code-row"
      >
        <code class="code">{{ inbox.code.value }}</code>
        <button
          type="button"
          class="fill"
          @click="emit('fill', inbox.code.value)"
        >
          Fill the code
        </button>
      </div>
      <p
        v-else
        class="hint"
      >
        The newest message has no code.
      </p>
    </template>
    <p
      v-else
      class="hint"
    >
      Waiting for the code…
    </p>
  </section>
</template>

<style scoped>
.inbox {
  margin-top: 1rem;
  padding: 0.75rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  border-radius: var(--r-sm);
  background: var(--bg);
  box-shadow: var(--inset-sm);
}

.subject {
  margin: 0;
  font-size: 0.8rem;
  color: var(--ink-dim);
}

.code-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.code {
  font-family: var(--mono);
  font-size: 1.35rem;
  letter-spacing: 0.18em;
  color: var(--ok);
}

.fill {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--ok);
  border-radius: 999px;
  background: transparent;
  color: var(--ok);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}
</style>
