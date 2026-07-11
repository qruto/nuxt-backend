<script setup lang="ts">
import { api } from '#backend/api'
import { ref } from 'vue'

definePageMeta({ middleware: 'auth' })

const { user, signOut, hasRole } = useAuth()
const { organizations, current, setActive, create, invite } = useOrganization()

// Live, workspace-scoped data: the `org.query` behind api.projects.list reads
// ctx.organization from identity claims — switching workspaces re-runs it.
const projects = useQuery(api.projects.list, {})
const createProject = useMutation(api.projects.create)
const removeProject = useMutation(api.projects.remove)

const projectName = ref('')
const workspaceName = ref('')
const inviteEmail = ref('')

async function addProject() {
  if (!projectName.value.trim()) return
  await createProject({ name: projectName.value.trim() })
  projectName.value = ''
}

async function addWorkspace() {
  const name = workspaceName.value.trim()
  if (!name) return
  await create({ name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}` })
  workspaceName.value = ''
}

async function sendInvite() {
  if (!inviteEmail.value.trim()) return
  await invite({ email: inviteEmail.value.trim() })
  inviteEmail.value = ''
}

async function logout() {
  await signOut()
  await navigateTo('/')
}
</script>

<template>
  <main>
    <nav>
      <strong>SaaS starter</strong>
      <NuxtLink to="/app/billing">Billing</NuxtLink>
      <NuxtLink
        v-if="hasRole('admin')"
        to="/app/admin"
      >Admin</NuxtLink>
      <span class="spacer" />
      <span class="muted">{{ user?.email }}</span>
      <button @click="logout">
        Sign out
      </button>
    </nav>

    <OrganizationBoundary>
      <template #default="{ workspace }">
        <section>
          <div class="row">
            <label
              class="muted"
              for="workspace"
            >Workspace</label>
            <select
              id="workspace"
              :value="workspace.id"
              @change="setActive(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="entry in organizations"
                :key="entry.id"
                :value="entry.id"
              >
                {{ entry.name }}
              </option>
            </select>
            <form
              class="row"
              @submit.prevent="addWorkspace"
            >
              <input
                v-model="workspaceName"
                placeholder="New workspace"
              >
              <button type="submit">
                Create
              </button>
            </form>
          </div>
          <form
            class="row"
            @submit.prevent="sendInvite"
          >
            <input
              v-model="inviteEmail"
              type="email"
              placeholder="teammate@example.com"
            >
            <button type="submit">
              Invite to {{ workspace.name }}
            </button>
          </form>
        </section>

        <section>
          <h2>Projects in {{ workspace.name }}</h2>
          <form
            class="row"
            @submit.prevent="addProject"
          >
            <input
              v-model="projectName"
              placeholder="Project name"
            >
            <button
              class="primary"
              type="submit"
            >
              Add project
            </button>
          </form>
          <ul>
            <li
              v-for="project in projects ?? []"
              :key="project._id"
            >
              <span>{{ project.name }}</span>
              <span class="spacer" />
              <button @click="removeProject({ id: project._id })">
                Remove
              </button>
            </li>
          </ul>
          <p
            v-if="projects && projects.length === 0"
            class="muted"
          >
            No projects yet — data here is scoped to the active workspace.
          </p>
        </section>
      </template>
      <template #fallback>
        <p class="muted">
          No active workspace yet — it appears on first sign-in.
        </p>
      </template>
    </OrganizationBoundary>

    <p
      v-if="current"
      class="muted"
    >
      Billing follows the workspace: “{{ current.name }}” owns the subscription
      and credits every member shares.
    </p>
  </main>
</template>
