<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const saveFile = useMutation(api.files.save)
const removeFile = useMutation(api.files.remove)
const files = useQuery(api.files.list, {})

// ── Single upload (useUpload + useStorageUrl) ─────────────────────────────────
const lastStorageId = ref<string | null>(null)
const single = useUpload(api.files.generateUploadUrl, {
  onSuccess: async (storageId, file) => {
    lastStorageId.value = storageId
    await saveFile({
      storageId,
      name: (file as File).name || 'upload',
      contentType: file.type || undefined,
      size: file.size,
    })
  },
})
// Live preview resolved straight from the storage id — skips while null.
const previewUrl = useStorageUrl(api.files.getUrl, lastStorageId)

function onPickSingle(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void single.upload(file)
}

// ── Batch upload (useUploadQueue) ─────────────────────────────────────────────
const queue = useUploadQueue(api.files.generateUploadUrl, {
  concurrency: 3,
  onItemSuccess: async (storageId, item) => {
    const file = item.file as File
    await saveFile({
      storageId,
      name: file.name || 'upload',
      contentType: file.type || undefined,
      size: file.size,
    })
  },
})

function onPickBatch(event: Event) {
  const input = event.target as HTMLInputElement
  queue.enqueue(input.files)
  input.value = ''
}

function isImage(contentType?: string | null): boolean {
  return !!contentType && contentType.startsWith('image/')
}
function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}
function kb(size?: number): string {
  return size ? `${(size / 1024).toFixed(1)} KB` : '—'
}
</script>

<template>
  <div class="page">
    <PageHeader
      tag="useUpload · useUploadQueue · useStorageUrl"
      title="File storage"
      live
    >
      Upload to Convex file storage with reactive progress, cancellation, and
      bounded-concurrency queues. Each upload calls
      <code>api.files.generateUploadUrl</code>, streams the file with progress,
      then saves the returned storage id.
    </PageHeader>

    <LabPanel
      label="single"
      title="useUpload + useStorageUrl"
      tone="signal"
    >
      <div class="uploader">
        <label class="drop">
          <input
            type="file"
            :disabled="single.isUploading.value"
            @change="onPickSingle"
          >
          <span>{{ single.isUploading.value ? 'Uploading…' : 'Choose a file' }}</span>
        </label>

        <button
          v-if="single.isUploading.value"
          type="button"
          class="cancel"
          @click="single.cancel()"
        >
          cancel
        </button>
      </div>

      <div
        v-if="single.isUploading.value"
        class="bar"
      >
        <div
          class="bar-fill"
          :style="{ width: pct(single.progress.value) }"
        />
      </div>

      <p
        v-if="single.error.value"
        class="error"
      >
        {{ single.error.value.message }}
      </p>

      <div
        v-if="previewUrl"
        class="preview"
      >
        <img
          :src="previewUrl"
          alt="Latest upload preview"
        >
        <code>useStorageUrl(api.files.getUrl, storageId)</code>
      </div>
    </LabPanel>

    <LabPanel
      label="batch"
      title="useUploadQueue"
      tone="signal"
    >
      <template #actions>
        <span class="agg">{{ pct(queue.progress.value) }} · {{ queue.activeCount.value }} active</span>
      </template>

      <label class="drop">
        <input
          type="file"
          multiple
          @change="onPickBatch"
        >
        <span>Choose multiple files (concurrency 3)</span>
      </label>

      <ul
        v-if="queue.items.value.length"
        class="queue"
      >
        <li
          v-for="item in queue.items.value"
          :key="item.id"
          class="queue-item"
          :data-status="item.status"
        >
          <span class="q-name">{{ (item.file as File).name }}</span>
          <span class="q-status">{{ item.status }}</span>
          <div class="bar">
            <div
              class="bar-fill"
              :style="{ width: pct(item.progress) }"
            />
          </div>
        </li>
      </ul>
    </LabPanel>

    <LabPanel
      label="library"
      title="files.list"
      tone="signal"
      flush
    >
      <div
        v-if="files === undefined"
        class="state"
      >
        <span class="spinner" /> loading…
      </div>
      <div
        v-else-if="files.length === 0"
        class="state"
      >
        <span class="empty-glyph">◈</span>
        <p>No files yet. Upload one above.</p>
      </div>
      <div
        v-else
        class="grid"
      >
        <figure
          v-for="file in files"
          :key="file._id"
          class="card"
        >
          <img
            v-if="isImage(file.contentType) && file.url"
            :src="file.url"
            :alt="file.name"
          >
          <span
            v-else
            class="filetype"
          >{{ (file.contentType || 'file').split('/')[1] || 'file' }}</span>
          <figcaption>
            <span class="card-name">{{ file.name }}</span>
            <span class="card-size">{{ kb(file.size) }}</span>
          </figcaption>
          <button
            type="button"
            class="remove"
            aria-label="Delete file"
            @click="removeFile({ id: file._id })"
          >
            ×
          </button>
        </figure>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.page { max-width: 720px; }

