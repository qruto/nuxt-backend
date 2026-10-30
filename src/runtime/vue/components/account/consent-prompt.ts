/** What `<ConsentPrompt>`'s `consent` slot receives for one kind. */
export interface ConsentSlotContext {
  /** The kind, as `setupAccount({ consents })` names it. */
  kind: string
  /** Its latest version. */
  version: string
  /** What the prompt calls it: the declaration's `title`, else the `consent.kinds.<kind>` label. */
  title: string
  /** Where its document lives. */
  url?: string
  /** `true` for a required kind; otherwise an opt-in. */
  required: boolean
  /** `true` when the account accepted an earlier version: the document changed. */
  changed: boolean
  /** Whether the box is ticked. Nothing is ticked for the person. */
  granted: boolean
  /** Tick the box; the prompt's button saves it. */
  grant: () => void
  /** Untick the box. */
  withdraw: () => void
}

/** `<ConsentPrompt>`'s slots. */
export interface ConsentPromptSlots {
  /** One kind's line: its checkbox, its name and a link to its document. */
  consent: (context: ConsentSlotContext) => unknown
  /** Closes the prompt, after its button. */
  footer: () => unknown
}
