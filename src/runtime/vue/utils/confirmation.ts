import { getCurrentInstance, onBeforeUnmount, shallowRef, type ShallowRef } from 'vue'

/**
 * What asks the person before an action goes ahead: resolves `true` to go
 * ahead. An app passes its own through a component's `confirm` prop.
 */
export type ConfirmFn = (text: string) => boolean | Promise<boolean>

/** The question a `<ConfirmDialog>` shows while it waits on the person. */
export interface ConfirmQuestion {
  text: string
}

/** One component's way of asking before an action: the app's `confirm`, else its own `<ConfirmDialog>`. */
export interface Confirmation {
  /** The question waiting on the person, or `null`: the dialog is open while it is set. */
  question: Readonly<ShallowRef<ConfirmQuestion | null>>
  /** Ask; resolves `true` once the person confirms, `false` when they cancel. */
  ask: (text: string) => Promise<boolean>
  /** The person's answer: what asked settles with it, and the dialog closes. */
  answer: (ok: boolean) => void
}

/**
 * Asking the person before a destructive or far-reaching action, in a
 * styled dialog rather than the browser's `confirm()`: unstyled, and some
 * browsers and automation dismiss it unasked. The app's own `confirm`
 * (`override`, read when asking) wins; otherwise the question waits for the
 * component's `<ConfirmDialog :confirmation>`. One question at a time: a
 * second one while the first is open answers the first `false`, as does
 * the component unmounting. On the server, nothing can answer: `false`.
 *
 * @internal
 */
export function useConfirmation(override?: () => ConfirmFn | undefined): Confirmation {
  const question = shallowRef<ConfirmQuestion | null>(null)
  let settle: ((ok: boolean) => void) | null = null

  const answer = (ok: boolean) => {
    const waiting = settle
    settle = null
    question.value = null
    waiting?.(ok)
  }

  const ask = async (text: string): Promise<boolean> => {
    const own = override?.()
    if (own) return own(text)
    if (typeof window === 'undefined') return false
    answer(false)
    return new Promise<boolean>((resolve) => {
      settle = resolve
      question.value = { text }
    })
  }

  if (getCurrentInstance()) onBeforeUnmount(() => answer(false))
  return { question, ask, answer }
}
