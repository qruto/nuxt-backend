import { createApp } from 'vue'
import { defineNuxtPlugin, useRouter } from '#app'
import ReviewNotes from './ReviewNotes.vue'
import './review-notes.css'
import { NOTES_ROUTE } from './route'

// The review-notes overlay, in a Vue app of its own beside the site's: it
// is never part of a page's render, so it can't touch hydration, and it
// mounts once, after the site has.
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  nuxtApp.hook('app:mounted', () => {
    const host = document.createElement('div')
    document.body.append(host)
    createApp(ReviewNotes, { route: () => router.currentRoute.value.fullPath, endpoint: NOTES_ROUTE }).mount(host)
  })
})
