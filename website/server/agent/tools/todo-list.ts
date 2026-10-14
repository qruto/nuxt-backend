import { api } from '#backend/api'

// This app's own agent tool, beside the package's built-ins. It reads the
// signed-in user's todos through the same Convex query the Queries page
// uses: `fetchQuery` runs it with the agent's short-lived token, so
// `ctx.auth` sees that user. No `scope`, so any agent the user connected
// sees it; add one to hide it from agents that were not granted that scope.
export default defineBackendMcpTool({
  name: 'todo-list',
  description: 'List the signed-in user\'s playground todos, newest first, with whether each is done.',
  annotations: { readOnlyHint: true },
  handler: async () => {
    const { fetchQuery } = useBackendMcp()
    const todos = await fetchQuery(api.todos.list)
    return { todos: todos.slice(0, 50).map(todo => ({ text: todo.text, done: todo.completed })) }
  },
})
