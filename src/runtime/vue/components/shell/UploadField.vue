<script setup lang="ts">
import { useUploadField } from '../../composables/use-upload-field'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import type { BackendError } from '../../utils/backend-error'
import type { UploadFieldSlots } from './upload-field'

/**
 * A labelled file field that uploads through the upload URL `setupStorage`
 * mints, then calls `claim`, where the deployment checks the file. v-model
 * is set only once the claim went through. The keyboard path is a button
 * that opens the native picker; dropping a file onto the field is a second
 * path. The logic is `useUploadField`, so markup of your own can do the
 * same with its bindings.
 *
 * @example
 * ```vue
 * <UploadField v-model="fileId" accept="image/*" :claim="id => attach({ stripId, fileId: id })" />
 * ```
 */
defineOptions({ name: 'UploadField' })

const props = defineProps<{
  /** The storage id of the claimed file. Bind it with `v-model`. */
  modelValue?: string | null
  /** Your mutation that keeps the file. A refusal it throws is tied to the field. */
  claim: (storageId: string) => Promise<unknown>
  /** The file types the picker offers, as the `accept` attribute writes them. The claim checks the type again. */
  accept?: string
  /** Copy for this field, over app config and the translations. */
  labels?: LabelGroupOverrides<'upload'>
}>()

const emit = defineEmits({
  /** The storage id, once the claim went through. */
  'update:modelValue': (_storageId: string | null) => true,
  /** The upload or the claim failed: the refusal, also on screen. */
  'error': (_error: BackendError) => true,
})

defineSlots<UploadFieldSlots>()

const field = useUploadField({
  claim: storageId => props.claim(storageId),
  accept: () => props.accept,
  labels: () => props.labels,
  onClaimed: storageId => emit('update:modelValue', storageId),
  onError: error => emit('error', error),
})
const { state, file, progress, error, announcement, cancel, bind } = field
const { t, errorMessage } = field.labels
</script>

<template>
  <div v-bind="bind.root.value">
    <span v-bind="bind.label.value">{{ t('label') }}</span>
    <input v-bind="bind.input.value">
    <div data-upload="picker">
      <button v-bind="bind.button.value">
        <slot>{{ props.modelValue || state === 'done' ? t('replace') : t('choose') }}</slot>
      </button>
      <span data-upload="drop">{{ t('drop') }}</span>
    </div>
    <slot
      v-if="file"
      name="file"
      :file="file"
      :progress="progress"
      :cancel="cancel"
    >
      <div data-upload="file">
        <span data-upload="name">{{ file.name }}</span>
        <progress
          v-if="state === 'uploading'"
          v-bind="bind.progress.value"
        />
        <button
          v-if="state === 'uploading'"
          v-bind="bind.cancel.value"
        >
          {{ t('cancel') }}
        </button>
      </div>
    </slot>
    <p v-bind="bind.status.value">
      {{ announcement }}
    </p>
    <p
      v-if="error"
      v-bind="bind.error.value"
    >
      <slot
        name="error"
        :error="error"
      >
        {{ errorMessage(error) }}
      </slot>
    </p>
  </div>
</template>
