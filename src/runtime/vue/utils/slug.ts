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
