import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BACKEND_ENV, CONTRACT_ENV_NAMES } from '../../src/env-registry'
import { applyProductionPosture, deploymentEnvId, DOCTOR_SCHEMA_URL, finding, FINDING_SERVICES, FINDINGS, type FindingId } from '../../src/findings'
import { doctorReport } from '../../src/preflight'

// The findings registry against everything that names a finding: the checks
// that emit them, the env registry, the production posture, the docs pages,
// STABILITY.md's frozen list and the published JSON Schema.

const root = fileURLToPath(new URL('../..', import.meta.url))
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const ids = Object.keys(FINDINGS) as FindingId[]

function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((entry) => {
    const path = `${dir}/${entry}`
    if (statSync(join(root, path)).isDirectory()) return walk(path)
    return /\.(?:ts|vue)$/.test(entry) && !entry.endsWith('.test.ts') ? [path] : []
  })
}

/** The checks' sources: everything that can emit a finding, the registry itself left out. */
const checks = walk('src').filter(path => !path.startsWith('src/findings/') && path !== 'src/env-registry.ts').map(read).join('\n')

/** The backticked names between two markers of a page. */
function namesBetween(text: string, from: string, to: string): Set<string> {
  const start = text.indexOf(from)
  const section = text.slice(start, text.indexOf(to, start + from.length))
  return new Set([...section.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)*)`/g)].map(match => match[1]!))
}

describe('the findings registry', () => {
  it('gives every finding a kebab-case id and a known service', () => {
    expect(ids.length).toBeGreaterThan(30)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(FINDING_SERVICES).toContain(FINDINGS[id].service)
    }
  })

  it.each(ids)('%s is emitted by a check', (id) => {
    const fromEnv = CONTRACT_ENV_NAMES.some(name => deploymentEnvId(name) === id)
    expect(fromEnv || checks.includes(`'${id}'`), `no check emits ${id}: drop it from the registry`).toBe(true)
  })

  it('reports each name of the deployment\'s contract with a finding of its own', () => {
    for (const name of CONTRACT_ENV_NAMES) {
      expect(FINDINGS[deploymentEnvId(name)]?.title, name).toBe(`Deployment ${name}`)
      expect(BACKEND_ENV[name].findings, name).toContain(deploymentEnvId(name))
    }
  })

  it('links env names only to registered findings', () => {
    for (const [name, entry] of Object.entries(BACKEND_ENV)) {
      for (const id of entry.findings) expect(ids, `${name} → ${id}`).toContain(id)
    }
  })

  it('builds a reported finding from the registry', () => {
    expect(finding('billing-portal', 'warn', 'Plan changes are off.', 'Turn them on.')).toEqual({
      id: 'billing-portal',
      service: 'billing',
      title: 'Customer portal',
      status: 'warn',
      message: 'Plan changes are off.',
      fixHint: 'Turn them on.',
      docsUrl: 'https://nuxt-backend.dev/d/billing-portal',
    })
  })

  it('fails under --prod only the warns of findings marked for it', () => {
    const reported = [
      finding('email-transport', 'warn', 'No key.'),
      finding('email-transport', 'pass', 'Key set.'),
      finding('deployment-email-from', 'warn', 'No sender.'),
    ]
    expect(applyProductionPosture(reported).map(item => item.status)).toEqual(['fail', 'pass', 'warn'])
  })
})

describe('the findings in the docs', () => {
  it('escalates under --prod exactly what the production page lists', () => {
    const listed = namesBetween(read('website/content/docs/09.ship/3.production/index.md'), 'These findings escalate', 'Everything else')
    expect([...listed].filter(name => (ids as string[]).includes(name)).sort()).toEqual(ids.filter(id => FINDINGS[id].prod === 'fail').sort())
  })

  it('lists every id in the CLI page\'s findings table, where /d/<id> lands', () => {
    const listed = namesBetween(read('website/content/docs/10.reference/09.cli/index.md'), '### Findings', '## `env push`')
    for (const id of ids) expect(listed.has(id), id).toBe(true)
  })

  it('names only registered ids in the first column of that table', () => {
    const page = read('website/content/docs/10.reference/09.cli/index.md')
    const table = page.slice(page.indexOf('### Findings'), page.indexOf('## `env push`'))
    const named = [...table.matchAll(/^\| ([^|]+) \|/gm)]
      .map(match => match[1]!)
      .filter(cell => cell.startsWith('`'))
      .flatMap(cell => [...cell.matchAll(/`([^`]+)`/g)].map(id => id[1]!))
    expect(named.length).toBeGreaterThan(30)
    expect(named.filter(id => !(ids as string[]).includes(id))).toEqual([])
  })

  it('freezes every id under its service in STABILITY.md, and nothing else', () => {
    const stability = read('STABILITY.md')
    const section = stability.slice(stability.indexOf('### 5. Diagnostics'), stability.indexOf('The environment variables the package reads'))
    const frozen: Record<string, string> = {}
    let service = ''
    for (const line of section.split('\n')) {
      const group = line.match(/^- `([a-z]+)`:$/)
      if (group) service = group[1]!
      const item = line.match(/^ {2}- `([a-z0-9-]+)`$/)
      if (item) frozen[item[1]!] = service
    }
    expect(frozen).toEqual(Object.fromEntries(ids.map(id => [id, FINDINGS[id].service])))
  })
})

describe('the JSON Schema', () => {
  const schema = JSON.parse(read('website/public/schemas/doctor.json')) as {
    $id: string
    required: string[]
    properties: Record<string, unknown>
    $defs: { finding: { required: string[], properties: { service: { enum: string[] }, status: { enum: string[] }, id: { pattern: string } } } }
  }
  const item = schema.$defs.finding

  it('is published where the report says', () => {
    expect(schema.$id).toBe(DOCTOR_SCHEMA_URL)
  })

  it('describes a report exactly', () => {
    const report = doctorReport([finding('mcp', 'pass', 'Mounted.')])
    expect(Object.keys(report).sort()).toEqual(Object.keys(schema.properties).sort())
    expect([...schema.required].sort()).toEqual(Object.keys(report).sort())
    expect(Object.keys(report.findings[0]!).sort()).toEqual([...item.required].sort())
    expect(Object.keys(item.properties).sort()).toEqual([...item.required].sort())
  })

  it('names the services and statuses the code has, and admits every id', () => {
    expect(item.properties.service.enum).toEqual(FINDING_SERVICES)
    expect(item.properties.status.enum).toEqual(['pass', 'warn', 'fail'])
    for (const id of ids) expect(id).toMatch(new RegExp(item.properties.id.pattern))
  })
})

describe('the sources', () => {
  it('build no finding by hand: every one goes through finding()', () => {
    // A literal `{ id: …, title: … }` would skip the registry's service and docs link.
    const literal = walk('src').filter(path => !path.startsWith('src/findings/')).filter(path => /\{\s*id: '[a-z-]+',\s*title:/.test(read(path)))
    expect(literal.map(path => relative(root, join(root, path)).split(sep).join('/'))).toEqual([])
  })
})
