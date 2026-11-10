// What the packaged confirmation groups share: the cancellation's, a plan
// change's, a pause's. Each element carries its component's `data-*` hook,
// and Escape closes the group without reaching a dialog around it.

/** The `data-<family>` hook of one element of a group: `{ 'data-settings': 'confirm-cancel' }`. */
export function familyHook(family: string, value: string): Record<string, string> {
  return { [`data-${family}`]: value }
}

/** A group's keydown: Escape closes it, and goes no further. */
export function closesOnEscape(close: () => void): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    close()
  }
}

/** What a confirmation group's markup reads from the component that offers it. */
export interface ConfirmGroupParts {
  /** The `data-<family>` hook of one element. */
  hook: (value: string) => Record<string, string>
  /** `true` while the group's action is on its way. */
  busy: () => boolean
  /** Escape closes the group. */
  keydown: (event: KeyboardEvent) => void
}

/** A group's hooks, its busy state and its Escape, from the options of the component that offers it. */
export function confirmGroup(options: () => { family: string, isBusy: () => boolean }, close: () => void): ConfirmGroupParts {
  return {
    hook: value => familyHook(options().family, value),
    busy: () => options().isBusy(),
    keydown: closesOnEscape(close),
  }
}
