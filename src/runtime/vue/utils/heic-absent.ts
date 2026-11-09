// What `heic-to` resolves to in an app that has not installed it, an
// optional peer (src/nuxt/photos.ts): `preparePhoto` then opens a HEIC only
// where the browser does (Safari), and refuses it as `unreadable` elsewhere.

/** The HEIC decoder, absent: every call refuses, and `preparePhoto` reads that as a photo this browser can't open. */
export async function heicTo(_options: unknown): Promise<never> {
  throw new Error('heic-to is not installed: install it to open HEIC photos in browsers other than Safari (npm install heic-to).')
}
