import { setupStorage } from 'nuxt-backend/storage'
import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { isDemo } from './demo'
import { routes } from './routes'

const MB = 1024 * 1024

// Convex stores the files; the package checks the size and the sniffed type
// after the upload, counts each workspace's files and bytes against a
// quota, strips EXIF and GPS data from images, and deletes files nobody
// claims. A mutation of yours keeps a file with `storage.claim`.
export const storage = setupStorage<DataModel>(components, {
  maxSize: 8 * MB,
  accept: ['image/jpeg', 'image/png', 'image/webp'],
  quota: { files: 200, bytes: 500 * MB },
  stripMetadata: true,
})

// A finished strip can be shared by a link: a long random token in a URL
// under routes.share (/s). Anyone with it reads the strip, without an
// account, until the author turns the link off. The public demo shares
// nothing: a link there would publish whatever anyone drew.
storage.shareable('strips', {
  path: routes.share,
  canShare: (ctx, strip) => !isDemo() && strip.authorId === ctx.user.id && strip.status === 'ready',
})

// The functions useUpload, <UploadField> and <StorageImage> call, and the
// ones behind useShareLink.
export const { generateUploadUrl, getFileUrl, getShareLink, enableShareLink, revokeShareLink } = storage.api
