<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { CONSOLE_DETENTS, CONSOLE_GLYPH, CONSOLE_PHONE_ROWS, consoleCommand, consoleSummary, consoleTranscript, foldsOnPhone, typedRows, type ConsoleLine } from '~~/shared/console'

/**
 * The console: turn the dial to an app layer and the LCD types what
 * `npx nuxt-backend doctor --only <layer>` prints for a configured app
 * (shared/console.ts). The page renders the whole transcript. Typing never
 * moves anything: the untyped rest of each row keeps its place, invisible,
 * so the LCD has the size of the whole transcript from the first character.
 * It types when the dial turns, and once on the way in if the LCD was out
 * of sight as the page loaded; a reader who sees it at once keeps it whole.
 * Reduced motion never types. Screen readers get the transcript as the
 * terminal prints it, line by line, and a turn of the dial announces the
 * command and its summary.
 *
 * A phone folds a long transcript to its first six rows and the summary,
 * with a key under the glass that shows all of it: pressed, the LCD grows
 * in place and nothing else moves. The fold is visual only: the transcript
 * a screen reader reads is always whole, and from `sm` up nothing folds.
 */
const layer = ref(CONSOLE_DETENTS[0]!.layer)
const detent = computed(() => CONSOLE_DETENTS.find(entry => entry.layer === layer.value)!)
const options = CONSOLE_DETENTS.map(({ layer, label }) => ({ value: layer, label }))

type Tone = 'command' | ConsoleLine['status'] | 'hint' | 'summary-ok' | 'summary-warn'
interface Row { tone: Tone, text: string }

const rows = computed<Row[]>(() => [
  { tone: 'command', text: `$ ${consoleCommand(detent.value)}` },
  ...detent.value.lines.flatMap((line): Row[] => [
    { tone: line.status, text: `${CONSOLE_GLYPH[line.status]} ${line.title}: ${line.message}` },
    ...(line.fixHint ? [{ tone: 'hint' as const, text: `↳ ${line.fixHint}` }] : []),
  ]),
  { tone: detent.value.lines.every(line => line.status === 'pass') ? 'summary-ok' : 'summary-warn', text: consoleSummary(detent.value.lines) },
])

/** What the terminal prints, line by line, for assistive technology. */
const transcript = computed(() => consoleTranscript(detent.value).filter(Boolean))

// The fold: the reader's choice holds across turns of the dial.
const expanded = ref(false)
const foldable = computed(() => rows.value.length > CONSOLE_PHONE_ROWS + 1)

const LED: Partial<Record<Tone, string>> = { pass: 'led-ok', warn: 'led-warn', fail: 'led-err' }
const INK: Partial<Record<Tone, string>> = { 'warn': 'led-warn', 'fail': 'led-err', 'summary-warn': 'led-warn', 'hint': 'led-warn opacity-75' }

// Typing: the number of characters shown. The server renders them all.
const typed = ref(Number.POSITIVE_INFINITY)
const parts = computed(() => typedRows(rows.value.map(row => row.text), typed.value))

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('qa-reduced')
let timer: ReturnType<typeof setInterval> | undefined
function type() {
  clearInterval(timer)
  if (reducedMotion()) {
    typed.value = Number.POSITIVE_INFINITY
    return
  }
  const total = rows.value.reduce((sum, row) => sum + row.text.length, 0)
  typed.value = 0
  timer = setInterval(() => {
    typed.value += 4
    if (typed.value >= total) clearInterval(timer)
  }, 16)
}

const lcdId = useId()
const lcd = useTemplateRef<ComponentPublicInstance>('lcd')
let observer: IntersectionObserver | undefined
onMounted(() => {
  const screen = lcd.value?.$el as Element | undefined
  if (!screen || reducedMotion()) return
  let first = true
  observer = new IntersectionObserver(([entry]) => {
    const visible = entry?.isIntersecting ?? false
    if (first) {
      first = false
      if (visible) {
        observer?.disconnect()
        return
      }
      // Out of sight: blank it, keeping its size, and type it in view.
      typed.value = 0
      return
    }
    if (!visible) return
    observer?.disconnect()
    type()
  }, { threshold: 0.25 })
  observer.observe(screen)
})

