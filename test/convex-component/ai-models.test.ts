import { expect, test } from 'vitest'
import { installTestModels } from '../../src/convex/test-models'

// A model on the runtime Convex functions run on: an app's backend loads
// with the AI SDK in the edge runtime. A Vitest run has no deployment URL and
// no gateway key, so the package answers each id with the AI SDK's mock
// instead, and a metered model call is testable without a key or a network
// call: defineBackendTestApp installs it, as here.
installTestModels()

test('the mock streams and reports its cost in the edge runtime, as on a deployment', async () => {
  const { streamText } = await import('ai')
  const { meteredModel, routeModel } = await import('../../src/convex/integrations/ai/models')
  const calls: Parameters<typeof meteredModel>[1] = []
  const result = streamText({ model: meteredModel(routeModel('openai/gpt-5-mini', {}), calls), prompt: 'Hello from the edge' })
  let text = ''
  for await (const chunk of result.textStream) text += chunk
  expect(text).toContain('Hello from the edge')
  expect(calls).toHaveLength(1)
  expect(calls[0]!.usd).toBeGreaterThan(0)
})
