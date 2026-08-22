const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX_PATTERN = /^#[0-9a-f]{6}$/i
const MODULES = new Set(['profile', 'education', 'skills', 'projects', 'experience', 'awards', 'links', 'photo', 'summary', 'contact'])
const DENSITIES = new Set(['compact', 'standard', 'airy'])
const DIVIDERS = new Set(['none', 'solid', 'dashed'])
const FONTS = new Set(['system-sans', 'modern-sans', 'serif'])
const VARIANTS = new Set(['standard', 'technical', 'editorial', 'terminal'])
const RENDERERS = new Set(['clean-single', 'split-sidebar', 'technical-timeline', 'portfolio-grid', 'editorial', 'academic', 'swiss-grid', 'midnight-terminal', 'sidebar-signal', 'business-timeline'])
const LAYOUT_MODES = new Set(['single-column', 'two-column'])
const MAX_CUSTOM_CSS_LENGTH = 16000
const UNSAFE_CUSTOM_CSS = /<\/?(?:style|script)|@import\b|@namespace\b|@font-face\b|url\s*\(|javascript\s*:|expression\s*\(|behavior\s*:/i

export const TEMPLATE_DEFAULTS = Object.freeze({
  schemaVersion: 1,
  id: 'campus-standard',
  name: '校招标准',
  description: '清晰稳重的单栏校园求职模板',
  family: 'campus-clear',
  renderer: 'clean-single',
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
  customCss: '',
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
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
  spec.customCss = typeof spec.customCss === 'string' ? spec.customCss : ''
  spec.tags = Array.isArray(spec.tags) ? spec.tags.filter((tag) => typeof tag === 'string').slice(0, 6) : []
  spec.layout.moduleOrder = Array.isArray(spec.layout.moduleOrder)
    ? [...new Set(spec.layout.moduleOrder.filter((module) => MODULES.has(module)))]
    : clone(TEMPLATE_DEFAULTS.layout.moduleOrder)
  return spec
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
  return { valid: errors.length === 0, errors, value: spec }
}

export function assertTemplateSpec(input) {
  const result = validateTemplateSpec(input)
  if (!result.valid) throw new Error(`invalid template: ${result.errors.join('; ')}`)
  return result.value
}
