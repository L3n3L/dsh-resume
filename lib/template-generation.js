import { COMPOSITION_OPTIONS, normalizeCompositionPageSpec, normalizeTemplateSpec, validateCssText, validateTemplateSpec, TEMPLATE_DEFAULTS } from './template-schema.js'
import { blockPreset, resolveThemeFamily, THEME_FAMILY_IDS } from './theme-system.js'

const AUDIENCES = new Set(['campus', 'engineering', 'product', 'design', 'academic', 'general'])
const LAYOUTS = new Set(['single-column', 'two-column'])
const DENSITIES = new Set(['compact', 'standard', 'airy'])
const TONES = new Set(['clear', 'technical', 'editorial', 'minimal', 'terminal'])
const HEX_PATTERN = /^#[0-9a-f]{6}$/i
const MODULES = new Set(['profile', 'education', 'skills', 'projects', 'experience', 'awards', 'links', 'photo', 'summary', 'contact'])
const BLOCK_TYPES = new Set(['profile', 'education', 'skills', 'projects', 'experience', 'awards', 'links', 'project-list', 'skill-tags', 'skill-groups', 'timeline', 'metric-row', 'portfolio-card', 'qr-code', 'photo', 'summary', 'contact', 'custom-section'])
const TEMPLATE_QUALITY_HOOKS = Object.freeze([
  ['header', 'header-block'],
  ['section headings', 'dsh-resume-section'],
  ['entry titles', 'dsh-entry-title'],
  ['entry metadata', 'dsh-entry-meta'],
  ['result bullets', 'dsh-entry-bullets'],
  ['skills', 'dsh-skill'],
  ['print output', '@media print'],
])

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
  templateCss: '',
  customCss: '',
  moduleOrder: [...TEMPLATE_DEFAULTS.layout.moduleOrder],
  moduleTypes: {},
  sidebarModules: ['skills', 'links'],
  bestFor: [],
  tags: [],
  composition: {},
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
  const composition = value.composition && typeof value.composition === 'object' && !Array.isArray(value.composition) ? value.composition : {}
  return {
    ...clone(DESIGN_BRIEF_DEFAULTS),
    ...value,
    palette: { ...palette },
    moduleTypes: { ...moduleTypes },
    composition: { ...composition },
    moduleOrder: cleanList(value.moduleOrder, 7),
    sidebarModules: cleanList(value.sidebarModules, 4),
    bestFor: cleanList(value.bestFor),
    tags: cleanList(value.tags),
  }
}

function normalizeComposition(value) {
  return Object.fromEntries(Object.entries(COMPOSITION_OPTIONS)
    .filter(([key]) => typeof value?.[key] === 'string')
    .map(([key]) => [key, value[key]]))
}

export function auditTemplateCss(css, templateId = '') {
  const value = typeof css === 'string' ? css : ''
  const missing = TEMPLATE_QUALITY_HOOKS
    .filter(([, marker]) => !value.includes(marker))
    .map(([label]) => label)
  const hasScope = !templateId || value.includes(`[data-template-id="${templateId}"]`) || value.includes(`[data-template-id='${templateId}']`)
  if (!value.trim()) missing.unshift('independent template CSS')
  if (!hasScope) missing.unshift('template scope')
  const score = Math.max(0, TEMPLATE_QUALITY_HOOKS.length - missing.length)
  return {
    status: missing.length === 0 ? 'ready-for-browser-review' : 'needs-visual-work',
    score,
    total: TEMPLATE_QUALITY_HOOKS.length + 1,
    bytes: Buffer.byteLength(value, 'utf8'),
    missing,
    instruction: missing.length ? '补齐缺失的正文层和打印样式后，再用真实饱满简历截图验收。' : '已覆盖核心视觉层，但仍需真实浏览器截图和 A4 指标确认。',
  }
}

export function normalizeDesignBrief(input = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const brief = mergeBrief(input)
  brief.schemaVersion = 1
  brief.id = typeof brief.id === 'string' ? slugify(brief.id) : ''
  brief.name = typeof brief.name === 'string' && brief.name.trim() ? brief.name.trim().slice(0, 40) : DESIGN_BRIEF_DEFAULTS.name
  brief.description = typeof brief.description === 'string' ? brief.description.trim().slice(0, 160) : ''
  brief.templateCss = typeof brief.templateCss === 'string' ? brief.templateCss : ''
  brief.customCss = typeof brief.customCss === 'string' ? brief.customCss : ''
  brief.composition = normalizeComposition(brief.composition)
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
  errors.push(...validateCssText(brief.templateCss, { kind: 'templateCss' }).errors)
  return { valid: errors.length === 0, errors, value: brief }
}

