// THE DOCS ASSISTANT: Docus's built-in assistant (node_modules/docus/modules/
// assistant), on for a build that can reach the model through the AI
// Gateway. One place says when it is on, where it answers, what it takes
// in and what it offers first:
//
// - nuxt.config.ts turns it on by assistantEnabled, points it at the docs
//   MCP's route (shared/docs-mcp.ts), which it calls in-process as the
//   visitor, and hands the FAQ to app config;
// - server/routes/__docus__/assistant.ts is its endpoint: Docus's own,
//   built from Docus's helpers, with the checks below in front, which
//   Docus's handler does not make;
// - server/middleware/0.firewall.ts limits ASSISTANT_API_PATH per IP on
//   Vercel (shared/firewall.ts), and nuxt.config.ts everywhere else;
// - scripts/check-website-agents.mjs holds a build to assistantEnabled;
// - /docs/ship/deploy/vercel describes it as part of the reference setup.
//
// No imports, so plain Node loads it too (the build-output check).

/** Where the assistant's chat endpoint answers: Docus's default, named here so the limits find it. */
export const ASSISTANT_API_PATH = '/__docus__/assistant'

/**
 * The budget of one client IP: questions per window. A question is one
 * request, whatever the model and the docs MCP do to answer it (Docus
 * stops a run at ten steps), and a person asks a few a minute at most.
 */
export const ASSISTANT_RATE_LIMIT = { tokensPerInterval: 10, interval: 60_000 } as const

/**
 * How the assistant reaches its model through the AI Gateway, by what a
 * build sees: a gateway key wherever it is set, or the deployment's own
 * OIDC token on Vercel (keyless). A token pulled into a local env file is
 * not one: it expires within hours, so locally only a key turns the
 * assistant on. On Vercel is shared/vercel.ts's `onVercel`, repeated here
 * as this file imports nothing (test/docs/site-vercel.test.ts holds the
 * two equal): `VERCEL` set, and a `VERCEL_ENV` other than the
 * `development` that `vercel env pull` writes beside the token.
 */
export function assistantCredential(env: Readonly<Record<string, string | undefined>>): 'key' | 'oidc' | undefined {
  if (env.AI_GATEWAY_API_KEY?.trim()) return 'key'
  const onVercel = Boolean(env.VERCEL) && env.VERCEL_ENV !== 'development'
  if (onVercel && env.VERCEL_OIDC_TOKEN?.trim()) return 'oidc'
  return undefined
}

/**
 * Whether a build turns the assistant on: only with a credential. Docus
 * reads the same two names to register its endpoint, so an assistant this
 * turns on always has one, and without a credential the site renders no
 * assistant at all.
 */
export function assistantEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return assistantCredential(env) !== undefined
}

/**
 * The most the endpoint reads of a request, in bytes. The chat sends the
 * whole conversation back with every question, the pages its earlier
 * answers read included (a reference page runs past 150 kB), so the cap is
 * wide: what reaches the model is held far tighter below.
 */
export const ASSISTANT_MAX_BODY = 1_048_576

/** The longest question the endpoint takes, in characters. */
export const ASSISTANT_MAX_QUESTION = 4_000

/**
 * The most of the earlier conversation the model sees with a question: the
 * newest turns, as text, up to this many characters and ASSISTANT_MAX_TURNS
 * turns. The pages earlier answers read are left out: the model reads a
 * page again when a follow-up needs it.
 */
export const ASSISTANT_MAX_HISTORY = 24_000

/** The most earlier turns, questions and answers, the model sees with a question. */
export const ASSISTANT_MAX_TURNS = 12

/** A turn of the conversation as the model takes it: its text alone. */
export interface AssistantTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Why the endpoint refuses a request: its status, a code, and the message the chat shows. */
export interface AssistantRefusal {
  status: 400 | 403 | 405 | 413 | 415
  error: string
  message: string
}

