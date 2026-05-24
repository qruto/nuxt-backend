<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../backend/_generated/api'

definePageMeta({ middleware: 'auth' })

const { data: preloadedTodos } = await useFetch('/api/todos.preload', {
  key: 'todos.preload',
})

const todos = usePreloadedAuthQuery(preloadedTodos.value!)

const createTodo = useMutation(api.todos.create)
const toggleTodo = useMutation(api.todos.toggle)
const removeTodo = useMutation(api.todos.remove)

const newTodo = ref('')

const done = computed(() => (todos.value ?? []).filter(t => t.completed).length)
const total = computed(() => (todos.value ?? []).length)

async function addTodo() {
  if (!newTodo.value.trim()) return
  await createTodo({ text: newTodo.value.trim() })
  newTodo.value = ''
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div class="api-tag">preloadAuthQuery · useQuery · useMutation</div>
      <h1>Todos</h1>
      <p class="subtitle">
        Preloaded server-side with <code>preloadAuthQuery</code>, then
        hydrated into a live per-user subscription.
      </p>
    </header>

    <!-- stats -->
    <div
      v-if="total > 0"
      class="stats"
    >
      <span class="stat">
        <span class="stat-val">{{ total }}</span>
        <span class="stat-label">total</span>
      </span>
      <span class="stat">
        <span class="stat-val">{{ done }}</span>
        <span class="stat-label">done</span>
      </span>
      <span class="stat">
        <span class="stat-val">{{ total - done }}</span>
        <span class="stat-label">remaining</span>
      </span>
    </div>

    <!-- input -->
    <form @submit.prevent="addTodo">
      <input
        v-model="newTodo"
        placeholder="What needs doing?"
        maxlength="200"
      >
      <button
        type="submit"
        class="btn-primary"
        :disabled="!newTodo.trim()"
      >
        Add
      </button>
    </form>

    <!-- list -->
    <ul v-if="(todos ?? []).length > 0">
      <li
        v-for="todo in todos ?? []"
        :key="todo._id"
        :class="{ completed: todo.completed }"
      >
        <label>
          <span class="checkbox" :class="{ checked: todo.completed }">
            <input
              type="checkbox"
              :checked="todo.completed"
              @change="toggleTodo({ id: todo._id })"
            >
            <span class="checkmark">✓</span>
          </span>
          <span :class="{ done: todo.completed }">{{ todo.text }}</span>
        </label>
        <button
          type="button"
          class="remove-btn"
          @click="removeTodo({ id: todo._id })"
          title="Remove"
        >
          ×
        </button>
      </li>
    </ul>

    <div
      v-else-if="todos !== undefined"
      class="empty"
    >
      <div class="empty-icon">✓</div>
      <p>Nothing to do. Add your first task above.</p>
    </div>

    <div
      v-else
      class="loading"
    >
      Loading…
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 580px; }

.page-header { margin-bottom: 1.5rem; }
.api-tag {
  font-size: 0.68rem;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.06em;
  color: var(--muted-color);
  text-transform: uppercase;
  margin-bottom: 0.4rem;
}
h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.3rem; letter-spacing: -0.02em; }
.subtitle { color: var(--muted-color); font-size: 0.875rem; margin: 0; line-height: 1.5; }
code {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.85em;
  color: var(--accent);
  background: var(--accent-dim);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}

/* Stats row */
.stats {
  display: flex;
  gap: 1.5rem;
  padding: 0.75rem 1rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  margin-bottom: 1rem;
}
.stat { display: flex; flex-direction: column; gap: 0.1rem; }
.stat-val { font-size: 1.25rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 0.7rem; font-weight: 500; color: var(--muted-color); text-transform: uppercase; letter-spacing: 0.05em; }

/* Form */
form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
input[type='text'], form input:not([type='checkbox']) {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 0.9rem;
  transition: border-color var(--transition);
}
input:not([type='checkbox']):focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}
.btn-primary {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background var(--transition), border-color var(--transition);
  white-space: nowrap;
}
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

/* List */
ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 0.875rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  background: var(--card-bg);
  transition: background var(--transition), border-color var(--transition);
  gap: 0.5rem;
}
li:hover { background: var(--card-hover); }
li.completed { opacity: 0.6; }

li label {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

/* Custom checkbox */
.checkbox { position: relative; flex-shrink: 0; }
.checkbox input[type='checkbox'] { position: absolute; opacity: 0; width: 0; height: 0; }
.checkmark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.65rem;
  color: transparent;
  background: var(--input-bg);
  transition: all var(--transition);
}
.checked .checkmark {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.done {
  text-decoration: line-through;
  color: var(--muted-color);
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
li label span:not(.checkbox):not(.checkmark) {
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.remove-btn {
  background: none;
  border: none;
  color: var(--muted-color);
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  transition: color var(--transition), background var(--transition);
  flex-shrink: 0;
}
.remove-btn:hover { color: var(--danger-color); background: var(--danger-dim); }

/* Empty / loading */
.empty {
  text-align: center;
  padding: 3rem 0;
  color: var(--muted-color);
}
.empty-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  opacity: 0.3;
}
.empty p { margin: 0; font-size: 0.875rem; }
.loading { color: var(--muted-color); font-size: 0.875rem; padding: 1rem 0; }
</style>
