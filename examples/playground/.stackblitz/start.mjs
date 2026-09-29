// StackBlitz runs this instead of `npm run dev` (see .stackblitzrc). A browser
// sandbox cannot log in to Convex or run a local backend, so this asks for a
// development deploy key and starts `npm run dev` against that deployment. The
// key lives only in this process's environment; nothing is written to disk.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'

// Readline echoes what it reads. Drop that echo while the key is typed, so the
// key never shows in the terminal.
let hidden = false
const output = new Writable({
  write(chunk, encoding, done) {
    if (!hidden) process.stdout.write(chunk, encoding)
    done()
  },
})
const prompt = createInterface({ input: process.stdin, output, terminal: true })
console.log('\nConnect this playground to a Convex deployment of yours: paste a')
console.log('development deploy key from dashboard.convex.dev → your project →')
console.log('Settings → Deploy keys → Generate a deploy key.\n')

let key
for (;;) {
  process.stdout.write('Development deploy key (hidden): ')
  hidden = true
  key = (await prompt.question('')).trim()
  hidden = false
  process.stdout.write('\n')
  // A production key would push this app's functions over a live deployment.
  if (/^dev:[\w-]+\|/.test(key)) break
  console.log('A development deploy key starts with `dev:<deployment>|`.')
}
prompt.close()

// The deployment the key belongs to. `nuxt-backend dev` reads it to provision
// the deployment's env, and Nuxt derives the backend URLs from it.
const deployment = key.slice(0, key.indexOf('|'))

console.log('\nSign-in checks the page origin against SITE_URL, which `dev` sets to')
console.log('http://localhost:3000. To sign in from this preview, set it to the')
console.log('preview\'s origin once the app is up (in a second terminal):')
console.log('  npx convex env set SITE_URL https://<this preview origin>\n')

spawn('npm run dev', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CONVEX_DEPLOY_KEY: key, CONVEX_DEPLOYMENT: deployment },
}).on('exit', (code) => {
  if (code) console.log('\nRun `node .stackblitz/start.mjs` to try another key.')
  process.exit(code ?? 0)
})
