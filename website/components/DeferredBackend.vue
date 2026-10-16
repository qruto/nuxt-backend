<script setup lang="ts">
/**
 * A live block outside the playground: it renders its slot once the backend
 * client has loaded, which it asks for when it scrolls into view (at once on
 * a route that already has the client). Until then, and on the server, it
 * renders `#fallback`, which gets `failed` when the client could not load.
 * On the docs only pages with `demo: true` may hold one
 * (test/docs/page-contract.test.ts); see modules/deferred-backend-client.
 */
const props = withDefaults(defineProps<{ as?: string }>(), { as: 'div' })

const root = useTemplateRef<HTMLElement>('root')
const ready = ref(false)
const failed = ref(false)
const { $loadBackendClient } = useNuxtApp()

let observer: IntersectionObserver | undefined
onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting)) return
    observer?.disconnect()
    $loadBackendClient().then(() => {
      ready.value = true
    }, () => {
      failed.value = true
    })
  }, { rootMargin: '200px' })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <component
    :is="props.as"
    ref="root"
  >
    <slot v-if="ready" />
    <slot
      v-else
      name="fallback"
      :failed="failed"
    />
  </component>
</template>
