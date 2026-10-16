import type { DocsCollectionItem } from '@nuxt/content'
import type { InjectionKey, Ref } from 'vue'

/** The docs page on screen, which the page provides to its aside. */
export const DOCS_PAGE: InjectionKey<Ref<DocsCollectionItem | null | undefined>> = Symbol('docs-page')

/** A page's last-updated date, as the aside prints it: the same day on the server and in every browser. */
export function formatUpdated(iso: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso))
}
