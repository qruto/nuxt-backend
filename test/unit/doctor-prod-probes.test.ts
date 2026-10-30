import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cspAllows, deploymentOrigins, hstsMaxAge, parseCsp, parseCspList, siteProbeFindings, type SiteProbeInput } from '../../src/cli/probes'
import type { FindingGroup, PreflightFinding } from '../../src/findings'

// doctor --prod's live probes against a local test server (Node http) that
// answers the way a healthy production site does, or the way a broken one
// does. The site is reached as `https://app.test`: the probes' fetch is
// pointed at the server, and every URL it answers with is mapped back, so
// the probes see the origin they asked for.

const PUBLIC = 'https://app.test'
const PRODUCTION = 'https://prod-slug-42.convex.cloud'
const DEV = 'https://dev-slug-1.convex.cloud'

type Shape = 'good' | 'bad'
let shape: Shape = 'good'
let server: Server
let local: string
let asked: string[] = []

/** A page whose inlined runtime config names a deployment, as a built Nuxt app's does. */
const page = (url: string) => `<!doctype html><html><body><div id="__nuxt"></div><script>window.__NUXT__={};window.__NUXT__.config={public:{convex:{url:"${url}",siteUrl:"${url.replace('.cloud', '.site')}"}},app:{baseURL:"\\u002F"}}</script></body></html>`

const GOOD_CSP = `default-src 'self'; connect-src 'self' ${PRODUCTION} ${PRODUCTION.replace('https:', 'wss:')} ${PRODUCTION.replace('.cloud', '.site')}; img-src 'self' data:`

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}) {
  res.writeHead(status, headers)
  res.end(body)
}

const json = (value: unknown) => JSON.stringify(value)

/** The site's answers, by request, in each shape. */
function answer(req: IncomingMessage, res: ServerResponse) {
  const path = (req.url ?? '/').split('?')[0]
  asked.push(`${req.method} ${path}`)
  const good = shape === 'good'
  switch (`${req.method} ${path}`) {
    case 'GET /':
      return good
        ? send(res, 200, page(PRODUCTION), { 'content-type': 'text/html', 'strict-transport-security': 'max-age=15552000; includeSubDomains', 'content-security-policy': GOOD_CSP })
        // Built against dev, a policy of the host's that blocks it, and no HSTS.
        : send(res, 200, page(DEV), { 'content-type': 'text/html', 'content-security-policy': `default-src 'self'; connect-src 'self' https://api.other.test` })
    case 'GET /settings':
      return good
        ? send(res, 302, '', { location: '/login?redirect=/settings' })
        : send(res, 200, page(PRODUCTION), { 'content-type': 'text/html', 'x-vercel-cache': 'HIT' })
    case 'GET /api/backend/health':
      return good
        ? send(res, 200, json({ status: 'degraded', capabilities: { auth: 'live', data: 'live', billing: 'missing' } }), { 'content-type': 'application/json' })
        : send(res, 200, json({ status: 'ok', capabilities: { auth: 'live' }, detail: { auth: { reason: 'x', missingEnv: ['EMAIL_API_KEY'], top: null } } }), { 'content-type': 'application/json' })
    case 'GET /api/auth/ok':
      // A build that knew no backend URL: the proxy has no deployment to forward to.
      return good ? send(res, 200, json({ ok: true }), { 'content-type': 'application/json' }) : send(res, 500, json({ statusCode: 500 }), { 'content-type': 'application/json' })
    case 'GET /llms.txt':
      return good ? send(res, 200, '# Acme\n\n> Docs for agents.\n', { 'content-type': 'text/plain; charset=utf-8' }) : send(res, 404, 'not found')
    default:
      return send(res, 404, 'not found')
  }
}

