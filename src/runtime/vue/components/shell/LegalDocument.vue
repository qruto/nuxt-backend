<script setup lang="ts">
/**
 * One packaged legal page's body: the privacy policy, the terms of
 * service, the subprocessor list or the accessibility statement, filled
 * from `appConfig.backend.legal`, the brand and the capabilities the app
 * uses, under the "not legal advice" note (the `legal.disclaimer` label,
 * which an empty string removes), with links to the other legal pages. In
 * development, a note names the `appConfig.backend.legal` keys still unset.
 *
 * Internal: the body of the `privacy`, `terms`, `subprocessors` and
 * `accessibility` pages, built on `useLegalDocument`. Replace a page with
 * your own at its path to write it yourself.
 *
 * @internal
 */
import type { LegalPageKey } from '../../../../convex/legal'
import LegalDataMap from './LegalDataMap.vue'
import LegalProcessors from './LegalProcessors.vue'
import LegalStorage from './LegalStorage.vue'
import { useLegalDocument, useLegalHealth } from './legal'

const props = defineProps<{
  /** Which legal page this is. */
  page: LegalPageKey
}>()

const { data: health } = await useLegalHealth()
const legal = useLegalDocument(props.page, health)
const { t, details, app, paths } = legal
</script>

<template>
  <article
    data-legal="document"
    :data-legal-page="page"
  >
    <p
      v-if="t('disclaimer')"
      data-legal="disclaimer"
      role="note"
    >
      {{ t('disclaimer') }}
    </p>
    <p
      v-if="legal.showMissing.value"
      data-legal="unset"
      role="note"
    >
      {{ t('unset', { fields: legal.missing.value.join(', ') }) }}
    </p>

    <template v-if="page === 'privacy'">
      <p data-legal="intro">
        {{ t('privacy.intro', { app }) }}
      </p>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('controller.title') }}
        </h2>
        <p v-if="details.company">
          {{ t('controller.company', { app, company: details.company }) }}
          {{ t('privacy.controller') }}
        </p>
        <p v-else>
          {{ t('privacy.controller') }}
        </p>
        <address
          v-if="details.address || details.contact || details.dpo"
          data-legal="controller"
        >
          <span v-if="details.address">{{ t('controller.address', { address: details.address }) }}</span>
          <span v-if="details.contact">{{ t('controller.contact', { contact: details.contact }) }}</span>
          <span v-if="details.dpo">{{ t('controller.dpo', { dpo: details.dpo }) }}</span>
        </address>
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('privacy.dataTitle') }}
        </h2>
        <p>{{ t('privacy.dataIntro') }}</p>
        <LegalDataMap :legal="legal" />
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('privacy.processorsTitle') }}
        </h2>
        <p>{{ t('privacy.processorsIntro') }}</p>
        <LegalProcessors :legal="legal" />
        <p v-if="paths.subprocessors.value">
          <NuxtLink :to="paths.subprocessors.value">
            {{ t('privacy.processorsLink') }}
          </NuxtLink>
        </p>
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('privacy.storageTitle') }}
        </h2>
        <p>{{ t('privacy.storageIntro') }}</p>
        <LegalStorage :legal="legal" />
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('privacy.rightsTitle') }}
        </h2>
        <ul data-legal="rights">
          <li>
            {{ t('privacy.rightsAccess') }}
            <NuxtLink
              v-if="paths.security.value"
              :to="paths.security.value"
            >
              {{ t('privacy.rightsAccessLink') }}
            </NuxtLink>
          </li>
          <li>
            {{ t('privacy.rightsCorrect') }}
            <NuxtLink
              v-if="paths.profile.value"
              :to="paths.profile.value"
            >
              {{ t('privacy.rightsCorrectLink') }}
            </NuxtLink>
          </li>
          <li>{{ details.contact ? t('privacy.rightsOther', { contact: details.contact }) : t('privacy.rightsOtherNoContact') }}</li>
          <li>{{ t('privacy.rightsComplain') }}</li>
        </ul>
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('privacy.changesTitle') }}
        </h2>
        <p>{{ t('privacy.changes') }}</p>
      </section>
    </template>

    <template v-else-if="page === 'terms'">
      <p data-legal="intro">
        {{ t('terms.intro', { app }) }}
        <template v-if="details.company">
          {{ t('controller.company', { app, company: details.company }) }}
        </template>
      </p>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('terms.accountTitle') }}
        </h2>
        <p>{{ t('terms.account') }}</p>
      </section>
      <section
        v-if="legal.merchant.value"
        data-legal="section"
      >
        <h2 data-legal="title">
          {{ t('terms.plansTitle') }}
        </h2>
        <p>{{ t('terms.plans') }}</p>
        <p>
          {{ t('terms.merchant', { merchant: legal.merchant.value.name }) }}
          <a
            :href="legal.merchant.value.terms"
            rel="noopener"
            target="_blank"
          >{{ t('terms.merchantLink') }}</a>
        </p>
        <p>{{ t('terms.withdrawal') }}</p>
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('terms.contentTitle') }}
        </h2>
        <p>{{ t('terms.content') }}</p>
        <p v-if="paths.report.value">
          {{ t('terms.report') }}
          <NuxtLink :to="paths.report.value">
            {{ t('terms.reportLink') }}
          </NuxtLink>
        </p>
      </section>
      <section
        v-if="legal.ai.value"
        data-legal="section"
      >
        <h2 data-legal="title">
          {{ t('terms.aiTitle') }}
        </h2>
        <p>{{ t('terms.ai') }}</p>
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('terms.endTitle') }}
        </h2>
        <p>{{ t('terms.end') }}</p>
        <p v-if="paths.privacy.value">
          <NuxtLink :to="paths.privacy.value">
            {{ t('terms.privacy') }}
          </NuxtLink>
        </p>
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('terms.contactTitle') }}
        </h2>
        <p v-if="details.contact">
          {{ t('terms.contact', { contact: details.contact }) }}
        </p>
        <p>{{ t('terms.changes') }}</p>
      </section>
    </template>

    <template v-else-if="page === 'subprocessors'">
      <p data-legal="intro">
        {{ t('subprocessors.intro', { app }) }}
      </p>
      <LegalProcessors :legal="legal" />
    </template>

    <template v-else>
      <p data-legal="intro">
        {{ t('accessibility.intro', { app }) }}
      </p>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('accessibility.standardTitle') }}
        </h2>
        <p>{{ t('accessibility.standard') }}</p>
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('accessibility.checkTitle') }}
        </h2>
        <p>{{ t('accessibility.check') }}</p>
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('accessibility.gapsTitle') }}
        </h2>
        <p>{{ t('accessibility.gaps') }}</p>
      </section>
      <section data-legal="section">
        <h2 data-legal="title">
          {{ t('accessibility.reportTitle') }}
        </h2>
        <p>{{ details.contact ? t('accessibility.report', { contact: details.contact }) : t('accessibility.reportNoContact') }}</p>
        <p>{{ t('accessibility.authority') }}</p>
      </section>
    </template>

    <nav
      v-if="legal.links.value.length > 0"
      data-legal="links"
      :aria-label="t('nav')"
    >
      <ul>
        <li
          v-for="link in legal.links.value"
          :key="link.key"
        >
          <NuxtLink :to="link.to">
            {{ t(`pages.${link.key}`) }}
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </article>
</template>
