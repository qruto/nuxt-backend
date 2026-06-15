/**
 * Minimal synchronous `XMLHttpRequest` stand-in for testing the file-upload
 * helpers without a real network. Created instances are recorded on
 * {@link FakeXhr.instances} so tests can drive progress/success/failure.
 */
export class FakeXhr {
  static instances: FakeXhr[] = []
  static reset(): void {
    FakeXhr.instances = []
  }

  method = ''
  url = ''
  sentBody: unknown = undefined
  headers: Record<string, string> = {}
  status = 0
  responseText = ''
  aborted = false

  upload: { onprogress: ((event: { loaded: number, total: number, lengthComputable: boolean }) => void) | null } = {
    onprogress: null,
  }

  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(key: string, value: string): void {
    this.headers[key] = value
  }

  send(body?: unknown): void {
    this.sentBody = body
    FakeXhr.instances.push(this)
  }

  abort(): void {
    this.aborted = true
    this.onabort?.()
  }

  /** Emit an upload-progress event. */
  emitProgress(loaded: number, total: number): void {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true })
  }

  /** Complete the request successfully with a `{ storageId }` body. */
  resolveWith(storageId: string, status = 200): void {
    this.status = status
    this.responseText = JSON.stringify({ storageId })
    this.onload?.()
  }

  /** Complete the request with a non-2xx status. */
  failWith(status: number, text = ''): void {
    this.status = status
    this.responseText = text
    this.onload?.()
  }

  /** Trigger a transport-level error. */
  networkError(): void {
    this.onerror?.()
  }
}

/**
 * Install {@link FakeXhr} as the global `XMLHttpRequest` and reset the recorded
 * instances. Returns a function that restores the previous global.
 */
export function installFakeXhr(): () => void {
  const host = globalThis as { XMLHttpRequest?: unknown }
  const original = host.XMLHttpRequest
  FakeXhr.reset()
  host.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest
  return () => {
    host.XMLHttpRequest = original
  }
}
