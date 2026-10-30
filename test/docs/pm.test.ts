import { describe, expect, it } from 'vitest'
import { convertBlock, convertCommand, convertLines, isPackageManager, PACKAGE_MANAGERS, PM_HEAD_SCRIPT, PM_STORAGE_KEY } from '../../website/shared/pm'

// The converter behind the docs' package-manager picker (website/shared/pm.ts):
// an npm-form command to npm's, pnpm's, yarn's and bun's, or null when it
// cannot say with confidence, so the block stays as written.

/** A command as each manager runs it, npm first. */
const each = (command: string) => PACKAGE_MANAGERS.map(pm => convertCommand(command, pm))

describe('installs', () => {
  it.each([
    ['npm install x', 'pnpm add x', 'yarn add x', 'bun add x'],
    ['npm i x', 'pnpm add x', 'yarn add x', 'bun add x'],
    ['npm add x y', 'pnpm add x y', 'yarn add x y', 'bun add x y'],
    ['npm i -D x', 'pnpm add -D x', 'yarn add -D x', 'bun add -d x'],
    ['npm install --save-dev x', 'pnpm add -D x', 'yarn add -D x', 'bun add -d x'],
    ['npm install -D vitest @nuxt/test-utils', 'pnpm add -D vitest @nuxt/test-utils', 'yarn add -D vitest @nuxt/test-utils', 'bun add -d vitest @nuxt/test-utils'],
    ['npm install -E nuxt-backend@0.2.0', 'pnpm add -E nuxt-backend@0.2.0', 'yarn add -E nuxt-backend@0.2.0', 'bun add --exact nuxt-backend@0.2.0'],
    ['npm install nuxt-backend@latest', 'pnpm add nuxt-backend@latest', 'yarn add nuxt-backend@latest', 'bun add nuxt-backend@latest'],
    ['npm install https://pkg.pr.new/qruto/nuxt-backend@123', 'pnpm add https://pkg.pr.new/qruto/nuxt-backend@123', 'yarn add https://pkg.pr.new/qruto/nuxt-backend@123', 'bun add https://pkg.pr.new/qruto/nuxt-backend@123'],
    ['npm install', 'pnpm install', 'yarn install', 'bun install'],
    ['npm uninstall x', 'pnpm remove x', 'yarn remove x', 'bun remove x'],
  ])('%s', (npm, pnpm, yarn, bun) => {
    expect(each(npm)).toEqual([npm, pnpm, yarn, bun])
  })

  it('leaves a flag it does not know, or a global install, to npm', () => {
    for (const command of ['npm install -g nuxi', 'npm install --legacy-peer-deps x', 'npm install -D', 'npm uninstall -D x', 'npm ci', 'npm view nuxt-backend dist', 'npm exec nuxt', 'npm update', 'npm', 'npm init']) {
      expect(convertCommand(command, 'pnpm'), command).toBeNull()
    }
  })
})

describe('project scripts', () => {
  it.each([
    ['npm run dev', 'pnpm dev', 'yarn dev', 'bun run dev'],
    ['npm run build', 'pnpm build', 'yarn build', 'bun run build'],
    ['npm test', 'pnpm test', 'yarn test', 'bun run test'],
    ['npm start', 'pnpm start', 'yarn start', 'bun run start'],
    // A script named like a command of the manager's own runs through `run`.
    ['npm run deploy', 'pnpm run deploy', 'yarn run deploy', 'bun run deploy'],
    ['npm run doctor', 'pnpm run doctor', 'yarn run doctor', 'bun run doctor'],
  ])('%s', (npm, pnpm, yarn, bun) => {
    expect(each(npm)).toEqual([npm, pnpm, yarn, bun])
  })

  it('passes what follows `--` to the script, without the `--`', () => {
    expect(each('npm run dev -- --port 3001')).toEqual(['npm run dev -- --port 3001', 'pnpm dev --port 3001', 'yarn dev --port 3001', 'bun run dev --port 3001'])
    expect(each('npm test -- --run')).toEqual(['npm test -- --run', 'pnpm test --run', 'yarn test --run', 'bun run test --run'])
  })

  it('leaves npm to a script whose arguments npm itself would read', () => {
    expect(convertCommand('npm run dev --port 3001', 'pnpm')).toBeNull()
    expect(convertCommand('npm run --silent dev', 'pnpm')).toBeNull()
    expect(convertCommand('npm run', 'pnpm')).toBeNull()
  })
})

