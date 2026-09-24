// Fail the website build when its stylesheet has lost the house palette.
//
// Docus splices this site's app.css into its own Tailwind entry. Two ways that
// can go wrong without any error: a Docus release that stops compiling the
// splice would ship a literal `@theme` block (dead CSS, every colour back to
// stock Tailwind), and a ramp declared with plain `@theme` instead of
// `@theme static` is emitted only for the shades Tailwind's usage scan finds,
// so the Nuxt UI tokens that read the rest at runtime fall back to stock
// colours. Both change how every page looks and neither fails a build, so
// this reads the built CSS and asserts every shade of every house ramp is
// there with its house value.
//
// The expected shades come from app.css itself — every `--color-<ramp>-<n>`
// declared in any `@theme` block, `static` or not — so a new shade is
// checked the moment it is added, and turning a ramp back into plain `@theme`
// fails here instead of quietly dropping it from the check. A shade missing
// from the output means its ramp is not `static`; a stock Tailwind value in
// its place would mean the splice failed.
//
// Run after `nuxt build website`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const outputDir = 'website/.output/public/_nuxt'

function expectedShades() {
  const source = readFileSync('website/app.css', 'utf8')
  const shades = new Map()
  for (const block of source.matchAll(/@theme(?:\s+static)?\s*\{([^}]*)\}/g)) {
    for (const [, name, value] of block[1].matchAll(/(--color-[a-z]+-\d+)\s*:\s*(#[0-9a-f]{3,8})/gi)) {
      shades.set(name, value.toLowerCase())
    }
  }
  return shades
}

// Minifiers may shorten `#aabbcc` to `#abc`; accept either spelling.
function spellings(hex) {
  const long = hex.length === 7 ? hex : `#${[...hex.slice(1)].map(c => c + c).join('')}`
  const pairs = long.slice(1).match(/../g)
  const short = pairs.every(p => p[0] === p[1]) ? `#${pairs.map(p => p[0]).join('')}` : null
  return [long, short].filter(Boolean)
}

const shades = expectedShades()
if (shades.size === 0) {
  console.error('[check-website-css] no `@theme` colour shades found in website/app.css.')
  process.exit(1)
}

let files
try {
  files = readdirSync(outputDir).filter(name => name.endsWith('.css'))
}
catch {
  console.error(`[check-website-css] ${outputDir} not found — run \`nuxt build website\` first.`)
  process.exit(1)
}
const css = files.map(name => readFileSync(join(outputDir, name), 'utf8')).join('\n').replace(/\s+/g, '').toLowerCase()

const problems = []
if (css.includes('@theme')) problems.push('a literal `@theme` block reached the output (the app.css splice was not compiled)')
for (const [name, hex] of shades) {
  if (!spellings(hex).some(value => css.includes(`${name}:${value}`))) {
    problems.push(`\`${name}\` is missing or not ${hex} (is its ramp \`@theme static\`?)`)
  }
}

if (problems.length) {
  console.error(`[check-website-css] ${files.length} stylesheet(s) in ${outputDir}:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`[check-website-css] OK — ${shades.size} shades present in ${files.length} stylesheet(s).`)
