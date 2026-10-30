import { useRuntimeConfig } from '#imports'
import { createNotesHandler } from './notes'

// The dev server's review-notes endpoint (registered by the try-kit module in
// development only): the file comes from the module, at the repository root,
// and the origin `pnpm try` serves the app at from NUXT_TRY_KIT_ORIGIN.
const tryKit = () => (useRuntimeConfig() as unknown as { tryKit: { notesFile: string, origin?: string } }).tryKit

export default createNotesHandler({
  file: () => tryKit().notesFile,
  dev: import.meta.dev,
  served: () => tryKit().origin || undefined,
})
