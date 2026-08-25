import { readJobhuntFile, writeJobhuntFile } from './workspace.js'

export const PRESENTATION_FILE = 'presentation.json'
export const PRESENTATION_SCHEMA_VERSION = 1

const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const FONT_FAMILIES = new Set(['system-sans', 'modern-sans', 'serif'])
const COLOR = /^#[0-9a-f]{6}$/i

function numberIn(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function cleanRelativePath(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').some((part) => part === '..')) return null
  return normalized
}

function cleanLayout(value = {}) {
  const result = {}
  if (FONT_FAMILIES.has(value.fontFamily)) result.fontFamily = value.fontFamily
  if (value.fontSize !== undefined) result.fontSize = numberIn(value.fontSize, 11, 18, 14)
  if (value.lineHeight !== undefined) result.lineHeight = numberIn(value.lineHeight, 1.2, 2, 1.55)
  if (value.sectionGap !== undefined) result.sectionGap = numberIn(value.sectionGap, 6, 30, 20)
  if (value.pageMargin !== undefined) result.pageMargin = numberIn(value.pageMargin, 24, 72, 48)
  return result
}

function cleanVisual(value = {}) {
  const result = {}
  for (const key of ['accentColor', 'textColor', 'mutedColor', 'backgroundColor']) {
    if (COLOR.test(String(value[key] || ''))) result[key] = String(value[key]).toLowerCase()
  }
  if (value.cornerRadius !== undefined) result.cornerRadius = numberIn(value.cornerRadius, 0, 16, 0)
  if (['none', 'solid', 'dashed'].includes(value.divider)) result.divider = value.divider
  return result
}

function cleanIconTuning(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result = {}
  for (const [name, tuning] of Object.entries(value)) {
    if (!/^(?:\*|[a-z0-9_-]+)$/i.test(name) || !tuning || typeof tuning !== 'object') continue
    result[name.toLowerCase()] = {
      scale: numberIn(tuning.scale, 0.7, 1.5, 1),
      offsetY: numberIn(tuning.offsetY, -0.25, 0.25, 0),
    }
  }
  return result
}

export function emptyPresentation() {
  return { schemaVersion: PRESENTATION_SCHEMA_VERSION, activeTemplateId: null, activePreviewPath: null, overrides: {} }
}

export function normalizePresentation(value) {
  const source = value && typeof value === 'object' ? value : {}
  const result = emptyPresentation()
  if (TEMPLATE_ID.test(String(source.activeTemplateId || ''))) result.activeTemplateId = String(source.activeTemplateId)
  result.activePreviewPath = cleanRelativePath(source.activePreviewPath)
  for (const [templateId, override] of Object.entries(source.overrides || {})) {
    if (!TEMPLATE_ID.test(templateId) || !override || typeof override !== 'object') continue
    result.overrides[templateId] = {
      layout: cleanLayout(override.layout),
      visual: cleanVisual(override.visual),
      iconTuning: cleanIconTuning(override.iconTuning),
      updatedAt: typeof override.updatedAt === 'string' ? override.updatedAt : undefined,
    }
  }
  return result
}

export async function loadPresentation(root) {
  try {
    const { content } = await readJobhuntFile(root, PRESENTATION_FILE)
    return normalizePresentation(JSON.parse(content))
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyPresentation()
    return emptyPresentation()
  }
}

export async function savePresentationOverride(root, {
  templateId,
  layout = {},
  visual = {},
  iconTuning = {},
  activeTemplateId = templateId,
  activePreviewPath,
  reset = false,
  activeOnly = false,
  clear = [],
} = {}) {
  if (!TEMPLATE_ID.test(String(templateId || ''))) throw new Error('templateId must be lower-kebab-case')
  const current = await loadPresentation(root)
  if (TEMPLATE_ID.test(String(activeTemplateId || ''))) current.activeTemplateId = String(activeTemplateId)
  if (activePreviewPath !== undefined) current.activePreviewPath = cleanRelativePath(activePreviewPath)
  if (reset) {
    delete current.overrides[templateId]
  } else if (!activeOnly) {
    const previous = current.overrides[templateId] || {}
    const next = {
      layout: { ...(previous.layout || {}), ...cleanLayout(layout) },
      visual: { ...(previous.visual || {}), ...cleanVisual(visual) },
      iconTuning: { ...(previous.iconTuning || {}), ...cleanIconTuning(iconTuning) },
      updatedAt: new Date().toISOString(),
    }
    for (const field of Array.isArray(clear) ? clear : []) {
      if (field === 'layout' || field === 'visual' || field === 'iconTuning') delete next[field]
    }
    if (Object.keys(next).some((key) => key !== 'updatedAt' && Object.keys(next[key] || {}).length)) current.overrides[templateId] = next
    else delete current.overrides[templateId]
  }
  const normalized = normalizePresentation(current)
  const saved = await writeJobhuntFile(root, PRESENTATION_FILE, `${JSON.stringify(normalized, null, 2)}\n`)
  return { ...saved, presentation: normalized }
}

export function applyPresentationOverride(template, presentation, templateId = template?.id) {
  if (!template || !presentation || !templateId) return template
  const override = presentation.overrides?.[templateId]
  if (!override) return template
  const layout = override.layout || {}
  return {
    ...template,
    typography: { ...(template.typography || {}), ...(layout.fontFamily ? { fontFamily: layout.fontFamily } : {}), ...(layout.fontSize !== undefined ? { fontSize: layout.fontSize } : {}), ...(layout.lineHeight !== undefined ? { lineHeight: layout.lineHeight } : {}) },
    spacing: { ...(template.spacing || {}), ...(layout.sectionGap !== undefined ? { sectionGap: layout.sectionGap } : {}), ...(layout.pageMargin !== undefined ? { pageMargin: layout.pageMargin } : {}) },
    visual: { ...(template.visual || {}), ...(override.visual || {}) },
  }
}
