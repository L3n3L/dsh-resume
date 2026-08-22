const FAMILY_IDS = new Set([
  'campus-clear',
  'engineering-dense',
  'split-focus',
  'editorial-quiet',
  'mono-terminal',
  'portfolio-grid',
  'business-timeline',
])

const BLOCK_PRESETS = Object.freeze({
  profile: { label: '个人信息', preset: 'identity' },
  education: { label: '教育经历', preset: 'standard-section' },
  skills: { label: '专业技能', preset: 'skill-list' },
  'skill-tags': { label: '技能标签', preset: 'tags' },
  projects: { label: '项目经历', preset: 'project-list' },
  'project-list': { label: '项目列表', preset: 'project-list' },
  'portfolio-card': { label: '项目卡片', preset: 'portfolio-card' },
  experience: { label: '实习经历', preset: 'standard-entry' },
  timeline: { label: '经历时间线', preset: 'timeline' },
  'metric-row': { label: '成果指标', preset: 'metrics' },
  awards: { label: '获奖经历', preset: 'standard-section' },
  links: { label: '链接信息', preset: 'compact-links' },
  'custom-section': { label: '自定义模块', preset: 'custom' },
})

const THEME_FAMILIES = Object.freeze({
  'campus-clear': {
    id: 'campus-clear', name: '校招清晰', description: '稳定、清楚、适合大多数校园投递场景', audience: ['campus', 'general'], tags: ['校招', '清晰', '单栏'],
    layout: { mode: 'single-column', density: 'standard', sidebarModules: [] },
    typography: { fontFamily: 'system-sans', fontSize: 14, headingScale: 1.14, lineHeight: 1.55 },
    spacing: { pageMargin: 48, sectionGap: 20, paragraphGap: 6 },
    visual: { accentColor: '#2563eb', textColor: '#1f2937', mutedColor: '#6b7280', backgroundColor: '#ffffff', divider: 'solid', cornerRadius: 0, variant: 'standard' },
    moduleTypes: { skills: 'skills', projects: 'project-list', experience: 'experience' },
  },
  'engineering-dense': {
    id: 'engineering-dense', name: '工程密集', description: '突出技术栈、工程结果和高信息密度', audience: ['engineering'], tags: ['技术', '高密度', '单栏'],
    layout: { mode: 'single-column', density: 'compact', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.1, lineHeight: 1.4 },
    spacing: { pageMargin: 38, sectionGap: 14, paragraphGap: 3 },
    visual: { accentColor: '#1e3a5f', textColor: '#172033', mutedColor: '#64748b', backgroundColor: '#ffffff', divider: 'solid', cornerRadius: 0, variant: 'technical' },
    moduleTypes: { skills: 'skill-tags', projects: 'project-list', experience: 'timeline' },
  },
  'split-focus': {
    id: 'split-focus', name: '双栏侧重', description: '侧栏承载技能与链接，主栏突出项目和经历', audience: ['campus', 'engineering', 'product'], tags: ['双栏', '项目优先'],
    layout: { mode: 'two-column', density: 'standard', sidebarModules: ['skills', 'links', 'awards'] },
    typography: { fontFamily: 'system-sans', fontSize: 14, headingScale: 1.12, lineHeight: 1.5 },
    spacing: { pageMargin: 42, sectionGap: 17, paragraphGap: 5 },
    visual: { accentColor: '#0f766e', textColor: '#1f2937', mutedColor: '#64748b', backgroundColor: '#ffffff', divider: 'solid', cornerRadius: 2, variant: 'standard' },
    moduleTypes: { skills: 'skill-tags', projects: 'portfolio-card', experience: 'timeline' },
  },
  'editorial-quiet': {
    id: 'editorial-quiet', name: '安静编辑', description: '低装饰、舒展、适合阅读型岗位', audience: ['product', 'general', 'academic'], tags: ['舒展', '阅读友好', '单栏'],
    layout: { mode: 'single-column', density: 'airy', sidebarModules: [] },
    typography: { fontFamily: 'serif', fontSize: 15, headingScale: 1.2, lineHeight: 1.7 },
    spacing: { pageMargin: 58, sectionGap: 26, paragraphGap: 8 },
    visual: { accentColor: '#0f766e', textColor: '#243238', mutedColor: '#718096', backgroundColor: '#fffdf8', divider: 'none', cornerRadius: 6, variant: 'editorial' },
    moduleTypes: { skills: 'skills', projects: 'project-list', experience: 'experience' },
  },
  'mono-terminal': {
    id: 'mono-terminal', name: '黑白终端', description: '高对比、少装饰、适合开发和测试岗位', audience: ['engineering'], tags: ['黑白', '终端', '紧凑'],
    layout: { mode: 'single-column', density: 'compact', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.1, lineHeight: 1.4 },
    spacing: { pageMargin: 38, sectionGap: 15, paragraphGap: 3 },
    visual: { accentColor: '#c2410c', textColor: '#172033', mutedColor: '#64748b', backgroundColor: '#fffaf5', divider: 'solid', cornerRadius: 2, variant: 'terminal' },
    moduleTypes: { skills: 'skill-tags', projects: 'project-list', experience: 'timeline' },
  },
  'portfolio-grid': {
    id: 'portfolio-grid', name: '项目作品集', description: '适合项目较多、需要突出作品结果的投递场景', audience: ['design', 'product', 'engineering'], tags: ['作品集', '双栏', '项目卡片'],
    layout: { mode: 'two-column', density: 'standard', sidebarModules: ['skills', 'links'] },
    typography: { fontFamily: 'modern-sans', fontSize: 14, headingScale: 1.16, lineHeight: 1.55 },
    spacing: { pageMargin: 44, sectionGap: 18, paragraphGap: 5 },
    visual: { accentColor: '#7c3aed', textColor: '#2e243d', mutedColor: '#7c6f91', backgroundColor: '#fcfaff', divider: 'solid', cornerRadius: 8, variant: 'editorial' },
    moduleTypes: { skills: 'skill-tags', projects: 'portfolio-card', experience: 'timeline' },
  },
  'business-timeline': {
    id: 'business-timeline', name: '商务时间线', description: '深色顶栏、金色信号和履历时间线，适合工作经历与项目成果丰富的候选人', audience: ['general', 'product', 'engineering'], tags: ['商务', '时间线', '项目履历'],
    layout: { mode: 'single-column', density: 'standard', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.12, lineHeight: 1.48 },
    spacing: { pageMargin: 42, sectionGap: 18, paragraphGap: 5 },
    visual: { accentColor: '#c8a45d', textColor: '#1f2937', mutedColor: '#64748b', backgroundColor: '#ffffff', divider: 'solid', cornerRadius: 0, variant: 'standard' },
    moduleTypes: { skills: 'skill-tags', projects: 'project-list', experience: 'timeline' },
  },
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function listThemeFamilies() {
  return Object.values(THEME_FAMILIES).map((family) => ({
    ...clone(family),
    supportedBlocks: Object.entries(family.moduleTypes).map(([module, type]) => ({ module, type, ...(BLOCK_PRESETS[type] || BLOCK_PRESETS['custom-section']) })),
  }))
}

export function resolveThemeFamily(id = 'campus-clear') {
  return clone(THEME_FAMILIES[FAMILY_IDS.has(id) ? id : 'campus-clear'])
}

export function blockPreset(type = 'custom-section') {
  return clone(BLOCK_PRESETS[type] || BLOCK_PRESETS['custom-section'])
}

export const THEME_FAMILY_IDS = Object.freeze([...FAMILY_IDS])
export const THEME_BLOCK_PRESETS = BLOCK_PRESETS