beforeAll(async () => {
  server = createServer(answer)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

beforeEach(() => {
  shape = 'good'
  asked = []
})

/** The probes' fetch: `https://app.test` is the local server, and the answers say so. */
const fetcher: typeof fetch = async (input, init) => {
  const response = await fetch(String(input).replace(PUBLIC, local), init)
  Object.defineProperty(response, 'url', { value: response.url.replace(local, PUBLIC), configurable: true })
  return response
}

function input(overrides: Partial<SiteProbeInput> = {}): SiteProbeInput {
  return { origin: PUBLIC, backendUrl: PRODUCTION, gatedPath: '/settings', loginPath: '/login', authRoute: '/api/auth', llms: true, wants: () => true, ...overrides }
}

const byId = (findings: PreflightFinding[]) => Object.fromEntries(findings.map(finding => [finding.id, finding]))

describe('the live probes', () => {
  it('pass a site that answers every probe the way production should', async () => {
    const findings = byId(await siteProbeFindings(input(), fetcher))
    expect(Object.fromEntries(Object.entries(findings).map(([id, finding]) => [id, finding.status]))).toEqual({
      'site-https': 'pass',
      'site-csp': 'pass',
      'site-backend-url': 'pass',
      'site-gated-page': 'pass',
      'site-auth-proxy': 'pass',
      'agent-docs': 'pass',
      'monitoring-health': 'pass',
    })
    expect(findings['site-https']!.message).toContain('max-age 15552000')
    expect(findings['monitoring-health']!.message).toContain('degraded')
    // Each one under its own capability, linked to its entry.
    expect(findings['site-csp']).toMatchObject({ capability: 'hosting', docsUrl: 'https://nuxt-backend.dev/d/site-csp' })
    expect(findings['site-gated-page']!.capability).toBe('auth')
    expect(findings['agent-docs']!.capability).toBe('hosting')
    expect(findings['monitoring-health']!.capability).toBe('monitoring')
  })

  it('fail a site that is open, cached, built against dev or leaking the health detail', async () => {
    shape = 'bad'
    const findings = byId(await siteProbeFindings(input(), fetcher))
    expect(findings['site-https']).toMatchObject({ status: 'warn', message: expect.stringContaining('without HSTS') })
    // The page talks to dev: its policy is checked against the deployment it names, and blocks it.
    expect(findings['site-csp']).toMatchObject({ status: 'fail', message: expect.stringContaining('https://dev-slug-1.convex.cloud and wss://dev-slug-1.convex.cloud') })
    // The fix names where such a policy comes from: the module only ever adds the deployment.
    expect(findings['site-csp']!.fixHint).toMatch(/app host or a proxy/)
    expect(findings['site-csp']!.fixHint).not.toMatch(/replaced/)
    expect(findings['site-backend-url']).toMatchObject({ status: 'fail', message: expect.stringContaining(DEV) })
    expect(findings['site-gated-page']).toMatchObject({ status: 'fail', message: expect.stringContaining('x-vercel-cache: HIT') })
    expect(findings['monitoring-health']).toMatchObject({ status: 'fail', message: expect.stringContaining('detail') })
    // env push leaves a value already set, so the fix forces it.
    expect(findings['monitoring-health']!.fixHint).toContain('env push --prod --force BACKEND_ENVIRONMENT')
    // The fix names the package's own variable, never the platform's.
    expect(findings['site-backend-url']!.fixHint).toContain('NUXT_PUBLIC_BACKEND_URL')
    expect(findings['site-backend-url']!.fixHint).not.toContain('CONVEX_DEPLOYMENT')
    expect(findings['agent-docs']).toMatchObject({ status: 'warn', message: expect.stringContaining('answered 404') })
    // The proxy without the deployment's HTTP routes origin: the host names it.
    expect(findings['site-auth-proxy']).toMatchObject({ status: 'fail', capability: 'auth', message: expect.stringContaining('answered 500') })
    expect(findings['site-auth-proxy']!.fixHint).toContain('NUXT_PUBLIC_CONVEX_SITE_URL')
  })

  it('ask the sign-in proxy at the route the app moved it to', async () => {
    const findings = byId(await siteProbeFindings(input({ authRoute: '/auth' }), fetcher))
    expect(findings['site-auth-proxy']).toMatchObject({ status: 'warn', message: expect.stringContaining('no auth proxy is mounted there') })
    expect(asked).toContain('GET /auth/ok')
  })

  it('send only what an anonymous visitor would: no cookie, no token', async () => {
    const seen: Array<Headers> = []
    const recording: typeof fetch = async (url, init) => {
      seen.push(new Headers(init?.headers))
      return fetcher(url, init)
    }
    await siteProbeFindings(input(), recording)
    expect(seen.length).toBeGreaterThan(3)
    for (const headers of seen) {
      expect(headers.has('cookie')).toBe(false)
      expect(headers.has('authorization')).toBe(false)
    }
  })

  it('ask only the groups doctor --only wants', async () => {
    const wants = (group: FindingGroup) => group === 'site'
    const findings = await siteProbeFindings(input({ wants }), fetcher)
    expect(findings.map(finding => finding.id).sort()).toEqual(['agent-docs', 'site-backend-url', 'site-csp', 'site-https'])
    expect(asked).not.toContain('GET /settings')
    expect(asked).not.toContain('GET /api/backend/health')
  })

  it('report a site that does not answer once, and ask nothing else', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError('fetch failed')
    }
    const findings = await siteProbeFindings(input(), down)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ id: 'site-https', status: 'warn', message: expect.stringContaining('unreachable') })
    const monitoringOnly = await siteProbeFindings(input({ wants: group => group === 'monitoring' }), down)
    expect(monitoringOnly.map(finding => finding.id)).toEqual(['monitoring-health'])
  })

  it('say nothing of docs for agents an app neither declares nor serves', async () => {
    shape = 'bad'
    const findings = await siteProbeFindings(input({ llms: false }), fetcher)
    expect(findings.map(finding => finding.id)).not.toContain('agent-docs')
  })

  it('fail a site served over plain HTTP, and warn one that sends visitors to another origin', async () => {
    const plain = byId(await siteProbeFindings(input({ origin: local, wants: group => group === 'site' }), fetch))
    expect(plain['site-https']).toMatchObject({ status: 'fail', message: expect.stringContaining('plain HTTP') })
    // An https site whose root sends the browser to plain HTTP.
    const downgraded: typeof fetch = async (url, init) => fetcher(url, init).then((response) => {
      if (String(url) === `${PUBLIC}/`) Object.defineProperty(response, 'url', { value: 'http://app.test/' })
      return response
    })
    expect(byId(await siteProbeFindings(input({ wants: group => group === 'site' }), downgraded))['site-https']).toMatchObject({ status: 'fail', message: expect.stringContaining('redirects to http://app.test over plain HTTP') })
    // The root redirects to the same server under another name: the browser lands elsewhere.
    const moved: typeof fetch = async (url, init) => {
      if (String(url) === `${PUBLIC}/`) return fetcher(`${PUBLIC}/elsewhere`, init).then((response) => {
        Object.defineProperty(response, 'url', { value: 'https://www.app.test/' })
        return response
      })
      return fetcher(url, init)
    }
    expect(byId(await siteProbeFindings(input({ wants: group => group === 'site' }), moved))['site-https']).toMatchObject({ status: 'warn', message: expect.stringContaining('redirects to https://www.app.test') })
  })
})

