// Fail the website build when its stylesheet has lost the house palette.
//
// Docus splices this site's app.css into its own Tailwind entry. Two ways that
// can go wrong without any error: a Docus release that stops compiling the
// splice would ship a literal `@theme` block (dead CSS, every colour back to
// stock Tailwind), and a ramp declared with plain `@theme` instead of
// `@theme static` is emitted only for the shades Tailwind's usage scan finds,
// so the Nuxt UI tokens that read the rest at runtime fall back to stock
// colours. Both change how every page looks and neither fails a build, so
// this reads the built CSS and asserts the palette is really there.
//
// Run after `nuxt build website`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'website/.output/public/_nuxt'

// One house value per ramp. A stock Tailwind value in its place would mean the
// splice failed; a missing one, that the ramp is not `static`. `zinc-800` is
// the shade that proved it: no utility class uses it, so plain `@theme`
// dropped it while Nuxt UI's neutral tokens still read it at runtime.
const sentinels = {
  'neutral (zinc)': '--color-zinc-800:#232323',
  'green': '--color-green-500:#136d36',
  'amber': '--color-amber-500:#845007',
  'red': '--color-red-500:#a1302d',
}

let files
try {
  files = readdirSync(dir).filter(name => name.endsWith('.css'))
}
catch {
  console.error(`[check-website-css] ${dir} not found — run \`nuxt build website\` first.`)
  process.exit(1)
}
const css = files.map(name => readFileSync(join(dir, name), 'utf8')).join('\n').replace(/\s+/g, '')

const problems = []
if (css.includes('@theme')) problems.push('a literal `@theme` block reached the output (the app.css splice was not compiled)')
for (const [ramp, sentinel] of Object.entries(sentinels)) {
  if (!css.includes(sentinel)) problems.push(`the ${ramp} ramp is missing \`${sentinel}\` (declare it with \`@theme static\`)`)
}

if (problems.length) {
  console.error(`[check-website-css] ${files.length} stylesheet(s) in ${dir}:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`[check-website-css] OK — ${Object.keys(sentinels).length} ramps present in ${files.length} stylesheet(s).`)
