<script setup lang="ts">
import { api } from '#backend/api'

// A tab of the admin console: whether this deployment is the public demo,
// and the canned ideas' cache, which "Draw the canned strips" fills with one
// free job per idea not drawn yet (backend/demo.ts). The console's guard
// holds for the page, and the seed function is admin-tier itself.
definePageMeta({
  auth: { role: 'admin', hidden: true },
  adminTab: { label: 'Demo', order: 175 },
})

const demo = useQuery(api.demo.status, {})
const seed = useMutation(api.demo.seed)
const { errorMessage } = useLabels('errors')
const pending = ref(false)
const result = ref<string | null>(null)
const refusal = ref<string | null>(null)
const drawn = computed(() => demo.value?.ideas.filter(idea => idea.ready).length ?? 0)

async function draw() {
  pending.value = true
  result.value = refusal.value = null
  try {
    const { queued } = await seed({})
    result.value = queued ? `${queued} queued. The Queue tab shows them drawing.` : 'Every canned idea is drawn already.'
  }
  catch (error) {
    refusal.value = errorMessage(error)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <section
    v-if="demo"
    aria-labelledby="demo-heading"
  >
    <h2 id="demo-heading">
      Demo
    </h2>
    <p v-if="demo.demo">
      This deployment is the public demo: share links are off, an idea of one's own needs a
      passkey sign-in, and strips older than a day are deleted each night.
    </p>
    <p v-else>
      This deployment is not a sandbox, so the demo's limits are off. The canned ideas are
      suggestions here.
    </p>
    <p>{{ drawn }} of {{ demo.ideas.length }} canned ideas drawn.</p>
    <ul>
      <li
        v-for="idea in demo.ideas"
        :key="idea.id"
      >
        {{ idea.idea }} · {{ idea.ready ? 'drawn' : 'not drawn yet' }}
      </li>
    </ul>
    <button
      type="button"
      class="primary"
      :aria-disabled="pending || undefined"
      @click="pending || draw()"
    >
      Draw the canned strips
    </button>
    <p
      v-if="result"
      role="status"
    >
      {{ result }}
    </p>
    <p
      v-if="refusal"
      role="alert"
    >
      {{ refusal }}
    </p>
  </section>
</template>