/** A fetch that answers the root (and only the root) with `root`, and every other path as the good site does. */
function rootAnswers(root: () => Response): typeof fetch {
  return async (url, init) => {
    if (String(url) !== `${PUBLIC}/`) return fetcher(url, init)
    const response = root()
    Object.defineProperty(response, 'url', { value: `${PUBLIC}/` })
    return response
  }
}

const siteOnly = (group: FindingGroup) => group === 'site'

describe('the live probes, at the edges', () => {
  it('warn, not fail, a policy that lets the WebSocket through only by its https origin', async () => {
    const policy = `default-src 'self'; connect-src 'self' ${PRODUCTION}`
    const findings = byId(await siteProbeFindings(input({ wants: siteOnly }), rootAnswers(() => new Response(page(PRODUCTION), { headers: { 'content-security-policy': policy } }))))
    expect(findings['site-csp']).toMatchObject({ status: 'warn', message: expect.stringContaining('only by its https origin') })
  })

  it('check every policy of a header sent twice, as browsers enforce each', async () => {
    // The module's policy lets the deployment through; the host's second one blocks it.
    const header = `${GOOD_CSP}, connect-src 'self'`
    const findings = byId(await siteProbeFindings(input({ wants: siteOnly }), rootAnswers(() => new Response(page(PRODUCTION), { headers: { 'content-security-policy': header } }))))
    expect(findings['site-csp']).toMatchObject({ status: 'fail' })
    // Two that both let it through pass, a comma never glued to a source.
    const both = `${GOOD_CSP}, frame-ancestors 'none'`
    const passing = byId(await siteProbeFindings(input({ wants: siteOnly }), rootAnswers(() => new Response(page(PRODUCTION), { headers: { 'content-security-policy': both } }))))
    expect(passing['site-csp']!.status).toBe('pass')
  })

  it('leave the policy unjudged when the page reaches the deployment through a custom domain', async () => {
    const custom = 'https://api.acme.test'
    const policy = `default-src 'self'; connect-src 'self' ${custom} wss://api.acme.test`
    const findings = byId(await siteProbeFindings(input({ wants: siteOnly }), rootAnswers(() => new Response(page(custom), { headers: { 'content-security-policy': policy, 'strict-transport-security': 'max-age=15552000' } }))))
    expect(findings['site-backend-url']!.status).toBe('warn')
    expect(findings['site-csp']).toMatchObject({ status: 'pass', message: expect.stringContaining('unknown') })
  })

  it('tell a page built against a deployment in another region', async () => {
    const regional = 'https://dev-slug-1.eu-west-1.convex.cloud'
    const findings = byId(await siteProbeFindings(input({ wants: siteOnly }), rootAnswers(() => new Response(page(regional), { headers: { 'content-security-policy': GOOD_CSP } }))))
    expect(findings['site-backend-url']).toMatchObject({ status: 'fail', message: expect.stringContaining(regional) })
  })

  it('warn a gated page that redirects to a location no browser can read, and probe the rest', async () => {
    const broken: typeof fetch = async (url, init) => String(url) === `${PUBLIC}/settings`
      ? new Response(null, { status: 302, headers: { location: 'http://[' } })
      : fetcher(url, init)
    const findings = byId(await siteProbeFindings(input(), broken))
    expect(findings['site-gated-page']).toMatchObject({ status: 'warn', message: expect.stringContaining('http://[') })
    expect(findings['monitoring-health']!.status).toBe('pass')
  })
})

