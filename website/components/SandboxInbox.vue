<script setup lang="ts">
import { computed } from 'vue'
import { isSandboxIdentity, normalizeTestEmail } from '../utils/testEmail'

// The sign-in code for a test identity, read back through the package's
// dev inbox: nobody can open a delivered+…@resend.dev mailbox, so its
// mail shows up here. Text only — a message's HTML is never rendered.
const props = defineProps<{ email: string }>()
const emit = defineEmits<{ fill: [code: string] }>()

const address = computed(() => isSandboxIdentity(props.email) ? normalizeTestEmail(props.email) : undefined)
const inbox = useSandboxInbox({ address })
</script>

<template>
  <section
    v-if="address"
    class="slot mt-4 flex flex-col gap-2 px-3.5 py-3"
    aria-live="polite"
  >
    <span class="stamp">dev inbox</span>
    <p
      v-if="inbox.isLoading.value"
      class="m-0 text-[0.78rem] leading-[1.55] text-(--ink-dim)"
    >
      Checking the inbox…
    </p>
    <p
      v-else-if="inbox.error.value"
      class="m-0 text-[0.78rem] leading-[1.55] text-(--err)"
      role="alert"
    >
      {{ inbox.error.value.message }}
    </p>
    <template v-else-if="inbox.latest.value">
      <p class="m-0 text-[0.8rem] text-(--ink-dim)">
        {{ inbox.latest.value.subject }}
      </p>
      <div
        v-if="inbox.code.value"
        class="flex items-center justify-between gap-2.5"
      >
        <code class="font-mono text-[1.35rem] tracking-[0.18em] text-(--ok)">{{ inbox.code.value }}</code>
        <Key
          size="xs"
          @click="emit('fill', inbox.code.value)"
        >
          Fill the code
        </Key>
      </div>
      <p
        v-else
        class="m-0 text-[0.78rem] leading-[1.55] text-(--ink-dim)"
      >
        The newest message has no code.
      </p>
    </template>
    <p
      v-else
      class="m-0 text-[0.78rem] leading-[1.55] text-(--ink-dim)"
    >
      Waiting for the code…
    </p>
  </section>
</template>
