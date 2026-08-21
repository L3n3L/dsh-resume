import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveUnderJobhunt } from './workspace.js'
import { assertTemplateSpec, TEMPLATE_DEFAULTS, validateTemplateSpec } from './template-schema.js'

const PRESETS = [
  TEMPLATE_DEFAULTS,
  {
    ...TEMPLATE_DEFAULTS,
    id: 'tech-compact',
    name: '技术极简',
    description: '适合前端、后端和算法岗位的高密度单栏模板',
    tags: ['技术岗', '单栏', '紧凑'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'compact' },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.1, lineHeight: 1.4 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 38, sectionGap: 12, paragraphGap: 4 },
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#1f3a5f', divider: 'solid', cornerRadius: 0, variant: 'technical' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'quiet-editorial',
    name: '安静编辑',
    description: '低饱和配色和舒展层级，适合运营、产品和综合岗位',
    tags: ['运营', '产品', '舒展'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'airy' },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'serif', fontSize: 14, headingScale: 1.2, lineHeight: 1.6 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 54, sectionGap: 24, paragraphGap: 8 },
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#0f766e', mutedColor: '#64748b', divider: 'dashed', cornerRadius: 4, variant: 'editorial' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'mono-terminal',
    name: '黑白终端',
    description: '黑白高对比和橙色细节，适合开发、测试和工程岗位',
    tags: ['开发', '黑白', '结构感'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'compact' },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.08, lineHeight: 1.42 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 40, sectionGap: 14, paragraphGap: 4 },
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#c2410c', textColor: '#111827', mutedColor: '#4b5563', divider: 'none', cornerRadius: 0, variant: 'terminal' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'split-sidebar',
    name: '侧栏聚焦',
    description: '主栏承载项目与经历，侧栏承载技能与联系方式的双栏模板',
    tags: ['双栏', '项目优先', '校招'],
    layout: { ...TEMPLATE_DEFAULTS.layout, mode: 'two-column', density: 'standard', sidebarRatio: 0.3, columnGap: 22 },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontSize: 13, headingScale: 1.1, lineHeight: 1.45 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 42, sectionGap: 16, paragraphGap: 5 },
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#3559a8', divider: 'solid', cornerRadius: 2, variant: 'standard' },
  },
]

const VALID_PRESETS = PRESETS.map((preset) => assertTemplateSpec(preset))

export function listTemplatePresets() {
  return VALID_PRESETS.map((preset) => JSON.parse(JSON.stringify(preset)))
}

export function getTemplatePreset(id) {
  const preset = VALID_PRESETS.find((item) => item.id === id) || VALID_PRESETS[0]
  return JSON.parse(JSON.stringify(preset))
}

export function validateTemplate(input) {
  return validateTemplateSpec(input)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function builtInTemplate(id) {
  return VALID_PRESETS.find((preset) => preset.id === id)
}

function assertCustomTemplateId(id) {
  if (builtInTemplate(id)) throw new Error(`template id is reserved by a built-in preset: ${id}`)
}

function historyRoot(root, id) {
  return resolveUnderJobhunt(root, `.dsh-resume/history/templates/${id}`).abs
}

async function recordTemplateVersion(root, current) {
  if (!current) return null
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const dir = historyRoot(root, current.id)
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${stamp}.json`)
  await fs.writeFile(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  return path.relative(root, file).replace(/\\/g, '/')
}

export async function listAvailableTemplates(root) {
  const templates = listTemplatePresets()
  const dir = resolveUnderJobhunt(root, 'templates').abs
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return templates
  }
  for (const entry of entries.filter((item) => item.isFile() && item.name.toLowerCase().endsWith('.json'))) {
    try {
      const abs = path.join(dir, entry.name)
      const parsed = JSON.parse(await fs.readFile(abs, 'utf8'))
      const result = validateTemplateSpec(parsed)
      if (!result.valid || path.basename(entry.name, '.json') !== result.value.id) continue
      assertCustomTemplateId(result.value.id)
      templates.push(clone(result.value))
    } catch {
      // Ignore invalid user templates in the gallery; the validate tool reports details.
    }
  }
  return templates
}

export async function loadTemplate(root, id) {
  if (!id) return undefined
  const builtin = builtInTemplate(id)
  if (builtin) return clone(builtin)
  const { abs } = resolveUnderJobhunt(root, `templates/${id}.json`)
  const parsed = JSON.parse(await fs.readFile(abs, 'utf8'))
  const result = validateTemplateSpec(parsed)
  if (!result.valid) throw new Error(`invalid template ${id}: ${result.errors.join('; ')}`)
  if (result.value.id !== id) throw new Error(`template filename and id must match: ${id}`)
  return clone(result.value)
}

export async function saveTemplate(root, input) {
  const result = validateTemplateSpec(input)
  if (!result.valid) throw new Error(`invalid template: ${result.errors.join('; ')}`)
  assertCustomTemplateId(result.value.id)
  const { abs, rel } = resolveUnderJobhunt(root, `templates/${result.value.id}.json`)
  let previous = null
  try {
    previous = JSON.parse(await fs.readFile(abs, 'utf8'))
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  const versionPath = await recordTemplateVersion(root, previous)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, `${JSON.stringify(result.value, null, 2)}\n`, 'utf8')
  return { path: rel, template: clone(result.value), versionPath, bytes: Buffer.byteLength(JSON.stringify(result.value, null, 2) + '\n', 'utf8') }
}

export async function copyTemplate(root, sourceId, newId, name) {
  const source = await loadTemplate(root, sourceId)
  const next = {
    ...source,
    id: newId,
    name: name || `${source.name} 副本`,
    tags: [...(source.tags || []).slice(0, 5), '我的模板'].slice(0, 6),
  }
  return saveTemplate(root, next)
}

export async function listTemplateVersions(root, id) {
  const dir = historyRoot(root, id)
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((a, b) => b.name.localeCompare(a.name))
    .map((entry) => ({ id: entry.name.slice(0, -5), path: `.dsh-resume/history/templates/${id}/${entry.name}` }))
}

export async function restoreLatestTemplate(root, id) {
  const versions = await listTemplateVersions(root, id)
  if (!versions.length) throw new Error(`no saved version for template: ${id}`)
  const { abs } = resolveUnderJobhunt(root, versions[0].path)
  const snapshot = JSON.parse(await fs.readFile(abs, 'utf8'))
  return saveTemplate(root, snapshot)
}
