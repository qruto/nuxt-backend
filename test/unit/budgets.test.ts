import { describe, expect, it } from 'vitest'
import { ceilingFor, overBudget, readBudgets } from '../../scripts/budgets.mjs'

// budgets.json moves only through `pnpm budgets:update`, so every ceiling is
// the one its measurement implies: a hand-raised ceiling fails here.
describe('budgets.json', () => {
  it.each(Object.entries(readBudgets()))('%s sits 5%% above its measurement', (_name, budget) => {
    expect(budget.ceiling).toEqual(ceilingFor(budget.measured))
  })

  it('reports each limit a measurement goes over', () => {
    const ceiling = { bytes: 1000, files: 10 }
    expect(overBudget({ bytes: 1000, files: 10 }, ceiling)).toEqual([])
    expect(overBudget({ bytes: 1001, files: 11 }, ceiling)).toEqual(['1,001 bytes, ceiling 1,000', '11 files, ceiling 10'])
  })
})
