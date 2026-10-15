// The page header's keys (Try live, API, Source) close each page's body in
// a `page-keys` block, for agents reading it as Markdown
// (shared/agent-markdown.ts). The header draws them, so the block draws
// nothing.
export default defineComponent({ name: 'PageKeys', render: () => null })
