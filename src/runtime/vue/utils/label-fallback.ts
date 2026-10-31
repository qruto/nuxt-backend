import { LABELS } from '../../../convex/labels.js'

// The English groups `useLabels` starts with where nothing loads them one by
// one: a unit test, or Vue without Nuxt. In an app, the module loads this
// file as `undefined` (src/nuxt/labels.ts), and each group arrives with the
// code that names it.

/** Every group, or `undefined` in an app's build. */
export const EVERY_GROUP: Partial<Record<string, typeof LABELS[keyof typeof LABELS]>> | undefined = LABELS
