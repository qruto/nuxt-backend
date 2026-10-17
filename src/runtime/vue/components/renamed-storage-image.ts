import { ConvexImage as StorageImage } from 'nuxt-convex-module/client'
import { renamedComponent } from '../utils/renamed-component'

/**
 * `<ConvexImage>` in development only: renders `<StorageImage>`, the same
 * component under its neutral name, and warns once to rename it.
 *
 * @internal
 */
export const ConvexImage = renamedComponent('ConvexImage', 'StorageImage', StorageImage)
