import { describe, expect, it } from 'vitest'
import { expandForAgents } from '../../website/shared/agent-markdown'
import { AGENT_PROMPT, AGENT_PROVIDERS } from '../../website/shared/agent-prompt'
import { contentFile, read } from './helpers'

// The one-paste install prompt (website/shared/agent-prompt.ts), the links
// that hand it to an agent, and the content hook that writes what a Vue-drawn
// block stands for into the Markdown agents read (`/raw/*.md`,
// `/llms-full.txt`).

describe('the agent install prompt', () => {
  const fence = `\`\`\`text\n${AGENT_PROMPT}\n\`\`\``

  it.each([
    ['the Installation page', contentFile('/getting-started/installation')],
    ['the README', 'README.md'],
  ])('is the prompt %s shows', (_, file) => {
    expect(read(file)).toContain(fence)
  })

  it('installs the skill whose install guide it names', () => {
    expect(AGENT_PROMPT).toContain('--skill nuxt-backend')
    expect(AGENT_PROMPT).toContain('.agents/skills/nuxt-backend/references/install.md')
    expect(read('skills/nuxt-backend/references/install.md')).toMatch(/^# Install nuxt-backend\n/)
  })

  it('hands the whole prompt to each agent link', () => {
    // VS Code and its forks decode the link once more before the handler
    // reads it, so their links carry the prompt encoded twice; every other
    // app reads it encoded once.
    const vscodeFamily = new Set(['vscode:', 'vscode-insiders:', 'vscodium:', 'cursor:', 'windsurf:', 'kiro:', 'antigravity-ide:', 'trae:', 'positron:'])
    for (const { href } of AGENT_PROVIDERS.flatMap(provider => provider.links)) {
      const url = new URL(href)
      const params = url.searchParams
      const prompt = params.get('prompt') ?? params.get('text') ?? params.get('q') ?? params.get('query') ?? ''
      expect(vscodeFamily.has(url.protocol) ? decodeURIComponent(prompt) : prompt, href).toBe(AGENT_PROMPT)
    }
  })

  it('is a prompt Cursor accepts', () => {
    // Cursor's link handler refuses any prompt that mentions an env file.
    expect(AGENT_PROMPT).not.toMatch(/\.env(?:\b|\W)/)
  })
})

describe('Markdown for agents', () => {
  type Node = string | [string, Record<string, unknown>, ...Node[]]
  const page = (...value: Node[]) => ({ type: 'minimark', value })

  it('writes the link a `::playground-link` stands for into it, nested or not', () => {
    const body = page(['note', {}, ['playground-link', { to: '/playground/platform/email', label: 'email delivery' }]])
    expandForAgents(body)
    expect((body.value[0] as Node[])[2]).toEqual(['playground-link', { to: '/playground/platform/email', label: 'email delivery' },
      ['p', {}, 'Try email delivery live in the playground: ', ['a', { href: '/playground/platform/email' }, '/playground/platform/email']],
    ])
  })

  it('writes the open-in-agent links into `:agent-prompt-links`', () => {
    const body = page(['agent-prompt-links', {}])
    expandForAgents(body)
    const links = JSON.stringify(body.value)
    for (const { href, app } of AGENT_PROVIDERS.flatMap(provider => provider.links)) expect(links).toContain(JSON.stringify(['a', { href }, app]))
  })

  it('runs once per block, and leaves other blocks alone', () => {
    const body = page(['playground-link', { to: '/playground' }], ['card', { title: 'x' }])
    expandForAgents(body)
    expandForAgents(body)
    expect(body.value[0]).toHaveLength(3)
    expect(body.value[1]).toEqual(['card', { title: 'x' }])
  })

  it('is used by the site', () => {
    expect(read('website/nuxt.config.ts')).toMatch(/'content:file:afterParse'\(\{ content \}\) \{\s+expandForAgents\(content\.body\)/)
  })
})
