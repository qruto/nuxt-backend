/**
 * The YAML frontmatter of a markdown file as flat `key → value` pairs:
 * enough for SKILL.md's scalar keys and the docs pages' page contract,
 * `>-` folded blocks included. Nested maps keep their key with an empty
 * value. Shared by the docs tests and scripts/agent-guidance.mjs.
 */
export function frontmatter(markdown) {
  const block = markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1]
  if (block === undefined) return {}
  const out = {}
  let key
  for (const line of block.split('\n')) {
    const entry = line.match(/^([\w-]+):(.*)$/)
    if (entry) {
      key = entry[1]
      const value = entry[2].trim()
      out[key] = /^[>|]-?$/.test(value) ? '' : value.replace(/^(['"])(.*)\1$/, '$2')
    }
    else if (key && /^\s+\S/.test(line)) {
      out[key] = `${out[key]} ${line.trim()}`.trim()
    }
  }
  return out
}
