import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dataModelPath = resolve(process.cwd(), 'src/convex-component/_generated/dataModel.ts')
const dataModelContents = readFileSync(dataModelPath, 'utf8')
const patchedContents = dataModelContents.replace(
  'import { AnyDataModel } from "convex/server";',
  'import type { AnyDataModel } from "convex/server";',
)

if (patchedContents !== dataModelContents) {
  writeFileSync(dataModelPath, patchedContents)
}
