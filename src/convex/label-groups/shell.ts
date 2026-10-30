import type { LabelTree } from '../label-format.js'

/**
 * `<AppShell>`: the frame of a signed-in app. Its header holds the app's
 * brand and links, the workspace switcher, the notification bell and the
 * account menu; the menus are disclosures on the browser's native popover.
 */
const SHELL_LABELS = {
  // The first link on the page: it jumps past the header to the page.
  skip: 'Skip to content',
  // The name of the navigation landmark that holds the app's own links.
  navigation: 'Main',
  signIn: 'Sign in',
  // Said while the session is read.
  loading: 'Loading…',
  account: {
    // The button that opens the menu names the account first, so it starts with the words it shows.
    menu: '{name}, account menu',
    heading: 'Account',
    signedInAs: 'Signed in as {email}',
    unnamed: 'Your account',
    profile: 'Profile',
    security: 'Security',
    settings: 'Settings',
    admin: 'Admin console',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    signedOut: 'You were signed out.',
    signOutFailed: 'Could not sign you out. Try again.',
  },
  workspaces: {
    // The button names the workspace in use first, so a screen reader hears where the person is.
    menu: '{name}, switch workspace',
    heading: 'Workspaces',
    // A workspace with no name yet.
    unnamed: 'Untitled workspace',
    current: 'Current',
    roles: {
      owner: 'Owner',
      admin: 'Admin',
      member: 'Member',
    },
    invitations: '{count} invitation waiting | {count} invitations waiting',
    switching: 'Switching…',
    switched: 'Switched to {name}.',
    switchFailed: 'Could not switch workspaces. You are still in {name}.',
    newName: 'New workspace name',
    create: 'Create workspace',
    creating: 'Creating…',
    created: 'Workspace “{name}” created.',
    createFailed: 'Could not create the workspace.',
    manage: 'Manage workspaces',
  },
} satisfies LabelTree

export default SHELL_LABELS
