import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
/** A message a settings component shows: its words, and whether it is good news. */
export interface SettingsMessage {
  text: string
  ok: boolean
}

/** A message an action left, kept as how to word it rather than the words. */
export interface MessageNote {
  ok: boolean
  /** The message, read when it renders: a locale switch rewords it. */
  text: () => string
}

/**
 * The message region of a settings component: `note` is what the last
 * action left, and `message` reads it in the active language, so an
 * outcome shown before a locale switch is reworded by it.
 */
export function useSettingsMessage(): { note: ShallowRef<MessageNote | null>, message: ComputedRef<SettingsMessage | null> } {
  const note = shallowRef<MessageNote | null>(null)
  const message = computed(() => (note.value ? { ok: note.value.ok, text: note.value.text() } : null))
  return { note, message }
}
