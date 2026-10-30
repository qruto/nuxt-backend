/** One review note, as `.review/notes.jsonl` holds it. */
export interface ExportedNote {
  at?: string
  page: string
  selector?: string | null
  text?: string | null
  viewport?: { width: number, height: number }
  note: string
}

/** Where the dev server writes the notes. */
export declare const NOTES_FILE: string
/** The notes in a JSON Lines text, in order; a line that is no note is skipped. */
export declare function parseNotes(text: string): ExportedNote[]
/** The notes as Markdown, grouped by page. */
export declare function notesMarkdown(notes: readonly ExportedNote[]): string
