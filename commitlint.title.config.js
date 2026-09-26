// The pull request title check (ci.yml › static › Pull request title): the
// commit rules, without commitlint's default ignores. Those let `Revert "…"`,
// `Merge …` and `fixup! …` messages through — right for a branch's own
// commits, wrong for the subject a squash merge writes on main.
import config from './commitlint.config.js'

export default { ...config, defaultIgnores: false }
