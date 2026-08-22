import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assembleResumeSections, buildPreviewDocument, markdownToHtml } from '../lib/renderer.js'
import { TEMPLATE_DEFAULTS } from '../lib/template-schema.js'
import { generateTemplateCandidate, normalizeDesignBrief } from '../lib/template-generation.js'
import { blockPreset, listThemeFamilies, resolveThemeFamily } from '../lib/theme-system.js'
import { validateLayoutSpec } from '../lib/layout-schema.js'
import { listTemplatePresets } from '../lib/template-presets.js'
import { listRendererIds } from '../lib/renderers/registry.js'
import { initJobhunt } from '../lib/workspace.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Markdown renderer keeps resume structure and inline emphasis', () => {
  const html = markdownToHtml('# 张三\n\n## 项目经历\n\n- **性能** 提升 30%')
  assert.match(html, /<h1>张三<\/h1>/)
  assert.match(html, /<h2>项目经历<\/h2>/)
  assert.match(html, /<strong>性能<\/strong>/)
})

test('preview document carries an explicit preview path for metrics association', () => {
  const html = buildPreviewDocument({
    title: '张三',
    bodyHtml: '<div class="dsh-resume-root"><h1>张三</h1></div>',
    cssText: '',
    sourcePath: 'resume.md',
    templatePath: 'templates/default.css',
    previewPath: 'companies/frontend/preview.html',
    templateSpec: TEMPLATE_DEFAULTS,
  })
  assert.match(html, /data-preview-path="companies\/frontend\/preview\.html"/)
  assert.match(html, /previewPath: document\.querySelector\('\.resume-document'\)/)
  assert.match(html, /safeColor = \(value, fallback\)/)
  assert.match(html, /query\.get\('backgroundColor'\)/)
  assert.match(html, /dsh-resume-token-preview/)
  assert.match(html, /isThumbnail = query\.get\('thumbnail'\)/)
  assert.match(html, /--resume-corner-radius/)
  assert.match(html, /moduleDetails/)
  assert.match(html, /visualAudit/)
  assert.match(html, /bottomWhitespace/)
  assert.match(html, /layoutScale/)
  assert.match(html, /renderer-clean-single/)
  assert.match(html, /data-template-family="campus-clear"/)
})

