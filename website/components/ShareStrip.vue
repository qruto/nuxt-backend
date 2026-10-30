<script setup lang="ts">
import { api } from '#backend/api'

// The share link of a finished strip: turn it on, make a new one, or turn
// it off. The link is shown once, when it is made. The public demo shares
// nothing (backend/storage.ts), and says where to run Panels that does.
const props = defineProps<{ stripId: string }>()
const demo = useQuery(api.demo.status, {})
const { shared, url, enable, revoke, isPending, error } = useShareLink('strips', () => props.stripId)
</script>

<template>
  <section aria-labelledby="share-heading">
    <h2 id="share-heading">
      Share
    </h2>
    <p v-if="demo && !demo.sharing">
      Sharing is off on the public demo.
      <a :href="demo.templateUrl">Run Panels yourself</a> to share strips by a link.
    </p>
    <template v-else-if="demo">
      <p v-if="url">
        Anyone with this link can read the strip: <code>{{ url }}</code>
      </p>
      <div class="row">
        <button
          type="button"
          :aria-disabled="isPending || undefined"
          @click="isPending || enable()"
        >
          {{ shared ? 'Make a new link' : 'Turn on a link' }}
        </button>
        <button
          v-if="shared"
          type="button"
          :aria-disabled="isPending || undefined"
          @click="isPending || revoke()"
        >
          Turn the link off
        </button>
      </div>
      <p
        v-if="error"
        role="alert"
      >
        {{ error.message }}
      </p>
    </template>
  </section>
</template>