/** A conversation the endpoint cannot take whole: its own message, as the chat shows it. */
export const ASSISTANT_TOO_LONG: AssistantRefusal = {
  status: 413,
  error: 'conversation_too_long',
  message: 'This conversation is too long for the assistant. Clear it and ask again.',
}

/** What the endpoint reads of a request before its body. */
export interface AssistantCaller {
  method: string
  contentType?: string
  /** `Sec-Fetch-Site`, which every current browser sends. */
  fetchSite?: string
  origin?: string
  /** The host the request was sent to. */
  host?: string
}

/**
 * Whether the endpoint refuses a caller before it reads a byte: anything
 * but a JSON POST, and a browser on another site. Another site's page could
 * otherwise spend the model's budget from its visitors' browsers, each from
 * an IP of its own, with a POST that needs no preflight (no content type,
 * or `text/plain`). JSON makes a cross-origin browser ask first, which the
 * site never allows; `Sec-Fetch-Site` (or, from an older browser, `Origin`)
 * says where the page that sent it is. A client that is not a browser sends
 * neither, borrows no visitor's IP, and pays from its own budget.
 */
export function assistantCallerRefusal(caller: AssistantCaller): AssistantRefusal | undefined {
  if (caller.method !== 'POST') return { status: 405, error: 'method_not_allowed', message: 'Ask the assistant with a POST.' }
  if (caller.contentType?.split(';')[0]!.trim().toLowerCase() !== 'application/json') {
    return { status: 415, error: 'unsupported_media_type', message: 'Send the conversation as JSON.' }
  }
  if (caller.fetchSite ? caller.fetchSite !== 'same-origin' && caller.fetchSite !== 'none' : caller.origin !== undefined && originHost(caller.origin) !== caller.host?.toLowerCase()) {
    return { status: 403, error: 'forbidden', message: 'The assistant answers this site\'s own pages only.' }
  }
  return undefined
}

/** The host of an `Origin` header, or `undefined` for `null` and anything else that is not a URL. */
function originHost(origin: string): string | undefined {
  try {
    return new URL(origin).host.toLowerCase()
  }
  catch {
    return undefined
  }
}

