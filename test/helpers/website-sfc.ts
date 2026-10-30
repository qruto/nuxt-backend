import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'

/**
 * A website component (website/components), compiled the way Nuxt compiles
 * it, its template inlined, for a test to mount. The website leans on
 * Nuxt's auto-imports, which the root app turns off, and its tsconfig
 * extends a .nuxt/ the test job never generates, so the component is not
 * imported but compiled here, with the auto-imported names it reads handed
 * in through `scope` and any module besides `vue` through `modules`. Vitest
 * runs from the repository root, which `file` is relative to.
 */
export function websiteComponent(file: string, scope: Record<string, unknown>, modules: Record<string, unknown> = {}): vue.Component {
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
  const { content } = compileScript(descriptor, { id: file, inlineTemplate: true })
  const { outputText } = ts.transpileModule(content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} as { default?: vue.Component } }
  const load = (id: string) => {
    if (id === 'vue') return vue
    if (id in modules) return modules[id]
    throw new Error(`${file} imports ${id}`)
  }
  new Function('require', 'module', 'exports', ...Object.keys(scope), outputText)(load, module, module.exports, ...Object.values(scope))
  return module.exports.default!
}
