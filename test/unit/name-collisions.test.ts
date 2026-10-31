import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { componentName, nameCollisionFinding, packageNames } from '../../src/name-collisions'

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-names-'))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

const write = (file: string, contents = '') => {
  mkdirSync(dirname(join(rootDir, file)), { recursive: true })
  writeFileSync(join(rootDir, file), contents)
}

describe('name-collisions', () => {
  it('names a component as Nuxt does', () => {
    expect(componentName('AuthForm.vue')).toBe('AuthForm')
    expect(componentName('auth/Form.vue')).toBe('AuthForm')
    expect(componentName('auth/AuthForm.vue')).toBe('AuthForm')
    expect(componentName('pricing-table/index.vue')).toBe('PricingTable')
    expect(componentName('Chart.client.vue')).toBe('Chart')
  })

  it('reads the names the installed package registers, its parts and the Convex module\'s among them', () => {
    const ours = packageNames()
    expect(ours.components.has('AuthForm')).toBe(true)
    expect(ours.components.has('PricingPlanCard')).toBe(true)
    expect(ours.composables.has('useAuth')).toBe(true)
    expect(ours.composables.has('useQuery')).toBe(true)
  })

  it('names each app component and composable that shares a name, and never warns', () => {
    write('app/components/auth/Form.vue', '<template><form /></template>')
    write('app/components/Hero.vue')
    write('app/composables/use-billing.ts', 'export function useBilling() {}\nexport const useMine = () => {}\n')
    write('app/composables/nested/deep.ts', 'export function useAuth() {}\n')
    const reported = nameCollisionFinding(rootDir)
    expect(reported).toMatchObject({ id: 'name-collisions', capability: 'data', status: 'pass' })
    expect(reported.message).toContain('<AuthForm> (app/components/auth/Form.vue)')
    expect(reported.message).toContain('useBilling (app/composables/use-billing.ts)')
    expect(reported.message).not.toContain('Hero')
    expect(reported.message).not.toContain('useMine')
    // Nuxt scans only a folder's top level and its folders' index files.
    expect(reported.message).not.toContain('useAuth')
  })

  it('passes quietly with nothing shared', () => {
    write('components/Hero.vue')
    expect(nameCollisionFinding(rootDir)).toMatchObject({ status: 'pass', message: expect.stringContaining('No app component or composable') })
  })
})
