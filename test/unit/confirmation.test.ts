import { describe, expect, it, vi } from 'vitest'
import { useConfirmation } from '../../src/runtime/vue/utils/confirmation'

// On the server nothing can answer a question: the confirmation resolves
// `false` there, and never opens a dialog. The app's own `confirm` still
// answers wherever it runs.
describe('useConfirmation without a window', () => {
  it('resolves false and asks nothing', async () => {
    expect(typeof window).toBe('undefined')
    const confirmation = useConfirmation()
    await expect(confirmation.ask('Lift the suppression?')).resolves.toBe(false)
    expect(confirmation.question.value).toBeNull()
  })

  it('asks the app\'s own confirm, read when asking', async () => {
    const app: { confirm?: (text: string) => boolean } = {}
    const confirmation = useConfirmation(() => app.confirm)
    await expect(confirmation.ask('First?')).resolves.toBe(false)
    app.confirm = vi.fn(() => true)
    await expect(confirmation.ask('Second?')).resolves.toBe(true)
    expect(app.confirm).toHaveBeenCalledWith('Second?')
  })
})
