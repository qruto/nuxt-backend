<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../backend/_generated/api'

definePageMeta({ middleware: 'auth' })

const { client, session } = useAuth()

const { data: preloadedTodos } = await useFetch('/api/todos.preload', {
  key: 'todos.preload',
})
const { data: preloadedUser } = await useFetch('/api/me.preload', {
  key: 'me.preload',
})

const user = usePreloadedAuthQuery(preloadedUser.value!)
const todos = usePreloadedAuthQuery(preloadedTodos.value!)

const createTodo = useMutation(api.todos.create)
const toggleTodo = useMutation(api.todos.toggle)
const removeTodo = useMutation(api.todos.remove)

const newTodo = ref('')

async function addTodo() {
  if (!newTodo.value.trim()) return
  await createTodo({ text: newTodo.value.trim() })
  newTodo.value = ''
}

async function signOut() {
  await client.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <main class="page">
    <header>
      <div>
        <h1>{{ user?.name ?? 'Welcome' }}</h1>
        <p class="muted">
          {{ user?.email ?? session.data?.user.email }}
        </p>
      </div>
      <button
        type="button"
        class="danger"
        @click="signOut"
      >
        Sign out
      </button>
    </header>

    <form @submit.prevent="addTodo">
      <input
        v-model="newTodo"
        placeholder="What needs doing?"
      >
      <button
        type="submit"
        class="primary"
      >
        Add
      </button>
    </form>

    <ul>
      <li
        v-for="todo in todos ?? []"
        :key="todo._id"
      >
        <label>
          <input
            type="checkbox"
            :checked="todo.completed"
            @change="toggleTodo({ id: todo._id })"
          >
          <span :class="{ done: todo.completed }">{{ todo.text }}</span>
        </label>
        <button
          type="button"
          class="remove"
          @click="removeTodo({ id: todo._id })"
        >
          ×
        </button>
      </li>
    </ul>

    <p
      v-if="(todos ?? []).length === 0"
      class="muted empty"
    >
      No todos yet — add one above.
    </p>
  </main>
</template>

<style scoped>
.page { max-width: 540px; margin: 3rem auto; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color); }
h1 { margin: 0; }
form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
input[type="text"], input[type="email"], form input { flex: 1; padding: 0.5rem; border: 1px solid var(--input-border); border-radius: 4px; background: var(--input-bg); color: var(--text-color); }
button.primary { background: var(--primary-color); color: white; border: 1px solid var(--primary-color); padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
button.primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
button.danger { background: var(--danger-color); color: white; border: 1px solid var(--danger-color); padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
button.danger:hover { background: var(--danger-hover); border-color: var(--danger-hover); }
ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; }
li { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--card-bg); transition: background-color 0.2s; }
li:hover { background: var(--card-hover); }
li label { display: flex; align-items: center; gap: 0.75rem; cursor: pointer; flex: 1; }
.done { text-decoration: line-through; color: var(--muted-color); }
.remove { background: none; border: none; color: var(--danger-color); cursor: pointer; font-size: 1.5rem; padding: 0 0.5rem; line-height: 1; font-weight: bold; }
.remove:hover { color: var(--danger-hover); }
.muted { color: var(--muted-color); font-size: 0.875rem; margin: 0; margin-top: 0.25rem; }
.empty { text-align: center; padding: 2rem 0; }
</style>
