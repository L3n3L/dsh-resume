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
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#1f3a5f', divider: 'solid', cornerRadius: 0 },
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
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#0f766e', mutedColor: '#64748b', divider: 'dashed', cornerRadius: 4 },
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
