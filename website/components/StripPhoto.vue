<script setup lang="ts">
import { api } from '#backend/api'
import type { Id } from '#backend/dataModel'

// The photo a strip is drawn from. <UploadField> uploads, shows progress and
// hands the new file to `claim`; <StorageImage> shows it once kept.
const props = defineProps<{ stripId: Id<'strips'>, photoId?: string }>()
const attach = useAction(api.strips.attachPhoto)
const photo = ref<string | null>(null)
</script>

<template>
  <StorageImage
    v-if="photoId"
    :get-url="api.storage.getFileUrl"
    :storage-id="photoId"
    alt="The photo this strip is drawn from"
    width="320"
  />
  <UploadField
    v-model="photo"
    accept="image/jpeg,image/png,image/webp"
    :claim="id => attach({ id: props.stripId, photoId: id })"
  />
</template>
