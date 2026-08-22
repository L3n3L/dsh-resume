import { normalizeTemplateSpec, validateTemplateSpec, TEMPLATE_DEFAULTS } from './template-schema.js'
import { blockPreset, resolveThemeFamily, THEME_FAMILY_IDS } from './theme-system.js'

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
  family: 'campus-clear',
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
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const brief = mergeBrief(input)
  brief.schemaVersion = 1
  brief.id = typeof brief.id === 'string' ? slugify(brief.id) : ''
  brief.name = typeof brief.name === 'string' && brief.name.trim() ? brief.name.trim().slice(0, 40) : DESIGN_BRIEF_DEFAULTS.name
  brief.description = typeof brief.description === 'string' ? brief.description.trim().slice(0, 160) : ''
  const inferredFamily = raw.audience === 'engineering' || raw.tone === 'technical' ? 'engineering-dense' : 'campus-clear'
  brief.family = THEME_FAMILY_IDS.includes(brief.family) && Object.hasOwn(raw, 'family') ? brief.family : inferredFamily
  const family = resolveThemeFamily(brief.family)
  brief.audience = AUDIENCES.has(brief.audience) ? brief.audience : 'general'
  brief.layout = Object.hasOwn(raw, 'layout') && LAYOUTS.has(brief.layout) ? brief.layout : family.layout.mode
  brief.density = Object.hasOwn(raw, 'density') && DENSITIES.has(brief.density) ? brief.density : family.layout.density
  brief.tone = Object.hasOwn(raw, 'tone') && TONES.has(brief.tone) ? brief.tone : family.visual.variant === 'technical' ? 'technical' : family.visual.variant === 'editorial' ? 'editorial' : family.visual.variant === 'terminal' ? 'terminal' : 'clear'
  brief.moduleOrder = brief.moduleOrder.filter((module) => MODULES.has(module))
  if (!brief.moduleOrder.length) brief.moduleOrder = [...TEMPLATE_DEFAULTS.layout.moduleOrder]
  if (!Object.hasOwn(raw, 'sidebarModules')) brief.sidebarModules = [...family.layout.sidebarModules]
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
  const family = resolveThemeFamily(brief.family)
  const palette = {
    ...family.visual,
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
  const family = resolveThemeFamily(brief.family)
  const technical = brief.audience === 'engineering' || brief.tone === 'technical'
  const typography = {
    ...family.typography,
    fontFamily: brief.tone === 'editorial' || brief.audience === 'academic' ? 'serif' : technical ? 'modern-sans' : family.typography.fontFamily,
    fontSize: brief.density === 'compact' ? 13 : brief.density === 'airy' ? 15 : family.typography.fontSize,
    headingScale: brief.density === 'compact' ? 1.1 : brief.density === 'airy' ? 1.2 : family.typography.headingScale,
    lineHeight: brief.density === 'compact' ? 1.4 : brief.density === 'airy' ? 1.7 : family.typography.lineHeight,
  }
  const spacing = {
    ...family.spacing,
    pageMargin: brief.density === 'compact' ? 38 : brief.density === 'airy' ? 58 : family.spacing.pageMargin,
    sectionGap: brief.density === 'compact' ? 14 : brief.density === 'airy' ? 26 : family.spacing.sectionGap,
    paragraphGap: brief.density === 'compact' ? 3 : brief.density === 'airy' ? 8 : family.spacing.paragraphGap,
  }
  const visual = visualDefaults(brief)
  const defaultModuleTypes = {
    skills: brief.tone === 'minimal' ? 'skills' : 'skill-tags',
    projects: brief.tone === 'editorial' ? 'portfolio-card' : 'project-list',
    experience: brief.tone === 'technical' ? 'timeline' : 'experience',
  }
  const moduleTypes = { ...defaultModuleTypes, ...family.moduleTypes, ...brief.moduleTypes }
  const layoutMode = brief.layout
  const mainModules = brief.moduleOrder.filter((module) => !brief.sidebarModules.includes(module))
  const sidebarModules = brief.sidebarModules.length ? brief.sidebarModules : family.layout.sidebarModules
  const sideModules = brief.layout === 'two-column' ? brief.moduleOrder.filter((module) => sidebarModules.includes(module)) : []
  const layoutSpec = {
    schemaVersion: 1,
    mode: layoutMode,
    regions: layoutMode === 'two-column' ? { main: mainModules, side: sideModules } : { main: mainModules },
    blocks: brief.moduleOrder.map((module) => ({
      id: module,
      type: moduleTypes[module] || module,
      source: module,
      options: { preset: blockPreset(moduleTypes[module] || module).preset, family: brief.family },
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
      family: brief.family,
      familyName: family.name,
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
      `${family.name}主题家族，模块使用稳定的语义预设而不是自由拼接 CSS`,
    ],
    nextSteps: ['用 jobhunt_render 生成预览', '用 jobhunt_layout_metrics 读取真实 A4 指标', '用户确认后再用 jobhunt_template_save 入库'],
  }
}
