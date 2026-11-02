<script setup lang="ts">
import { api } from '#backend/api'
import type { Id } from '#backend/dataModel'

definePageMeta({ auth: true })

const route = useRoute()
const id = computed(() => route.params.id as Id<'strips'>)
// Asked once the backend holds the session's token (useAuth().isReady).
const { isReady } = useAuth()
const strip = useQuery(api.strips.get, () => (isReady.value ? { id: id.value } : 'skip'))
// On the demo a canned idea is a copy of panels drawn once (backend/demo.ts).
const demo = useQuery(api.demo.status, {})
</script>

<template>
  <div
    v-if="strip"
    class="page"
  >
    <h1>{{ strip.idea }}</h1>
    <StripPhoto
      :strip-id="strip._id"
      :photo-id="strip.photoId"
    />
    <p
      v-if="demo?.demo && strip.ideaId"
      class="muted"
    >
      On the demo, this idea is copied from panels drawn once: a photo you add is not used.
    </p>
    <StripDrawing :strip="strip" />
    <ShareStrip
      v-if="strip.status === 'ready'"
      :strip-id="strip._id"
    />
    <ReportStrip :strip-id="strip._id" />
  </div>
  <div
    v-else-if="strip === null"
    class="page"
  >
    <p>This strip is not in your workspace.</p>
  </div>
</template>
