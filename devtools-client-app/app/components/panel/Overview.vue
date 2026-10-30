<script setup lang="ts">
import { DEPLOYMENT_KIND_LABEL, type DevtoolsPanelId, type DevtoolsPreflightFinding } from '../../../../src/devtools/rpc-types'
import { capabilitySummary } from '../../../../src/capabilities/health'
import { PANEL_TABS } from '~/nav'
import { connectionLabel, connectionSignal, findingSignal, layerSignal, type Signal } from '~/utils/signal'

const state = usePanelState()
const panel = usePanel()

onMounted(() => {
  void panel.readDeploymentEnv()
  void panel.readHealth()
})

// The capability console: a channel per app capability, its light the state the dev
// server detected from the preflight, the doctor runs since the env last
// changed and the deployment env names last read.
const capabilities = computed(() => state.info?.capabilities ?? [])
const summary = computed(() => capabilitySummary(capabilities.value.map(capability => capability.state)))
const tabLabel = (id: DevtoolsPanelId) => PANEL_TABS.find(tab => tab.id === id)?.label ?? id
const deploymentSignal = computed<Signal>(() => {
  const kind = state.info?.deployment.kind
  if (kind === 'production' || kind === 'preview') return 'warn'
  return kind === 'none' || !kind ? 'off' : 'ok'
})

// Doctor's findings replace the preflight's of the same id and add the ones
// only it can check (the deployment, the routes, the catalog). Its
// per-variable deployment checks are left to the Env table below; the two it
// keeps say something the table cannot: the names could not be read, or a
// dev-only variable is set where it must not be.
const DEPLOYMENT_FINDINGS_KEPT = new Set(['deployment-env', 'deployment-auth-trust-local-origins'])
const findings = computed<Array<DevtoolsPreflightFinding & { fromDoctor: boolean }>>(() => {
  const preflight = (state.info?.findings ?? []).map(finding => ({ ...finding, fromDoctor: false }))
  const doctor = (state.doctor?.findings ?? [])
    .filter(finding => !finding.id.startsWith('deployment-') || DEPLOYMENT_FINDINGS_KEPT.has(finding.id))
    .map(finding => ({ ...finding, fromDoctor: true }))
  const byId = new Map([...preflight, ...doctor].map(finding => [finding.id, finding]))
  return [...byId.values()]
})
const problems = computed(() => findings.value.filter(finding => finding.status !== 'pass'))
const passes = computed(() => findings.value.filter(finding => finding.status === 'pass'))

const envRows = computed(() => {
  const env = state.info?.env
  if (!env) return []
  const deployed = env.deployment?.names
  const rows = (tier: 'required' | 'optional') => Object.entries(env.visible[tier]).map(([name, here]) => ({
    name,
    tier,
    here,
    deployed: deployed ? deployed[tier][name] === true : null,
  }))
  return [...rows('required'), ...rows('optional')]
})
function deployedSignal(row: { tier: string, deployed: boolean | null }): Signal {
  if (row.deployed === null) return 'off'
  if (row.deployed) return 'ok'
  return row.tier === 'required' ? 'err' : 'off'
}

const wiring = computed(() => {
  const options = state.info?.options
  if (!options) return []
  return [
    { label: `auth route: ${options.authRoute}`, on: true },
  ]
})

const versions = computed(() => Object.entries(state.info?.versions ?? {}))

const copied = ref<string | null>(null)
async function copyHint(id: string, hint: string) {
  await copyText(hint.replace(/^Run: /, ''))
  copied.value = id
  setTimeout(() => copied.value = null, 1200)
}

async function copyReport(report: string) {
  await copyText(report)
  copied.value = 'doctor-json'
  setTimeout(() => copied.value = null, 1200)
}

function refreshAll() {
  void panel.refresh()
  void panel.readDeploymentEnv(true)
  void panel.readHealth(true)
}

// What each maintenance task deletes, by the component's task name.
const TASK_LABELS: Record<string, string> = {
  sessions: 'Expired sessions',
  verifications: 'Expired codes and verifications',
  rateLimits: 'Idle rate-limit counters',
  aiRequests: 'Finished AI requests',
  invitations: 'Expired invitations',
  secretOutbox: 'Secret emails past their code',
  emailRecords: 'Old email records',
}
const maintenanceTasks = computed(() => {
  const maintenance = state.health?.maintenance
  return maintenance?.status === 'ok' ? maintenance.tasks : []
})
const missingMounts = computed(() => (state.health?.mounts ?? []).filter(mount => !mount.mounted))
function when(at: number | undefined): string {
  if (at === undefined) return 'running'
  const date = new Date(at)
  return Date.now() - at < 86_400_000 ? date.toLocaleTimeString() : date.toLocaleString()
}
</script>

