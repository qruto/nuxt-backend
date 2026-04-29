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
      <button type="submit">
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
      class="muted"
    >
      No todos yet — add one above.
    </p>
  </main>
</template>

<style scoped>
.page { max-width: 540px; margin: 3rem auto; font-family: system-ui, sans-serif; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
input[type="text"], form input { flex: 1; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
li { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.6rem; border: 1px solid #eee; border-radius: 4px; }
li label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.done { text-decoration: line-through; color: #999; }
.remove { background: none; border: none; color: #c00; cursor: pointer; font-size: 1.1rem; }
.muted { color: #888; font-size: 0.875rem; margin: 0; }
</style>
