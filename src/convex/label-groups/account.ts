import type { LabelTree } from '../label-format.js'

/** `<AccountData>` on the security page: the account's export, and its deletion once the person typed their address. */
const ACCOUNT_LABELS = {
  loading: 'Loading…',
  exportTitle: 'Your data',
  exportNote: 'Download everything this app keeps of your account, in one file. Its link works for an hour.',
  export: 'Export my data',
  exporting: 'Preparing your file…',
  exportReady: 'Your file is ready.',
  download: 'Download your data',
  expires: 'The link works until {time}.',
  deleteTitle: 'Delete account',
  deleteNote: 'Your account is deleted after a waiting period, and you can keep it until then. Then it can\'t be undone: your workspaces no one else belongs to, your files, your activity and your billing records go with it.',
  confirmLabel: 'Type {email} to confirm',
  confirmHint: 'Your address, exactly as it is shown.',
  confirmMismatch: 'That isn\'t your address. Type it exactly as it is shown.',
  delete: 'Delete my account',
  deleting: 'Scheduling the deletion…',
  scheduled: 'Your account is scheduled for deletion.',
  scheduledNote: 'Your account will be deleted on {date}. Until then it works as before.',
  keep: 'Keep my account',
  keeping: 'Keeping your account…',
  kept: 'Your account is kept.',
  filesPart: 'Your files, part {part} of {count}',
  impersonating: 'An administrator acting as this account can\'t export its data or delete it.',
} satisfies LabelTree

export default ACCOUNT_LABELS
