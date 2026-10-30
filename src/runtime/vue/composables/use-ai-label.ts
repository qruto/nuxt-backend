import { computed, toValue, useId, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { JobProvenance } from '../../../convex/integrations/ai/provenance'
import { useLabels, type LabelGroupOverrides, type UseLabelsReturn } from './use-labels'

export type { JobProvenance } from '../../../convex/integrations/ai/provenance'

/** Where a person checks a file's content credentials: the Content Authenticity Initiative's verifier. */
export const CONTENT_CREDENTIALS_VERIFIER = 'https://contentcredentials.org/verify'

/** Whether a URL carries a signature (`storage.signedUrl`, a cloud store's presigned link): a key to a private file, never handed to a third party. */
function isSigned(url: string): boolean {
  try {
    return [...new URL(url).searchParams.keys()].some(key => /signature|^sig$|token/i.test(key))
  }
  catch {
    return false
  }
}

export interface UseAiLabelOptions {
  /** What made the content (`useJob().provenance`, `ai.provenanceOf`): with it, the label opens its details. */
  provenance?: MaybeRefOrGetter<JobProvenance | null | undefined>
  /** The image's public URL: the verify link opens the verifier on it. A signed URL (`storage.signedUrl`) is never sent; without one, the verifier asks for the file. */
  src?: MaybeRefOrGetter<string | null | undefined>
  /** Copy for this label, over `appConfig.backend.labels.ai` and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'ai'> | undefined>
}

export interface UseAiLabelReturn {
  /** Whether there are details to open: a provenance record was given. */
  hasDetails: ComputedRef<boolean>
  /** The models that made it, as a list in the reader's language: "model-a and model-b". */
  models: ComputedRef<string>
  /** When it was made, as the reader's locale writes a date; empty without a record. */
  madeOn: ComputedRef<string>
  /** The verifier, on the image when `src` names it and carries no signature. */
  verifyHref: ComputedRef<string>
  /** The label's words, for markup of your own. */
  labels: UseLabelsReturn<'ai'>
  /** Attribute bindings, with the accessibility attributes, for markup of your own. */
  bind: {
    /** The label: `data-ai-label="root"`, `data-state` (`label` or `details`). */
    root: ComputedRef<Record<string, unknown>>
    /** The button that opens the details: a native popover target, named by its words. */
    trigger: ComputedRef<Record<string, unknown>>
    /** The details: a native popover, named by its heading. */
    details: ComputedRef<Record<string, unknown>>
    /** The details' heading. */
    heading: ComputedRef<Record<string, unknown>>
    /** The link to the verifier, in a new tab, sending no referrer. */
    verify: ComputedRef<Record<string, unknown>>
  }
}

/**
 * The AI-generated label without its markup: its words, and with a
 * provenance record the details it opens — the models, the date and a link
 * to check the content credentials — as state and bindings. The details are
 * a native popover the label's button opens, so they need no script to
 * open, close on Escape and return focus. `<AiLabel>` is this with the
 * package's markup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const job = useJob(() => strip.value?.jobId)
 * const label = useAiLabel({ provenance: job.provenance })
 * </script>
 * <template>
 *   <span v-bind="label.bind.root.value">
 *     <button v-bind="label.bind.trigger.value">{{ label.labels.t('label') }}</button>
 *     <div v-bind="label.bind.details.value">{{ label.models.value }}</div>
 *   </span>
 * </template>
 * ```
 */
export function useAiLabel(options: UseAiLabelOptions = {}): UseAiLabelReturn {
  const labels = useLabels('ai', () => toValue(options.labels))
  const id = useId() ?? `ai-label-${Math.random().toString(36).slice(2)}`
  const ids = { details: `${id}-details`, heading: `${id}-heading` }
  const record = computed(() => toValue(options.provenance) ?? undefined)
  const hasDetails = computed(() => record.value !== undefined)

  const models = computed(() => {
    const list = record.value?.models ?? []
    try {
      return new Intl.ListFormat(labels.locale.value, { type: 'conjunction' }).format(list)
    }
    catch {
      return list.join(', ')
    }
  })
  const madeOn = computed(() => {
    const at = record.value?.finishedAt
    if (at === undefined) return ''
    try {
      return new Intl.DateTimeFormat(labels.locale.value, { dateStyle: 'medium' }).format(new Date(at))
    }
    catch {
      return new Date(at).toISOString().slice(0, 10)
    }
  })
  const verifyHref = computed(() => {
    const src = toValue(options.src)
    return src && !isSigned(src) ? `${CONTENT_CREDENTIALS_VERIFIER}?source=${encodeURIComponent(src)}` : CONTENT_CREDENTIALS_VERIFIER
  })

  const bind: UseAiLabelReturn['bind'] = {
    root: computed(() => ({ 'data-ai-label': 'root', 'data-state': hasDetails.value ? 'details' : 'label' })),
    trigger: computed(() => ({ 'type': 'button', 'data-ai-label': 'trigger', 'popovertarget': ids.details })),
    details: computed(() => ({ 'id': ids.details, 'popover': 'auto', 'role': 'dialog', 'aria-labelledby': ids.heading, 'data-ai-label': 'details' })),
    heading: computed(() => ({ 'id': ids.heading, 'data-ai-label': 'heading' })),
    // `noreferrer` sends no Referer, and implies `noopener`.
    verify: computed(() => ({ 'href': verifyHref.value, 'target': '_blank', 'rel': 'noreferrer', 'data-ai-label': 'verify' })),
  }

  return { hasDetails, models, madeOn, verifyHref, labels, bind }
}
