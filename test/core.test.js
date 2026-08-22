import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { assembleResumeSections, buildPreviewDocument, markdownToHtml } from '../lib/renderer.js'
import { TEMPLATE_DEFAULTS } from '../lib/template-schema.js'
import { generateTemplateCandidate, normalizeDesignBrief } from '../lib/template-generation.js'
import { validateLayoutSpec } from '../lib/layout-schema.js'
import { initJobhunt } from '../lib/workspace.js'

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
})

test('new workspaces receive a substantive demo resume', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-test-'))
  try {
    await initJobhunt(root)
    const content = await fs.readFile(path.join(root, 'resume.md'), 'utf8')
    assert.ok(content.length > 700)
    assert.match(content, /个人优势/)
    assert.match(content, /数据看板/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
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
    blocks: [{ id: 'skills', type: 'skill-tags', source: '技能' }],
    regions: { main: ['skills'] },
  }).value
  const html = assembleResumeSections(markdownToHtml('## 技能\n\n- JavaScript\n- TypeScript'), layout)
  assert.match(html, /dsh-module-skill-tags/)
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