function visualDefaults(brief) {
  const family = resolveThemeFamily(brief.family)
  const palette = {
    ...family.visual,
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

function rendererForBrief(brief) {
  // New templates use the generic structure renderer. Visual families are
  // expressed by composition + scoped CSS instead of a new renderer ID.
  return 'composition'
}

function compositionForBrief(brief) {
  const timeline = brief.family === 'business-timeline' || brief.tone === 'technical' || brief.audience === 'engineering'
  const hero = brief.family === 'avatar-profile' || brief.family === 'business-timeline' || brief.audience === 'design'
  const composition = {
    page: brief.family === 'portfolio-grid' ? 'grid' : brief.layout === 'two-column' ? 'split' : 'stack',
    header: hero ? 'hero' : 'standard',
    section: brief.tone === 'minimal' ? 'line' : 'badge',
    entry: timeline ? 'timeline' : 'stack',
    meta: timeline || brief.layout === 'two-column' ? 'split' : 'inline',
    skills: brief.tone === 'minimal' || brief.family === 'business-timeline' ? 'list' : 'chips',
    ...brief.composition,
  }
  if (composition.page === 'stack') composition.pageSpec = singleColumnPageSpec(brief)
  return composition
}

function singleColumnPageSpec(brief) {
  const family = brief.family
  const terminal = brief.tone === 'terminal' || family === 'geek-lab' || family === 'mono-terminal'
  const editorial = brief.tone === 'editorial' || family === 'editorial-quiet' || family === 'magazine-editorial' || family === 'heading-stack'
  const timeline = family === 'business-timeline' || family === 'career-chronicle' || brief.tone === 'technical' || brief.audience === 'engineering'
  const projects = family === 'case-study' || family === 'impact-board' ? 'feature-first' : timeline ? 'timeline' : editorial ? 'cards' : 'standard'
  const experience = timeline ? 'timeline' : family === 'case-study' ? 'role-stack' : editorial ? 'feature-first' : 'standard'
  const skills = family === 'operation-block' || family === 'avatar-profile' ? 'grouped-chips' : brief.tone === 'minimal' ? 'inline' : brief.density === 'compact' ? 'rows' : 'list'
  const section = terminal ? 'numbered-rail' : family === 'operation-block' ? 'marker' : editorial ? 'plain' : timeline ? 'numbered-rail' : brief.tone === 'minimal' ? 'rule' : 'badge'
  const header = terminal ? 'command' : family === 'avatar-profile' ? 'centered' : editorial ? 'masthead' : 'masthead'
  const typeScale = brief.density === 'compact' ? 'compact' : brief.density === 'airy' || editorial ? 'display' : 'balanced'
  const margin = brief.density === 'compact' ? 34 : brief.density === 'airy' ? 52 : 42
  return normalizeCompositionPageSpec({
    page: { size: 'A4', column: 'single', density: brief.density, margin: { top: margin, right: margin, bottom: margin, left: margin } },
    header: { variant: header, alignment: family === 'avatar-profile' ? 'center' : 'left', identity: family === 'avatar-profile' ? 'split' : 'stacked', contact: terminal ? 'stacked' : 'inline' },
    flow: { layout: 'balanced-footer', order: brief.moduleOrder, keepEntryTogether: true, avoidSectionOrphans: true },
    modules: { section, experience, projects, skills, education: 'compact', awards: 'compact' },
    visual: { family, typeScale, ruleStyle: brief.tone === 'minimal' ? 'none' : editorial ? 'solid' : 'hairline', accentMode: terminal ? 'text' : editorial ? 'surface' : 'marker' },
  })
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
  const renderer = rendererForBrief(brief)
  const composition = compositionForBrief(brief)
  const mainModules = brief.moduleOrder.filter((module) => !brief.sidebarModules.includes(module))
  const sidebarModules = brief.sidebarModules.length ? brief.sidebarModules : family.layout.sidebarModules
  const sideModules = brief.layout === 'two-column' ? brief.moduleOrder.filter((module) => sidebarModules.includes(module)) : []
  const ir = composition.page === 'grid'
    ? { type: 'grid', columns: 2, gap: 20, items: brief.moduleOrder }
    : layoutMode === 'two-column'
      ? {
          type: 'split',
          gap: 22,
          columns: [
            { id: 'main', width: '1fr', items: mainModules },
            { id: 'side', width: '0.32fr', items: sideModules },
          ],
        }
      : { type: 'stack', items: brief.moduleOrder }
  const layoutSpec = {
    schemaVersion: 1,
    mode: layoutMode,
    regions: layoutMode === 'two-column' ? { main: mainModules, side: sideModules } : { main: mainModules },
    ir,
    blocks: brief.moduleOrder.map((module) => ({
      id: module,
      type: moduleTypes[module] || module,
      source: module,
      options: { preset: blockPreset(moduleTypes[module] || module).preset, family: brief.family },
    })),
  }
  const { templateCss: _templateCssForMetadata, ...designBrief } = brief
  const template = normalizeTemplateSpec({
    id,
    name: brief.name,
    description: brief.description || `${brief.name}：面向${brief.audience}场景的${brief.layout === 'two-column' ? '双栏' : '单栏'}模板`,
    family: brief.family,
    renderer,
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
    composition,
    templateCss: brief.templateCss,
    customCss: brief.customCss,
    metadata: {
      generatedBy: 'dsh-template-design',
      family: brief.family,
      familyName: family.name,
      audience: brief.audience,
      tone: brief.tone,
      bestFor: brief.bestFor,
      designBrief,
    },
  })
  const result = validateTemplateSpec(template)
  const qualityAudit = auditTemplateCss(brief.templateCss, id)
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
      `单栏页面规格已写入 composition.pageSpec：模块顺序、变体、密度和分页约束可被 Renderer 消费`,
      `使用通用结构 Renderer，差异由页面规格与独立 CSS 承载`,
      `${family.name}主题家族，模块使用稳定的语义预设而不是自由拼接 CSS`,
      `视觉质量闸门：${qualityAudit.status}（${qualityAudit.score}/${qualityAudit.total}，需浏览器截图确认）`,
    ],
    qualityAudit,
    nextSteps: [
      ...(qualityAudit.missing.length ? ['先补齐 templateCss 的正文层、作用域和 print 规则'] : []),
      '用 jobhunt_template_save 入库（用户已明确要求创建或应用时无需再次确认）',
      '用真实饱满简历调用 jobhunt_render 生成预览',
      '用 jobhunt_layout_metrics 读取真实 A4 指标，并根据截图继续调整',
    ],
  }
}