.uploader { display: flex; align-items: center; gap: 0.75rem; }

.drop {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.1rem;
  border: 1px dashed var(--edge);
  border-radius: 8px;
  color: var(--ink-dim);
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}
.drop:hover { border-color: var(--signal); color: var(--signal); background: var(--signal-dim); }
.drop input { display: none; }

.cancel {
  background: none;
  border: 1px solid var(--edge);
  color: var(--ink-dim);
  cursor: pointer;
  font-family: var(--mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.45rem 0.7rem;
  border-radius: 6px;
  transition: color var(--transition), border-color var(--transition);
}
.cancel:hover { color: var(--err); border-color: var(--err); }

.bar {
  height: 6px;
  border-radius: 3px;
  background: var(--edge);
  overflow: hidden;
  margin-top: 0.75rem;
}
.bar-fill {
  height: 100%;
  background: var(--signal);
  border-radius: 3px;
  transition: width 0.15s var(--ease-out);
}

.agg { font-family: var(--mono); font-size: 0.68rem; color: var(--ink-dim); }

.preview {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.preview img {
  max-height: 160px;
  width: auto;
  align-self: flex-start;
  border-radius: 8px;
  border: 1px solid var(--edge);
}

.queue { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.queue-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.25rem 0.75rem;
  font-size: 0.8rem;
}
.queue-item .bar { grid-column: 1 / -1; margin-top: 0.2rem; }
.q-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-status {
  font-family: var(--mono);
  font-size: 0.66rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-dim);
}
.queue-item[data-status='success'] .q-status { color: var(--signal); }
.queue-item[data-status='success'] .bar-fill { background: var(--signal); }
.queue-item[data-status='error'] .q-status { color: var(--err); }
.queue-item[data-status='error'] .bar-fill { background: var(--err); }

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2.5rem 1rem;
  color: var(--ink-dim);
  font-size: 0.85rem;
}
.empty-glyph { font-size: 1.75rem; opacity: 0.3; }
.state p { margin: 0; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
  padding: 1rem;
}
.card {
  position: relative;
  margin: 0;
  border: 1px solid var(--edge);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface, transparent);
}
.card img { display: block; width: 100%; height: 100px; object-fit: cover; }
.filetype {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  font-family: var(--mono);
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--ink-dim);
  background: var(--signal-dim);
}
.card figcaption {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.5rem 0.6rem;
  border-top: 1px solid var(--edge);
}
.card-name { font-size: 0.74rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-size { font-size: 0.64rem; color: var(--ink-faint); font-family: var(--mono); }
.remove {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: color-mix(in srgb, var(--bg, #000) 60%, transparent);
  color: #fff;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition), background var(--transition);
}
.card:hover .remove { opacity: 1; }
.remove:hover { background: var(--err); }

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
  font-size: 0.78em;
  color: var(--signal);
  background: var(--signal-dim);
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
}
</style>
