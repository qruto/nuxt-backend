<script setup lang="ts">
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// Every packaged default template, rendered server-side with sample data
// (backend/emailTemplates.ts) — the HTML lands in a sandboxed iframe, so
// nothing in a template can script this page.
const previews = useQuery(api.emailTemplates.previews)
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="defaultEmailTemplates · defaultGiftEmail"
      title="Email templates"
    >
      The transactional emails the backend sends out of the box — OTP codes
      (one template, four purposes), welcome, verification, email change,
      account deletion, workspace invitations, and the gift notification.
      Override any of them without touching the transport.
    </PageHeader>

    <LabPanel
      label="customize"
      title="Two override points"
      tone="accent"
    >
      <p class="hint">
        Auth emails: <code>integrations.emailTemplates</code> in
        <code>backend/auth.ts</code> — this playground overrides
        <code>otp</code> that way (see
        <NuxtLink to="/playground/platform/email">Email</NuxtLink> for the
        snippet and live delivery tracking). The gift email:
        <code>giftEmail</code> in <code>setupBilling</code>. Below are the
        packaged defaults, rendered with sample data.
      </p>
    </LabPanel>

    <LabPanel
      v-for="preview in previews ?? []"
      :key="preview.key"
      :label="preview.purpose ? `${preview.label} · ${preview.purpose}` : preview.label"
      :title="preview.subject"
    >
      <p class="hint">
        {{ preview.note }}
      </p>
      <div class="meta">
        <span class="meta-key mono">to</span>
        <span class="mono">{{ preview.to }}</span>
        <span class="meta-key mono">subject</span>
        <span class="mono">{{ preview.subject }}</span>
      </div>
      <div class="variants">
        <div class="variant">
          <span class="variant-label mono">text</span>
          <pre class="text-body mono">{{ preview.text }}</pre>
        </div>
        <div class="variant">
          <span class="variant-label mono">html</span>
          <!-- sandbox with no allowances: template HTML renders, scripts never run -->
          <iframe
            class="html-frame"
            :srcdoc="preview.html"
            sandbox=""
            :title="`${preview.label} email preview`"
          />
        </div>
      </div>
    </LabPanel>

    <p
      v-if="previews === undefined"
      class="hint"
    >
      loading templates…
    </p>
  </div>
</template>

<style scoped>
.meta {
  display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.7rem;
  align-items: baseline; margin: 0.8rem 0 0; font-size: 0.78rem;
}
.meta-key { color: var(--ink-faint); font-size: 0.68rem; }

.variants { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-top: 0.9rem; }
.variant { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
.variant-label {
  font-size: 0.6rem; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-dim);
}

.text-body {
  margin: 0; padding: 0.7rem 0.85rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
  font-size: 0.72rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
  min-height: 180px;
}

.html-frame {
  width: 100%; min-height: 180px; border: 0; border-radius: var(--r-sm);
  background: #fff; box-shadow: var(--inset-sm);
}

@media (max-width: 860px) {
  .variants { grid-template-columns: 1fr; }
}
</style>
