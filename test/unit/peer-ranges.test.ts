import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { satisfies, subset, validRange } from 'semver'
import { describe, expect, it } from 'vitest'

// The upstream ranges this package declares, checked against what is actually
// installed and against what those upstreams declare for each other. A bump
// that leaves the lockfile outside a declared range — or widens our
// better-auth range past what the Convex adapter supports — fails here, before
// a consumer's package manager reports the peer conflict.

interface PackageManifest {
  name: string
  version: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const root = fileURLToPath(new URL('../..', import.meta.url))

function manifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(new URL(path, `file://${root}/`), 'utf8')) as PackageManifest
}

/** The installed copy of a package, as the root `node_modules` resolves it. */
const installed = (name: string) => manifest(`node_modules/${name}/package.json`)

const pkg = manifest('package.json')
const convexDevPackages = Object.keys(pkg.dependencies ?? {}).filter(name => name.startsWith('@convex-dev/'))

describe('peer ranges', () => {
  it('declares valid semver ranges for convex and the auth stack', () => {
    for (const range of [pkg.peerDependencies!.convex, pkg.dependencies!['better-auth']]) {
      expect(validRange(range), range).not.toBeNull()
    }
  })

  it('installs a convex version inside the declared peer range', () => {
    expect(satisfies(installed('convex').version, pkg.peerDependencies!.convex!)).toBe(true)
  })

  it('keeps the better-auth range inside the Convex adapter\'s peer range', () => {
    // `@convex-dev/better-auth` tracks Better Auth minors closely; our range
    // must be a sub-range of its declared peer so both resolve to one copy.
    const adapterRange = installed('@convex-dev/better-auth').peerDependencies!['better-auth']!
    const ourRange = pkg.dependencies!['better-auth']!
    expect(subset(ourRange, adapterRange), `${ourRange} ⊆ ${adapterRange}`).toBe(true)
    expect(satisfies(installed('better-auth').version, ourRange)).toBe(true)
  })

  it('ships the passkey plugin on the same better-auth line', () => {
    // The plugin is versioned in lockstep with Better Auth; a range that
    // drifts from ours pulls a second core version into the lockfile.
    expect(subset(pkg.dependencies!['@better-auth/passkey']!, pkg.dependencies!['better-auth']!)).toBe(true)
  })

  it('lists the Convex component packages', () => {
    expect(convexDevPackages.length).toBeGreaterThanOrEqual(8)
  })

  it.each(convexDevPackages)('%s is installed inside its declared range and accepts the installed convex', (name) => {
    const declared = pkg.dependencies![name]!
    const { version, peerDependencies } = installed(name)
    expect(satisfies(version, declared), `${name}@${version} satisfies ${declared}`).toBe(true)
    // Every component declares a convex peer; the one convex we install must
    // satisfy each, or the consumer's install warns for us.
    const convexPeer = peerDependencies?.convex
    expect(convexPeer, `${name} declares a convex peer`).toBeDefined()
    expect(satisfies(installed('convex').version, convexPeer!), `convex satisfies ${name}'s ${convexPeer}`).toBe(true)
  })
})
