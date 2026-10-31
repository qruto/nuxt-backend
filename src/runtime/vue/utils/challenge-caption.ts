import { useLabels } from '../composables/use-labels'

/** The human check's caption, in the active language: its own module, so the `auth` labels load with the challenge. */
export const challengeCaption = (): string => useLabels('auth').t('challenge')
