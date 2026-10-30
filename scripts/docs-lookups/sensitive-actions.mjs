/**
 * Auth › Access › Require a recent sign-in: the sensitive-action table
 * (SENSITIVE_ACTIONS in src/convex/sensitive-actions.ts) as two tables, the
 * auth routes and the scaffold's own functions, every row that asks for a
 * recent sign-in, refuses an administrator's visit or spends a limit. A row that does none of those (a read a visit may use) is
 * left out: it asks nothing of anyone.
 */
import { SENSITIVE_ACTIONS } from '../../src/convex/sensitive-actions.ts'
import { blocks, code, table } from './markdown.mjs'

/** How recent a sign-in a row takes, in words. */
function signInWindow(seconds) {
  if (seconds === null) return 'no'
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`
}

/** The limits a row spends, each with what its bucket is keyed by. */
function limits(limit) {
  if (!limit) return ''
  return Object.entries(limit).map(([key, name]) => `${code(name)} (${key})`).join(', ')
}

/** Whether a row asks anything of anyone. */
const asks = row => row.recentSignIn !== null || row.impersonation === 'refused' || row.limit !== null

/** One table of rows. */
function rowsTable(first, entries) {
  return table([first, 'Recent sign-in', 'Impersonated session', 'Limits'], entries.map(([key, row]) => [
    code(key),
    signInWindow(row.recentSignIn),
    row.impersonation === 'refused' ? 'refused' : 'allowed',
    limits(row.limit),
  ]))
}

/** The routes, then the functions. */
export function sensitiveActionsTable() {
  const entries = Object.entries(SENSITIVE_ACTIONS).filter(([, row]) => asks(row))
  return blocks(
    rowsTable('Auth route', entries.filter(([key]) => key.startsWith('/'))),
    rowsTable('Scaffold function', entries.filter(([key]) => !key.startsWith('/'))),
  )
}
