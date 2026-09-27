// The panel's only colours: a signal per element, never an accent. Every
// status the panel shows maps to one of four signals here, once.

export type Signal = 'ok' | 'warn' | 'err' | 'off'

/** The UI kit colour (`n="…"`) for each signal. */
export const SIGNAL_COLOR: Record<Signal, 'green' | 'amber' | 'red' | 'gray'> = {
  ok: 'green',
  warn: 'amber',
  err: 'red',
  off: 'gray',
}

/** The LED fill for each signal. */
export const SIGNAL_LED: Record<Signal, string> = {
  ok: 'bg-green-500',
  warn: 'bg-amber-500',
  err: 'bg-red-500',
  off: 'bg-gray-400',
}

/** Classes bound at runtime, which UnoCSS has to be told about. */
export const SIGNAL_SAFELIST = [
  ...Object.values(SIGNAL_COLOR).map(color => `n-${color}`),
  ...Object.values(SIGNAL_LED),
]

/** A preflight or doctor finding. */
export function findingSignal(status: 'pass' | 'warn' | 'fail'): Signal {
  return status === 'pass' ? 'ok' : status === 'warn' ? 'warn' : 'err'
}

/** A webhook delivery's outcome. A duplicate is a delivery already handled. */
export function outcomeSignal(outcome: string): Signal {
  if (outcome === 'ok') return 'ok'
  if (outcome === 'duplicate') return 'off'
  if (outcome === 'unknown_type') return 'warn'
  return 'err'
}

/** A subscription's state. */
export function subscriptionSignal(billing: { status?: string, cancelAtPeriodEnd?: boolean, isPaused?: boolean } | undefined): Signal {
  const status = billing?.status
  if (!status || status === 'canceled' || status === 'ended') return 'off'
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete' || status === 'incomplete_expired') return 'err'
  if (billing?.isPaused || billing?.cancelAtPeriodEnd || status === 'paused') return 'warn'
  return status === 'active' || status === 'trialing' ? 'ok' : 'warn'
}

/** The backend connection, as the base module reports it. */
export function connectionSignal(connection: string | null | undefined): Signal {
  if (connection === 'connected') return 'ok'
  if (connection === 'reconnecting') return 'warn'
  if (connection === 'closed') return 'err'
  return 'off'
}

/** Words for the connection light. */
export function connectionLabel(connection: string | null | undefined): string {
  switch (connection) {
    case 'connected': return 'Backend connected'
    case 'reconnecting': return 'Backend reconnecting'
    case 'closed': return 'Backend disconnected'
    case 'idle': return 'Backend idle'
    default: return 'Backend connection unknown'
  }
}
