<script setup lang="ts">
import { computed, ref } from 'vue'
import { busyAttributes } from '../../a11y'
import { useBilling } from '../../composables/use-billing'
import { refusalText, useLabels } from '../../composables/use-labels'
import { VNodes } from '../../utils/vnodes'
import { type PastDueNoticeContext, turnedOff } from './notices'

/**
 * `<BackendNotices>`' past-due notice (LIFECYCLE): while a renewal payment
 * failed and the provider retries it (`useBilling().isPastDue`), the
 * billing managers read that the plan keeps working for now, with the way to
 * update the payment method in the billing portal. It goes as soon as the
 * payment is made. Nothing for a member who manages no billing.
 *
 * @internal
 */
defineOptions({ name: 'NoticePastDue' })
const props = defineProps<{ slotContent?: (context: PastDueNoticeContext) => unknown }>()
const billing = useBilling()
const labels = useLabels('pastDue')
const { t } = labels
const isPending = ref(false)
const failed = ref<string | null>(null)

async function portal(): Promise<void> {
  if (isPending.value) return
  isPending.value = true
  failed.value = null
  try {
    await billing.portal({ redirect: true })
  }
  catch (failure) {
    failed.value = refusalText(labels, failure)
  }
  finally {
    isPending.value = false
  }
}

const shows = computed(() => billing.isPastDue.value && billing.canManage.value)
const context = computed<PastDueNoticeContext>(() => ({ message: t('message'), portal, isPending: isPending.value }))
</script>

<template>
  <aside
    v-if="shows && !turnedOff(props.slotContent, context)"
    data-past-due="banner"
    :aria-label="t('label')"
  >
    <VNodes
      v-if="props.slotContent"
      :nodes="props.slotContent(context) as never"
    />
    <template v-else>
      <p data-past-due="message">
        {{ context.message }}
      </p>
      <button
        data-past-due="action"
        type="button"
        v-bind="busyAttributes(isPending)"
        @click="portal"
      >
        {{ isPending ? t('opening') : t('action') }}
      </button>
    </template>
    <p
      v-if="failed"
      data-past-due="error"
      role="alert"
    >
      {{ failed }}
    </p>
  </aside>
</template>
