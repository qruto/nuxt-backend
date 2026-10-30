import { isPackageManager, PM_STORAGE_KEY, type PackageManager } from '~~/shared/pm'

/**
 * The package manager the reader's commands are shown for, shared by the
 * header, the drawer and every converted block (shared/pm.ts).
 *
 * The page renders npm and the head script sets `html[data-pm]` before the
 * first paint, so CSS shows the reader's pick before any of this runs. The
 * state follows once the app has mounted (plugins/package-manager.ts),
 * so hydration sees what the server rendered. `choose` writes the pick
 * everywhere at once: the state, `data-pm`, localStorage (whose `storage`
 * event moves the reader's other tabs) and a polite announcement.
 */
export function usePackageManager() {
  const pm = useState<PackageManager>('package-manager', () => 'npm')
  const announcement = useState('package-manager-announcement', () => '')

  /** Show `next`, here and in every tab the next time it reads the storage. */
  function choose(next: PackageManager) {
    if (!isPackageManager(next)) return
    pm.value = next
    document.documentElement.setAttribute('data-pm', next)
    try {
      localStorage.setItem(PM_STORAGE_KEY, next)
    }
    catch {
      // Storage blocked: the pick lasts for this page.
    }
    announcement.value = `Commands now show ${next}.`
  }

  return { pm, announcement, choose }
}
