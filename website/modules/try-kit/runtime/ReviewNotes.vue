<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, ref } from 'vue'

/**
 * The review-notes overlay (dev only, `pnpm try`): press N, or the Note key,
 * to leave a note on the current page about the element under the pointer,
 * or click an element while picking. The note goes to the dev server with
 * the route, a selector for the element, the start of its text and the
 * viewport, and lands in `.review/notes.jsonl`.
 */
const props = defineProps<{
  /** The current route, with its query. */
  route: () => string
  /** The dev server's notes endpoint. */
  endpoint: string
}>()

const root = ref<HTMLElement>()
const textarea = ref<HTMLTextAreaElement>()
const open = ref(false)
const picking = ref(false)
const hovered = ref<Element | null>(null)
const target = ref<Element | null>(null)
const box = ref<{ top: number, left: number, width: number, height: number } | null>(null)
const draft = ref('')
const status = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
const page = ref('')
let returnFocus: Element | null = null

const inOverlay = (node: EventTarget | null) => node instanceof Node && Boolean(root.value?.contains(node))
const editable = (node: EventTarget | null) => node instanceof Element && Boolean(node.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))

/** A selector a reader can find the element by: an id, or a short path of tags, markers and positions. */
function selectorOf(element: Element): string {
  const parts: string[] = []
  for (let node: Element | null = element; node && node !== document.documentElement && parts.length < 6; node = node.parentElement) {
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`)
      break
    }
    let part = node.tagName.toLowerCase()
    const marker = [...node.attributes].find(attribute => /^(?:data-(?!v-)[\w-]+|aria-label|role|name)$/.test(attribute.name))
    if (marker) part += `[${marker.name}="${marker.value.replaceAll('"', '\\"').slice(0, 60)}"]`
    const siblings = node.parentElement ? [...node.parentElement.children].filter(child => child.tagName === node!.tagName) : []
    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
    parts.unshift(part)
  }
  return parts.join(' > ')
}

const snippetOf = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)

const selector = computed(() => target.value ? selectorOf(target.value) : null)
const snippet = computed(() => target.value ? snippetOf(target.value) : '')

function outline(element: Element | null) {
  if (!element) {
    box.value = null
    return
  }
  const rect = element.getBoundingClientRect()
  box.value = { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

function begin(element: Element | null) {
  returnFocus = document.activeElement
  const meaningful = element && element !== document.body && element !== document.documentElement ? element : null
  target.value = meaningful
  picking.value = false
  page.value = props.route()
  outline(meaningful)
  status.value = 'idle'
  open.value = true
  nextTick(() => textarea.value?.focus())
}

function close() {
  open.value = false
  picking.value = false
  target.value = null
  draft.value = ''
  outline(null)
  if (returnFocus instanceof HTMLElement) returnFocus.focus()
  returnFocus = null
}

function togglePicking() {
  if (open.value) return close()
  picking.value = !picking.value
  if (!picking.value) outline(null)
}

async function save() {
  if (status.value === 'saving' || !draft.value.trim()) return
  status.value = 'saving'
  try {
    // fallow-ignore-next-line security-sink -- the dev server's own same-origin notes route; verified 2026-10-19
    const response = await fetch(props.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        page: page.value,
        url: location.href,
        title: document.title,
        selector: selector.value,
        text: snippet.value || null,
        viewport: { width: innerWidth, height: innerHeight },
        note: draft.value,
      }),
    })
    status.value = response.ok ? 'saved' : 'failed'
  }
  catch {
    status.value = 'failed'
  }
  if (status.value === 'saved') setTimeout(close, 700)
}

function onPointerMove(event: PointerEvent) {
  if (inOverlay(event.target)) return
  hovered.value = event.target instanceof Element ? event.target : null
  if (picking.value) outline(hovered.value)
}

function onClick(event: MouseEvent) {
  if (!picking.value || inOverlay(event.target) || !(event.target instanceof Element)) return
  event.preventDefault()
  event.stopPropagation()
  begin(event.target)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && (open.value || picking.value)) {
    event.preventDefault()
    close()
    return
  }
  if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
  if (open.value || editable(event.target)) return
  event.preventDefault()
  begin(hovered.value)
}

const onViewportChange = () => {
  if (open.value || picking.value) outline(open.value ? target.value : hovered.value)
}

// Removed with the overlay. Clicks are caught before the page's own handlers, so picking never follows a link.
useEventListener(document, 'pointermove', onPointerMove, { passive: true })
useEventListener(document, 'click', onClick, { capture: true })
useEventListener(document, 'keydown', onKeydown)
useEventListener(window, 'scroll', onViewportChange, { passive: true, capture: true })
useEventListener(window, 'resize', onViewportChange, { passive: true })

const STATUS = { idle: '', saving: 'Saving…', saved: 'Saved to .review/notes.jsonl', failed: 'Not saved: is the dev server running?' } as const
</script>

<template>
  <div
    ref="root"
    class="trn"
    data-review-notes
  >
    <div
      v-if="box"
      class="trn-box"
      :style="{ top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` }"
      aria-hidden="true"
    />
    <button
      type="button"
      class="trn-key"
      aria-keyshortcuts="N"
      :aria-pressed="picking"
      :title="picking ? 'Click the element to note, or press Escape' : 'Leave a review note (N)'"
      @click="togglePicking"
    >
      {{ picking ? 'Pick an element' : 'Note' }} <kbd>N</kbd>
    </button>
    <form
      v-if="open"
      class="trn-panel"
      role="dialog"
      aria-label="Review note"
      @submit.prevent="save"
      @keydown.meta.enter.prevent="save"
      @keydown.ctrl.enter.prevent="save"
    >
      <p class="trn-where">
        <strong>{{ page }}</strong>
        <span>{{ selector ?? 'the whole page' }}</span>
      </p>
      <p
        v-if="snippet"
        class="trn-snippet"
      >
        “{{ snippet }}”
      </p>
      <label class="trn-label">
        <span>Note</span>
        <textarea
          ref="textarea"
          v-model="draft"
          rows="4"
          placeholder="What should change here?"
        />
      </label>
      <div class="trn-actions">
        <button
          type="submit"
          class="trn-save"
          :aria-disabled="status === 'saving' || !draft.trim() ? 'true' : undefined"
        >
          Save
        </button>
        <button
          type="button"
          @click="close"
        >
          Cancel
        </button>
        <span
          role="status"
          class="trn-status"
        >{{ STATUS[status] }}</span>
      </div>
    </form>
  </div>
</template>
