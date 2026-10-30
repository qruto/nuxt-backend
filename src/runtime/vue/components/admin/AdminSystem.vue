<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { HEALTH_ROUTE } from '../../../../convex/constants'
import { busyAttributes } from '../../a11y'
import { useLabels, valueLabel } from '../../composables/use-labels'

/**
 * The admin console's System tab: every capability's state from the app's
 * own health endpoint (`/api/backend/health`), which answers an
 * administrator with the detail: why each capability is in its state, the
 * env it lacks and its most pressing finding, linked to its docs. Read once
 * the tab opens, and again on "Check again"; never on the server.
 *
 * @internal
 */
defineOptions({ name: 'AdminSystem' })

/** The app's health as `/api/backend/health` answers it: the detail for an administrator. */
interface Health {
  status: 'ok' | 'degraded' | 'failing'
  capabilities: Record<string, string>
  detail?: Record<string, { reason: string, missingEnv: string[], top: string | null }>
}

const labels = useLabels('admin')
const { t } = labels
const health = ref<Health | null>(null)
const failed = ref(false)
const checking = ref(false)

async function check(): Promise<void> {
  if (checking.value) return
  checking.value = true
  failed.value = false
  try {
    // Same origin, with the session's cookie: the endpoint reads the caller's role.
    // fallow-ignore-next-line security-sink -- destination is the app's own fixed health route (HEALTH_ROUTE), a same-origin path, never input; verified 2026-10-19
    const response = await fetch(HEALTH_ROUTE, { credentials: 'same-origin', headers: { accept: 'application/json' } })
    health.value = await response.json() as Health
  }
  catch {
    failed.value = true
  }
  finally {
    checking.value = false
  }
}
onMounted(check)

const capabilities = computed(() => Object.entries(health.value?.capabilities ?? {}))
/** Where a finding is explained, by its id (the docs' stable alias). */
const findingUrl = (id: string) => `https://nuxt-backend.dev/d/${id}`
</script>

<template>
  <section
    data-admin="system"
    :aria-busy="checking ? 'true' : undefined"
  >
    <h2 data-admin="title">
      {{ t('system.title') }}
    </h2>
    <p
      v-if="health"
      data-admin="system-status"
      :data-state="health.status"
      role="status"
      aria-live="polite"
    >
      {{ t(`system.statuses.${health.status}`) }}
    </p>
    <p
      v-else-if="checking"
      data-admin="loading"
      role="status"
      aria-live="polite"
    >
      {{ t('system.checking') }}
    </p>
    <p
      v-if="failed"
      data-admin="error"
      role="alert"
    >
      {{ t('system.unreachable') }}
    </p>
    <table
      v-if="capabilities.length"
      data-admin="table"
    >
      <thead>
        <tr>
          <th scope="col">
            {{ t('system.capability') }}
          </th>
          <th scope="col">
            {{ t('system.state') }}
          </th>
          <th scope="col">
            {{ t('system.why') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="[name, state] in capabilities"
          :key="name"
          data-admin="capability"
          :data-state="state"
        >
          <th scope="row">
            {{ valueLabel(labels, 'admin', 'system.capabilities', name) }}
          </th>
          <td data-admin="capability-state">
            {{ valueLabel(labels, 'admin', 'system.states', state) }}
          </td>
          <td data-admin="capability-why">
            <template v-if="health?.detail?.[name]">
              {{ health.detail[name].reason }}
              <template v-if="health.detail[name].missingEnv.length">
                <br>{{ t('system.missingEnv', { names: health.detail[name].missingEnv.join(', ') }) }}
              </template>
              <template v-if="health.detail[name].top">
                <br><a
                  :href="findingUrl(health.detail[name].top!)"
                  target="_blank"
                  rel="noopener"
                >{{ t('system.finding') }}</a>
              </template>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <p
      v-if="health && !health.detail"
      data-admin="coarse-note"
    >
      {{ t('system.coarse') }}
    </p>
    <button
      data-admin="refresh"
      type="button"
      v-bind="busyAttributes(checking)"
      @click="check"
    >
      {{ checking ? t('system.checking') : t('system.refresh') }}
    </button>
  </section>
</template>
