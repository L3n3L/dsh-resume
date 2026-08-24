import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SKILL_FILE = fileURLToPath(new URL('../skills/resume-template-design/SKILL.md', import.meta.url))

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return null
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z-]+):\s*(.*)$/.exec(line)
    if (kv) meta[kv[1]] = kv[2]
  }
  return { meta, body: match[2].trim() }
}

/**
 * Register the plugin's bundled SKILL.md as a runtime skill so it ships with
 * the package. The host skill registry never scans plugin package directories
 * (only project/user skill roots and configured dirs), so without this the
 * skill would only load via per-machine junction hacks.
 */
export async function registerBundledSkills(ctx) {
  let text
  try {
    text = await fs.readFile(SKILL_FILE, 'utf8')
  } catch {
    ctx.logger?.warn?.('[dsh-resume] bundled skill not found at ' + SKILL_FILE)
    return
  }
  const parsed = parseFrontmatter(text)
  const name = parsed?.meta?.name
  const description = parsed?.meta?.description
  if (!name || !description) {
    ctx.logger?.warn?.('[dsh-resume] bundled skill has no usable frontmatter; skipping registration')
    return
  }
  ctx.skills.register({
    name,
    description,
    content: (parsed.body || text).replace(/\r\n/g, '\n'),
  })
}
