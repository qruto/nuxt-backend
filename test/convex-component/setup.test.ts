/// <reference types="vite/client" />
import { expect, test } from 'vitest'
import component from '../../src/convex/test'

test('the test helper exposes the all-in-one backend component module glob', () => {
  expect(Object.keys(component.modules)).toEqual(['backend'])
  // The glob carries every function module the component tests mount.
  for (const name of ['adapter', 'email', 'billing', 'gifts', 'schema']) {
    expect(Object.keys(component.modules.backend).some(path => path.includes(name))).toBe(true)
  }
})
