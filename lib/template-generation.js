import { normalizeTemplateSpec, validateTemplateSpec, TEMPLATE_DEFAULTS } from './template-schema.js'

const AUDIENCES = new Set(['campus', 'engineering', 'product', 'design', 'academic', 'general'])
const LAYOUTS = new Set(['single-column', 'two-column'])
const DENSITIES = new Set(['compact', 'standard', 'airy'])
const TONES = new Set(['clear', 'technical', 'editorial', 'minimal', 'terminal'])
const HEX_PATTERN = /^#[0-9a-f]{6}$/i
const MODULES = new Set(['profile', 'education', 'skills', 'projects', 'experience', 'awards', 'links'])
const BLOCK_TYPES = new Set(['profile', 'education', 'skills', 'projects', 'experience', 'awards', 'links', 'project-list', 'skill-tags', 'timeline', 'metric-row', 'portfolio-card', 'qr-code', 'custom-section'])

export const DESIGN_BRIEF_DEFAULTS = Object.freeze({
  schemaVersion: 1,
  id: '',
  name: 'AI 模板候选',
  description: '',
  audience: 'general',
  layout: 'single-column',
  density: 'standard',
  tone: 'clear',
  palette: {},
  moduleOrder: [...TEMPLATE_DEFAULTS.layout.moduleOrder],
  moduleTypes: {},
  sidebarModules: ['skills', 'links'],
  bestFor: [],
  tags: [],
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'ai-template'
}

function cleanList(value, limit = 6) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))].slice(0, limit)
    : []
}

function mergeBrief(input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const palette = value.palette && typeof value.palette === 'object' && !Array.isArray(value.palette) ? value.palette : {}
  const moduleTypes = value.moduleTypes && typeof value.moduleTypes === 'object' && !Array.isArray(value.moduleTypes) ? value.moduleTypes : {}
  return {
    ...clone(DESIGN_BRIEF_DEFAULTS),
    ...value,
    palette: { ...palette },
    moduleTypes: { ...moduleTypes },
    moduleOrder: cleanList(value.moduleOrder, 7),
    sidebarModules: cleanList(value.sidebarModules, 4),
    bestFor: cleanList(value.bestFor),
    tags: cleanList(value.tags),
  }
}

export function normalizeDesignBrief(input = {}) {
  const brief = mergeBrief(input)
  brief.schemaVersion = 1
  brief.id = typeof brief.id === 'string' ? slugify(brief.id) : ''
  brief.name = typeof brief.name === 'string' && brief.name.trim() ? brief.name.trim().slice(0, 40) : DESIGN_BRIEF_DEFAULTS.name
  brief.description = typeof brief.description === 'string' ? brief.description.trim().slice(0, 160) : ''
  brief.audience = AUDIENCES.has(brief.audience) ? brief.audience : 'general'
  brief.layout = LAYOUTS.has(brief.layout) ? brief.layout : 'single-column'
  brief.density = DENSITIES.has(brief.density) ? brief.density : 'standard'
  brief.tone = TONES.has(brief.tone) ? brief.tone : 'clear'
  brief.moduleOrder = brief.moduleOrder.filter((module) => MODULES.has(module))
  if (!brief.moduleOrder.length) brief.moduleOrder = [...TEMPLATE_DEFAULTS.layout.moduleOrder]
  brief.sidebarModules = brief.sidebarModules.filter((module) => brief.moduleOrder.includes(module))
  brief.moduleTypes = Object.fromEntries(Object.entries(brief.moduleTypes).filter(([module, type]) => MODULES.has(module) && BLOCK_TYPES.has(type)))
  for (const key of ['accentColor', 'textColor', 'mutedColor', 'backgroundColor']) {
    if (typeof brief.palette[key] !== 'string' || !HEX_PATTERN.test(brief.palette[key])) delete brief.palette[key]
  }
  return brief
}

export function validateDesignBrief(input) {
  const brief = normalizeDesignBrief(input)
  const errors = []
  if (!brief.name || brief.name.length > 40) errors.push('name is required and must be at most 40 characters')
  if (!AUDIENCES.has(brief.audience)) errors.push('audience is invalid')
  if (!LAYOUTS.has(brief.layout)) errors.push('layout is invalid')
  if (!DENSITIES.has(brief.density)) errors.push('density is invalid')
  if (!TONES.has(brief.tone)) errors.push('tone is invalid')
  return { valid: errors.length === 0, errors, value: brief }
}

