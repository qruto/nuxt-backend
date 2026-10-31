import { nextTick, type Ref, watch } from 'vue'

/**
 * Keeping keyboard focus on the page when the control holding it goes away:
 * a dismissed banner, a gift that was just claimed, a pager button with no
 * page left in its direction. Without a new place, the browser drops focus
 * to `<body>`, and the next Tab starts again from the top of the page.
 */

/** The element that holds keyboard focus inside `region`, or `null`: asked before a change that may remove or disable it. */
export function focusedIn(region: HTMLElement | null): HTMLElement | null {
  if (typeof document === 'undefined' || !region) return null
  const active = document.activeElement
  return active instanceof HTMLElement && region.contains(active) ? active : null
}

/** Whether keyboard focus sits inside `region`: asked before a change that may remove the control holding it. */
export function holdsFocus(region: HTMLElement | null): boolean {
  return focusedIn(region) !== null
}

/** Whether focus has fallen off the page's controls: onto `<body>`, nowhere, or an element no longer in the document. */
export function focusDropped(): boolean {
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  return active === null || active === document.body || !active.isConnected
}

/**
 * Whether `control`, which had focus, has lost it to the page: it was
 * removed, or it became `disabled` while focused (a browser moves focus off
 * a disabled control), or focus fell to `<body>`. Focus the person moved to
 * another control is not lost.
 */
export function focusStranded(control: HTMLElement): boolean {
  if (typeof document === 'undefined') return false
  if (focusDropped()) return true
  return document.activeElement === control && (control as HTMLButtonElement).disabled === true
}

/**
 * Move focus to the sentence that says an outcome, when the control the
 * person pressed went away with it: `remember` is called as they press
 * (before anything changes), and once `settled` turns true the note takes
 * focus if focus was in `root` and has fallen off the page.
 */
export function useOutcomeFocus(root: Ref<HTMLElement | null>, note: Ref<HTMLElement | null>, settled: () => boolean): { remember: () => void } {
  let hadFocus = false
  watch(settled, async (now) => {
    if (!now) return
    await nextTick()
    if (hadFocus && focusDropped()) returnFocus(note.value)
    hadFocus = false
  })
  return {
    remember: () => {
      hadFocus = focusedIn(root.value) !== null
    },
  }
}

/** Put focus on `target` without scrolling the page to it: the place it lands is where the person already is. */
export function returnFocus(target: HTMLElement | null | undefined): void {
  target?.focus({ preventScroll: true })
}

/**
 * A modal `<dialog>`'s focus: `show` remembers the control that had focus,
 * opens the dialog as a modal (`beforeOpen` runs first, when it was closed)
 * and focuses the first element `focus` selects inside it; `hide` gives
 * focus back to that control once the dialog has left the page.
 */
export function useModalFocus(dialog: Ref<HTMLDialogElement | null>): { show: (focus: string, beforeOpen?: () => void) => Promise<void>, hide: () => Promise<void> } {
  let opener: HTMLElement | null = null
  return {
    async show(focus, beforeOpen) {
      const active = document.activeElement
      opener = active instanceof HTMLElement && active !== document.body ? active : null
      await nextTick()
      const element = dialog.value
      if (!element) return
      if (!element.open) {
        beforeOpen?.()
        if (typeof element.showModal === 'function') element.showModal()
        else element.setAttribute('open', '')
      }
      element.querySelector<HTMLElement>(focus)?.focus()
    },
    async hide() {
      const back = opener
      opener = null
      await nextTick()
      if (back?.isConnected) returnFocus(back)
    },
  }
}
