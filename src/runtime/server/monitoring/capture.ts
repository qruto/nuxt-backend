import { isReportable, monitoringTags } from '../../monitoring/report'

// Where a failed backend call made from the Nuxt server is reported: every
// reporter registered here, service-neutral. The error-reporting SDK's
// Nitro plugin registers one when the SDK is wired, the dev server's local
// error log another; without either a capture is a no-op.

/** Reports one failed call: the error as it was thrown, and its tags. */
export type BackendReporter = (error: unknown, tags: Record<string, string>) => void

const reporters = new Set<BackendReporter>()

/** Register a reporter; returns its removal. */
export function addBackendReporter(reporter: BackendReporter): () => void {
  reporters.add(reporter)
  return () => reporters.delete(reporter)
}

/**
 * Report a failed backend call made from the server, tagged with the
 * function it ran and its catalog code. A refusal (anything but
 * `unavailable`) is the app working as designed and is not reported. A
 * reporter that throws never hides the call's own failure.
 */
export function captureBackendError(error: unknown, context: { function: string }): void {
  if (reporters.size === 0 || !isReportable(error)) return
  const tags = monitoringTags(error, { function: context.function, source: 'server' })
  for (const reporter of reporters) {
    try {
      reporter(error, tags)
    }
    catch {
      // A reporter's own failure must not replace the call's.
    }
  }
}

/** Run a server-side call, reporting it when it fails; the failure still rejects. */
export async function capturingBackendCall<T>(fn: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  }
  catch (error) {
    captureBackendError(error, { function: fn })
    throw error
  }
}