function visualDefaults(brief) {
  const palette = {
    accentColor: '#2563eb',
    textColor: '#1f2937',
    mutedColor: '#6b7280',
    backgroundColor: '#ffffff',
    ...(brief.audience === 'engineering' ? { accentColor: '#1d4ed8' } : {}),
    ...(brief.audience === 'product' ? { accentColor: '#0f766e' } : {}),
    ...(brief.audience === 'design' ? { accentColor: '#9333ea' } : {}),
    ...(brief.audience === 'academic' ? { accentColor: '#7c3aed', backgroundColor: '#fcfcff' } : {}),
    ...(brief.tone === 'technical' ? { accentColor: '#1e3a5f' } : {}),
    ...(brief.tone === 'editorial' ? { accentColor: '#0f766e', backgroundColor: '#fffdf8' } : {}),
    ...(brief.tone === 'terminal' ? { accentColor: '#c2410c', backgroundColor: '#fffaf5' } : {}),
    ...brief.palette,
  }
  const variant = brief.tone === 'technical' ? 'technical'
    : brief.tone === 'editorial' ? 'editorial'
      : brief.tone === 'terminal' ? 'terminal' : 'standard'
  return { ...visualDefaultsFrom(brief), ...palette, variant }
}

function visualDefaultsFrom(brief) {
  return {
    divider: brief.tone === 'minimal' ? 'none' : 'solid',
    cornerRadius: brief.tone === 'editorial' || brief.tone === 'terminal' ? 6 : 0,
    variant: 'standard',
  }
}

export function generateTemplateCandidate(input = {}) {
  const validation = validateDesignBrief(input)
  const brief = validation.value
  if (!validation.valid) return { valid: false, errors: validation.errors, brief }

  const id = brief.id || slugify(brief.name)
  const technical = brief.audience === 'engineering' || brief.tone === 'technical'
  const typography = {
    fontFamily: brief.tone === 'editorial' || brief.audience === 'academic' ? 'serif' : technical ? 'modern-sans' : 'system-sans',
    fontSize: brief.density === 'compact' ? 13 : brief.density === 'airy' ? 15 : 14,
    headingScale: brief.density === 'compact' ? 1.1 : brief.density === 'airy' ? 1.2 : 1.14,
    lineHeight: brief.density === 'compact' ? 1.4 : brief.density === 'airy' ? 1.7 : 1.55,
  }
  const spacing = {
    pageMargin: brief.density === 'compact' ? 38 : brief.density === 'airy' ? 58 : 48,
    sectionGap: brief.density === 'compact' ? 14 : brief.density === 'airy' ? 26 : 20,
    paragraphGap: brief.density === 'compact' ? 3 : brief.density === 'airy' ? 8 : 6,
  }
  const visual = visualDefaults(brief)
  const defaultModuleTypes = {
    skills: brief.tone === 'minimal' ? 'skills' : 'skill-tags',
    projects: brief.tone === 'editorial' ? 'portfolio-card' : 'project-list',
    experience: brief.tone === 'technical' ? 'timeline' : 'experience',
  }
  const moduleTypes = { ...defaultModuleTypes, ...brief.moduleTypes }
  const layoutMode = brief.layout
  const mainModules = brief.moduleOrder.filter((module) => !brief.sidebarModules.includes(module))
  const sideModules = brief.layout === 'two-column' ? brief.moduleOrder.filter((module) => brief.sidebarModules.includes(module)) : []
  const layoutSpec = {
    schemaVersion: 1,
    mode: layoutMode,
    regions: layoutMode === 'two-column' ? { main: mainModules, side: sideModules } : { main: mainModules },
    blocks: brief.moduleOrder.map((module) => ({
      id: module,
      type: moduleTypes[module] || module,
      source: module,
      options: {},
    })),
  }
  const template = normalizeTemplateSpec({
    id,
    name: brief.name,
    description: brief.description || `${brief.name}：面向${brief.audience}场景的${brief.layout === 'two-column' ? '双栏' : '单栏'}模板`,
    tags: [...new Set([...brief.tags, brief.layout === 'two-column' ? '双栏' : '单栏', brief.density])].slice(0, 6),
    layout: {
      mode: brief.layout,
      density: brief.density,
      moduleOrder: brief.moduleOrder,
      sidebarRatio: brief.layout === 'two-column' ? 0.32 : TEMPLATE_DEFAULTS.layout.sidebarRatio,
      columnGap: brief.layout === 'two-column' ? 22 : TEMPLATE_DEFAULTS.layout.columnGap,
    },
    typography,
    spacing,
    visual,
    metadata: {
      generatedBy: 'dsh-template-design',
      audience: brief.audience,
      tone: brief.tone,
      bestFor: brief.bestFor,
      designBrief: brief,
    },
  })
  const result = validateTemplateSpec(template)
  return {
    valid: result.valid,
    errors: result.errors,
    brief,
    template: result.value,
    layoutSpec,
    rationale: [
      `${brief.layout === 'two-column' ? '双栏' : '单栏'}结构，适合${brief.audience}场景`,
      `${brief.density}密度，优先保证 A4 内的信息层级`,
      `${brief.tone}视觉语气，颜色、字体和分隔方式已映射到安全 token`,
    ],
    nextSteps: ['用 jobhunt_render 生成预览', '用 jobhunt_layout_metrics 读取真实 A4 指标', '用户确认后再用 jobhunt_template_save 入库'],
  }
}
