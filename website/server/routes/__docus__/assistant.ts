import { readRequestBody } from '@modelcontextprotocol/sdk/server/requestBody.js'
import { streamText } from 'ai'
import { createAssistantResponse, getAssistantDefaultOptions } from 'docus/modules/assistant/runtime/server/utils/assistant'
import { createError, defineEventHandler, getRequestHeader, getRequestHost, type H3Event, setResponseHeader, setResponseStatus, toWebRequest } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { ASSISTANT_MAX_BODY, ASSISTANT_TOO_LONG, assistantCallerRefusal, assistantConversation, type AssistantRefusal } from '../../../shared/assistant'

// The docs assistant's endpoint, at ASSISTANT_API_PATH (shared/assistant.ts):
// Docus's own handler as its reference implementation has it (Docus's
// `getAssistantDefaultOptions` for the model's tools, prompt and steps,
// `createAssistantResponse` for the stream the chat reads), with checks in
// front that Docus's makes none of. It is public, anonymous and billed per
// question, and the chat sends the whole conversation, which the client
// writes, so it refuses another site's pages and anything but a JSON POST,
// reads at most ASSISTANT_MAX_BODY, and hands the model the question and
// the newest text of the conversation only (assistantConversation).
// Docus leaves its own handler out when a route of the site's answers its
// path. A build without a credential turns the assistant off, and this
// route then answers 404 to everything, as no route would.

/** Answer a refused request: its status, and the message the chat shows. */
function refuse(event: H3Event, { status, error, message }: AssistantRefusal): { error: string, message: string } {
  setResponseStatus(event, status)
  if (status === 405) setResponseHeader(event, 'allow', 'POST')
  return { error, message }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.public.assistant?.enabled) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  const caller = assistantCallerRefusal({
    method: event.method,
    contentType: getRequestHeader(event, 'content-type'),
    fetchSite: getRequestHeader(event, 'sec-fetch-site'),
    origin: getRequestHeader(event, 'origin'),
    host: getRequestHost(event, { xForwardedHost: true }),
  })
  if (caller) return refuse(event, caller)
  const body = await readRequestBody(toWebRequest(event), ASSISTANT_MAX_BODY)
  if (body.tooLarge) return refuse(event, ASSISTANT_TOO_LONG)
  let parsed: unknown
  try {
    parsed = JSON.parse(body.text)
  }
  catch {
    parsed = undefined
  }
  const conversation = assistantConversation(parsed)
  if ('refusal' in conversation) return refuse(event, conversation.refusal)
  return createAssistantResponse(streamText({
    ...await getAssistantDefaultOptions(event),
    model: config.assistant.model,
    // Gateway specific, as in Docus's handler.
    providerOptions: { gateway: { caching: 'auto' } },
    messages: conversation.turns,
  }))
})
