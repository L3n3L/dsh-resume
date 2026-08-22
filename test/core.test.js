import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assembleResumeSections, buildPreviewDocument, markdownToHtml } from '../lib/renderer.js'
import { TEMPLATE_DEFAULTS, validateTemplateSpec } from '../lib/template-schema.js'
import { generateTemplateCandidate, normalizeDesignBrief } from '../lib/template-generation.js'
import { blockPreset, listThemeFamilies, resolveThemeFamily } from '../lib/theme-system.js'
import { validateLayoutSpec } from '../lib/layout-schema.js'
import { listTemplatePresets } from '../lib/template-presets.js'
import { listRendererIds } from '../lib/renderers/registry.js'
import { initJobhunt } from '../lib/workspace.js'
import { getLatestMetrics, previewState, registerPreviewRoutes, rememberPreview } from '../lib/preview-api.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Markdown renderer keeps resume structure and inline emphasis', () => {
  const html = markdownToHtml('# 张三\n\n## 项目经历\n\n- **性能** 提升 30%')
  assert.match(html, /<h1>张三<\/h1>/)
  assert.match(html, /<h2>项目经历<\/h2>/)
  assert.match(html, /<strong>性能<\/strong>/)
})

test('Markdown renderer keeps block structure and escapes raw HTML', () => {
  const html = markdownToHtml('## 技能\n\n| 技能 | 熟练度 |\n| --- | --- |\n| TypeScript | 熟练 |\n\n- 前端\n  - React\n\n<script>alert(1)</script>')
  assert.match(html, /<table>/)
  assert.match(html, /<ul>[\s\S]*<ul>[\s\S]*React/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})

test('preview state is isolated by root and preview path', () => {
  previewState.clear()
  const first = rememberPreview('E:/resume-a', 'companies/a/preview.html', { renderId: 'render-a', contentHash: 'hash-a' })
  const second = rememberPreview('E:/resume-b', 'companies/b/preview.html', { renderId: 'render-b', contentHash: 'hash-b' })
  assert.equal(previewState.size, 2)
  assert.notEqual(first.renderId, second.renderId)
  assert.equal([...previewState.values()][0].contentHash, 'hash-a')
  assert.equal([...previewState.values()][1].contentHash, 'hash-b')
  previewState.clear()
})

test('metrics rejects stale render identities and status does not select an old file', async () => {
  previewState.clear()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-metrics-test-'))
  try {
    await initJobhunt(root)
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
    const metricsRoute = routes.find((route) => route.path === '/dsh-resume/api/metrics')
    const statusRoute = routes.find((route) => route.path === '/dsh-resume/api/status')
    rememberPreview(root, 'preview.html', { renderId: 'render-current', contentHash: 'hash-current' })
    const response = () => {
      let result = null
      return {
        writeHead(status) { this.status = status },
        end(body) { result = JSON.parse(body) },
        get result() { return result },
      }
    }
    const request = (body) => ({
      method: 'POST',
      url: '/dsh-resume/api/metrics',
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) },
    })
    const stale = response()
    await metricsRoute.handler(request({ previewRoot: root, previewPath: 'preview.html', renderId: 'render-old', contentHash: 'hash-old', metrics: { pageCount: 1 } }), stale)
    assert.equal(stale.status, 409)
    const current = response()
    await metricsRoute.handler(request({ previewRoot: root, previewPath: 'preview.html', renderId: 'render-current', contentHash: 'hash-current', metrics: { pageCount: 1 } }), current)
    assert.equal(current.status, 200)
    assert.equal(getLatestMetrics(root, 'preview.html').metrics.pageCount, 1)
    const status = response()
    await statusRoute.handler({ method: 'GET', url: `/dsh-resume/api/status?root=${encodeURIComponent(root)}&preview=missing/preview.html` }, status)
    assert.equal(status.result.previewRel, null)
  } finally {
    previewState.clear()
    await fs.rm(root, { recursive: true, force: true })
  }
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

test('template customCss is scoped, bounded, and carried into preview', () => {
  const customCss = '.dsh-resume-section { box-shadow: 0 4px 12px #0002; }'
  const valid = validateTemplateSpec({ ...TEMPLATE_DEFAULTS, id: 'custom-template', customCss })
  assert.equal(valid.valid, true)
  const html = buildPreviewDocument({
    title: '自定义模板',
    bodyHtml: '<div class="dsh-resume-root"><h1>林知远</h1></div>',
    cssText: '',
    sourcePath: 'resume.md',
    templatePath: 'templates/default.css',
    previewPath: 'preview.html',
    previewRoot: 'E:/jobhunt',
    renderId: 'render-custom',
    contentHash: 'hash-custom',
    templateSpec: valid.value,
  })
  assert.match(html, /data-render-id="render-custom"/)
  assert.match(html, /data-content-hash="hash-custom"/)
  assert.match(html, /@scope \(\.resume-document\[data-template-id="custom-template"\]\)/)
  assert.match(html, /box-shadow: 0 4px 12px/)
  assert.equal(validateTemplateSpec({ ...TEMPLATE_DEFAULTS, customCss: '<script>alert(1)<\/script>' }).valid, false)
})

test('AI template candidates can carry validated customCss', () => {
  const result = generateTemplateCandidate({
    name: '卡片视觉候选',
    customCss: '.dsh-portfolio-card { box-shadow: 0 4px 12px #0002; }',
  })
  assert.equal(result.valid, true)
  assert.match(result.template.customCss, /box-shadow/)
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
  assert.deepEqual(listRendererIds(), ['clean-single', 'split-sidebar', 'technical-timeline', 'portfolio-grid', 'editorial', 'academic', 'swiss-grid', 'midnight-terminal', 'sidebar-signal', 'business-timeline'])
  assert.equal(new Set(templates.map((template) => template.renderer)).size, 10)
  for (const id of ['campus-standard', 'tech-compact', 'split-sidebar', 'engineering-timeline', 'portfolio-grid', 'product-signal', 'academic-research', 'swiss-grid', 'midnight-terminal', 'editorial-serif', 'portfolio-cards', 'academic-paper', 'sidebar-signal', 'business-timeline']) {
    assert.ok(templates.some((template) => template.id === id), `missing built-in template: ${id}`)
  }
})

test('template renderer registry produces structural variants', () => {
  const source = '# 张三\n\n## 项目经历\n\n- 结果指标'
  const technical = assembleResumeSections(markdownToHtml(source), null, { mode: 'single-column' }, { ...TEMPLATE_DEFAULTS, renderer: 'technical-timeline' })
  const portfolio = assembleResumeSections(markdownToHtml(source), null, { mode: 'single-column' }, { ...TEMPLATE_DEFAULTS, renderer: 'portfolio-grid' })
  const sidebar = assembleResumeSections(markdownToHtml('# 张三\n\n## 技能\n\n- JavaScript\n\n## 项目经历\n\n- 结果指标'), null, { mode: 'two-column', regions: { main: ['projects'], side: ['skills'] } }, { ...TEMPLATE_DEFAULTS, renderer: 'split-sidebar', layout: { ...TEMPLATE_DEFAULTS.layout, mode: 'two-column' } })
  assert.match(technical, /dsh-renderer-technical-timeline/)
  assert.match(technical, /dsh-renderer-item-projects/)
  assert.match(portfolio, /dsh-renderer-portfolio-grid/)
  assert.match(portfolio, /dsh-renderer-featured/)
  assert.match(sidebar, /dsh-column-main-item/)
  assert.match(sidebar, /dsh-column-side-item/)
  assert.doesNotMatch(sidebar, /dsh-resume-columns/)
})

test('semantic modules render photo, summary, contact, and grouped skills', () => {
  const source = '# 林知远\n\n## 个人简介\n\n专注前端工程与实时交互。\n\n## 联系方式\n\nlin@example.com | 杭州\n\n## 专业技能\n\n- 前端：React / TypeScript\n- 工程：Vitest / Playwright\n\n## 头像\n\n![林知远](assets/avatar.png)'
  const layout = validateLayoutSpec({
    mode: 'single-column',
    regions: { main: ['summary', 'contact', 'skills', 'photo'] },
    blocks: [
      { id: 'summary', type: 'summary', source: '个人简介' },
      { id: 'contact', type: 'contact', source: '联系方式' },
      { id: 'skills', type: 'skill-groups', source: '专业技能' },
      { id: 'photo', type: 'photo', source: '头像', options: { source: 'assets/avatar.png', shape: 'circle', size: 96 } },
    ],
  }).value
  const html = assembleResumeSections(markdownToHtml(source), layout, null, TEMPLATE_DEFAULTS, { root: 'E:/jobhunt' })
  assert.match(html, /dsh-module-summary[\s\S]*dsh-summary/)
  assert.match(html, /dsh-module-contact[\s\S]*dsh-contact/)
  assert.match(html, /dsh-module-skill-groups[\s\S]*dsh-skill-groups/)
  assert.match(html, /dsh-photo dsh-photo-circle/)
  assert.match(html, /api\/asset\?root=E%3A%2Fjobhunt(?:&amp;|&)path=assets%2Favatar.png/)
})

test('local asset route serves safe images and a visible placeholder', async () => {
  previewState.clear()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-assets-test-'))
  try {
    await initJobhunt(root)
    await fs.writeFile(path.join(root, 'assets', 'avatar.png'), Buffer.from([137, 80, 78, 71]))
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
    const route = routes.find((item) => item.path === '/dsh-resume/api/asset')
    const request = (assetPath) => ({ method: 'GET', url: `/dsh-resume/api/asset?root=${encodeURIComponent(root)}&path=${encodeURIComponent(assetPath)}` })
    const response = () => {
      let body = null
      return {
        writeHead(status, headers) { this.status = status; this.headers = headers },
        end(value) { body = Buffer.isBuffer(value) ? value : Buffer.from(String(value || '')) },
        get body() { return body },
      }
    }
    const image = response()
    await route.handler(request('assets/avatar.png'), image)
    assert.equal(image.status, 200)
    assert.equal(image.headers['content-type'], 'image/png')
    assert.deepEqual(image.body, Buffer.from([137, 80, 78, 71]))
    const missing = response()
    await route.handler(request('assets/missing.png'), missing)
    assert.equal(missing.status, 404)
    assert.match(missing.body.toString('utf8'), /图片不可用/)
    const escaped = response()
    await route.handler(request('../outside.png'), escaped)
    assert.equal(escaped.status, 404)
  } finally {
    previewState.clear()
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('business timeline renderer keeps the header and timeline structure distinct', () => {
  const source = '# 林知远\n\n前端工程师 | lin@example.com\n\n## 项目经历\n\n### 项目名称\n\n- 结果指标'
  const template = listTemplatePresets().find((item) => item.id === 'business-timeline')
  const html = assembleResumeSections(markdownToHtml(source), null, template.layout, template)
  assert.match(html, /dsh-renderer-business-timeline/)
  assert.match(html, /dsh-business-timeline/)
  assert.match(html, /dsh-business-marker/)
  assert.match(html, /dsh-renderer-item-projects/)
  assert.match(html, /<div class="dsh-resume-root dsh-renderer-business-timeline dsh-business-timeline">[\s\S]*<header[\s\S]*<\/header>[\s\S]*<article/)
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
  assert.equal(listThemeFamilies().length, 7)
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

test('DesignBrief can generate the business timeline family', () => {
  const result = generateTemplateCandidate({
    name: '商务时间线',
    family: 'business-timeline',
    audience: 'general',
    moduleOrder: ['profile', 'experience', 'projects', 'education'],
  })
  assert.equal(result.valid, true)
  assert.equal(result.template.renderer, 'business-timeline')
  assert.equal(result.template.metadata.family, 'business-timeline')
  assert.equal(result.layoutSpec.blocks.find((block) => block.id === 'experience').type, 'timeline')
})
