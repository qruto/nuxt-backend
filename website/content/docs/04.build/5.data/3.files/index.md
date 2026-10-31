---
title: Files
description: "Let people upload photos and files: checked on the server, stripped of location data, counted against quotas, shown only to who may see them, shared by link and swept when nobody keeps them, on Convex file storage."
kind: landing
capability: data
navigation:
  title: Overview
  icon: i-lucide-folder-up
---

People upload photos, covers and attachments; your app keeps them, shows them and shares some of them. Convex file storage holds the bytes, mints upload URLs and serves file URLs. `setupStorage` adds the backend half in one call: the checks, the owner records, access, share links and cleanup. The base module's `useUpload`, and `<UploadField>` around it, do the browser half.

## How it works

```text
browser              your mutation                    backend component
photo bytes ───────▶ storage.store()   checked, stripped, stored with your row
large file ─▶ URL ─▶ storage.claim()   size and quota now; type and stripping next
                     storage.fileUrl() / signedUrl()  shown to who may see it
                     storage.shareable()              a link anyone holding it opens
                                                      sweep: unclaimed uploads, after a day
```

1. **Store or claim.** A photo goes to your mutation as bytes, and `storage.store` keeps it with your row in one transaction. A large file goes to an upload URL first, and your mutation claims its storage id.
2. **Check.** The size, the type read from the file's bytes, file and byte quotas, and EXIF and GPS data removed from images.
3. **Show.** A file reaches a page only through a check: its owner, a member of its workspace, or your own query that decided. An expiring URL serves a private file for a set time.
4. **Share.** A row you mark `shareable` gets a link its owner turns on, rotates and revokes, with a preview card and the sharer's referral code.
5. **Sweep.** An upload nobody claimed is deleted by the component's maintenance after a day.

## Who does what

| | Convex | The package | Your app |
|---|---|---|---|
| Storing bytes | [File storage](https://docs.convex.dev/file-storage), upload URLs, `ctx.storage` in mutations | Keeps files in the `backend` component's storage, beside their owner records | Nothing |
| Checking uploads | The stored size and the declared type | `maxSize`, `accept` on the sniffed type, `stripMetadata`, file and byte quotas | The limits, and where each file is attached |
| Access | None: a file URL works for whoever holds it | `getFileUrl` for the owner and their workspace; `signedUrl` that expires | Which of your rows point at which file |
| Images | The original bytes | An image provider for `@nuxt/image` | Sizes and formats, in `<NuxtImg>` |
| Sharing | None | Hashed share links, `useShareLink`, preview cards, the share loop | Which tables are shareable, and the public page |
| Cleanup | None | Owner records, `release`, the orphan sweep, export and erasure | When your rows let go of a file |

## In development and in production

Files live on the deployment you run: your dev deployment while you build, the production one once you ship. There is no provider key: the `data` capability reads `test` on a dev deployment and `live` on production ([Capabilities](/docs/start/concepts/capabilities)). Storage and bandwidth count against your Convex plan ([Convex](/docs/services/convex)). A person's files join their [data export](/docs/build/auth/accounts/data), and their account's erasure deletes them.

## In this section

::card-group
  :::card{icon="i-lucide-file-check" title="Accept checked uploads" to="/docs/build/data/files/checked-uploads"}
  `setupStorage`, a photo stored with its row in one mutation, upload URLs and `<UploadField>` for large files.
  :::

  :::card{icon="i-lucide-image" title="Show images" to="/docs/build/data/files/images"}
  `<StorageImage>`, the image provider for `<NuxtImg>`, and expiring private URLs.
  :::

  :::card{icon="i-lucide-link" title="Share by link" to="/docs/build/data/files/share-links"}
  A link to one row, its public page, a preview card and the share loop.
  :::

  :::card{icon="i-lucide-trash-2" title="Keep storage clean" to="/docs/build/data/files/cleanup"}
  Release files with their rows, the orphan sweep, and files in export and erasure.
  :::
::

## Not included

- **Moderation.** What an image shows is content safety: [Keep content safe](/docs/build/ai/content-safety).
- **Image transforms in storage.** Convex serves original bytes; resizing comes from your host's optimizer through the [image provider](/docs/build/data/files/images#resize-with-the-image-provider).
- **Video processing.** No transcoding or streaming formats: store video as a download, or use a video service.