<template>
  <NPanelGrids v-if="!state.info">
    <NLoading>Connecting to the dev server…</NLoading>
  </NPanelGrids>

  <template v-else>
    <NCard class="p4 flex items-center gap-3 flex-wrap">
      <span class="flex items-center gap-2">
        <Led :signal="connectionSignal(state.snapshot?.connection)" />
        {{ connectionLabel(state.snapshot?.connection) }}
      </span>
      <SignalBadge :signal="deploymentSignal">
        {{ DEPLOYMENT_KIND_LABEL[state.info.deployment.kind] }}
      </SignalBadge>
      <span
        v-if="state.info.deployment.id"
        class="font-mono text-xs op65"
      >{{ state.info.deployment.id }}</span>
      <span class="ml-auto flex gap-1">
        <NButton
          v-if="state.info.deployment.dashboardUrl"
          n="xs"
          icon="carbon-launch"
          :to="state.info.deployment.dashboardUrl"
          target="_blank"
        >
          Open dashboard
        </NButton>
        <NButton
          n="xs"
          icon="carbon-plug"
          title="Connection, live queries, auth state and logs"
          @click="openConnectionTab()"
        >
          Connection &amp; queries
        </NButton>
        <NButton
          n="xs"
          icon="carbon-renew"
          title="Read the dev server and the deployment env again"
          @click="refreshAll()"
        />
      </span>
    </NCard>

    <div class="flex gap-3 flex-wrap text-xs op50 font-mono">
      <span>functions: {{ state.info.functionsDir }}/</span>
      <span
        v-for="[name, version] of versions"
        :key="name"
      >{{ name }}@{{ version }}</span>
    </div>

    <PanelCard title="Capabilities">
      <template #actions>
        <span class="text-xs op50">{{ summary }}</span>
      </template>
      <div class="grid gap-2 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
        <section
          v-for="capability of capabilities"
          :key="capability.name"
          class="border n-border-base rounded p3 flex flex-col gap-1.5"
          :data-capability="capability.name"
          :data-state="capability.state"
          :aria-label="`${capability.title}: ${capability.state}`"
        >
          <div class="flex items-center gap-2">
            <Led :signal="layerSignal(capability.state)" />
            <span class="font-medium">{{ capability.title }}</span>
            <SignalBadge
              :signal="layerSignal(capability.state)"
              class="ml-auto"
            >
              {{ capability.state }}
            </SignalBadge>
          </div>
          <div class="text-xs op65">
            {{ capability.providers.join(' · ') }}
          </div>
          <div class="text-xs">
            {{ capability.reason }}
          </div>
          <div
            v-if="capability.missingEnv.length"
            class="text-xs font-mono op65"
          >
            unset: {{ capability.missingEnv.join(', ') }}
          </div>
          <div
            v-if="capability.top"
            class="text-xs flex items-baseline gap-1.5"
          >
            <Led :signal="findingSignal(capability.top.status)" />
            <span><span class="font-medium">{{ capability.top.title }}</span> <span class="op65">{{ capability.top.message }}</span></span>
          </div>
          <div class="flex gap-1 mt-auto pt1">
            <NButton
              v-if="capability.devtools !== 'overview'"
              n="xs"
              icon="carbon-arrow-right"
              :title="`Open the ${tabLabel(capability.devtools)} tab`"
              @click="panel.select(capability.devtools)"
            >
              {{ tabLabel(capability.devtools) }}
            </NButton>
            <NButton
              n="xs"
              icon="carbon-document"
              :to="capability.docsUrl"
              target="_blank"
              :title="`The ${capability.title} docs`"
            >
              Docs
            </NButton>
          </div>
        </section>
      </div>
      <div
        v-if="state.info.doctorRanAt === null"
        class="op50 text-xs"
      >
        Lit from the dev-server checks. Run doctor below to add the deployment's: routes, mounts,
        the billing catalog.
      </div>
      <div
        v-else
        class="op50 text-xs"
      >
        With doctor's checks from {{ new Date(state.info.doctorRanAt).toLocaleTimeString() }}.
      </div>
    </PanelCard>

    <NTip
      v-if="state.snapshot?.missingNamespaces.length"
      n="amber"
      icon="carbon-warning"
    >
      The app has no <code>{{ state.snapshot.missingNamespaces.map(name => `${state.info!.functionsDir}/${name}.ts`).join(', ') }}</code>
      deployed, so the composables that bind to it stay empty. Restore it with
      <code>npx nuxt-backend init</code>.
    </NTip>

    <PanelCard title="Health">
      <template #actions>
        <span
          v-if="state.doctor"
          class="text-xs op50"
        >doctor ran {{ new Date(state.doctor.ranAt).toLocaleTimeString() }}</span>
        <NButton
          n="xs"
          icon="carbon-stethoscope"
          :disabled="state.doctorRunning"
          title="Run nuxt-backend doctor's checks against the dev deployment"
          @click="panel.runDoctor()"
        >
          {{ state.doctorRunning ? 'Running doctor…' : 'Run doctor' }}
        </NButton>
        <NButton
          v-if="state.doctor?.report"
          n="xs"
          icon="carbon-copy"
          title="Copy the run as nuxt-backend doctor --json prints it, for an issue or a coding agent"
          @click="copyReport(state.doctor.report)"
        >
          {{ copied === 'doctor-json' ? 'Copied' : 'Copy doctor JSON' }}
        </NButton>
      </template>
      <NTip
        v-if="state.doctor?.error"
        n="red"
        icon="carbon-warning"
      >
        {{ state.doctor.error }}
      </NTip>
      <div
        v-for="finding of problems"
        :key="finding.id"
        class="flex flex-col gap-1"
      >
        <div class="flex items-center gap-2 flex-wrap">
          <SignalBadge :signal="findingSignal(finding.status)">
            {{ finding.status }}
          </SignalBadge>
          <span>{{ finding.title }}</span>
          <span class="op65 text-xs">{{ finding.message }}</span>
        </div>
        <div
          v-if="finding.fixHint"
          class="flex items-center gap-2 pl2"
        >
          <code class="font-mono text-xs op65 n-bg-active rounded px2 py0.5">{{ finding.fixHint }}</code>
          <NButton
            n="xs"
            :icon="copied === finding.id ? 'carbon-checkmark' : 'carbon-copy'"
            title="Copy"
            @click="copyHint(finding.id, finding.fixHint)"
          />
        </div>
      </div>
      <div
        v-if="!problems.length"
        class="op50"
      >
        Every check passes.
      </div>
      <div class="flex gap-2 flex-wrap">
        <SignalBadge
          v-for="finding of passes"
          :key="finding.id"
          signal="ok"
        >
          {{ finding.title }}
        </SignalBadge>
      </div>
      <div
        v-if="!state.doctor"
        class="op50 text-xs"
      >
        These are the dev-server checks. Run doctor to add the deployment's: codegen, deployed
        functions, webhook routes, the billing catalog.
      </div>
    </PanelCard>

    <PanelCard title="Env (names only: values never leave the dev server)">
      <template #actions>
        <span
          v-if="state.info.env.deployment?.status === 'ok'"
          class="text-xs op50"
        >deployment read {{ new Date(state.info.env.deployment.readAt).toLocaleTimeString() }}</span>
        <NButton
          n="xs"
          icon="carbon-renew"
          :disabled="state.deploymentEnvLoading"
          title="Read the deployment env names again"
          @click="panel.readDeploymentEnv(true)"
        />
      </template>
      <div
        v-if="state.info.env.deployment?.status === 'unavailable'"
        class="op65 text-xs"
      >
        Deployment: {{ state.info.env.deployment.reason }}
      </div>
      <table class="text-left text-xs">
        <thead class="op50">
          <tr>
            <th class="py1 pr4 font-normal">
              Variable
            </th>
            <th class="py1 pr4 font-normal">
              In this dev server
            </th>
            <th class="py1 font-normal">
              On the deployment
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row of envRows"
            :key="row.name"
          >
            <td class="py1 pr4 font-mono">
              {{ row.name }}<span
                v-if="row.tier === 'required'"
                class="op50"
              > · required</span>
            </td>
            <td class="py1 pr4">
              <span class="flex items-center gap-1.5">
                <Led :signal="row.here ? 'ok' : 'off'" />{{ row.here ? 'set' : 'not set' }}
              </span>
            </td>
            <td class="py1">
              <span class="flex items-center gap-1.5">
                <Led :signal="deployedSignal(row)" />{{ row.deployed === null ? (state.deploymentEnvLoading ? 'reading…' : 'not read') : row.deployed ? 'set' : 'not set' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </PanelCard>

    <PanelCard title="Mounts">
      <template #actions>
        <span
          v-if="state.health"
          class="text-xs op50"
        >read {{ new Date(state.health.readAt).toLocaleTimeString() }}</span>
        <NButton
          n="xs"
          icon="carbon-renew"
          :disabled="state.healthLoading"
          title="Read convex.config.ts, http.ts and the maintenance again"
          @click="panel.readHealth(true)"
        />
      </template>
      <div
        v-if="!state.health"
        class="op50"
      >
        {{ state.healthLoading ? 'Reading convex.config.ts…' : 'Not read yet.' }}
      </div>
      <template v-else>
        <div class="flex gap-2 flex-wrap">
          <SignalBadge
            v-for="mount of state.health.mounts"
            :key="mount.from"
            :signal="mount.mounted ? 'ok' : 'warn'"
            :title="mount.from"
          >
            {{ mount.name }}{{ mount.scaffold ? '' : ' · yours' }}
          </SignalBadge>
        </div>
        <NTip
          v-if="missingMounts.length || state.health.missingRoutes.length"
          n="amber"
          icon="carbon-warning"
        >
          <span v-if="missingMounts.length">Not mounted: <code>{{ missingMounts.map(mount => mount.name).join(', ') }}</code>. </span>
          <span v-if="state.health.missingRoutes.length">Not registered in http.ts: <code>{{ state.health.missingRoutes.join(', ') }}</code>. </span>
          <code>npx nuxt-backend doctor --fix</code> adds them.
        </NTip>
      </template>
    </PanelCard>

    <PanelCard title="Maintenance">
      <div
        v-if="state.health?.maintenance.status === 'unavailable'"
        class="op65 text-xs"
      >
        {{ state.health.maintenance.reason }}
      </div>
      <div
        v-else-if="state.health && !maintenanceTasks.length"
        class="op50"
      >
        No pass has run yet: the backend component starts one every hour.
      </div>
      <table
        v-if="maintenanceTasks.length"
        class="text-left text-xs"
      >
        <thead class="op50">
          <tr>
            <th class="py1 pr4 font-normal">
              Task
            </th>
            <th class="py1 pr4 font-normal">
              Last pass
            </th>
            <th class="py1 pr4 font-normal">
              Rows pruned
            </th>
            <th class="py1 font-normal">
              In total
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task of maintenanceTasks"
            :key="task.task"
          >
            <td class="py1 pr4">
              {{ TASK_LABELS[task.task] ?? task.task }}
              <SignalBadge
                v-if="task.error"
                signal="err"
                :title="task.error"
              >
                failed
              </SignalBadge>
            </td>
            <td class="py1 pr4 op65">
              {{ when(task.finishedAt) }}
            </td>
            <td class="py1 pr4 font-mono">
              {{ task.pruned ?? '·' }}
            </td>
            <td class="py1 font-mono op65">
              {{ task.totalPruned }}
            </td>
          </tr>
        </tbody>
      </table>
    </PanelCard>

    <PanelCard title="Pages">
      <table class="text-left text-xs">
        <thead class="op50">
          <tr>
            <th class="py1 pr4 font-normal">
              Page
            </th>
            <th class="py1 pr4 font-normal">
              Path
            </th>
            <th class="py1 pr4 font-normal">
              Access
            </th>
            <th class="py1 font-normal">
              Rendered by
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="page of state.info.pages"
            :key="page.key"
          >
            <td class="py1 pr4">
              {{ page.key }}
            </td>
            <td class="py1 pr4 font-mono">
              {{ page.path }}
            </td>
            <td class="py1 pr4 op65">
              {{ page.auth ? 'signed in' : 'public' }}
            </td>
            <td class="py1 op65">
              {{ page.shadowed ? 'your page' : 'the module' }}
            </td>
          </tr>
        </tbody>
      </table>
    </PanelCard>

    <PanelCard title="Wiring">
      <div class="flex gap-2 flex-wrap">
        <SignalBadge
          v-for="entry of wiring"
          :key="entry.label"
          :signal="entry.on ? 'ok' : 'off'"
        >
          {{ entry.label }}
        </SignalBadge>
      </div>
    </PanelCard>
  </template>
</template>