describe('new projects', () => {
  it('passes the initializer\'s flags without npm\'s `--`, and yarn takes no version', () => {
    expect(each('npm create nuxt@latest my-app -- -t gh:qruto/nuxt-backend/templates/starter')).toEqual([
      'npm create nuxt@latest my-app -- -t gh:qruto/nuxt-backend/templates/starter',
      'pnpm create nuxt@latest my-app -t gh:qruto/nuxt-backend/templates/starter',
      'yarn create nuxt my-app -t gh:qruto/nuxt-backend/templates/starter',
      'bun create nuxt@latest my-app -t gh:qruto/nuxt-backend/templates/starter',
    ])
    expect(each('npm create nuxt -- --template=gh:x/y')).toEqual(['npm create nuxt -- --template=gh:x/y', 'pnpm create nuxt --template=gh:x/y', 'yarn create nuxt --template=gh:x/y', 'bun create nuxt --template=gh:x/y'])
    expect(each('npm init nuxt@latest app')).toEqual(['npm init nuxt@latest app', 'pnpm create nuxt@latest app', 'yarn create nuxt app', 'bun create nuxt@latest app'])
  })

  it('leaves a pinned initializer to npm, which yarn create cannot run', () => {
    expect(convertCommand('npm create nuxt@3.12.0 app', 'pnpm')).toBe('pnpm create nuxt@3.12.0 app')
    expect(convertCommand('npm create nuxt@3.12.0 app', 'yarn')).toBeNull()
    expect(convertBlock(['npm create nuxt@3.12.0 app'])).toBeNull()
  })
})

describe('the project\'s own CLIs', () => {
  it.each([
    ['npx nuxt-backend doctor --prod', 'pnpm nuxt-backend doctor --prod', 'yarn nuxt-backend doctor --prod', 'bunx nuxt-backend doctor --prod'],
    ['npx convex env set --prod SITE_URL https://app.example.com', 'pnpm convex env set --prod SITE_URL https://app.example.com', 'yarn convex env set --prod SITE_URL https://app.example.com', 'bunx convex env set --prod SITE_URL https://app.example.com'],
    ['npx nuxi info', 'pnpm nuxi info', 'yarn nuxi info', 'bunx nuxi info'],
    ['npx nuxt module add nuxt-backend', 'pnpm nuxt module add nuxt-backend', 'yarn nuxt module add nuxt-backend', 'bunx nuxt module add nuxt-backend'],
  ])('run the installed copy, never dlx: %s', (npm, pnpm, yarn, bun) => {
    expect(each(npm)).toEqual([npm, pnpm, yarn, bun])
  })

  it('keep their arguments as written, quotes, `--` and redirects among them', () => {
    expect(convertCommand('npx convex run email:send \'{"to":"a@b.dev","text":"It works."}\'', 'bun')).toBe('bunx convex run email:send \'{"to":"a@b.dev","text":"It works."}\'')
    expect(convertCommand('npx nuxt-backend doctor --json > doctor.json', 'pnpm')).toBe('pnpm nuxt-backend doctor --json > doctor.json')
    expect(convertCommand('npx nuxt-backend dev -- --host', 'yarn')).toBe('yarn nuxt-backend dev -- --host')
  })
})

describe('download and run', () => {
  it.each([
    ['npx nuxt-backend@latest init', 'pnpm dlx nuxt-backend@latest init', 'yarn dlx nuxt-backend@latest init', 'bunx nuxt-backend@latest init'],
    ['npx @convex-dev/bundle-analyzer packages zod', 'pnpm dlx @convex-dev/bundle-analyzer packages zod', 'yarn dlx @convex-dev/bundle-analyzer packages zod', 'bunx @convex-dev/bundle-analyzer packages zod'],
    ['npx skills add https://nuxt-backend.dev --skill \'*\'', 'pnpm dlx skills add https://nuxt-backend.dev --skill \'*\'', 'yarn dlx skills add https://nuxt-backend.dev --skill \'*\'', 'bunx skills add https://nuxt-backend.dev --skill \'*\''],
  ])('%s', (npm, pnpm, yarn, bun) => {
    expect(each(npm)).toEqual([npm, pnpm, yarn, bun])
  })

  it('leaves npx\'s own flags to npm', () => {
    expect(convertCommand('npx -y skills add x', 'pnpm')).toBeNull()
    expect(convertCommand('npx --package=x y', 'pnpm')).toBeNull()
    expect(convertCommand('npx', 'pnpm')).toBeNull()
  })
})

