/** `<HowDidYouHear>`'s slots. */
export interface HowDidYouHearSlots {
  /** One answer's text, in place of its label; receives the answer's name and its label in the person's language. */
  option: (scope: { option: string, label: string }) => unknown
}

/** An answer's label key: its name in camel case (`ai-assistant` reads `options.aiAssistant`). */
export function optionKey(option: string): string {
  return `source.options.${option.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())}`
}
