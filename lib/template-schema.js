const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX_PATTERN = /^#[0-9a-f]{6}$/i
const MODULES = new Set(['profile', 'education', 'skills', 'projects', 'experience', 'awards', 'links', 'photo', 'summary', 'contact'])
const DENSITIES = new Set(['compact', 'standard', 'airy'])
const DIVIDERS = new Set(['none', 'solid', 'dashed'])
const FONTS = new Set(['system-sans', 'modern-sans', 'serif'])
const VARIANTS = new Set(['standard', 'technical', 'editorial', 'terminal'])
const RENDERERS = new Set(['composition'])
const LAYOUT_MODES = new Set(['single-column', 'two-column'])
export const COMPOSITION_OPTIONS = Object.freeze({
  page: Object.freeze(['stack', 'split', 'grid']),
  header: Object.freeze(['standard', 'hero']),
  section: Object.freeze(['line', 'badge']),
  entry: Object.freeze(['stack', 'timeline']),
  meta: Object.freeze(['inline', 'split']),
  skills: Object.freeze(['list', 'chips']),
})
const PAGE_SPEC_HEADER_VARIANTS = new Set(['masthead', 'split', 'centered', 'compact', 'command'])
const PAGE_SPEC_HEADER_ALIGNMENTS = new Set(['left', 'center', 'right'])
const PAGE_SPEC_IDENTITY_VARIANTS = new Set(['stacked', 'inline', 'split'])
const PAGE_SPEC_CONTACT_VARIANTS = new Set(['inline', 'stacked', 'split'])
const PAGE_SPEC_SECTION_VARIANTS = new Set(['plain', 'numbered-rail', 'badge', 'rule', 'marker'])
const PAGE_SPEC_ENTRY_VARIANTS = new Set(['standard', 'timeline', 'feature-first', 'compact', 'role-stack'])
const PAGE_SPEC_PROJECT_VARIANTS = new Set(['standard', 'timeline', 'feature-first', 'cards', 'compact'])
const PAGE_SPEC_SKILL_VARIANTS = new Set(['list', 'grouped-chips', 'rows', 'inline'])
const PAGE_SPEC_TYPE_SCALES = new Set(['compact', 'balanced', 'display'])
const PAGE_SPEC_RULE_STYLES = new Set(['none', 'hairline', 'solid', 'dashed'])
const PAGE_SPEC_ACCENT_MODES = new Set(['text', 'marker', 'surface', 'rule'])
const COMPOSITION_KEYS = Object.freeze(Object.fromEntries(
  Object.entries(COMPOSITION_OPTIONS).map(([key, values]) => [key, new Set(values)]),
))
const PAGE_SPEC_MODULES = new Set(['profile', 'summary', 'contact', 'experience', 'projects', 'education', 'skills', 'awards', 'links', 'photo'])
export const COMPOSITION_PAGE_SPEC_DEFAULTS = Object.freeze({
  schemaVersion: 1,
  page: { size: 'A4', column: 'single', density: 'standard', margin: { top: 40, right: 44, bottom: 40, left: 44 } },
  header: { variant: 'masthead', alignment: 'left', identity: 'stacked', contact: 'inline' },
  flow: { order: ['profile', 'summary', 'experience', 'projects', 'education', 'skills'], keepEntryTogether: true, avoidSectionOrphans: true },
  modules: { section: 'rule', experience: 'standard', projects: 'standard', skills: 'list', education: 'compact', awards: 'compact' },
  visual: { family: 'campus-clear', typeScale: 'balanced', ruleStyle: 'hairline', accentMode: 'marker' },
})
export const MAX_CUSTOM_CSS_LENGTH = 64000
export const MAX_TEMPLATE_CSS_LENGTH = 64000
const CSS_URL_PATTERN = /url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi
const UNSAFE_CSS = /<\/?(?:style|script)|@import\b|@namespace\b|javascript\s*:|expression\s*\(|behavior\s*:/i
const UNSAFE_CUSTOM_CSS = /<\/?(?:style|script)|@import\b|@namespace\b|@font-face\b|javascript\s*:|expression\s*\(|behavior\s*:/i

export const TEMPLATE_DEFAULTS = Object.freeze({
  schemaVersion: 1,
  id: 'campus-standard',
  name: '校招标准',
  description: '清晰稳重的单栏校园求职模板',
  family: 'campus-clear',
  renderer: 'composition',
  tags: ['校招', '单栏', '标准'],
  layout: {
    mode: 'single-column',
    pageTarget: 1,
    density: 'standard',
    moduleOrder: ['profile', 'education', 'skills', 'projects', 'experience'],
    sidebarRatio: 0.32,
    columnGap: 24,
  },
  typography: {
    fontFamily: 'system-sans',
    fontSize: 14,
    headingScale: 1.14,
    lineHeight: 1.55,
  },
  spacing: {
    pageMargin: 48,
    sectionGap: 20,
    paragraphGap: 6,
  },
  visual: {
    accentColor: '#2563eb',
    textColor: '#1f2937',
    mutedColor: '#6b7280',
    backgroundColor: '#ffffff',
    divider: 'solid',
    cornerRadius: 0,
    variant: 'standard',
  },
  // Transient when loaded/generated; persisted separately as templates/<id>.css.
  templateCss: '',
  customCss: '',
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizePageSpecMargin(value, fallback) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const result = {}
  for (const key of ['top', 'right', 'bottom', 'left']) {
    const number = Number(source[key])
    result[key] = Number.isFinite(number) ? Math.min(72, Math.max(24, number)) : fallback[key]
  }
  return result
}

export function normalizeCompositionPageSpec(input = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const defaults = COMPOSITION_PAGE_SPEC_DEFAULTS
  const page = raw.page && typeof raw.page === 'object' && !Array.isArray(raw.page) ? raw.page : {}
  const header = raw.header && typeof raw.header === 'object' && !Array.isArray(raw.header) ? raw.header : {}
  const flow = raw.flow && typeof raw.flow === 'object' && !Array.isArray(raw.flow) ? raw.flow : {}
  const modules = raw.modules && typeof raw.modules === 'object' && !Array.isArray(raw.modules) ? raw.modules : {}
  const visual = raw.visual && typeof raw.visual === 'object' && !Array.isArray(raw.visual) ? raw.visual : {}
  const order = Array.isArray(flow.order)
    ? [...new Set(flow.order.filter((id) => typeof id === 'string' && PAGE_SPEC_MODULES.has(id)))]
    : [...defaults.flow.order]
  return {
    schemaVersion: 1,
    page: {
      size: page.size === 'A4' ? 'A4' : defaults.page.size,
      column: page.column === 'single' ? 'single' : defaults.page.column,
      density: DENSITIES.has(page.density) ? page.density : defaults.page.density,
      margin: normalizePageSpecMargin(page.margin, defaults.page.margin),
    },
    header: {
      variant: PAGE_SPEC_HEADER_VARIANTS.has(header.variant) ? header.variant : defaults.header.variant,
      alignment: PAGE_SPEC_HEADER_ALIGNMENTS.has(header.alignment) ? header.alignment : defaults.header.alignment,
      identity: PAGE_SPEC_IDENTITY_VARIANTS.has(header.identity) ? header.identity : defaults.header.identity,
      contact: PAGE_SPEC_CONTACT_VARIANTS.has(header.contact) ? header.contact : defaults.header.contact,
    },
    flow: {
      order: order.length ? order : [...defaults.flow.order],
      keepEntryTogether: flow.keepEntryTogether !== false,
      avoidSectionOrphans: flow.avoidSectionOrphans !== false,
    },
    modules: {
      section: PAGE_SPEC_SECTION_VARIANTS.has(modules.section) ? modules.section : defaults.modules.section,
      experience: PAGE_SPEC_ENTRY_VARIANTS.has(modules.experience) ? modules.experience : defaults.modules.experience,
      projects: PAGE_SPEC_PROJECT_VARIANTS.has(modules.projects) ? modules.projects : defaults.modules.projects,
      skills: PAGE_SPEC_SKILL_VARIANTS.has(modules.skills) ? modules.skills : defaults.modules.skills,
      education: modules.education === 'standard' ? 'standard' : defaults.modules.education,
      awards: modules.awards === 'standard' ? 'standard' : defaults.modules.awards,
    },
    visual: {
      family: typeof visual.family === 'string' && /^[a-z0-9-]{2,40}$/.test(visual.family) ? visual.family : defaults.visual.family,
      typeScale: PAGE_SPEC_TYPE_SCALES.has(visual.typeScale) ? visual.typeScale : defaults.visual.typeScale,
      ruleStyle: PAGE_SPEC_RULE_STYLES.has(visual.ruleStyle) ? visual.ruleStyle : defaults.visual.ruleStyle,
      accentMode: PAGE_SPEC_ACCENT_MODES.has(visual.accentMode) ? visual.accentMode : defaults.visual.accentMode,
    },
  }
}

export function validateCompositionPageSpec(input) {
  const spec = normalizeCompositionPageSpec(input)
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const rawPage = raw.page && typeof raw.page === 'object' && !Array.isArray(raw.page) ? raw.page : {}
  const errors = []
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1) errors.push('composition.pageSpec.schemaVersion must be 1')
  if (rawPage.size !== undefined && rawPage.size !== 'A4') errors.push('composition.pageSpec.page.size must be A4')
  if (rawPage.column !== undefined && rawPage.column !== 'single') errors.push('composition.pageSpec.page.column must be single')
  if (!DENSITIES.has(spec.page.density)) errors.push('composition.pageSpec.page.density is invalid')
  for (const key of ['top', 'right', 'bottom', 'left']) {
    if (!numberInRange(spec.page.margin[key], 24, 72)) errors.push(`composition.pageSpec.page.margin.${key} must be between 24 and 72`)
  }
  if (!spec.flow.order.length) errors.push('composition.pageSpec.flow.order cannot be empty')
  return { valid: errors.length === 0, errors, value: spec }
}

function merge(base, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clone(base)
  return {
    ...clone(base),
    ...value,
    layout: { ...clone(base.layout), ...(value.layout || {}) },
    typography: { ...clone(base.typography), ...(value.typography || {}) },
    spacing: { ...clone(base.spacing), ...(value.spacing || {}) },
    visual: { ...clone(base.visual), ...(value.visual || {}) },
  }
}

function numberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function relativeLuminance(hex) {
  const values = hex.slice(1).match(/.{2}/g)?.map((pair) => parseInt(pair, 16) / 255)
  if (!values || values.length !== 3) return null
  const linear = values.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(first, second) {
  if (!HEX_PATTERN.test(first) || !HEX_PATTERN.test(second)) return 0
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  if (firstLuminance == null || secondLuminance == null) return 0
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

export function normalizeTemplateSpec(input = {}) {
  const spec = merge(TEMPLATE_DEFAULTS, input)
  spec.schemaVersion = 1
  spec.templateCss = typeof spec.templateCss === 'string' ? spec.templateCss : ''
  spec.customCss = typeof spec.customCss === 'string' ? spec.customCss : ''
  spec.tags = Array.isArray(spec.tags) ? spec.tags.filter((tag) => typeof tag === 'string').slice(0, 6) : []
  spec.layout.moduleOrder = Array.isArray(spec.layout.moduleOrder)
    ? [...new Set(spec.layout.moduleOrder.filter((module) => MODULES.has(module)))]
    : clone(TEMPLATE_DEFAULTS.layout.moduleOrder)
  if (spec.composition && typeof spec.composition === 'object' && !Array.isArray(spec.composition)) {
    const rawComposition = spec.composition
    spec.composition = Object.fromEntries(Object.entries(COMPOSITION_KEYS)
      .filter(([key]) => typeof rawComposition[key] === 'string')
      .map(([key]) => [key, rawComposition[key]]))
    if (rawComposition.pageSpec && typeof rawComposition.pageSpec === 'object' && !Array.isArray(rawComposition.pageSpec)) {
      spec.composition.pageSpec = normalizeCompositionPageSpec(rawComposition.pageSpec)
    }
  } else {
    delete spec.composition
  }
  return spec
}

function safeCssUrl(value) {
  const url = String(value || '').trim()
  if (!url || url.startsWith('#')) return true
  if (/^data:image\/(?:svg\+xml|png|gif|jpe?g|webp)(?:;|,)/i.test(url)) {
    return !/<\/?(?:script|foreignObject)\b|javascript\s*:|on[a-z]+\s*=/i.test(url)
  }
  return /^\/dsh-resume\/api\/asset\?[^\s"']+$/i.test(url)
}

export function validateCssText(value, { kind = 'templateCss', maxLength = MAX_TEMPLATE_CSS_LENGTH } = {}) {
  const css = typeof value === 'string' ? value : ''
  const errors = []
  if (css.length > maxLength) errors.push(`${kind} must be at most ${maxLength} characters`)
  if (UNSAFE_CSS.test(css)) errors.push(`${kind} contains disallowed HTML, external resource, or behavior rules`)
  for (const match of css.matchAll(CSS_URL_PATTERN)) {
    if (!safeCssUrl(match[2])) {
      errors.push(`${kind} url() may only use data:image/*, #fragment, or /dsh-resume/api/asset resources`)
      break
    }
  }
  return { valid: errors.length === 0, errors, value: css }
}

export function validateTemplateSpec(input) {
  const spec = normalizeTemplateSpec(input)
  const errors = []
  if (!ID_PATTERN.test(spec.id)) errors.push('id must be lower-kebab-case')
  if (!spec.name || typeof spec.name !== 'string' || spec.name.length > 40) errors.push('name is required and must be at most 40 characters')
  if (typeof spec.family !== 'string' || !spec.family || spec.family.length > 40) errors.push('family is required and must be at most 40 characters')
  if (!RENDERERS.has(spec.renderer)) errors.push('renderer is invalid')
  if (!LAYOUT_MODES.has(spec.layout.mode)) errors.push('layout.mode is invalid')
  if (spec.layout.pageTarget !== 1) errors.push('pageTarget must be 1 in P0')
  if (!DENSITIES.has(spec.layout.density)) errors.push('layout.density is invalid')
  if (!spec.layout.moduleOrder.length) errors.push('layout.moduleOrder cannot be empty')
  if (!numberInRange(spec.layout.sidebarRatio, 0.24, 0.45)) errors.push('layout.sidebarRatio must be between 0.24 and 0.45')
  if (!numberInRange(spec.layout.columnGap, 12, 40)) errors.push('layout.columnGap must be between 12 and 40')
  if (spec.composition) {
    for (const [key, allowed] of Object.entries(COMPOSITION_KEYS)) {
      if (spec.composition[key] !== undefined && !allowed.has(spec.composition[key])) errors.push(`composition.${key} is invalid`)
    }
    if (spec.composition.pageSpec) errors.push(...validateCompositionPageSpec(spec.composition.pageSpec).errors)
  }
  if (!FONTS.has(spec.typography.fontFamily)) errors.push('typography.fontFamily is invalid')
  if (!numberInRange(spec.typography.fontSize, 11, 18)) errors.push('typography.fontSize must be between 11 and 18')
  if (!numberInRange(spec.typography.headingScale, 1.05, 1.5)) errors.push('typography.headingScale must be between 1.05 and 1.5')
  if (!numberInRange(spec.typography.lineHeight, 1.2, 2)) errors.push('typography.lineHeight must be between 1.2 and 2')
  if (!numberInRange(spec.spacing.pageMargin, 24, 72)) errors.push('spacing.pageMargin must be between 24 and 72')
  if (!numberInRange(spec.spacing.sectionGap, 6, 30)) errors.push('spacing.sectionGap must be between 6 and 30')
  if (!numberInRange(spec.spacing.paragraphGap, 0, 16)) errors.push('spacing.paragraphGap must be between 0 and 16')
  for (const key of ['accentColor', 'textColor', 'mutedColor', 'backgroundColor']) {
    if (!HEX_PATTERN.test(spec.visual[key])) errors.push(`visual.${key} must be a six-digit hex color`)
  }
  if (HEX_PATTERN.test(spec.visual.textColor) && HEX_PATTERN.test(spec.visual.backgroundColor) && contrastRatio(spec.visual.textColor, spec.visual.backgroundColor) < 4.5) {
    errors.push('visual.textColor and visual.backgroundColor must have a contrast ratio of at least 4.5:1')
  }
  if (!DIVIDERS.has(spec.visual.divider)) errors.push('visual.divider is invalid')
  if (!numberInRange(spec.visual.cornerRadius, 0, 16)) errors.push('visual.cornerRadius must be between 0 and 16')
  if (!VARIANTS.has(spec.visual.variant)) errors.push('visual.variant is invalid')
  if (spec.customCss.length > MAX_CUSTOM_CSS_LENGTH) errors.push(`customCss must be at most ${MAX_CUSTOM_CSS_LENGTH} characters`)
  if (UNSAFE_CUSTOM_CSS.test(spec.customCss)) errors.push('customCss contains disallowed HTML, external resource, or behavior rules')
  const templateCssResult = validateCssText(spec.templateCss, { kind: 'templateCss', maxLength: MAX_TEMPLATE_CSS_LENGTH })
  errors.push(...templateCssResult.errors)
  const customCssResult = validateCssText(spec.customCss, { kind: 'customCss', maxLength: MAX_CUSTOM_CSS_LENGTH })
  errors.push(...customCssResult.errors.filter((error) => !error.includes('HTML, external resource, or behavior rules')))
  return { valid: errors.length === 0, errors, value: spec }
}

export function assertTemplateSpec(input) {
  const result = validateTemplateSpec(input)
  if (!result.valid) throw new Error(`invalid template: ${result.errors.join('; ')}`)
  return result.value
}