// What a turn of the dial says to assistive technology, once per turn.
const said = ref('')
watch(layer, () => {
  observer?.disconnect()
  type()
  said.value = `${consoleCommand(detent.value)}: ${consoleSummary(detent.value.lines)}`
})
onBeforeUnmount(() => {
  observer?.disconnect()
  clearInterval(timer)
})
</script>

<template>
  <!-- The fold tilts the console toward the reader as it scrolls in, which
       widens it by a pixel or two at the top: the section clips that, so the
       page never pans sideways. -->
  <section class="mx-auto w-full max-w-(--ui-container) overflow-x-clip">
    <div class="home-fold grid gap-8 px-4 py-12 sm:px-6 lg:px-8">
      <div class="grid max-w-[62ch] gap-3">
        <p class="stamp">
          npx nuxt-backend doctor
        </p>
        <EngravedTitle
          text="One command checks it all."
          class="font-display text-3xl font-bold [font-stretch:112%] sm:text-4xl"
        />
        <p class="text-(--ink-dim) text-pretty">
          Turn the dial: each detent runs <code class="whitespace-nowrap">doctor --only</code> for one
          app layer and shows what your terminal prints for an app that is set
          up, warnings and their fixes included.
        </p>
      </div>

      <Console>
        <template #display>
          <Lcd
            :id="lcdId"
            ref="lcd"
            label="Doctor output"
            class="min-h-80 content-start"
          >
            <template
              v-for="(row, index) in rows"
              :key="`${layer}-${index}`"
            >
              <!-- Where a phone folds the transcript: the rows it leaves out. -->
              <div
                v-if="foldable && !expanded && index === rows.length - 1"
                class="lcd-row ps-[22px] sm:hidden"
                aria-hidden="true"
              >
                <span class="px text-base leading-snug">…</span>
              </div>
              <div
                class="lcd-row items-start"
                :class="{ 'mt-2': row.tone.startsWith('summary'), 'ps-[22px]': row.tone === 'hint' || row.tone === 'command', 'max-sm:hidden': !expanded && foldsOnPhone(index, rows.length) }"
                aria-hidden="true"
              >
                <span
                  v-if="LED[row.tone]"
                  class="pxled mt-1.5"
                  :class="LED[row.tone]"
                />
                <span
                  class="px text-base leading-snug wrap-anywhere sm:text-lg"
                  :class="INK[row.tone]"
                >{{ parts[index]!.shown }}<span class="invisible">{{ parts[index]!.rest }}</span></span>
              </div>
            </template>
            <ol class="sr-only">
              <li>$ {{ consoleCommand(detent) }}</li>
              <li
                v-for="(line, index) in transcript"
                :key="index"
              >
                {{ line }}
              </li>
            </ol>
          </Lcd>
          <Key
            v-if="foldable"
            class="mt-5 sm:hidden"
            :pressed="expanded"
            :aria-controls="lcdId"
            @click="expanded = !expanded"
          >
            Show all {{ rows.length }} lines
          </Key>
          <p
            class="sr-only"
            role="status"
          >
            {{ said }}
          </p>
        </template>
        <template #dial>
          <Dial
            v-model="layer"
            :options="options"
            :controls="lcdId"
            label="Layer"
          />
        </template>
        <template #keys>
          <div class="grid w-full gap-3 sm:w-auto">
            <Key :to="detent.docs">
              {{ detent.label }} docs
            </Key>
            <Key to="/docs/reference/cli#doctor">
              Doctor reference
            </Key>
          </div>
        </template>
      </Console>
    </div>
  </section>
</template>
