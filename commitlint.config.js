// Conventional Commits linting. Enforced locally via `.githooks/commit-msg`
// (wired by the `prepare` script) and on PRs in CI (.github/workflows/ci.yml).
// The accepted types drive the automated release bump — see RELEASING.md.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // config-conventional's defaults, plus `ai` for AI-instruction / agent
    // metadata updates (AGENTS.md, skills, Convex codegen instructions).
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
        'ai',
      ],
    ],
  },
}
