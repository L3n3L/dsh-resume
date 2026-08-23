const FAMILY_IDS = new Set([
  'campus-clear',
  'engineering-dense',
  'split-focus',
  'editorial-quiet',
  'mono-terminal',
  'portfolio-grid',
  'business-timeline',
  'avatar-profile',
  'magazine-editorial',
  'impact-board',
  'operation-block',
  'career-chronicle',
  'simple-typographic',
  'geek-lab',
  'heading-stack',
  'case-study',
  'social-profile',
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
  'avatar-profile': {
    id: 'avatar-profile', name: '肖像侧栏', description: '以头像和个人识别为视觉锚点', audience: ['design', 'product', 'general'], tags: ['设计', '头像', '个人品牌'],
    layout: { mode: 'single-column', density: 'standard', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.18, lineHeight: 1.5 },
    spacing: { pageMargin: 44, sectionGap: 18, paragraphGap: 5 },
    visual: { accentColor: '#db2777', textColor: '#24202a', mutedColor: '#776b7c', backgroundColor: '#fffafe', divider: 'solid', cornerRadius: 14, variant: 'editorial' },
    moduleTypes: { skills: 'skill-tags', projects: 'portfolio-card', experience: 'experience' },
  },
  'magazine-editorial': {
    id: 'magazine-editorial', name: '杂志开篇', description: '用主叙事和错落栏流组织经历', audience: ['product', 'general', 'design'], tags: ['运营', '杂志', '叙事'],
    layout: { mode: 'single-column', density: 'airy', sidebarModules: [] },
    typography: { fontFamily: 'serif', fontSize: 14, headingScale: 1.3, lineHeight: 1.62 },
    spacing: { pageMargin: 48, sectionGap: 20, paragraphGap: 7 },
    visual: { accentColor: '#be123c', textColor: '#292524', mutedColor: '#78716c', backgroundColor: '#fffdf7', divider: 'none', cornerRadius: 0, variant: 'editorial' },
    moduleTypes: { skills: 'skills', projects: 'project-list', experience: 'experience' },
  },
  'impact-board': {
    id: 'impact-board', name: '成果看板', description: '用编号卡片和结果信号强调项目价值', audience: ['engineering', 'product', 'general'], tags: ['成果', '数据', '产品'],
    layout: { mode: 'single-column', density: 'compact', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.1, lineHeight: 1.42 },
    spacing: { pageMargin: 38, sectionGap: 14, paragraphGap: 3 },
    visual: { accentColor: '#0e7490', textColor: '#102a43', mutedColor: '#627d98', backgroundColor: '#f7fbfc', divider: 'solid', cornerRadius: 8, variant: 'technical' },
    moduleTypes: { skills: 'skill-tags', projects: 'portfolio-card', experience: 'timeline' },
  },
  'operation-block': {
    id: 'operation-block', name: '色块分区', description: '用色带划分身份、能力和经历', audience: ['product', 'design', 'general'], tags: ['运营', '色块', '强识别'],
    layout: { mode: 'single-column', density: 'standard', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.16, lineHeight: 1.5 },
    spacing: { pageMargin: 42, sectionGap: 16, paragraphGap: 4 },
    visual: { accentColor: '#ea580c', textColor: '#2b2118', mutedColor: '#806b5e', backgroundColor: '#fffaf5', divider: 'none', cornerRadius: 4, variant: 'standard' },
    moduleTypes: { skills: 'skill-groups', projects: 'project-list', experience: 'experience' },
  },
  'career-chronicle': {
    id: 'career-chronicle', name: '经历编年', description: '用连续日期轨道呈现成长和交付节点', audience: ['general', 'engineering', 'product'], tags: ['社招', '编年', '经历优先'],
    layout: { mode: 'single-column', density: 'standard', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.12, lineHeight: 1.48 },
    spacing: { pageMargin: 40, sectionGap: 17, paragraphGap: 4 },
    visual: { accentColor: '#4338ca', textColor: '#1e1b4b', mutedColor: '#6b6aa5', backgroundColor: '#fbfbff', divider: 'solid', cornerRadius: 0, variant: 'standard' },
    moduleTypes: { skills: 'skill-tags', projects: 'project-list', experience: 'timeline' },
  },
  'simple-typographic': {
    id: 'simple-typographic', name: '纯字留白', description: '用极少装饰和强字号层级表达内容', audience: ['general', 'academic'], tags: ['简约', '留白', '通用'],
    layout: { mode: 'single-column', density: 'airy', sidebarModules: [] },
    typography: { fontFamily: 'serif', fontSize: 14, headingScale: 1.24, lineHeight: 1.7 },
    spacing: { pageMargin: 60, sectionGap: 24, paragraphGap: 7 },
    visual: { accentColor: '#111827', textColor: '#111827', mutedColor: '#6b7280', backgroundColor: '#ffffff', divider: 'none', cornerRadius: 0, variant: 'standard' },
    moduleTypes: { skills: 'skills', projects: 'project-list', experience: 'experience' },
  },
  'geek-lab': {
    id: 'geek-lab', name: '极客实验室', description: '终端语法、编号模块和黑底层级', audience: ['engineering'], tags: ['Geek', '暗黑', '模块化'],
    layout: { mode: 'single-column', density: 'compact', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.08, lineHeight: 1.4 },
    spacing: { pageMargin: 40, sectionGap: 14, paragraphGap: 3 },
    visual: { accentColor: '#a3e635', textColor: '#ecfccb', mutedColor: '#a7b89a', backgroundColor: '#101610', divider: 'solid', cornerRadius: 2, variant: 'terminal' },
    moduleTypes: { skills: 'skill-tags', projects: 'project-list', experience: 'timeline' },
  },
  'heading-stack': {
    id: 'heading-stack', name: '主标题层叠', description: '巨型标题、侧边标签和层叠留白', audience: ['design', 'product'], tags: ['设计', '主标题', '强层级'],
    layout: { mode: 'single-column', density: 'airy', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 14, headingScale: 1.28, lineHeight: 1.62 },
    spacing: { pageMargin: 50, sectionGap: 22, paragraphGap: 6 },
    visual: { accentColor: '#7c2d12', textColor: '#292524', mutedColor: '#78716c', backgroundColor: '#fff7ed', divider: 'solid', cornerRadius: 0, variant: 'editorial' },
    moduleTypes: { skills: 'skill-tags', projects: 'portfolio-card', experience: 'experience' },
  },
  'case-study': {
    id: 'case-study', name: '重点案例', description: '首屏放大核心项目，其余经历作为证据补充', audience: ['product', 'design', 'engineering'], tags: ['作品集', '重点内容', '产品'],
    layout: { mode: 'single-column', density: 'standard', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.16, lineHeight: 1.5 },
    spacing: { pageMargin: 42, sectionGap: 17, paragraphGap: 4 },
    visual: { accentColor: '#2563eb', textColor: '#172033', mutedColor: '#64748b', backgroundColor: '#f8fbff', divider: 'solid', cornerRadius: 10, variant: 'standard' },
    moduleTypes: { skills: 'skill-tags', projects: 'portfolio-card', experience: 'experience' },
  },
  'social-profile': {
    id: 'social-profile', name: '社交名片', description: '像个人主页一样组织状态、联系方式和经历动态', audience: ['design', 'product', 'general'], tags: ['个人品牌', '名片', '创意'],
    layout: { mode: 'single-column', density: 'standard', sidebarModules: [] },
    typography: { fontFamily: 'modern-sans', fontSize: 13, headingScale: 1.12, lineHeight: 1.5 },
    spacing: { pageMargin: 42, sectionGap: 18, paragraphGap: 5 },
    visual: { accentColor: '#059669', textColor: '#12312a', mutedColor: '#6b877f', backgroundColor: '#f7fffc', divider: 'solid', cornerRadius: 12, variant: 'standard' },
    moduleTypes: { skills: 'skill-tags', projects: 'portfolio-card', experience: 'experience' },
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