describe('a line around the command', () => {
  it('keeps the environment it sets and the comment after it', () => {
    expect(convertCommand('CONVEX_AGENT_MODE=anonymous npm run dev', 'pnpm')).toBe('CONVEX_AGENT_MODE=anonymous pnpm dev')
    expect(convertCommand('npx nuxt-backend doctor --fix      # restore missing files', 'bun')).toBe('bunx nuxt-backend doctor --fix      # restore missing files')
    expect(convertCommand('npm run dev   # the dev script `init` writes: nuxt-backend dev', 'yarn')).toBe('yarn dev   # the dev script `init` writes: nuxt-backend dev')
    expect(convertCommand('  npm install convex', 'pnpm')).toBe('  pnpm add convex')
  })

  it('converts each command of a pipeline or a chain, and leaves the others', () => {
    expect(convertCommand('openssl rand -base64 32 | npx convex env set --prod AUTH_SECRET', 'pnpm')).toBe('openssl rand -base64 32 | pnpm convex env set --prod AUTH_SECRET')
    expect(convertCommand('npm install && npm run build', 'bun')).toBe('bun install && bun run build')
    expect(convertCommand('cd my-app; npm run dev', 'yarn')).toBe('cd my-app; yarn dev')
  })

  it('cannot say when npm is an argument: quoted, after `--`, inside a subshell or behind `then`', () => {
    for (const command of [
      'npx convex deploy --cmd \'npm run build\'',
      'claude mcp add --scope project nuxt-backend -- npx nuxt-backend mcp',
      'echo $(npx nuxt-backend status)',
      'if true; then npx nuxt-backend env push; fi',
      'npm-run-all build',
    ]) expect(convertCommand(command, 'pnpm'), command).toBeNull()
  })

  it('reads `pnpm`, `.npmrc` and npmjs.com as no mention of npm', () => {
    expect(convertCommand('cp .npmrc dist/ && npm install', 'pnpm')).toBe('cp .npmrc dist/ && pnpm install')
    expect(convertCommand('open https://www.npmjs.com && npx nuxi info', 'bun')).toBe('open https://www.npmjs.com && bunx nuxi info')
  })
})

describe('a block', () => {
  it('converts line for line, comments and blank lines and other commands as they are', () => {
    const lines = ['# a specific PR', 'npm install https://pkg.pr.new/qruto/nuxt-backend@123', '', 'cd my-app', 'npx nuxt-backend init   # scaffold']
    expect(convertLines(lines, 'pnpm')).toEqual(['# a specific PR', 'pnpm add https://pkg.pr.new/qruto/nuxt-backend@123', '', 'cd my-app', 'pnpm nuxt-backend init   # scaffold'])
    expect(convertBlock(lines)?.bun).toEqual(['# a specific PR', 'bun add https://pkg.pr.new/qruto/nuxt-backend@123', '', 'cd my-app', 'bunx nuxt-backend init   # scaffold'])
  })

  it('keeps a command continued over several lines, unless a continuation names npm', () => {
    const lines = ['npx convex deploy --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL \\', '  --preview-run \'billing:syncProducts\'']
    expect(convertLines(lines, 'yarn')).toEqual(['yarn convex deploy --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL \\', '  --preview-run \'billing:syncProducts\''])
    expect(convertLines([lines[0]!, '  --cmd \'npm run build\''], 'yarn')).toBeNull()
    // Not continued: a backslash inside a comment ends nothing.
    expect(convertLines(['npm run dev # a \\', 'npm install'], 'pnpm')).toEqual(['pnpm dev # a \\', 'pnpm install'])
  })

  it('is null when no line runs npm, or when one line cannot convert', () => {
    expect(convertBlock(['pnpm add @convex-dev/agent'])).toBeNull()
    expect(convertBlock(['# just a comment', 'BILLING_ACCESS_TOKEN=xyz'])).toBeNull()
    expect(convertBlock(['npx nuxt-backend status', 'npm view nuxt-backend dist'])).toBeNull()
  })

  it('reads npm as npm', () => {
    expect(convertLines(['npm ci'], 'npm')).toEqual(['npm ci'])
    expect(convertCommand('npm run dev\nnpx convex dev\n', 'pnpm')).toBe('pnpm dev\npnpm convex dev\n')
  })
})

describe('the pick before the first paint', () => {
  /** The head script run against a stand-in for the page, with `stored` in localStorage. */
  function stamp(stored: string | null, blocked = false): string | undefined {
    const attributes: Record<string, string> = {}
    const localStorage = { getItem: (key: string) => {
      if (blocked) throw new Error('SecurityError')
      return key === PM_STORAGE_KEY ? stored : null
    } }
    const document = { documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) } }
    new Function('localStorage', 'document', PM_HEAD_SCRIPT)(localStorage, document)
    return attributes['data-pm']
  }

  it('sets html[data-pm] from the stored pick, and nothing for anything else', () => {
    expect(stamp('pnpm')).toBe('pnpm')
    expect(stamp('bun')).toBe('bun')
    expect(stamp(null)).toBeUndefined()
    expect(stamp('pnpm"><script>')).toBeUndefined()
    expect(stamp('pnpm', true)).toBeUndefined()
  })

  it('knows every manager the picker offers', () => {
    expect(PACKAGE_MANAGERS.every(isPackageManager)).toBe(true)
    expect(isPackageManager('deno')).toBe(false)
  })
})
