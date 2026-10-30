<script setup lang="ts">
/**
 * The admin console's Reports tab: the reported content, intimate-image
 * removal requests first by their 48-hour deadline (those the app could not
 * place on a thing among them), then the most reported; the other notices
 * whose link the app could not place; and the open appeals. An administrator hides content or dismisses its reports with a
 * reason the people who reported it and its author read, flags a suspected
 * crime for the authorities (DSA Art. 18), and keeps or reverses an
 * appealed decision. Every change asks for a recent sign-in through the
 * tab's own `<ReauthenticateDialog>` and lands on the activity trail,
 * never naming who reported. The console shows it once
 * `backend/admin.ts` passes `reports` to `setupAdmin`.
 *
 * Internal: the console's tab, built on `useReportsTab`.
 *
 * @internal
 */
import AdminTabDialogs from './AdminTabDialogs.vue'
import AdminTabStatus from './AdminTabStatus.vue'
import AdminReportsAppeal from './AdminReportsAppeal.vue'
import AdminReportsDecision from './AdminReportsDecision.vue'
import AdminReportsNotice from './AdminReportsNotice.vue'
import AdminReportsSubject from './AdminReportsSubject.vue'
import { useReportsTab } from './admin-reports-tab'

const props = defineProps<{
  /** Ask before a suspected crime is flagged; resolves `true` to go ahead. Default: the tab's own confirmation dialog. */
  confirm?: (text: string) => boolean | Promise<boolean>
}>()

const tab = useReportsTab(() => props.confirm)
const { t, data, message, queue } = tab
</script>

<template>
  <section
    data-admin="reports"
    :aria-busy="tab.isLoading.value || undefined"
  >
    <p
      v-if="tab.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('reports.refused') }}
    </p>
    <template v-else-if="data">
      <p
        v-if="message"
        data-admin="message"
        :data-state="message.ok ? 'ok' : 'error'"
        :role="message.ok ? 'status' : 'alert'"
      >
        {{ message.text }}
      </p>
      <p
        v-if="!data.subjects.length && !data.notices.length && !data.appeals.length"
        data-admin="reports-empty"
        role="status"
      >
        {{ t('reports.empty') }}
      </p>
      <section
        v-if="queue.queue.length"
        data-admin="reports-subjects"
        :aria-labelledby="`${tab.id}-subjects`"
      >
        <h2 :id="`${tab.id}-subjects`">
          {{ t('reports.subjects') }}
        </h2>
        <template
          v-for="item in queue.queue"
          :key="item.subject ? tab.keyOf(item.subject) : `notice:${item.notice.id}`"
        >
          <AdminReportsSubject
            v-if="item.subject"
            :tab="tab"
            :subject="item.subject"
          />
          <article
            v-else
            data-admin="reports-item"
            data-state="intimate"
          >
            <AdminReportsNotice
              :tab="tab"
              :notice="item.notice"
            />
            <AdminReportsDecision
              :tab="tab"
              :target="{ notice: item.notice.id }"
            />
          </article>
        </template>
      </section>
      <section
        v-if="queue.unplaced.length"
        data-admin="reports-unplaced"
        :aria-labelledby="`${tab.id}-unplaced`"
      >
        <h2 :id="`${tab.id}-unplaced`">
          {{ t('reports.unplaced') }}
        </h2>
        <article
          v-for="notice in queue.unplaced"
          :key="notice.id"
          data-admin="reports-item"
        >
          <AdminReportsNotice
            :tab="tab"
            :notice="notice"
          />
          <AdminReportsDecision
            :tab="tab"
            :target="{ notice: notice.id }"
          />
        </article>
      </section>
      <section
        v-if="data.appeals.length"
        data-admin="reports-appeals"
        :aria-labelledby="`${tab.id}-appeals`"
      >
        <h2 :id="`${tab.id}-appeals`">
          {{ t('reports.appeals') }}
        </h2>
        <AdminReportsAppeal
          v-for="appeal in data.appeals"
          :key="appeal.id"
          :tab="tab"
          :appeal="appeal"
        />
      </section>
    </template>
    <AdminTabStatus
      v-else-if="tab.error.value || tab.isLoading.value"
      :error="tab.error.value"
    />
    <AdminTabDialogs :confirmation="tab.confirmation" />
  </section>
</template>
