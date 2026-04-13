/// <reference types="vite/client" />

import { describe, expect, test } from 'vitest'
import * as adapter from '../../src/convex-component/adapter'

describe('adapter proxy functions', () => {
  test('exports all required CRUD operations', () => {
    expect(adapter.create).toBeDefined()
    expect(adapter.findOne).toBeDefined()
    expect(adapter.findMany).toBeDefined()
    expect(adapter.updateOne).toBeDefined()
    expect(adapter.updateMany).toBeDefined()
    expect(adapter.deleteOne).toBeDefined()
    expect(adapter.deleteMany).toBeDefined()
  })

  test('each export is a function', () => {
    for (const key of ['create', 'findOne', 'findMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany'] as const) {
      expect(typeof adapter[key]).toBe('function')
    }
  })
})
