import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Browser, chromium, type Page } from 'playwright-core'

// The package's stylesheets in a real browser, against an app's own CSS:
// what the cascade layers and the tokens actually compute, which no DOM
// test can tell. The stylesheets load as the module adds them: the tokens
// first (they declare the layer order), the shared rules, then each
// component's; the app's sheet comes after, with Tailwind's layer order.

const sheet = (file: string) => readFileSync(fileURLToPath(new URL(`../../src/runtime/vue/components/${file}`, import.meta.url)), 'utf8')
const PACKAGE = ['tokens.css', 'shared.css', 'auth/AuthForm.css', 'billing/PricingPlanCard.css', 'shell/ConfirmDialog.css'].map(sheet).join('\n')
const TAILWIND_LAYERS = '@layer theme, base, components, utilities;'

let browser: Browser
let page: Page

beforeAll(async () => {
  // CI installs the headless shell playwright-core pins; a machine without it uses its Chrome.
  browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }))
  page = await browser.newPage()
})

afterAll(async () => {
  await browser?.close()
})

/** Render markup under the package's stylesheets and the app's. */
async function render(app: string, body: string): Promise<void> {
  await page.setContent(`<!doctype html><html><head><style>${PACKAGE}</style><style>${TAILWIND_LAYERS}${app}</style></head><body>${body}</body></html>`)
}

/** One computed property of the first element a selector finds. */
const computed = (selector: string, property: string) => page.$eval(selector, (element, name) => getComputedStyle(element).getPropertyValue(name), property)

const FORM = '<div data-backend data-auth="form"><h2 data-auth="title">Sign in</h2><button data-auth="submit">Send code</button><button data-auth="back">Back</button></div>'

describe('the faces', () => {
  it('leave a heading face the app sets in Tailwind\'s base layer alone', async () => {
    await render('body { font-family: "App Body" } @layer base { h2 { font-family: "App Heading" } }', FORM)
    expect(await computed('[data-auth="title"]', 'font-family')).toBe('"App Heading"')
  })

  it('give a heading the page\'s face while the tokens are unset, and the token once set', async () => {
    await render('body { font-family: "App Body" }', FORM)
    expect(await computed('[data-auth="title"]', 'font-family')).toBe('"App Body"')
    await render('body { font-family: "App Body" } :root { --bk-font-heading: "Token Face" }', FORM)
    expect(await computed('[data-auth="title"]', 'font-family')).toBe('"Token Face"')
  })

  it('give a button --bk-font-control, then --bk-font', async () => {
    await render('body { font-family: "App Body" } :root { --bk-font: "Text Face" }', FORM)
    expect(await computed('[data-auth="submit"]', 'font-family')).toBe('"Text Face"')
    await render('body { font-family: "App Body" } :root { --bk-font: "Text Face"; --bk-font-control: "Control Face" }', FORM)
    expect(await computed('[data-auth="submit"]', 'font-family')).toBe('"Control Face"')
  })
})

describe('the shadows', () => {
  it('put --bk-shadow-control under a button drawn as a button, never under a text button', async () => {
    await render(':root { --bk-shadow-control: 2px 2px 0 rgb(0, 0, 0) }', FORM)
    expect(await computed('[data-auth="submit"]', 'box-shadow')).toBe('rgb(0, 0, 0) 2px 2px 0px 0px')
    expect(await computed('[data-auth="back"]', 'box-shadow')).toBe('none')
  })

  it('keep --bk-shadow under the current plan, whose ring is an outline', async () => {
    await render(':root { --bk-shadow: 3px 3px 0 rgb(0, 0, 0) }', '<div data-backend data-pricing="table"><div data-pricing="plan" data-current>Pro</div></div>')
    expect(await computed('[data-pricing="plan"]', 'box-shadow')).toBe('rgb(0, 0, 0) 3px 3px 0px 0px')
    expect(await computed('[data-pricing="plan"]', 'outline-style')).toBe('solid')
    expect(await computed('[data-pricing="plan"]', 'outline-width')).toBe('1px')
  })

  it('cast a dark overlay shadow on a dark page, never a glow of the text colour', async () => {
    await render(':root { color-scheme: dark } body { background: black; color: white }', '<div data-backend><dialog open data-confirm="dialog"><p>Delete it?</p></dialog></div>')
    const shadow = await computed('[data-confirm="dialog"]', 'box-shadow')
    expect(shadow).toMatch(/^(?:rgba\(0, 0, 0, 0\.2\d*\)|color\(srgb 0 0 0 \/ 0\.2\d*\)) 0px 8px 24px 0px$/)
  })
})
