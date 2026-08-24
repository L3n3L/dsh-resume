import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolveUnderJobhunt } from './workspace.js'
import { assertTemplateSpec, TEMPLATE_DEFAULTS, validateCssText, validateTemplateSpec } from './template-schema.js'

const BUNDLED_TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates')

// The built-in catalog is the single source of truth for identity, family,
// renderer, and composition. Do not add a second per-id override map below:
// it previously let the raw descriptor and the normalized descriptor drift.
const PRESETS = [
  {
    ...TEMPLATE_DEFAULTS,
    renderer: 'composition',
    composition: { page: 'stack', header: 'standard', section: 'line', entry: 'stack', meta: 'inline', skills: 'chips' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'business-ledger-plus',
    name: '商务履历增强',
    description: '深色信息头、头像锚点和细密时间线，适合把项目成果做成一页清晰履历',
    tags: ['商务', '时间线', '头像头部', '社招'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'standard', moduleOrder: ['profile', 'summary', 'experience', 'projects', 'education', 'skills', 'awards'] },
    composition: { page: 'stack', header: 'hero', section: 'badge', entry: 'timeline', meta: 'split', skills: 'list' },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.14, lineHeight: 1.46 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 38, sectionGap: 16, paragraphGap: 4 },
    family: 'business-timeline',
    renderer: 'composition',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#d2a84b', textColor: '#1c2938', mutedColor: '#6c7b8d', backgroundColor: '#ffffff', divider: 'solid', cornerRadius: 0, variant: 'standard' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'magazine-feature',
    name: '杂志开篇',
    description: '大标题、开篇主叙事和错落栏流，适合内容、品牌、运营和产品岗位',
    tags: ['运营', '杂志', '叙事'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'standard', moduleOrder: ['profile', 'summary', 'projects', 'experience', 'education', 'skills'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'serif', fontSize: 13, headingScale: 1.24, lineHeight: 1.5 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 40, sectionGap: 15, paragraphGap: 4 },
    family: 'magazine-editorial',
    renderer: 'composition',
    composition: { page: 'grid', header: 'hero', section: 'line', entry: 'stack', meta: 'inline', skills: 'chips' },
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#be123c', textColor: '#292524', mutedColor: '#78716c', backgroundColor: '#fffdf7', divider: 'none', cornerRadius: 0, variant: 'editorial' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'geek-lab',
    name: '极客实验室',
    description: '用终端语法、模块编号和黑底层级表达技术个性，适合 Geek 与工程岗位',
    tags: ['Geek', '暗黑', '模块化'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'compact', moduleOrder: ['profile', 'skills', 'projects', 'experience', 'education'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.08, lineHeight: 1.4 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 40, sectionGap: 14, paragraphGap: 3 },
    family: 'geek-lab',
    renderer: 'composition',
    composition: { page: 'stack', header: 'hero', section: 'badge', entry: 'timeline', meta: 'split', skills: 'list' },
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#a3e635', textColor: '#ecfccb', mutedColor: '#a7b89a', backgroundColor: '#101610', divider: 'solid', cornerRadius: 2, variant: 'terminal' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'case-study',
    name: '重点案例',
    description: '把最重要的项目放大成首屏案例，其余经历作为证据补充，适合产品与作品集投递',
    tags: ['作品集', '重点内容', '产品'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'standard', moduleOrder: ['profile', 'projects', 'summary', 'experience', 'skills', 'education'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.16, lineHeight: 1.5 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 42, sectionGap: 17, paragraphGap: 4 },
    family: 'case-study',
    renderer: 'composition',
    composition: { page: 'stack', header: 'hero', section: 'badge', entry: 'stack', meta: 'split', skills: 'chips' },
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#2563eb', textColor: '#172033', mutedColor: '#64748b', backgroundColor: '#f8fbff', divider: 'solid', cornerRadius: 10, variant: 'standard' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'portrait-profile',
    name: '肖像侧栏',
    description: '把个人识别、头像和联系方式做成视觉锚点，适合设计、运营与个人品牌型简历',
    tags: ['设计', '头像', '个人品牌'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'standard', moduleOrder: ['photo', 'profile', 'summary', 'skills', 'projects', 'experience', 'education'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.18, lineHeight: 1.5 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 44, sectionGap: 18, paragraphGap: 5 },
    family: 'avatar-profile',
    renderer: 'composition',
    composition: { page: 'stack', header: 'hero', section: 'badge', entry: 'stack', meta: 'inline', skills: 'chips' },
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#db2777', textColor: '#24202a', mutedColor: '#776b7c', backgroundColor: '#fffafe', divider: 'solid', cornerRadius: 14, variant: 'editorial' },
  },
]

// The active catalog is intentionally small and curated. Similar or
// unfinished built-ins are no longer registered as presets. AI-generated
// composition templates are added separately from the workspace templates
// directory and are not limited by this built-in list.
const GALLERY_PRESET_IDS = Object.freeze(PRESETS.map((preset) => preset.id))

const VALID_PRESETS = PRESETS.map((preset) => assertTemplateSpec({
  ...preset,
  family: preset.family || 'campus-clear',
  renderer: 'composition',
  composition: preset.composition,
  metadata: {
    ...(preset.metadata || {}),
    generatedBy: 'dsh-built-in-template',
    family: preset.family || 'campus-clear',
  },
}))

export function listTemplatePresets() {
  return GALLERY_PRESET_IDS
    .map((id) => VALID_PRESETS.find((preset) => preset.id === id))
    .filter(Boolean)
    .map((preset) => JSON.parse(JSON.stringify(preset)))
}

export function getTemplatePreset(id) {
  const preset = VALID_PRESETS.find((item) => item.id === id)
  return preset ? JSON.parse(JSON.stringify(preset)) : undefined
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

async function recordTemplateVersion(root, current, templateCss = '') {
  if (!current) return null
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const dir = historyRoot(root, current.id)
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${stamp}.json`)
  await fs.writeFile(file, `${JSON.stringify({ ...current, templateCss }, null, 2)}\n`, 'utf8')
  return path.relative(root, file).replace(/\\/g, '/')
}

async function readOptionalTemplateCss(root, id) {
  const cssPath = builtInTemplate(id)
    ? path.join(BUNDLED_TEMPLATE_DIR, `${id}.css`)
    : resolveUnderJobhunt(root, `templates/${id}.css`).abs
  try {
    const css = await fs.readFile(cssPath, 'utf8')
    const result = validateCssText(css, { kind: 'templateCss' })
    if (!result.valid) throw new Error(result.errors.join('; '))
    return css
  } catch (err) {
    if (err?.code === 'ENOENT') return ''
    throw err
  }
}

export async function loadTemplateCss(root, id) {
  return readOptionalTemplateCss(root, id)
}

function cssMetadata(css) {
  const value = typeof css === 'string' ? css : ''
  return {
    templateCssBytes: Buffer.byteLength(value, 'utf8'),
    templateCssFingerprint: createHash('sha256').update(value).digest('hex').slice(0, 16),
  }
}

async function addCssMetadata(root, template) {
  const css = await readOptionalTemplateCss(root, template.id)
  return { ...template, ...cssMetadata(css) }
}

export async function listAvailableTemplates(root) {
  const templates = await Promise.all(listTemplatePresets().map((template) => addCssMetadata(root, template)))
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
      if (result.value.renderer !== 'composition') continue
      assertCustomTemplateId(result.value.id)
      templates.push(await addCssMetadata(root, clone(result.value)))
    } catch {
      // Ignore invalid user templates in the gallery; the validate tool reports details.
    }
  }
  return templates
}

export async function loadTemplate(root, id) {
  if (!id) return undefined
  const builtin = builtInTemplate(id)
  if (builtin) return { ...clone(builtin), templateCss: await readOptionalTemplateCss(root, id) }
  const { abs } = resolveUnderJobhunt(root, `templates/${id}.json`)
  const parsed = JSON.parse(await fs.readFile(abs, 'utf8'))
  const result = validateTemplateSpec(parsed)
  if (!result.valid) throw new Error(`invalid template ${id}: ${result.errors.join('; ')}`)
  if (result.value.id !== id) throw new Error(`template filename and id must match: ${id}`)
  const cssFile = await readOptionalTemplateCss(root, id)
  return { ...clone(result.value), templateCss: cssFile || result.value.templateCss || '' }
}

export async function saveTemplate(root, input) {
  const result = validateTemplateSpec(input)
  if (!result.valid) throw new Error(`invalid template: ${result.errors.join('; ')}`)
  if (result.value.renderer !== 'composition') throw new Error('template renderer must be composition')
  assertCustomTemplateId(result.value.id)
  const { abs, rel } = resolveUnderJobhunt(root, `templates/${result.value.id}.json`)
  const cssAbs = resolveUnderJobhunt(root, `templates/${result.value.id}.css`).abs
  const hasTemplateCss = Object.prototype.hasOwnProperty.call(input || {}, 'templateCss')
  let previous = null
  try {
    previous = JSON.parse(await fs.readFile(abs, 'utf8'))
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  let previousCss = ''
  try {
    previousCss = await fs.readFile(cssAbs, 'utf8')
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  const nextCss = hasTemplateCss ? result.value.templateCss : previousCss
  const cssValidation = validateCssText(nextCss, { kind: 'templateCss' })
  if (!cssValidation.valid) throw new Error(cssValidation.errors.join('; '))
  const versionPath = await recordTemplateVersion(root, previous, previousCss)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  const { templateCss: _templateCss, ...persisted } = result.value
  await fs.writeFile(abs, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8')
  if (nextCss) {
    await fs.writeFile(cssAbs, nextCss, 'utf8')
  } else if (hasTemplateCss) {
    try { await fs.unlink(cssAbs) } catch (err) { if (err?.code !== 'ENOENT') throw err }
  }
  const template = { ...clone(persisted), templateCss: nextCss }
  return { path: rel, cssPath: nextCss ? `templates/${result.value.id}.css` : null, template, versionPath, bytes: Buffer.byteLength(JSON.stringify(persisted, null, 2) + '\n', 'utf8'), cssBytes: Buffer.byteLength(nextCss, 'utf8') }
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
