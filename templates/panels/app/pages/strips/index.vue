<script setup lang="ts">
import { api } from '#backend/api'

// `auth: true` sends a visitor who is not signed in to the login page, and
// back here after.
definePageMeta({ auth: true })

const strips = useQuery(api.strips.list, {})
// The demo's facts (backend/demo.ts): the canned ideas, and whether an idea
// of one's own needs a passkey sign-in. On the demo a canned idea is a free
// copy once drawn, and its button waits until then; elsewhere it is a
// suggestion, drawn like any other idea.
const demo = useQuery(api.demo.status, {})
// An experiment (backend/flags.ts): half of the people see example ideas.
const { variant } = useExperiment('ideaExamples')
const EXAMPLES = ['A cat learns to surf', 'The last bus on the moon', 'A robot bakes bread']
const create = useMutation(api.strips.create)
// A refusal in the reader's language. `passkey_required` is Panels' own
// reason, so its sentence is Panels' own label (app.config.ts).
const { errorMessage } = useLabels('errors')
const idea = ref('')
const refusal = ref<string | null>(null)

async function start(args: { idea: string } | { ideaId: string }) {
  refusal.value = null
  try {
    const id = await create(args)
    idea.value = ''
    await navigateTo({ name: 'strips-id', params: { id } })
  }
  catch (error) {
    refusal.value = errorMessage(error)
  }
}
</script>

<template>
  <div class="page">
    <h1>Strips</h1>
    <section
      v-if="demo?.ideas.length"
      aria-labelledby="canned-heading"
    >
      <h2 id="canned-heading">
        Start from an idea
      </h2>
      <div class="row">
        <button
          v-for="canned in demo.ideas"
          :key="canned.id"
          type="button"
          :disabled="demo.demo && !canned.ready"
          @click="start({ ideaId: canned.id })"
        >
          {{ canned.idea }}{{ demo.demo && canned.ready ? ' (free)' : '' }}
        </button>
      </div>
    </section>
    <form
      class="row"
      @submit.prevent="start({ idea })"
    >
      <label for="idea">Idea for a new strip</label>
      <input
        id="idea"
        v-model="idea"
        placeholder="A cat learns to surf"
        required
        :aria-describedby="demo?.ownIdeaNeedsPasskey ? 'idea-passkey' : undefined"
      >
      <button
        type="submit"
        class="primary"
      >
        Start a strip
      </button>
      <p
        v-if="demo?.ownIdeaNeedsPasskey"
        id="idea-passkey"
        class="muted"
      >
        On the public demo, an idea of your own needs a passkey sign-in.
      </p>
      <p
        v-if="refusal"
        role="alert"
      >
        {{ refusal }}
      </p>
    </form>
    <div
      v-if="variant === 'examples'"
      class="row"
    >
      <span class="muted">Try:</span>
      <button
        v-for="example in EXAMPLES"
        :key="example"
        type="button"
        @click="idea = example"
      >
        {{ example }}
      </button>
    </div>
    <ul>
      <li
        v-for="strip in strips"
        :key="strip._id"
      >
        <NuxtLink :to="{ name: 'strips-id', params: { id: strip._id } }">
          {{ strip.idea }}
        </NuxtLink> · {{ strip.status }}
      </li>
    </ul>
  </div>
</template>