test('preview links preserve the selected workspace root across reloads', async () => {
  const source = await fs.readFile(path.join(repoRoot, 'lib/preview-api.js'), 'utf8')
  assert.match(source, /buildPreviewUrl\(root, currentPreview\)/)
  const indexSource = await fs.readFile(path.join(repoRoot, 'index.js'), 'utf8')
  assert.match(indexSource, /previewUrl: `\/dsh-resume\/preview\?root=/)
})

test('new workspaces receive a substantive demo resume', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-test-'))
  try {
    await initJobhunt(root)
    const content = await fs.readFile(path.join(root, 'resume.md'), 'utf8')
    assert.ok(content.length > 1400)
    assert.match(content, /校园服务平台/)
    assert.match(content, /数据看板/)
    assert.match(content, /获奖与补充/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('legacy placeholder resumes upgrade without touching custom content', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-upgrade-test-'))
  try {
    await initJobhunt(root)
    const resumePath = path.join(root, 'resume.md')
    const original = await fs.readFile(resumePath, 'utf8')
    await fs.writeFile(resumePath, '# 张三\n\n前端开发 | 本科 | 138-0000-0000 | demo@example.com | GitHub: your-id\n\n## 教育经历\n\n**某某大学 · 计算机科学与技术 · 本科**  \n2022.09 - 2026.06\n\n- GPA：x.x / 4.0\n- 主修：数据结构、计算机网络、操作系统\n\n## 专业技能\n\n- 语言：JavaScript / TypeScript / Python\n- 框架：React / Vue / Node.js\n- 其他：Git、Linux、基本的工程化与测试\n\n## 项目经历\n\n### 项目名称 · 核心成员\n2025.01 - 2025.06\n\n- 用一句话说明项目目标与你的职责\n- 写可验证结果，例如性能、用户量、上线效果\n- 列出关键技术栈\n\n## 实习经历\n\n### 公司 · 岗位\n2025.07 - 2025.09\n\n- 业务背景与你的产出\n- 量化结果优先\n', 'utf8')
    const result = await initJobhunt(root)
    assert.deepEqual(result.upgraded, ['resume.md'])
    assert.match(await fs.readFile(resumePath, 'utf8'), /^# 林知远/m)
    await fs.writeFile(resumePath, `${original}\n用户自己的补充\n`, 'utf8')
    const preserved = await initJobhunt(root)
    assert.deepEqual(preserved.upgraded, [])
    assert.match(await fs.readFile(resumePath, 'utf8'), /用户自己的补充/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('built-in template gallery includes representative visual directions', () => {
  const templates = listTemplatePresets()
  assert.ok(templates.length >= 15)
  assert.deepEqual(listRendererIds(), ['clean-single', 'split-sidebar', 'technical-timeline', 'portfolio-grid', 'editorial', 'academic', 'swiss-grid', 'midnight-terminal', 'sidebar-signal'])
  assert.equal(new Set(templates.map((template) => template.renderer)).size, 9)
  for (const id of ['campus-standard', 'tech-compact', 'split-sidebar', 'engineering-timeline', 'portfolio-grid', 'product-signal', 'academic-research', 'swiss-grid', 'midnight-terminal', 'editorial-serif', 'portfolio-cards', 'academic-paper', 'sidebar-signal']) {
    assert.ok(templates.some((template) => template.id === id), `missing built-in template: ${id}`)
  }
})

test('template renderer registry produces structural variants', () => {
  const source = '# 张三\n\n## 项目经历\n\n- 结果指标'
  const technical = assembleResumeSections(markdownToHtml(source), null, { mode: 'single-column' }, { ...TEMPLATE_DEFAULTS, renderer: 'technical-timeline' })
  const portfolio = assembleResumeSections(markdownToHtml(source), null, { mode: 'single-column' }, { ...TEMPLATE_DEFAULTS, renderer: 'portfolio-grid' })
  assert.match(technical, /dsh-renderer-technical-timeline/)
  assert.match(technical, /dsh-renderer-item-projects/)
  assert.match(portfolio, /dsh-renderer-portfolio-grid/)
  assert.match(portfolio, /dsh-renderer-featured/)
})

test('new visual directions are selected from design briefs', () => {
  const minimal = generateTemplateCandidate({ name: '极简网格', tone: 'minimal' })
  const terminal = generateTemplateCandidate({ name: '终端工程', tone: 'terminal', audience: 'engineering' })
  const sidebar = generateTemplateCandidate({ name: '信息侧栏', layout: 'two-column', audience: 'general' })
  assert.equal(minimal.template.renderer, 'swiss-grid')
  assert.equal(terminal.template.renderer, 'midnight-terminal')
  assert.equal(sidebar.template.renderer, 'split-sidebar')
})

test('every built-in renderer can render the same resume fixture', () => {
  const source = '# 张三\n\n前端开发 | demo@example.com\n\n## 教育经历\n\n某某大学 · 计算机科学与技术\n\n## 专业技能\n\n- JavaScript / TypeScript\n\n## 项目经历\n\n- 性能提升 30%\n\n## 实习经历\n\n- 负责前端交付'
  for (const template of listTemplatePresets()) {
    const body = assembleResumeSections(markdownToHtml(source), null, template.layout, template)
    const html = buildPreviewDocument({ title: template.name, bodyHtml: body, cssText: '', sourcePath: 'resume.md', templatePath: 'templates/default.css', previewPath: 'preview.html', templateSpec: template })
    assert.match(html, new RegExp(`renderer-${template.renderer}`), `renderer missing for ${template.id}`)
  }
})

test('DesignBrief generates a validated candidate without saving it', () => {
  const result = generateTemplateCandidate({
    name: '技术双栏',
    audience: 'engineering',
    layout: 'two-column',
    density: 'compact',
    tone: 'technical',
    moduleOrder: ['profile', 'skills', 'projects', 'experience'],
    bestFor: ['前端校招'],
  })
  assert.equal(result.valid, true)
  assert.equal(result.template.id, '技术双栏'.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'ai-template')
  assert.equal(result.template.layout.mode, 'two-column')
  assert.equal(result.template.renderer, 'split-sidebar')
  assert.equal(result.template.layout.density, 'compact')
    assert.equal(result.template.typography.fontFamily, 'modern-sans')
    assert.equal(result.template.metadata.generatedBy, 'dsh-template-design')
  assert.equal(result.layoutSpec.mode, 'two-column')
  assert.equal(result.layoutSpec.blocks.find((block) => block.id === 'skills').type, 'skill-tags')
  assert.equal(result.layoutSpec.blocks.find((block) => block.id === 'projects').type, 'project-list')
})

test('module renderer gives skill tags a real visual semantic', () => {
  const layout = validateLayoutSpec({
    mode: 'single-column',
    blocks: [{ id: 'skills', type: 'skill-tags', source: '技能', options: { preset: 'tags', family: 'engineering-dense' } }],
    regions: { main: ['skills'] },
  }).value
  const html = assembleResumeSections(markdownToHtml('## 技能\n\n- JavaScript\n- TypeScript'), layout)
  assert.match(html, /dsh-module-skill-tags/)
  assert.match(html, /dsh-preset-tags/)
  assert.match(html, /data-theme-family="engineering-dense"/)
  assert.match(html, /dsh-skill-tags/)
  assert.match(html, /dsh-skill-tag.*JavaScript/)
})

test('DesignBrief normalization keeps module order inside the safe registry', () => {
  const brief = normalizeDesignBrief({
    name: '双栏模板',
    moduleOrder: ['skills', 'unknown', 'projects', 'skills'],
  })
  assert.deepEqual(brief.moduleOrder, ['skills', 'projects'])
})

test('theme families provide stable visual and module defaults', () => {
  const family = resolveThemeFamily('engineering-dense')
  assert.equal(family.layout.density, 'compact')
  assert.equal(family.moduleTypes.experience, 'timeline')
  assert.equal(blockPreset('timeline').preset, 'timeline')
  assert.equal(listThemeFamilies().length, 6)
})

test('DesignBrief can generate a family-driven portfolio layout', () => {
  const result = generateTemplateCandidate({
    name: '项目作品集',
    family: 'portfolio-grid',
    moduleOrder: ['profile', 'skills', 'projects', 'experience'],
  })
  assert.equal(result.valid, true)
  assert.equal(result.template.metadata.family, 'portfolio-grid')
  assert.equal(result.template.layout.mode, 'two-column')
  assert.equal(result.layoutSpec.blocks.find((block) => block.id === 'projects').options.preset, 'portfolio-card')
  assert.equal(result.layoutSpec.blocks.find((block) => block.id === 'projects').options.family, 'portfolio-grid')
})
