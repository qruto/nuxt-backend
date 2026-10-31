import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Every file git would commit, as repo-relative `/` paths: the tracked ones
 * and the new ones it does not ignore, present in the working tree. Build
 * output, `.env.local` and the rest of what `.gitignore` names are not in
 * it, so a check over it holds what a clone of the repository has.
 */
export function repositoryFiles(): string[] {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  // A tracked file deleted in the working tree is still listed until the deletion is staged.
  return [...new Set(listed.split('\0').filter(Boolean))].filter(file => existsSync(file))
}
