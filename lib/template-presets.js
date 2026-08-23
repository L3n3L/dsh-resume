import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveUnderJobhunt } from './workspace.js'
import { assertTemplateSpec, TEMPLATE_DEFAULTS, validateCssText, validateTemplateSpec } from './template-schema.js'

const BUNDLED_TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates')

const PRESETS = [
  TEMPLATE_DEFAULTS,
  {
    ...TEMPLATE_DEFAULTS,
    id: 'two-column-brief',
    name: '双栏简报',
    description: '左侧压缩身份与技能，右侧按投递重点展开项目和经历',
    tags: ['双栏', '信息分区', '校招'],
    layout: { ...TEMPLATE_DEFAULTS.layout, mode: 'two-column', density: 'standard', moduleOrder: ['profile', 'skills', 'links', 'education', 'projects', 'experience'], sidebarRatio: 0.28, columnGap: 24 },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.08, lineHeight: 1.46 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 40, sectionGap: 16, paragraphGap: 4 },
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#0f766e', textColor: '#193b3b', mutedColor: '#5b7474', divider: 'solid', cornerRadius: 0, variant: 'standard' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'rail-engineering',
    name: '工程轨道',
    description: '用连续轨道串联技术栈、项目结果和交付节点，适合工程岗位',
    tags: ['技术', '轨道', '高密度'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'compact', moduleOrder: ['profile', 'skills', 'projects', 'experience', 'awards'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.08, lineHeight: 1.42 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 36, sectionGap: 13, paragraphGap: 3 },
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#155e75', textColor: '#172033', mutedColor: '#64748b', divider: 'solid', cornerRadius: 0, variant: 'technical' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'project-atlas',
    name: '项目图鉴',
    description: '以项目卡片和成果指标为主角，适合前端、产品和设计岗位',
    tags: ['作品集', '项目卡片', '成果导向'],
    layout: { ...TEMPLATE_DEFAULTS.layout, mode: 'two-column', density: 'standard', moduleOrder: ['profile', 'projects', 'experience', 'skills', 'education', 'links'], sidebarRatio: 0.31, columnGap: 20 },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.12, lineHeight: 1.48 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 40, sectionGap: 15, paragraphGap: 4 },
    family: 'portfolio-grid',
    renderer: 'portfolio-grid',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#7c3aed', textColor: '#2e243d', mutedColor: '#7c6f91', backgroundColor: '#fcfaff', divider: 'solid', cornerRadius: 7, variant: 'editorial' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'editorial-spread',
    name: '编辑开页',
    description: '衬线标题、短段落和杂志式留白，适合产品、运营和内容岗位',
    tags: ['编辑', '衬线', '阅读友好'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'airy', moduleOrder: ['profile', 'summary', 'experience', 'projects', 'education', 'skills'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'serif', fontSize: 14, headingScale: 1.28, lineHeight: 1.66 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 54, sectionGap: 22, paragraphGap: 7 },
    family: 'editorial-quiet',
    renderer: 'editorial',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#9a3412', textColor: '#292524', mutedColor: '#78716c', backgroundColor: '#fffaf2', divider: 'none', cornerRadius: 6, variant: 'editorial' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'research-dossier',
    name: '研究档案',
    description: '像研究档案一样组织教育、论文、项目和奖项，适合科研与复试',
    tags: ['学术', '研究生复试', '教育优先'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'standard', moduleOrder: ['profile', 'education', 'summary', 'projects', 'awards', 'skills'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'serif', fontSize: 13, headingScale: 1.16, lineHeight: 1.54 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 46, sectionGap: 17, paragraphGap: 4 },
    family: 'editorial-quiet',
    renderer: 'academic',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#475569', textColor: '#1e293b', mutedColor: '#64748b', backgroundColor: '#ffffff', divider: 'dashed', cornerRadius: 0, variant: 'editorial' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'swiss-modular',
    name: '瑞士模块',
    description: '严格的模块网格、强标题和黑白层级，适合设计与技术方向',
    tags: ['模块网格', '极简', '高对比'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'standard', moduleOrder: ['profile', 'summary', 'projects', 'skills', 'experience', 'education'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.26, lineHeight: 1.48 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 42, sectionGap: 18, paragraphGap: 4 },
    family: 'campus-clear',
    renderer: 'swiss-grid',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#111827', textColor: '#111827', mutedColor: '#4b5563', backgroundColor: '#ffffff', divider: 'solid', cornerRadius: 0, variant: 'standard' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'terminal-console',
    name: '终端控制台',
    description: '深色纸张、命令行节奏和青色信号，适合开发、测试和基础设施岗位',
    tags: ['暗黑', '终端', '工程'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'compact', moduleOrder: ['profile', 'skills', 'projects', 'experience', 'education'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.08, lineHeight: 1.42 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 40, sectionGap: 14, paragraphGap: 3 },
    family: 'mono-terminal',
    renderer: 'midnight-terminal',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#67e8f9', textColor: '#f8fafc', mutedColor: '#cbd5e1', backgroundColor: '#0f172a', divider: 'solid', cornerRadius: 2, variant: 'terminal' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'signal-sidebar',
    name: '信号侧栏',
    description: '深色侧栏承载联系方式和技能，主栏用亮色节奏突出经历成果',
    tags: ['侧栏', '强重心', '信息优先'],
    layout: { ...TEMPLATE_DEFAULTS.layout, mode: 'two-column', density: 'standard', moduleOrder: ['profile', 'skills', 'links', 'education', 'projects', 'experience'], sidebarRatio: 0.27, columnGap: 22 },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.1, lineHeight: 1.46 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 36, sectionGap: 17, paragraphGap: 4 },
    family: 'split-focus',
    renderer: 'sidebar-signal',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#f59e0b', textColor: '#172033', mutedColor: '#64748b', backgroundColor: '#ffffff', divider: 'solid', cornerRadius: 4, variant: 'standard' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'executive-ledger',
    name: '履历账本',
    description: '深色信息顶栏、金色标记和履历时间线，适合社招与项目成果丰富的候选人',
    tags: ['商务', '时间线', '社招'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'standard', moduleOrder: ['profile', 'experience', 'projects', 'education', 'skills', 'awards'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.12, lineHeight: 1.48 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 42, sectionGap: 18, paragraphGap: 5 },
    family: 'business-timeline',
    renderer: 'business-timeline',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#c8a45d', textColor: '#1f2937', mutedColor: '#64748b', backgroundColor: '#ffffff', divider: 'solid', cornerRadius: 0, variant: 'standard' },
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
    renderer: 'portrait-profile',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#db2777', textColor: '#24202a', mutedColor: '#776b7c', backgroundColor: '#fffafe', divider: 'solid', cornerRadius: 14, variant: 'editorial' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'magazine-feature',
    name: '杂志开篇',
    description: '大标题、开篇主叙事和错落栏流，适合内容、品牌、运营和产品岗位',
    tags: ['运营', '杂志', '叙事'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'airy', moduleOrder: ['profile', 'summary', 'projects', 'experience', 'education', 'skills'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'serif', fontSize: 14, headingScale: 1.3, lineHeight: 1.62 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 48, sectionGap: 20, paragraphGap: 7 },
    family: 'magazine-editorial',
    renderer: 'magazine-feature',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#be123c', textColor: '#292524', mutedColor: '#78716c', backgroundColor: '#fffdf7', divider: 'none', cornerRadius: 0, variant: 'editorial' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'metrics-board',
    name: '成果看板',
    description: '用编号、卡片和结果信号优先呈现项目价值，适合产品、数据和工程岗位',
    tags: ['成果', '数据', '产品'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'compact', moduleOrder: ['profile', 'summary', 'projects', 'experience', 'skills', 'education'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.1, lineHeight: 1.42 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 38, sectionGap: 14, paragraphGap: 3 },
    family: 'impact-board',
    renderer: 'metrics-board',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#0e7490', textColor: '#102a43', mutedColor: '#627d98', backgroundColor: '#f7fbfc', divider: 'solid', cornerRadius: 8, variant: 'technical' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'color-block',
    name: '色块分区',
    description: '用整块色带划分身份、能力和经历，适合运营、市场与偏视觉岗位',
    tags: ['运营', '色块', '强识别'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'standard', moduleOrder: ['profile', 'summary', 'skills', 'projects', 'experience', 'education'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.16, lineHeight: 1.5 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 42, sectionGap: 16, paragraphGap: 4 },
    family: 'operation-block',
    renderer: 'color-block',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#ea580c', textColor: '#2b2118', mutedColor: '#806b5e', backgroundColor: '#fffaf5', divider: 'none', cornerRadius: 4, variant: 'standard' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'chronicle-rail',
    name: '经历编年',
    description: '把每段经历放进连续的日期轨道，适合社招、项目履历和跨阶段成长经历',
    tags: ['社招', '编年', '经历优先'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'standard', moduleOrder: ['profile', 'experience', 'projects', 'education', 'skills', 'awards'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.12, lineHeight: 1.48 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 40, sectionGap: 17, paragraphGap: 4 },
    family: 'career-chronicle',
    renderer: 'chronicle-rail',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#4338ca', textColor: '#1e1b4b', mutedColor: '#6b6aa5', backgroundColor: '#fbfbff', divider: 'solid', cornerRadius: 0, variant: 'standard' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'minimal-typographic',
    name: '纯字留白',
    description: '极少装饰、极强字号层级和编号留白，适合需要克制表达的通用投递',
    tags: ['简约', '留白', '通用'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'airy', moduleOrder: ['profile', 'summary', 'experience', 'projects', 'education', 'skills'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'serif', fontSize: 14, headingScale: 1.24, lineHeight: 1.7 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 60, sectionGap: 24, paragraphGap: 7 },
    family: 'simple-typographic',
    renderer: 'minimal-typographic',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#111827', textColor: '#111827', mutedColor: '#6b7280', backgroundColor: '#ffffff', divider: 'none', cornerRadius: 0, variant: 'standard' },
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
    renderer: 'geek-lab',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#a3e635', textColor: '#ecfccb', mutedColor: '#a7b89a', backgroundColor: '#101610', divider: 'solid', cornerRadius: 2, variant: 'terminal' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'heading-stack',
    name: '主标题层叠',
    description: '用巨型标题、侧边标签和层叠留白制造强烈第一眼层级，适合设计与品牌岗位',
    tags: ['设计', '主标题', '强层级'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'airy', moduleOrder: ['profile', 'summary', 'projects', 'experience', 'skills', 'education'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 14, headingScale: 1.28, lineHeight: 1.62 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 50, sectionGap: 22, paragraphGap: 6 },
    family: 'heading-stack',
    renderer: 'heading-stack',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#7c2d12', textColor: '#292524', mutedColor: '#78716c', backgroundColor: '#fff7ed', divider: 'solid', cornerRadius: 0, variant: 'editorial' },
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
    renderer: 'case-study',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#2563eb', textColor: '#172033', mutedColor: '#64748b', backgroundColor: '#f8fbff', divider: 'solid', cornerRadius: 10, variant: 'standard' },
  },
  {
    ...TEMPLATE_DEFAULTS,
    id: 'social-profile',
    name: '社交名片',
    description: '像个人主页一样组织状态、联系方式和经历动态，适合自由职业与创意岗位',
    tags: ['个人品牌', '名片', '创意'],
    layout: { ...TEMPLATE_DEFAULTS.layout, density: 'standard', moduleOrder: ['profile', 'links', 'summary', 'projects', 'experience', 'skills', 'education'] },
    typography: { ...TEMPLATE_DEFAULTS.typography, fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.12, lineHeight: 1.5 },
    spacing: { ...TEMPLATE_DEFAULTS.spacing, pageMargin: 42, sectionGap: 18, paragraphGap: 5 },
    family: 'social-profile',
    renderer: 'social-profile',
    visual: { ...TEMPLATE_DEFAULTS.visual, accentColor: '#059669', textColor: '#12312a', mutedColor: '#6b877f', backgroundColor: '#f7fffc', divider: 'solid', cornerRadius: 12, variant: 'standard' },
  },
]

const FAMILY_BY_PRESET = {
  'campus-standard': 'campus-clear',
  'two-column-brief': 'split-focus',
  'rail-engineering': 'engineering-dense',
  'project-atlas': 'portfolio-grid',
  'editorial-spread': 'editorial-quiet',
  'research-dossier': 'editorial-quiet',
  'swiss-modular': 'campus-clear',
  'terminal-console': 'mono-terminal',
  'signal-sidebar': 'split-focus',
  'executive-ledger': 'business-timeline',
  'portrait-profile': 'avatar-profile',
  'magazine-feature': 'magazine-editorial',
  'metrics-board': 'impact-board',
  'color-block': 'operation-block',
  'chronicle-rail': 'career-chronicle',
  'minimal-typographic': 'simple-typographic',
  'geek-lab': 'geek-lab',
  'heading-stack': 'heading-stack',
  'case-study': 'case-study',
  'social-profile': 'social-profile',
}

const RENDERER_BY_PRESET = {
  'campus-standard': 'clean-single',
  'two-column-brief': 'split-sidebar',
  'rail-engineering': 'technical-timeline',
  'project-atlas': 'portfolio-grid',
  'editorial-spread': 'editorial',
  'research-dossier': 'academic',
  'swiss-modular': 'swiss-grid',
  'terminal-console': 'midnight-terminal',
  'signal-sidebar': 'sidebar-signal',
  'executive-ledger': 'business-timeline',
  'portrait-profile': 'portrait-profile',
  'magazine-feature': 'magazine-feature',
  'metrics-board': 'metrics-board',
  'color-block': 'color-block',
  'chronicle-rail': 'chronicle-rail',
  'minimal-typographic': 'minimal-typographic',
  'geek-lab': 'geek-lab',
  'heading-stack': 'heading-stack',
  'case-study': 'case-study',
  'social-profile': 'social-profile',
}

// Old IDs stay loadable for existing workspaces, but are intentionally not
// returned by listTemplatePresets() and therefore do not appear in the gallery.
const LEGACY_TEMPLATE_ALIASES = Object.freeze({
  'tech-compact': 'rail-engineering',
  'quiet-editorial': 'editorial-spread',
  'mono-terminal': 'terminal-console',
  'split-sidebar': 'two-column-brief',
  'engineering-timeline': 'rail-engineering',
  'portfolio-grid': 'project-atlas',
  'product-signal': 'editorial-spread',
  'academic-research': 'research-dossier',
  'swiss-grid': 'swiss-modular',
  'midnight-terminal': 'terminal-console',
  'editorial-serif': 'editorial-spread',
  'portfolio-cards': 'project-atlas',
  'academic-paper': 'research-dossier',
  'sidebar-signal': 'signal-sidebar',
  'business-timeline': 'executive-ledger',
})

// Early workspace experiments remain loadable for existing links, but should
// not reappear in the refreshed gallery as near-duplicates of the new families.
const HIDDEN_LEGACY_WORKSPACE_TEMPLATES = new Set([
  'premium-navy',
  'quiet-editorial-filled',
  'soft-tinted',
])

const VALID_PRESETS = PRESETS.map((preset) => assertTemplateSpec({
  ...preset,
  family: FAMILY_BY_PRESET[preset.id] || preset.family || 'campus-clear',
  renderer: RENDERER_BY_PRESET[preset.id] || preset.renderer || 'clean-single',
  metadata: {
    ...(preset.metadata || {}),
    generatedBy: 'dsh-built-in-template',
    family: FAMILY_BY_PRESET[preset.id] || 'campus-clear',
  },
}))

export function listTemplatePresets() {
  return VALID_PRESETS.map((preset) => JSON.parse(JSON.stringify(preset)))
}

export function getTemplatePreset(id) {
  const resolvedId = LEGACY_TEMPLATE_ALIASES[id] || id
  const preset = VALID_PRESETS.find((item) => item.id === resolvedId) || VALID_PRESETS[0]
  const result = JSON.parse(JSON.stringify(preset))
  if (LEGACY_TEMPLATE_ALIASES[id]) result.id = id
  return result
}

export function validateTemplate(input) {
  return validateTemplateSpec(input)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function builtInTemplate(id) {
  return VALID_PRESETS.find((preset) => preset.id === id) || (LEGACY_TEMPLATE_ALIASES[id] ? getTemplatePreset(id) : undefined)
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
  const resolvedId = LEGACY_TEMPLATE_ALIASES[id] || id
  const cssPath = builtInTemplate(resolvedId)
    ? path.join(BUNDLED_TEMPLATE_DIR, `${resolvedId}.css`)
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
      if (HIDDEN_LEGACY_WORKSPACE_TEMPLATES.has(result.value.id)) continue
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