describe('reading the answers', () => {
  it('reads HSTS lifetimes', () => {
    expect(hstsMaxAge('max-age=31536000; includeSubDomains; preload')).toBe(31536000)
    expect(hstsMaxAge('includeSubDomains; max-age="600"')).toBe(600)
    expect(hstsMaxAge(null)).toBeNull()
    expect(hstsMaxAge('includeSubDomains')).toBeNull()
  })

  it('lets a connection through the way browsers do', () => {
    const self = PUBLIC
    const allows = (policy: string, target: string) => cspAllows(parseCsp(policy), target, self)
    expect(allows(`connect-src 'self' ${PRODUCTION}`, PRODUCTION)).toBe(true)
    expect(allows(`connect-src 'self' ${PRODUCTION}`, 'wss://prod-slug-42.convex.cloud')).toBe(false)
    expect(allows('connect-src https://*.convex.cloud wss://*.convex.cloud', 'wss://prod-slug-42.convex.cloud')).toBe(true)
    expect(allows('connect-src https: wss:', PRODUCTION)).toBe(true)
    expect(allows('connect-src http:', PRODUCTION)).toBe(true)
    expect(allows('connect-src *', 'wss://prod-slug-42.convex.cloud')).toBe(true)
    expect(allows('connect-src \'none\'', PRODUCTION)).toBe(false)
    // connect-src unset falls back to default-src; neither set restricts nothing.
    expect(allows('default-src \'self\'', PRODUCTION)).toBe(false)
    expect(allows('img-src \'self\'', PRODUCTION)).toBe(true)
    expect(allows(`connect-src 'self'`, `${PUBLIC}/api`)).toBe(true)
    // The first directive of a name wins, as in browsers.
    expect(allows(`connect-src 'none'; connect-src ${PRODUCTION}`, PRODUCTION)).toBe(false)
  })

  it('splits a header sent twice into its policies', () => {
    const policies = parseCspList(`connect-src 'self' https://x.convex.cloud wss://x.convex.cloud, frame-ancestors 'none'`)
    expect(policies).toHaveLength(2)
    expect(policies[0]!.get('connect-src')).toEqual(['\'self\'', 'https://x.convex.cloud', 'wss://x.convex.cloud'])
    expect(policies[1]!.get('frame-ancestors')).toEqual(['\'none\''])
  })

  it('finds the deployments a page names, escaped or not', () => {
    expect(deploymentOrigins(page(PRODUCTION))).toEqual([PRODUCTION])
    expect(deploymentOrigins('url:"https:\\u002F\\u002Fprod-slug-42.convex.cloud"')).toEqual([PRODUCTION])
    expect(deploymentOrigins('url:"https:\\/\\/Dev-Slug-1.convex.cloud"')).toEqual([DEV])
    expect(deploymentOrigins('<p>no backend</p>')).toEqual([])
    // A deployment outside the default region carries it as a label.
    expect(deploymentOrigins('url:"https://prod-slug-42.eu-west-1.convex.cloud"')).toEqual(['https://prod-slug-42.eu-west-1.convex.cloud'])
  })
})
