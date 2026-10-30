import type { BackendError } from '../../utils/backend-error'

/** `<UploadField>`'s slots. */
export interface UploadFieldSlots {
  /** The words of the picker button. */
  default: () => unknown
  /** The chosen file, with its progress and the way to cancel. */
  file: (scope: { file: File, progress: number, cancel: () => void }) => unknown
  /** Why the file was refused. */
  error: (scope: { error: BackendError }) => unknown
}
