---
title: Monitor production
description: "Where to look once the app is live: each capability's state, error reports and uptime, cron check-ins, the deployment's logs and their codes, the webhook delivery log, the activity trail and the providers' own dashboards, with what each tells you."
kind: how-to
capability: hosting
related:
  - /docs/ship/operate/monitoring
  - /docs/ship/operate/runbooks
  - /docs/ship/operate/troubleshooting
navigation:
  title: Overview
  icon: i-lucide-radar
---

Once your app is live, a few places tell you how it is doing, each for one kind of question. The package wires most of them for you: error reports and check-ins once a DSN is set, a health endpoint, log lines with stable codes, a log of every webhook delivery and an activity trail. This page is the map, and each row links to the page that sets it up.

| You want to know | Look at | Set up in |
|---|---|---|
| Whether every capability is configured | `npx nuxt-backend status --prod`, or the admin console's System tab | [Capabilities](/docs/start/concepts/capabilities) |
| Whether the app is up | An uptime check on `/api/backend/health` | [Monitoring](/docs/ship/operate/monitoring#the-health-endpoint) |
| What failed, where, and for whom | Error reports in Sentry, tagged with the function and the error code | [Monitoring](/docs/ship/operate/monitoring#what-gets-reported) |
| Whether the scheduled jobs ran | Cron monitors: the backend's own `backend-maintenance`, and yours | [Monitoring](/docs/ship/operate/monitoring#check-jobs-in) |
| What the backend logged | The Convex dashboard's logs, searched by log code | [Log codes](/docs/ship/operate/troubleshooting#log-codes) |
| Whether a purchase or an email event arrived | The webhook delivery log | [Register webhooks](/docs/ship/security/webhooks#the-delivery-log) |
| Who did what | The activity trail | [Activity trail](/docs/build/auth/admin/audit-log) |
| How the business is doing | The billing provider's dashboard; the admin console's analytics arrive in `0.2.0` | [Run the admin console](/docs/build/auth/admin) |
| Whether mail reaches inboxes | `doctor --prod`'s reputation and quota checks, and the email provider's dashboard | [Get email into inboxes](/docs/build/email/delivery/deliverability) |

## Check the capabilities

```bash
npx nuxt-backend status --prod
```

It shows each [capability](/docs/start/concepts/capabilities) of production with its state and the findings behind it. It reads production's mode off the deployment, so a capability left in a provider's test mode never reads as live. The admin console's System tab shows the same states from the health endpoint, with why each is in its state. Run `npx nuxt-backend doctor --prod` after every env change: it also probes the live site.

## Watch errors and uptime

With `MONITORING_DSN` on the deployment and a DSN in the app, every crash and failed backend call reaches Sentry from wherever it happened, tagged with the function it ran (`backend.function`), its error code (`backend.code`) and the side that saw it (`backend.source`). A refusal the app made on purpose, such as a role the caller lacks, is never reported, so what arrives needs a look. Point an uptime check at `/api/backend/health`: it answers `503` when a capability's env is unusable or the backend cannot be reached. [Monitor errors and uptime](/docs/ship/operate/monitoring) sets both up.

## Read the logs

Convex keeps every function's log lines; the dashboard's Logs page searches them, and a Convex Pro plan can stream them to a log service of yours. Every line the package writes reads `[nuxt-backend] <code>: <message>`, and no line names a person, so a search for the code finds each occurrence: [Log codes](/docs/ship/operate/troubleshooting#log-codes) says what each one means and what to do. The Nuxt server's own logs are your host's: on Vercel, the project's runtime logs, or a log drain.

## Follow the webhooks

Plans, credits and email statuses move when the providers' events arrive. The webhook delivery log keeps every verified delivery with its outcome, and counts the requests refused before any signature checked out. Read it in DevTools' Backend tab, signed in as an administrator, or with `getWebhookDeliveries` from an administrator's code. An outcome other than `ok` says what to fix: [Respond to incidents](/docs/ship/operate/runbooks#webhooks-fail).

## Review the activity

The activity trail records sign-ins, passkey and email changes, workspace and role changes, billing events, administrator actions and flag changes, as ids. Administrators read all of it in the admin console's Activity tab; a workspace's owners read theirs in its settings ([Record and review activity](/docs/build/auth/admin/audit-log)).

## Pull a lever

Some incidents are best met by switching something off while you fix it. The kill switches pause sign-ups, checkout or AI for everyone at once, and the maintenance banner tells people what is going on, all from the admin console with no deploy ([Roll out features and pause services](/docs/ship/operate/flags#kill-switches)).

## In this section

::card-group
  :::card{icon="i-lucide-activity" title="Monitor errors and uptime" to="/docs/ship/operate/monitoring"}
  Error reports from every side, cron check-ins, and the health endpoint.
  :::

  :::card{icon="i-lucide-toggle-right" title="Flags and kill switches" to="/docs/ship/operate/flags"}
  Roll features out by account, workspace, plan or percentage, and pause services in one switch.
  :::

  :::card{icon="i-lucide-siren" title="Respond to incidents" to="/docs/ship/operate/runbooks"}
  What to check and what to do when webhooks, erasures, crons, limits or a provider fail.
  :::

  :::card{icon="i-lucide-life-buoy" title="Troubleshooting" to="/docs/ship/operate/troubleshooting"}
  Fixes by symptom, and every log code.
  :::

  :::card{icon="i-lucide-database-backup" title="Back up, restore and roll back" to="/docs/ship/operate/backup"}
  Snapshots of the deployment, a restore with the providers caught up, and a rollback across schema changes.
  :::

  :::card{icon="i-lucide-settings-2" title="Apply the provider settings" to="/docs/services#recommended-settings"}
  Planned: `doctor --fix` sets the billing settings its findings recommend, and keeps both webhook endpoints healthy.
  :::

  :::card{icon="i-lucide-message-circle-question" title="Get help" to="/docs/ship/operate/help"}
  Where to ask, what to include, and how a security report differs.
  :::
::

## Related

- [Prepare for launch](/docs/ship/checklist): what to check before the first real visitor.
- [Diagnostics](/docs/reference/cli/diagnostics): every finding `doctor` and `status` report.
- [Service map](/docs/services): each provider's own dashboard, and what it holds.
- [HTTP routes](/docs/reference/backend/http-routes): the health routes, beside every other route.