/** Whether a value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A chat message's text: its text parts, without the tool calls, the pages they read or anything else. */
function textOf(message: Record<string, unknown>): string {
  if (!Array.isArray(message.parts)) return ''
  return message.parts
    .filter((part): part is { type: 'text', text: string } => isRecord(part) && part.type === 'text' && typeof part.text === 'string')
    .map(part => part.text.trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * What the model sees of a request's conversation, or why the endpoint
 * refuses it. The chat sends every message back with each question, and
 * the client writes all of them, the assistant's own answers included, so
 * none is taken as sent: only the roles the chat writes (a `system` message
 * would steer the model), only their text (a tool result is the page the
 * docs MCP returned, which the model can read again), and of the history
 * only the newest turns that fit ASSISTANT_MAX_HISTORY and
 * ASSISTANT_MAX_TURNS. The question itself, the last message, is the
 * user's, and refused past ASSISTANT_MAX_QUESTION rather than cut.
 */
export function assistantConversation(body: unknown): { turns: AssistantTurn[] } | { refusal: AssistantRefusal } {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return { refusal: { status: 400, error: 'invalid_request', message: 'Send the conversation as a list of messages.' } }
  }
  const turns: AssistantTurn[] = []
  for (const message of body.messages) {
    if (!isRecord(message) || (message.role !== 'user' && message.role !== 'assistant')) {
      return { refusal: { status: 400, error: 'invalid_role', message: 'The assistant takes questions and its own answers, and nothing else.' } }
    }
    turns.push({ role: message.role, content: textOf(message) })
  }
  const question = turns.pop()
  if (question?.role !== 'user' || !question.content) {
    return { refusal: { status: 400, error: 'no_question', message: 'The conversation ends with a question.' } }
  }
  if (question.content.length > ASSISTANT_MAX_QUESTION) {
    return { refusal: { status: 413, error: 'question_too_long', message: `A question is at most ${ASSISTANT_MAX_QUESTION.toLocaleString('en-US')} characters.` } }
  }
  const history: AssistantTurn[] = []
  let room = ASSISTANT_MAX_HISTORY
  for (const turn of turns.reverse()) {
    if (!turn.content) continue
    if (history.length === ASSISTANT_MAX_TURNS || turn.content.length > room) break
    room -= turn.content.length
    history.unshift(turn)
  }
  // The history the model sees opens with a question, as a chat does.
  while (history[0]?.role === 'assistant') history.shift()
  return { turns: [...history, question] }
}

/** A question the assistant offers before the first message, and the page that answers it. */
interface FaqQuestion {
  question: string
  /** The docs route that answers it: test/docs/site-vercel.test.ts holds it to a page. */
  answeredBy: string
}

/**
 * The docs tabs the FAQ leaves out: Reference is where an answer is looked
 * up, not where a first question starts.
 */
export const ASSISTANT_FAQ_LEFT_OUT: readonly string[] = ['Reference']

/**
 * The questions the assistant offers before the first message, by docs
 * tab, in the header's order: the first thing a builder asks in each tab
 * but ASSISTANT_FAQ_LEFT_OUT, each answered by a page of that tab.
 */
export const ASSISTANT_FAQ: ReadonlyArray<{ tab: string, questions: readonly FaqQuestion[] }> = [
  {
    tab: 'Start',
    questions: [
      { question: 'Can I try it without creating any accounts?', answeredBy: '/docs/start/quickstart' },
      { question: 'How do I add nuxt-backend to an existing Nuxt app?', answeredBy: '/docs/start/installation' },
    ],
  },
  {
    tab: 'Services',
    questions: [
      { question: 'Which accounts does my app need, and when?', answeredBy: '/docs/services' },
    ],
  },
  {
    tab: 'Develop',
    questions: [
      { question: 'How do I read sign-in codes without a real inbox?', answeredBy: '/docs/develop/dev-inbox' },
      { question: 'How do I hand my app to a coding agent?', answeredBy: '/docs/develop/agents' },
      { question: 'How do I connect my coding agent to these docs?', answeredBy: '/docs/develop/agents/docs-mcp' },
    ],
  },
  {
    tab: 'Build',
    questions: [
      { question: 'How do sign-in codes and passkeys work?', answeredBy: '/docs/build/auth/sign-in' },
      { question: 'How do I open a page only to signed-in people?', answeredBy: '/docs/build/auth/access/pages' },
      { question: 'How do prepaid credits work?', answeredBy: '/docs/build/billing/credits' },
      { question: 'How do I start a checkout for a plan?', answeredBy: '/docs/build/billing/subscriptions/checkout' },
      { question: 'How do I send a transactional email?', answeredBy: '/docs/build/email/sending' },
      { question: 'How do I charge credits for an AI call?', answeredBy: '/docs/build/ai/metered-actions' },
      { question: 'How do I run work in the background?', answeredBy: '/docs/build/data/jobs' },
      { question: 'How do I restyle the built-in pages?', answeredBy: '/docs/build/ui/customize/tokens' },
    ],
  },
  {
    tab: 'Ship',
    questions: [
      { question: 'What do I check before launching to production?', answeredBy: '/docs/ship/checklist' },
      { question: 'What does this site use from Vercel?', answeredBy: '/docs/ship/deploy/vercel' },
    ],
  },
]

/** The FAQ as Docus's app config takes it: a category per tab, its questions as text. */
export function assistantFaqQuestions(): Array<{ category: string, items: string[] }> {
  return ASSISTANT_FAQ.map(({ tab, questions }) => ({ category: tab, items: questions.map(entry => entry.question) }))
}
