// THE AGENT INSTALL PROMPT: the text the Installation page and the README show
// in a ```text fence (test/docs/agent-prompt.test.ts keeps them the same), and
// the links that hand it to an agent. It installs the package's skill, whose
// references/install.md is the install guide; `skills add -y` puts it under
// .agents/skills/.
export const AGENT_PROMPT = [
  'Install nuxt-backend, the all-in-one SaaS backend for Nuxt on Convex, in this project:',
  'run `npx skills add https://nuxt-backend.dev --skill nuxt-backend -y`,',
  'then follow .agents/skills/nuxt-backend/references/install.md.',
].join('\n')

const once = encodeURIComponent(AGENT_PROMPT)
// VS Code and its forks percent-decode a link before the handler parses its
// query, so a prompt encoded once loses everything after its first `&`, `+`
// or `%` there. Encoded twice it arrives whole.
const twice = encodeURIComponent(once)

/** A link that opens an agent in one app with the prompt typed in. It never sends it. */
export interface AgentLink {
  /** The app that opens, under its own mark, so VS Code Insiders is just `Insiders`. */
  app: string
  icon: string
  href: string
}

/** One agent, and every app that takes the prompt for it from a link. */
export interface AgentProvider {
  agent: string
  maker: string
  icon: string
  links: AgentLink[]
}

/**
 * The Claude Code extension handles `/open?prompt=` in whichever VS Code
 * family editor hosts it, so one link per editor, in that editor's scheme.
 */
const claudeCodeIn = (scheme: string) => `${scheme}://anthropic.claude-code/open?prompt=${twice}`
const copilotIn = (scheme: string) => `${scheme}://GitHub.Copilot-Chat/chat?mode=agent&prompt=${twice}`

/**
 * Every agent that takes a prompt from a link and leaves sending it to the
 * reader, most used first. Each was read in the app's or extension's own
 * handler (2026-10-02, for nuxt-convex-module's site, which carries the same
 * list).
 *
 * Left out: Claude Code in the terminal (`claude-cli://` opens in the home
 * directory, and "this project" would be the wrong one); VS Code's Agents
 * window (`vscode://agents/new` drafts with No Workspace unless the link
 * names a folder, and the site cannot know the reader's); Cline, whose link
 * starts the task at once; Augment, whose prompt link is behind a server
 * flag; and the Codex, Gemini, Kilo Code, Amp and Continue extensions,
 * JetBrains, Warp and Grok Build, which take no prompt from a link.
 *
 * `claude://code/new` and Trae's `side-chat` have no documentation page:
 * check them when those apps update.
 */
export const AGENT_PROVIDERS: AgentProvider[] = [
  {
    agent: 'Claude Code',
    maker: 'Anthropic',
    icon: 'i-simple-icons-claude',
    links: [
      { app: 'Claude app', icon: 'i-simple-icons-claude', href: `claude://code/new?q=${once}` },
      { app: 'VS Code', icon: 'i-simple-icons-visualstudiocode', href: claudeCodeIn('vscode') },
      { app: 'Cursor', icon: 'i-simple-icons-cursor', href: claudeCodeIn('cursor') },
      { app: 'Windsurf', icon: 'i-simple-icons-windsurf', href: claudeCodeIn('windsurf') },
      { app: 'Insiders', icon: 'i-simple-icons-visualstudiocode', href: claudeCodeIn('vscode-insiders') },
      { app: 'VSCodium', icon: 'i-simple-icons-vscodium', href: claudeCodeIn('vscodium') },
      { app: 'Kiro', icon: 'i-lucide-app-window', href: claudeCodeIn('kiro') },
      { app: 'Antigravity', icon: 'i-lucide-app-window', href: claudeCodeIn('antigravity-ide') },
      { app: 'Trae', icon: 'i-simple-icons-trae', href: claudeCodeIn('trae') },
      { app: 'Positron', icon: 'i-lucide-app-window', href: claudeCodeIn('positron') },
      { app: 'Web', icon: 'i-lucide-globe', href: `https://claude.ai/code?prompt=${once}` },
    ],
  },
  {
    agent: 'Cursor',
    maker: 'Anysphere',
    icon: 'i-simple-icons-cursor',
    links: [
      { app: 'Cursor', icon: 'i-simple-icons-cursor', href: `cursor://anysphere.cursor-deeplink/prompt?text=${twice}` },
    ],
  },
  {
    agent: 'Codex',
    maker: 'OpenAI',
    icon: 'i-simple-icons-openai',
    links: [
      { app: 'Codex app', icon: 'i-simple-icons-openai', href: `codex://new?prompt=${once}` },
    ],
  },
  {
    agent: 'Copilot',
    maker: 'GitHub',
    icon: 'i-simple-icons-githubcopilot',
    links: [
      { app: 'VS Code', icon: 'i-simple-icons-visualstudiocode', href: copilotIn('vscode') },
      { app: 'Insiders', icon: 'i-simple-icons-visualstudiocode', href: copilotIn('vscode-insiders') },
    ],
  },
  {
    agent: 'Cascade',
    maker: 'Cognition',
    icon: 'i-simple-icons-windsurf',
    links: [
      { app: 'Windsurf', icon: 'i-simple-icons-windsurf', href: `windsurf://cascade?prompt=${twice}` },
    ],
  },
  {
    agent: 'Zed',
    maker: 'Zed Industries',
    icon: 'i-simple-icons-zedindustries',
    links: [
      { app: 'Zed', icon: 'i-simple-icons-zedindustries', href: `zed://agent?prompt=${once}` },
    ],
  },
  {
    agent: 'Trae',
    maker: 'ByteDance',
    icon: 'i-simple-icons-trae',
    links: [
      { app: 'Trae', icon: 'i-simple-icons-trae', href: `trae://trae.ai-ide/side-chat?query=${twice}` },
    ],
  },
]
