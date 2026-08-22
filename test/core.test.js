import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildPreviewDocument, markdownToHtml } from '../lib/renderer.js'
import { TEMPLATE_DEFAULTS } from '../lib/template-schema.js'
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
