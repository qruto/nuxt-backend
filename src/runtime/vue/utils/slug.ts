/**
 * A workspace slug from the name someone typed: lower-cased, every run of
 * characters outside `a-z0-9` one hyphen, none at either end
 * (`"  Acme & Co. "` → `acme-co`). Applying it twice changes nothing, so a
 * slug typed as one comes back as it was.
 *
 * @internal
 */
export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * The slug of a workspace someone creates: its name's ({@link slugify}),
 * else `workspace` for a name with no letter or digit it keeps (`Мастерская`),
 * and eight hex characters after it. Slugs are unique across the
 * deployment, so two accounts' "Acme" must not collide.
 *
 * @internal
 */
export function workspaceSlug(name: string): string {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)), byte => byte.toString(16).padStart(2, '0')).join('')
  return `${slugify(name) || 'workspace'}-${suffix}`
}
