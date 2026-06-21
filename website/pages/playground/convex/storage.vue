<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const saveFile = useMutation(api.files.save)
const removeFile = useMutation(api.files.remove)
const files = useQuery(api.files.list, {})

// ── Single upload (useUpload + useStorageUrl) ─────────────────────
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
const previewUrl = useStorageUrl(api.files.getUrl, lastStorageId)

function onPickSingle(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void single.upload(file)
}

// ── Batch upload (useUploadQueue) ─────────────────────────────────
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
  <div class="stack">
    <PageHeader
      tag="useUpload · useUploadQueue · useStorageUrl"
      title="File storage"
      live
    >
      Upload to Convex storage with reactive progress, cancellation and
      bounded-concurrency queues. Each upload calls
      <code>generateUploadUrl</code>, streams the file, then saves the storage
      id; <code>useStorageUrl</code> resolves served URLs reactively.
    </PageHeader>

    <div class="grid-2">
      <LabPanel
        label="single"
        title="useUpload"
        tone="accent"
      >
        <label class="drop">
          <input
            type="file"
            :disabled="single.isUploading.value"
            @change="onPickSingle"
          >
          <Icon
            name="storage"
            :size="20"
          />
          <span>{{ single.isUploading.value ? 'Uploading…' : 'Choose a file' }}</span>
        </label>

        <div
          v-if="single.isUploading.value"
          class="upload-foot"
        >
          <div class="bar">
            <div
              class="bar-fill"
              :style="{ width: pct(single.progress.value) }"
            />
          </div>
          <button
            type="button"
            class="cancel"
            @click="single.cancel()"
          >
            cancel
          </button>
        </div>

        <p
          v-if="single.error.value"
          class="err-text"
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
          <code class="prose-code">useStorageUrl(api.files.getUrl, id)</code>
        </div>
      </LabPanel>

      <LabPanel
        label="batch"
        title="useUploadQueue"
        tone="accent"
      >
        <template #actions>
          <span class="mono agg">{{ pct(queue.progress.value) }} · {{ queue.activeCount.value }} active</span>
        </template>

        <label class="drop">
          <input
            type="file"
            multiple
            @change="onPickBatch"
          >
          <Icon
            name="storage"
            :size="20"
          />
          <span>Choose multiple files · concurrency 3</span>
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
    </div>

    <LabPanel
      label="library"
      title="files.list"
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
        <Icon
          name="storage"
          :size="26"
        />
        <p>No files yet. Upload one above.</p>
      </div>
      <div
        v-else
        class="library"
      >
        <figure
          v-for="file in files"
          :key="file._id"
          class="filecard"
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
            <span class="card-size mono">{{ kb(file.size) }}</span>
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
.drop {
  display: flex; align-items: center; justify-content: center; gap: 0.6rem;
  padding: 1.4rem; border-radius: var(--r);
  background: var(--sink); box-shadow: var(--inset-sm);
  color: var(--ink-dim); font-size: 0.85rem; cursor: pointer;
  transition: color var(--transition), box-shadow var(--transition);
}
.drop:hover { color: var(--accent); }
.drop input { display: none; }

.upload-foot { display: flex; align-items: center; gap: 0.7rem; margin-top: 0.8rem; }
.cancel {
  flex-shrink: 0; background: var(--surface); border: 0; color: var(--ink-dim); cursor: pointer;
  font-family: var(--mono); font-size: 0.64rem; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 0.4rem 0.7rem; border-radius: 6px; box-shadow: var(--raise-sm);
}
.cancel:hover { color: var(--err); }

.bar { flex: 1; height: 8px; border-radius: 99px; background: var(--sink); box-shadow: var(--inset-sm); overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.15s var(--ease-out); }

.agg { font-size: 0.68rem; color: var(--ink-dim); }
.preview { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
.preview img { max-height: 150px; width: auto; align-self: flex-start; border-radius: var(--r-sm); box-shadow: var(--raise-sm); }

.queue { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.7rem; }
.queue-item { display: grid; grid-template-columns: 1fr auto; gap: 0.3rem 0.75rem; font-size: 0.8rem; }
.queue-item .bar { grid-column: 1 / -1; margin-top: 0.2rem; }
.q-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-status { font-family: var(--mono); font-size: 0.66rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-dim); }
.queue-item[data-status='success'] .q-status { color: var(--ok); }
.queue-item[data-status='success'] .bar-fill { background: var(--ok); }
.queue-item[data-status='error'] .q-status { color: var(--err); }
.queue-item[data-status='error'] .bar-fill { background: var(--err); }

.state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2.5rem 1rem; color: var(--ink-faint); font-size: 0.85rem; }
.state p { margin: 0; }

.library { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.85rem; padding: 1rem; }
.filecard {
  position: relative; margin: 0; border-radius: var(--r); overflow: hidden;
  background: var(--surface); box-shadow: var(--raise-sm);
}
.filecard img { display: block; width: 100%; height: 100px; object-fit: cover; }
.filetype {
  display: flex; align-items: center; justify-content: center; height: 100px;
  font-family: var(--mono); font-size: 0.7rem; text-transform: uppercase; color: var(--ink-dim); background: var(--sink);
}
.filecard figcaption { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.5rem 0.6rem; }
.card-name { font-size: 0.74rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-size { font-size: 0.64rem; color: var(--ink-faint); }
.remove {
  position: absolute; top: 0.4rem; right: 0.4rem; width: 22px; height: 22px; border-radius: 50%;
  border: 0; background: color-mix(in srgb, var(--ink) 55%, transparent); color: #fff;
  font-size: 1rem; line-height: 1; cursor: pointer; opacity: 0; transition: opacity var(--transition), background var(--transition);
}
.filecard:hover .remove { opacity: 1; }
.remove:hover { background: var(--err); }

.err-text { margin: 0.75rem 0 0; font-size: 0.8rem; color: var(--err); }
.spinner { display: inline-block; width: 13px; height: 13px; border: 2px solid var(--edge-hi); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; }
</style>
