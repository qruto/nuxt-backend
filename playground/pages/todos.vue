<script setup lang="ts">
import { computed, ref } from 'vue'
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
    <PageHeader
      tag="preloadAuthQuery · useQuery · useMutation"
      title="Todos"
    >
      Preloaded server-side with <code>preloadAuthQuery</code>, then hydrated into
      a live per-user subscription. Mutations write straight through.
    </PageHeader>

    <LabPanel
      label="store"
      title="Task list"
      tone="signal"
    >
      <template #actions>
        <span class="stat"><b>{{ total }}</b> total</span>
        <span class="stat"><b class="ok">{{ done }}</b> done</span>
        <span class="stat"><b>{{ total - done }}</b> left</span>
      </template>

      <form
        class="add"
        @submit.prevent="addTodo"
      >
        <input
          v-model="newTodo"
          placeholder="What needs doing?"
          maxlength="200"
        >
        <LabButton
          variant="signal"
          :disabled="!newTodo.trim()"
        >
          Add
        </LabButton>
      </form>

      <ul v-if="(todos ?? []).length > 0">
        <li
          v-for="todo in todos ?? []"
          :key="todo._id"
          :class="{ completed: todo.completed }"
        >
          <label>
            <span
              class="checkbox"
              :class="{ checked: todo.completed }"
            >
              <input
                type="checkbox"
                :checked="todo.completed"
                @change="toggleTodo({ id: todo._id })"
              >
              <span class="checkmark">✓</span>
            </span>
            <span :class="{ doneitem: todo.completed }">{{ todo.text }}</span>
          </label>
          <button
            type="button"
            class="remove"
            title="Remove"
            @click="removeTodo({ id: todo._id })"
          >
            ×
          </button>
        </li>
      </ul>

      <div
        v-else-if="todos !== undefined"
        class="empty"
      >
        <span class="empty-glyph">✓</span>
        <p>Nothing to do. Add your first task above.</p>
      </div>

      <div
        v-else
        class="empty"
      >
        loading…
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.page { max-width: 620px; }

.stat { font-size: 0.74rem; color: var(--ink-dim); }
.stat b { color: var(--ink); font-variant-numeric: tabular-nums; }
.stat b.ok { color: var(--ok); }

.add { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.add input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--ink);
  font-size: 0.9rem;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.add input:focus { outline: none; border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-dim); }

ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem; }
li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: var(--panel);
  transition: border-color var(--transition), background var(--transition);
}
li:hover { border-color: var(--edge-hi); }
li.completed { opacity: 0.55; }
li label { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; flex: 1; min-width: 0; }

.checkbox { position: relative; flex-shrink: 0; line-height: 0; }
.checkbox input { position: absolute; opacity: 0; width: 0; height: 0; }
.checkmark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--edge-hi);
  border-radius: 4px;
  font-size: 0.65rem;
  color: transparent;
  background: var(--input-bg);
  transition: all var(--transition);
}
.checked .checkmark { background: var(--signal); border-color: var(--signal); color: var(--on-signal); }
.doneitem { text-decoration: line-through; color: var(--ink-dim); }
li label span:not(.checkbox):not(.checkmark) {
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.remove {
  background: none;
  border: none;
  color: var(--ink-dim);
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  flex-shrink: 0;
  transition: color var(--transition), background var(--transition);
}
.remove:hover { color: var(--err); background: var(--err-dim); }

.empty { text-align: center; padding: 2.5rem 0; color: var(--ink-dim); font-size: 0.85rem; }
.empty-glyph { display: block; font-size: 1.75rem; opacity: 0.3; margin-bottom: 0.4rem; }
.empty p { margin: 0; }

code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--signal);
  background: var(--signal-dim);
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
}
</style>
