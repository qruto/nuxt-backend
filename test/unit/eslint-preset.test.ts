import convexPlugin from '@convex-dev/eslint-plugin'
import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'
import rootConfig from '../../eslint.config.js'
import { BACKEND_ESLINT_RULES, backendEslint } from '../../src/eslint'
import { BACKEND_FILE_TEMPLATES, LOCAL_BACKEND_FILE_TEMPLATES } from '../../src/templates'

const PREFIX = '@convex-dev/'

/**
 * Plugin rules the preset leaves off, and why. Every rule the plugin ships is
 * either adopted or listed here, so a new upstream rule fails this file until
 * someone decides.
 */
const NOT_ADOPTED: Record<string, string> = {
  'require-access-control': 'off in the upstream recommended set; the scaffold guards through createFunctions',
  'import-wrong-runtime': 'off in the upstream recommended set',
  'no-collect-in-query': 'not in the upstream recommended set',
}

const recommended = (convexPlugin.configs.recommended as unknown as Array<{ rules: Record<string, string> }>)[0]!.rules
const adopted = Object.keys(BACKEND_ESLINT_RULES).map(rule => rule.slice(PREFIX.length))

describe('BACKEND_ESLINT_RULES', () => {
  it('names only rules the plugin ships', () => {
    for (const rule of Object.keys(BACKEND_ESLINT_RULES)) {
      expect(rule.startsWith(PREFIX), rule).toBe(true)
      expect(convexPlugin.rules, rule).toHaveProperty(rule.slice(PREFIX.length))
    }
  })

  it('decides on every rule the plugin ships', () => {
    expect([...adopted, ...Object.keys(NOT_ADOPTED)].sort()).toEqual(Object.keys(convexPlugin.rules).sort())
  })

  it('keeps the upstream recommended levels', () => {
    for (const [rule, level] of Object.entries(BACKEND_ESLINT_RULES)) expect(recommended[rule], rule).toBe(level)
  })

  it('leaves off only what the upstream recommended set leaves off', () => {
    for (const rule of Object.keys(NOT_ADOPTED)) expect(recommended[`${PREFIX}${rule}`] ?? 'off', rule).toBe('off')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(BACKEND_ESLINT_RULES)).toBe(true)
  })
})

describe('backendEslint', () => {
  it('scopes the rules to the functions directory and ignores its codegen', () => {
    const [generated, convex] = backendEslint()
    expect(generated).toEqual({ name: 'nuxt-backend:generated', ignores: ['backend/**/_generated/**'] })
    expect(convex).toMatchObject({
      name: 'nuxt-backend:convex',
      files: ['backend/**/*.ts'],
      ignores: ['backend/**/*.test.ts'],
      rules: BACKEND_ESLINT_RULES,
    })
    expect(convex!.plugins!['@convex-dev']).toBe(convexPlugin)
  })

  it('takes another functions directory, spelled either way', () => {
    for (const functionsDir of ['convex', './convex', 'convex/']) {
      expect(backendEslint({ functionsDir })[1]!.files).toEqual(['convex/**/*.ts'])
    }
  })

  it('lets rule levels override or extend the set', () => {
    const rules = backendEslint({ rules: { '@convex-dev/no-filter-in-query': 'off', '@convex-dev/no-collect-in-query': 'warn' } })[1]!.rules!
    expect(rules['@convex-dev/no-filter-in-query']).toBe('off')
    expect(rules['@convex-dev/no-collect-in-query']).toBe('warn')
    expect(rules['@convex-dev/require-args-validator']).toBe('error')
  })
})

describe('this repository', () => {
  it('lints its own Convex code with the preset', async () => {
    const entries = await rootConfig as Linter.Config[]
    const convex = entries.find(entry => entry.name === 'nuxt-backend:convex')
    expect(convex?.files).toEqual(['src/convex/**/*.ts'])
    expect(convex?.rules).toEqual(BACKEND_ESLINT_RULES)
  })

  it('passes a freshly scaffolded app, in both installations', async () => {
    // The parser the Nuxt config sets for TypeScript, so the scaffold is read
    // the way an app's own `withNuxt(backendEslint())` run reads it. Only the
    // preset's findings and parse errors count: the rest is the app's config.
    const entries = await rootConfig as Linter.Config[]
    const parser = entries.find(entry => entry.languageOptions?.parser && entry.files?.some(glob => String(glob).includes('ts')))?.languageOptions?.parser
    expect(parser).toBeDefined()
    const config: Linter.Config[] = [...backendEslint(), { files: ['**/*.ts'], languageOptions: { parser } }]
    const linter = new Linter({ configType: 'flat' })
    const findings: string[] = []
    let linted = 0
    for (const templates of [BACKEND_FILE_TEMPLATES, LOCAL_BACKEND_FILE_TEMPLATES]) {
      for (const [file, source] of Object.entries(templates)) {
        linted++
        for (const message of linter.verify(source, config, { filename: `backend/${file}` })) {
          if (message.fatal || message.ruleId?.startsWith(PREFIX)) findings.push(`backend/${file}:${message.line} ${message.ruleId ?? 'parse'}: ${message.message}`)
        }
      }
    }
    expect(linted).toBeGreaterThan(10)
    expect(findings).toEqual([])
  })
})
