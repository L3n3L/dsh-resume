import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assembleResumeSections, buildPreviewDocument, markdownToHtml, renderPreviewHtml } from '../lib/renderer.js'
import { TEMPLATE_DEFAULTS, validateCompositionPageSpec, validateCssText, validateTemplateSpec } from '../lib/template-schema.js'
import { auditTemplateCss, generateTemplateCandidate, normalizeDesignBrief } from '../lib/template-generation.js'
import { blockPreset, listThemeFamilies, resolveThemeFamily } from '../lib/theme-system.js'
import { normalizeLayoutSpec, validateLayoutSpec } from '../lib/layout-schema.js'
import { getTemplatePreset, listAvailableTemplates, listTemplatePresets, loadTemplate, saveTemplate } from '../lib/template-presets.js'
import { listRendererIds, renderTemplateLayout, resolveRendererId } from '../lib/renderers/registry.js'
import { ensureWorkspaceManifest, getWorkspaceInfo, initJobhunt, listJobhunt, readJobhuntFile, resolveWorkspaceInput, writeJobhuntFile } from '../lib/workspace.js'
import { activeWorkspaceLockCount, withWorkspaceLock } from '../lib/workspace-lock.js'
import { bindWorkspaceRoot, getGlobalWorkspaceRoot, getLatestMetrics, previewState, registerPreviewRoutes, rememberPreview, rememberWorkspaceRoot, setGlobalWorkspaceRoot } from '../lib/preview-api.js'
import { inspectIconTokens, listIconTokens } from '../lib/icons/registry.js'
import { applyPresentationOverride, loadPresentation, presentationWithOverride, savePresentationOverride } from '../lib/presentation.js'
import { listResumeVersions, loadResumeVersionRegistry } from '../lib/resume-versions.js'
import { resumeQualityCheck } from '../lib/quality.js'

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

test('status follows the last explicitly touched workspace when no root is provided', async () => {
  previewState.clear()
  rememberWorkspaceRoot(null)
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-workspace-root-test-'))
  try {
    await initJobhunt(root)
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
    const statusRoute = routes.find((route) => route.path === '/dsh-resume/api/status')
    rememberWorkspaceRoot(root)
    const response = { result: null, writeHead(status) { this.status = status }, end(body) { this.result = JSON.parse(body) } }
    await statusRoute.handler({ method: 'GET', url: '/dsh-resume/api/status' }, response)
    assert.equal(response.status, 200)
    assert.equal(response.result.root, path.normalize(root))
  } finally {
    rememberWorkspaceRoot(null)
    previewState.clear()
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('status bindings stay isolated per DSH session and expose deleted workspaces', async () => {
  previewState.clear()
  rememberWorkspaceRoot(null, 'session-a')
  rememberWorkspaceRoot(null, 'session-b')
  const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-session-a-'))
  const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-session-b-'))
  try {
    await initJobhunt(firstRoot)
    await initJobhunt(secondRoot)
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
    const statusRoute = routes.find((route) => route.path === '/dsh-resume/api/status')
    const response = () => ({ result: null, writeHead(status) { this.status = status }, end(body) { this.result = JSON.parse(body) } })
    rememberWorkspaceRoot(firstRoot, 'session-a')
    rememberWorkspaceRoot(secondRoot, 'session-b')

    const first = response()
    await statusRoute.handler({ method: 'GET', url: '/dsh-resume/api/status?sessionId=session-a' }, first)
    assert.equal(first.result.root, path.normalize(firstRoot))
    assert.equal(first.result.workspaceState, 'ready')

    const second = response()
    await statusRoute.handler({ method: 'GET', url: '/dsh-resume/api/status?sessionId=session-b' }, second)
    assert.equal(second.result.root, path.normalize(secondRoot))
    assert.equal(second.result.workspaceState, 'ready')

    await fs.rm(secondRoot, { recursive: true, force: true })
    const missing = response()
    await statusRoute.handler({ method: 'GET', url: '/dsh-resume/api/status?sessionId=session-b' }, missing)
    assert.equal(missing.result.root, path.normalize(secondRoot))
    assert.equal(missing.result.workspaceState, 'missing')
    assert.equal(missing.result.workspaceExists, false)
    assert.deepEqual(missing.result.previews, [])
  } finally {
    rememberWorkspaceRoot(null, 'session-a')
    rememberWorkspaceRoot(null, 'session-b')
    previewState.clear()
    await fs.rm(firstRoot, { recursive: true, force: true })
    await fs.rm(secondRoot, { recursive: true, force: true })
  }
})

test('workspace binding creates a stable manifest and becomes the session status root', async () => {
  previewState.clear()
  rememberWorkspaceRoot(null, 'workspace-bind-test')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-workspace-bind-'))
  try {
    await initJobhunt(root)
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
    const workspaceRoute = routes.find((route) => route.path === '/dsh-resume/api/workspace')
    const statusRoute = routes.find((route) => route.path === '/dsh-resume/api/status')
    const response = () => ({ result: null, status: 0, writeHead(status) { this.status = status }, end(body) { this.result = JSON.parse(body) } })
    const request = (body) => ({
      method: 'POST',
      url: '/dsh-resume/api/workspace',
      headers: {},
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) },
    })
    const bound = response()
    await workspaceRoute.handler(request({ action: 'bind', root, sessionId: 'workspace-bind-test', name: '测试简历' }), bound)
    assert.equal(bound.status, 200)
    assert.equal(bound.result.root, path.normalize(root))
    assert.equal(bound.result.workspaceName, '测试简历')
    assert.equal(bound.result.registered, true)
    assert.ok(bound.result.workspaceId)
    assert.deepEqual(await getWorkspaceInfo(root), {
      root: path.normalize(root),
      exists: true,
      directory: true,
      initialized: true,
      registered: true,
      workspaceId: bound.result.workspaceId,
      workspaceName: '测试简历',
      manifestPath: path.join(path.normalize(root), '.dsh-workspace', 'workspace.json'),
    })
    const status = response()
    await statusRoute.handler({ method: 'GET', url: '/dsh-resume/api/status?sessionId=workspace-bind-test' }, status)
    assert.equal(status.result.root, path.normalize(root))
    assert.equal(status.result.workspaceId, bound.result.workspaceId)
    assert.equal((await fs.readdir(root)).some((name) => name === '.dsh-workspace'), true)
  } finally {
    rememberWorkspaceRoot(null, 'workspace-bind-test')
    previewState.clear()
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('workspace input accepts a project parent when it contains a jobhunt child', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-project-parent-'))
  const nested = path.join(parent, 'jobhunt')
  try {
    await initJobhunt(nested)
    const resolved = await resolveWorkspaceInput(parent)
    assert.equal(resolved.root, path.normalize(nested))
    assert.equal(resolved.requestedRoot, path.normalize(parent))
    assert.equal(resolved.redirected, true)
    await ensureWorkspaceManifest(nested)
    assert.equal((await listJobhunt(nested)).entries.some((entry) => entry.path.startsWith('.dsh-workspace')), false)
  } finally {
    await fs.rm(parent, { recursive: true, force: true })
  }
})

test('workspace input does not redirect into an unrelated jobhunt folder', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-project-parent-unrelated-'))
  const nested = path.join(parent, 'jobhunt')
  try {
    await fs.mkdir(nested, { recursive: true })
    await fs.writeFile(path.join(nested, 'notes.txt'), 'not a resume workspace', 'utf8')
    const resolved = await resolveWorkspaceInput(parent)
    assert.equal(resolved.root, path.normalize(parent))
    assert.equal(resolved.redirected, false)
  } finally {
    await fs.rm(parent, { recursive: true, force: true })
  }
})

test('picked non-empty folder requires confirmation and bind does not overwrite its files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-picked-nonempty-'))
  const previousGlobal = getGlobalWorkspaceRoot()
  try {
    setGlobalWorkspaceRoot(previousGlobal)
    await fs.writeFile(path.join(root, 'notes.txt'), 'keep me', 'utf8')
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } }, { pickWorkspaceDirectory: async () => root })
    const workspaceRoute = routes.find((route) => route.path === '/dsh-resume/api/workspace')
    const response = () => ({ result: null, status: 0, writeHead(status) { this.status = status }, end(body) { this.result = JSON.parse(body) } })
    const request = (body) => ({
      method: 'POST',
      url: '/dsh-resume/api/workspace',
      headers: {},
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) },
    })
    const candidate = response()
    await workspaceRoute.handler(request({ action: 'pick', sessionId: 'picked-nonempty-test' }), candidate)
    assert.equal(candidate.status, 200)
    assert.equal(candidate.result.requiresConfirmation, true)
    assert.equal(candidate.result.candidate.fileCount, 1)
    assert.equal(await fs.access(path.join(root, '.dsh-workspace')).then(() => true).catch(() => false), false)

    const bound = response()
    await workspaceRoute.handler(request({ action: 'bind', root, sessionId: 'picked-nonempty-test' }), bound)
    assert.equal(bound.status, 200)
    assert.equal(bound.result.registered, true)
    assert.equal(bound.result.initialized, false)
    assert.equal(await fs.readFile(path.join(root, 'notes.txt'), 'utf8'), 'keep me')
    assert.equal(await fs.access(path.join(root, 'resume.md')).then(() => true).catch(() => false), false)
  } finally {
    rememberWorkspaceRoot(null, 'picked-nonempty-test')
    setGlobalWorkspaceRoot(previousGlobal)
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('explicit workspace selection is global across sessions and keeps recent choices', async () => {
  previewState.clear()
  setGlobalWorkspaceRoot(null)
  const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-global-a-'))
  const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-global-b-'))
  try {
    await initJobhunt(firstRoot)
    await initJobhunt(secondRoot)
    bindWorkspaceRoot(firstRoot, 'session-a')
    assert.equal(getGlobalWorkspaceRoot(), path.normalize(firstRoot))
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
    const statusRoute = routes.find((route) => route.path === '/dsh-resume/api/status')
    const response = () => ({ result: null, writeHead(status) { this.status = status }, end(body) { this.result = JSON.parse(body) } })
    const secondSession = response()
    await statusRoute.handler({ method: 'GET', url: '/dsh-resume/api/status?sessionId=session-b' }, secondSession)
    assert.equal(secondSession.result.root, path.normalize(firstRoot))
    bindWorkspaceRoot(secondRoot, 'session-b')
    const firstSessionAfterSwitch = response()
    await statusRoute.handler({ method: 'GET', url: '/dsh-resume/api/status?sessionId=session-a' }, firstSessionAfterSwitch)
    assert.equal(firstSessionAfterSwitch.result.root, path.normalize(secondRoot))
  } finally {
    setGlobalWorkspaceRoot(null)
    rememberWorkspaceRoot(null, 'session-a')
    rememberWorkspaceRoot(null, 'session-b')
    previewState.clear()
    await fs.rm(firstRoot, { recursive: true, force: true })
    await fs.rm(secondRoot, { recursive: true, force: true })
  }
})

test('folder picker cancellation leaves the global workspace unchanged', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-picker-current-'))
  try {
    setGlobalWorkspaceRoot(root)
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } }, { pickWorkspaceDirectory: async () => null })
    const workspaceRoute = routes.find((route) => route.path === '/dsh-resume/api/workspace')
    const response = () => ({ result: null, writeHead(status) { this.status = status }, end(body) { this.result = JSON.parse(body) } })
    const request = {
      method: 'POST',
      url: '/dsh-resume/api/workspace',
      headers: {},
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ action: 'pick', sessionId: 'picker-test' })) },
    }
    const cancelled = response()
    await workspaceRoute.handler(request, cancelled)
    assert.equal(cancelled.result.cancelled, true)
    assert.equal(getGlobalWorkspaceRoot(), path.normalize(root))
  } finally {
    setGlobalWorkspaceRoot(null)
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('Windows folder picker keeps the native dialog visible', async () => {
  const source = await fs.readFile(path.join(repoRoot, 'lib/workspace-picker.js'), 'utf8')
  assert.match(source, /windowsHide: false/)
  assert.doesNotMatch(source, /['"]-NonInteractive['"]/, 'GUI picker must not be launched as non-interactive')
})

test('workspace mutations serialize per root while independent roots can proceed', async () => {
  const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-lock-a-'))
  const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-lock-b-'))
  const events = []
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  try {
    await Promise.all([
      withWorkspaceLock(firstRoot, async () => {
        events.push('a-start')
        await wait(15)
        events.push('a-end')
      }),
      withWorkspaceLock(firstRoot, async () => {
        events.push('a2-start')
        events.push('a2-end')
      }),
      withWorkspaceLock(secondRoot, async () => {
        events.push('b-start')
        await wait(2)
        events.push('b-end')
      }),
    ])
    assert.ok(events.indexOf('a-end') < events.indexOf('a2-start'))
    assert.equal(activeWorkspaceLockCount(), 0)
  } finally {
    await fs.rm(firstRoot, { recursive: true, force: true })
    await fs.rm(secondRoot, { recursive: true, force: true })
  }
})

test('workspace text writes are atomic and leave no temporary files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-atomic-write-'))
  try {
    await initJobhunt(root)
    const content = '# 林知远\n\n## 项目经历\n\n- 原子写入测试\n'
    await writeJobhuntFile(root, 'resume.md', content)
    assert.equal((await readJobhuntFile(root, 'resume.md')).content, content)
    const entries = await fs.readdir(root, { withFileTypes: true })
    assert.equal(entries.some((entry) => entry.name.endsWith('.tmp')), false)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('presentation overrides persist per template and can reset one layer', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-presentation-test-'))
  try {
    await initJobhunt(root)
    await savePresentationOverride(root, {
      templateId: 'campus-standard',
      activeTemplateId: 'campus-standard',
      layout: { fontSize: 13, lineHeight: 1.42, sectionGap: 14, pageMargin: 38 },
      visual: { accentColor: '#123456' },
      iconTuning: { github: { scale: 1.2, offsetY: 0.04 } },
    })
    const saved = await loadPresentation(root)
    assert.equal(saved.activeTemplateId, 'campus-standard')
    assert.equal(saved.overrides['campus-standard'].layout.fontSize, 13)
    assert.equal(saved.overrides['campus-standard'].visual.accentColor, '#123456')
    const template = getTemplatePreset('campus-standard')
    const merged = applyPresentationOverride(template, saved, 'campus-standard')
    assert.equal(merged.typography.fontSize, 13)
    assert.equal(merged.spacing.pageMargin, 38)
    assert.equal(merged.visual.accentColor, '#123456')
    await savePresentationOverride(root, {
      templateId: 'business-ledger-plus',
      activeTemplateId: 'business-ledger-plus',
      activePreviewPath: 'companies\\frontend\\preview.html',
      layout: { fontSize: 16 },
    })
    const isolated = await loadPresentation(root)
    assert.equal(isolated.activeTemplateId, 'business-ledger-plus')
    assert.equal(isolated.activePreviewPath, 'companies/frontend/preview.html')
    assert.equal(isolated.overrides['business-ledger-plus'].layout.fontSize, 16)
    assert.equal(isolated.overrides['business-ledger-plus'].visual.accentColor, undefined)
    await savePresentationOverride(root, {
      templateId: 'business-ledger-plus',
      activePreviewPath: '../outside.html',
      visual: { accentColor: '#not-a-color' },
    })
    const sanitized = await loadPresentation(root)
    assert.equal(sanitized.activePreviewPath, null)
    assert.deepEqual(sanitized.overrides['business-ledger-plus'].visual, {})
    await savePresentationOverride(root, {
      templateId: 'campus-standard',
      layout: {},
      visual: {},
      iconTuning: {},
      clear: ['layout'],
    })
    const resetLayout = await loadPresentation(root)
    assert.deepEqual(resetLayout.overrides['campus-standard'].layout, {})
    assert.equal(resetLayout.overrides['campus-standard'].visual.accentColor, '#123456')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('version presentation can render an isolated override without persisting workspace presentation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-presentation-draft-'))
  try {
    const saved = await savePresentationOverride(root, {
      templateId: 'campus-standard',
      layout: { fontSize: 14 },
      activeTemplateId: 'campus-standard',
    })
    const isolated = presentationWithOverride(saved.presentation, {
      templateId: 'campus-standard',
      layout: { fontSize: 12, lineHeight: 1.35 },
      iconTuning: { github: { scale: 0.9, offsetY: 0.04 } },
      activePreviewPath: 'companies/demo/preview.html',
    })
    assert.equal(isolated.overrides['campus-standard'].layout.fontSize, 12)
    assert.equal(isolated.overrides['campus-standard'].layout.lineHeight, 1.35)
    assert.equal((await loadPresentation(root)).overrides['campus-standard'].layout.fontSize, 14)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('editor draft preview carries presentation changes without writing shared state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-editor-draft-'))
  try {
    await initJobhunt(root)
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
    const previewRoute = routes.find((route) => route.path === '/dsh-resume/api/editor/preview')
    const editorPreviewRoute = routes.find((route) => route.path === '/dsh-resume/editor-preview')
    const response = (json = false) => ({ result: null, status: 0, writeHead(status) { this.status = status }, end(body) { this.result = json ? JSON.parse(body) : body } })
    const request = (body) => ({
      method: 'POST',
      url: '/dsh-resume/api/editor/preview',
      headers: {},
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) },
    })
    const created = response(true)
    await previewRoute.handler(request({ root, resume: 'resume.md', preview: 'preview.html', templateId: 'campus-standard', layout: { fontSize: 12, lineHeight: 1.3 }, visual: { accentColor: '#123456' }, iconTuning: { github: { scale: 0.9, offsetY: 0.05 } }, content: '# 草稿预览\n' }), created)
    assert.equal(created.status, 200)
    const rendered = response()
    await editorPreviewRoute.handler({ method: 'GET', url: created.result.previewUrl, headers: {} }, rendered)
    assert.equal(rendered.status, 200)
    assert.match(rendered.result, /font-size:\s*12px/)
    assert.equal((await loadPresentation(root)).overrides['campus-standard'], undefined)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('resume version save binds content and presentation, supports copy rename and archive', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-version-save-'))
  try {
    await initJobhunt(root)
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
    const versionsRoute = routes.find((route) => route.path === '/dsh-resume/api/versions')
    const response = () => ({ result: null, status: 0, writeHead(status) { this.status = status }, end(body) { this.result = JSON.parse(body) } })
    const request = (body) => ({
      method: 'POST',
      url: '/dsh-resume/api/versions',
      headers: {},
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) },
    })
    const content = '# 林知远\n\n## 项目经历\n\n- 版本保存测试\n'
    const saved = response()
    await versionsRoute.handler(request({ action: 'save', mode: 'current', root, resume: 'resume.md', preview: 'preview.html', sessionId: 'version-save-test', name: '主简历 · 前端', templateId: 'campus-standard', layout: { fontSize: 13, lineHeight: 1.4 }, iconTuning: { github: { scale: 1.2, offsetY: 0.04 } }, persistPresentation: false, content }), saved)
    assert.equal(saved.status, 200)
    assert.equal(saved.result.version.name, '主简历 · 前端')
    assert.equal(saved.result.version.presentation.templateId, 'campus-standard')
    assert.equal(saved.result.version.presentation.layout.fontSize, 13)
    assert.equal((await loadResumeVersionRegistry(root)).versions.length, 1)
    assert.equal((await readJobhuntFile(root, 'resume.md')).content, content)
    assert.equal((await loadPresentation(root)).overrides['campus-standard'], undefined)

    const copied = response()
    await versionsRoute.handler(request({ action: 'save', mode: 'copy', root, resume: 'resume.md', preview: 'preview.html', sessionId: 'version-save-test', name: '字节 AI 产品经理', templateId: 'campus-standard', layout: { fontSize: 15 }, content }), copied)
    assert.equal(copied.status, 200)
    assert.equal(copied.result.version.kind, 'delivery')
    assert.match(copied.result.version.resumePath, /^companies\/字节-ai-产品经理\/resume\.md$/)
    assert.equal((await readJobhuntFile(root, copied.result.version.resumePath)).content, content)

    const renamed = response()
    await versionsRoute.handler(request({ action: 'rename', root, sessionId: 'version-save-test', id: copied.result.version.id, name: '字节 · AI 产品经理（校招）' }), renamed)
    assert.equal(renamed.status, 200)
    assert.equal(renamed.result.version.name, '字节 · AI 产品经理（校招）')

    const archived = response()
    await versionsRoute.handler(request({ action: 'archive', root, sessionId: 'version-save-test', id: copied.result.version.id }), archived)
    assert.equal(archived.status, 200)
    assert.equal(archived.result.versions.some((version) => version.id === copied.result.version.id), false)
    assert.equal(await fs.access(path.join(root, copied.result.version.resumePath)).then(() => true).catch(() => false), true)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('legacy preview version can be archived without deleting its source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-legacy-version-archive-'))
  try {
    await fs.mkdir(path.join(root, 'companies/old-role'), { recursive: true })
    await fs.writeFile(path.join(root, 'companies/old-role/resume.md'), '# 旧版本\n', 'utf8')
    await fs.writeFile(path.join(root, 'companies/old-role/preview.html'), '<!doctype html>', 'utf8')
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
    const versionsRoute = routes.find((route) => route.path === '/dsh-resume/api/versions')
    const listed = await listResumeVersions(root, ['companies/old-role/preview.html'])
    const response = () => ({ result: null, status: 0, writeHead(status) { this.status = status }, end(body) { this.result = JSON.parse(body) } })
    const request = (body) => ({
      method: 'POST',
      url: '/dsh-resume/api/versions',
      headers: {},
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) },
    })
    const archived = response()
    await versionsRoute.handler(request({ action: 'archive', root, id: listed[0].id, name: listed[0].name, resumePath: listed[0].resumePath, previewPath: listed[0].previewPath }), archived)
    assert.equal(archived.status, 200)
    assert.equal(archived.result.versions.some((version) => version.id === listed[0].id), false)
    assert.equal(await fs.readFile(path.join(root, 'companies/old-role/resume.md'), 'utf8'), '# 旧版本\n')
    assert.equal(await fs.readFile(path.join(root, 'companies/old-role/preview.html'), 'utf8'), '<!doctype html>')
  } finally {
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
  assert.match(html, /renderer-composition/)
  assert.match(html, /data-template-family="campus-clear"/)
})

test('thumbnail rendering works before a workspace has been initialized', async () => {
  const rendered = await renderPreviewHtml(path.join(os.tmpdir(), 'dsh-resume-thumbnail-fixture'), {
    resumePath: 'resume.md',
    resumeContent: '# 林知远\n\n## 项目经历\n\n- 负责一个完整项目的前端交付',
    cssText: 'body { color: #111827; }',
    templateSpec: getTemplatePreset('campus-standard'),
  })
  assert.match(rendered.html, /林知远/)
  assert.match(rendered.html, /body \{ color: #111827; \}/)
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

test('template CSS is injected between defaults and custom overrides', () => {
  const valid = validateTemplateSpec({ ...TEMPLATE_DEFAULTS, id: 'css-order', customCss: '.resume-document{outline:1px solid red;}' })
  const html = buildPreviewDocument({
    title: 'CSS order',
    bodyHtml: '<div class="dsh-resume-root"><h1>林知远</h1></div>',
    cssText: '/* base */',
    templateCssText: '.resume-document{background:linear-gradient(90deg,#fff,#f8fafc);}',
    sourcePath: 'resume.md',
    templatePath: 'templates/default.css',
    previewPath: 'preview.html',
    templateSpec: valid.value,
  })
  const base = html.indexOf('data-template-base-css')
  const template = html.indexOf('data-template-css')
  const custom = html.indexOf('data-template-custom-css')
  assert.ok(base >= 0 && base < template && template < custom)
  assert.match(html, /data-dsh-manual-tokens/)
  assert.match(html, /data-dsh-layout-contract/)
})

test('AI template candidates can carry validated customCss', () => {
  const result = generateTemplateCandidate({
    name: '卡片视觉候选',
    customCss: '.dsh-portfolio-card { box-shadow: 0 4px 12px #0002; }',
  })
  assert.equal(result.valid, true)
  assert.match(result.template.customCss, /box-shadow/)
})

test('template design audit distinguishes a runnable candidate from a visually reviewable template', () => {
  const incomplete = auditTemplateCss('.resume-document{color:#111827;}', 'new-template')
  assert.equal(incomplete.status, 'needs-visual-work')
  assert.ok(incomplete.missing.includes('template scope'))
  assert.ok(incomplete.missing.includes('header'))
  const complete = auditTemplateCss(`
    [data-template-id="new-template"] .header-block{padding:24px;}
    [data-template-id="new-template"] .dsh-resume-section{margin-top:20px;}
    [data-template-id="new-template"] .dsh-entry-title{font-weight:700;}
    [data-template-id="new-template"] .dsh-entry-meta{color:#64748b;}
    [data-template-id="new-template"] .dsh-entry-bullets{padding-left:18px;}
    [data-template-id="new-template"] .dsh-skill-tag{border:1px solid #111827;}
    @media print{[data-template-id="new-template"]{background:#fff;}}
  `, 'new-template')
  assert.equal(complete.status, 'ready-for-browser-review')
  assert.equal(complete.missing.length, 0)
})

test('independent template CSS is safe, persisted separately, and restored with versions', async () => {
  assert.equal(validateCssText('.icon{background-image:url("data:image/svg+xml;base64,AAAA");}').valid, true)
  assert.equal(validateCssText('.icon{background-image:url("data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E");}').valid, true)
  assert.equal(validateCssText('.icon{background-image:url(https://example.com/icon.svg);}').valid, false)
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-template-css-'))
  try {
    const template = { ...TEMPLATE_DEFAULTS, id: 'independent-style', renderer: 'composition', composition: { page: 'stack', header: 'standard', section: 'line', entry: 'stack', meta: 'inline', skills: 'chips' }, templateCss: '.dsh-resume-section{outline:2px solid #2563eb;}' }
    const saved = await saveTemplate(root, template)
    assert.equal(saved.cssPath, 'templates/independent-style.css')
    assert.equal(await fs.readFile(path.join(root, 'templates/independent-style.css'), 'utf8'), template.templateCss)
    assert.doesNotMatch(await fs.readFile(path.join(root, 'templates/independent-style.json'), 'utf8'), /templateCss/)
    assert.equal((await loadTemplate(root, 'independent-style')).templateCss, template.templateCss)

    await saveTemplate(root, { ...template, templateCss: '.dsh-resume-section{outline:3px solid #db2777;}' })
    const versions = await fs.readdir(path.join(root, '.dsh-resume/history/templates/independent-style'))
    assert.equal(versions.length, 1)
    assert.match(await fs.readFile(path.join(root, '.dsh-resume/history/templates/independent-style', versions[0]), 'utf8'), /outline:2px solid/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('representative built-in templates carry distinct visual asset layers', async () => {
  const expected = {
    'campus-standard': ['AVAILABLE FOR THE NEXT BUILD', 'campus-section'],
    'portrait-profile': ['PROFILE / 2026', 'portrait-rose'],
    'geek-lab': ['--geek-green', 'geek-green'],
    'magazine-feature': ['LEAD STORY', 'mag-rose'],
    'case-study': ['OUTCOME FIRST', 'case-blue'],
  }
  const sharedCss = await fs.readFile(path.join(repoRoot, 'lib/templates/default.css'), 'utf8')
  assert.match(sharedCss, /\.dsh-entry-bullets ul/)
  for (const [id, markers] of Object.entries(expected)) {
    const template = await loadTemplate(null, id)
    assert.ok(template.templateCss.length >= 1800, `${id} should have a substantive independent CSS layer`)
    for (const marker of markers) assert.match(template.templateCss, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    for (const marker of ['table', 'blockquote', 'pre', 'a:hover', 'dsh-icon', '@media print']) {
      assert.match(template.templateCss, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${id} should cover ${marker}`)
    }
  }
})

test('template listings expose CSS metadata so gallery thumbnails invalidate after CSS-only edits', async () => {
  const templates = await listAvailableTemplates(repoRoot)
  const campus = templates.find((template) => template.id === 'campus-standard')
  assert.ok(campus)
  assert.equal(campus.templateCssBytes, Buffer.byteLength((await loadTemplate(null, 'campus-standard')).templateCss, 'utf8'))
  assert.match(campus.templateCssFingerprint, /^[a-f0-9]{16}$/)
})

test('template workshop exposes CSS detail, validation, and live preview hooks', async () => {
  const apiSource = await fs.readFile(path.join(repoRoot, 'lib/preview-api.js'), 'utf8')
  const rendererSource = await fs.readFile(path.join(repoRoot, 'lib/renderer.js'), 'utf8')
  const clientSource = await fs.readFile(path.join(repoRoot, 'client/client.js'), 'utf8')
  assert.match(apiSource, /\/dsh-resume\/api\/templates\/detail/)
  assert.match(apiSource, /body\.action === 'validate'/)
  assert.match(rendererSource, /data-dsh-workshop-css/)
  assert.match(clientSource, /className: 'cj-templateCss'/)
  assert.match(clientSource, /templateCss: templateCssDraft/)
})

test('manual preview refresh re-reads disk without overwriting a local draft', async () => {
  const clientSource = await fs.readFile(path.join(repoRoot, 'client/client.js'), 'utf8')
  assert.match(clientSource, /void reloadEditorFromDisk\(\)\.then\(/)
  assert.match(clientSource, /const hasLocalDraft = editorDraft !== editorDiskContentRef\.current/)
  assert.match(clientSource, /if \(!force && hasLocalDraft && diskChanged\)/)
  assert.match(clientSource, /reloadEditorFromDisk\(\{ force: true \}\)/)
})

test('opening a resume version pins and persists its preview path', async () => {
  const clientSource = await fs.readFile(path.join(repoRoot, 'client/client.js'), 'utf8')
  const apiSource = await fs.readFile(path.join(repoRoot, 'lib/preview-api.js'), 'utf8')
  assert.match(clientSource, /const explicitPreviewRef = useRef\('\'\)/)
  assert.match(clientSource, /const persistActivePreview = \(version\)/)
  assert.match(clientSource, /activePreviewPath: version\.previewPath/)
  assert.match(clientSource, /activeOnly: true/)
  assert.match(clientSource, /explicitPreviewRef\.current = version\?\.previewPath \|\| ''/)
  assert.match(clientSource, /void persistActivePreview\(version\)/)
  assert.match(clientSource, /const nextPreviewPath = result\.version\?\.previewPath \|\| result\.rendered\?\.previewPath \|\| selected/)
  assert.match(clientSource, /if \(nextPreviewPath && explicitPreviewRef\.current && explicitPreviewRef\.current !== nextPreviewPath\) return/)
  assert.match(clientSource, /\[status\?\.root, status\?\.workspaceState, mainConversation\.sessionId\]/)
  assert.match(apiSource, /const currentPreview = persistedPreview \|\| \(/)
})

test('resume writing guidance protects evidence and treats one page as a soft target', async () => {
  const quality = resumeQualityCheck('# 张三\n\n## 项目经历\n\n- 负责前端开发，完成上线\n')
  assert.match(quality.target, /可读性优先/)
  assert.match(quality.target, /软目标/)
  assert.deepEqual(quality.writingGuidance.priority.slice(0, 3), ['证据有依据的职业化强化表达', '目标岗位相关性', 'HR 扫描清晰度'])
  assert.equal(quality.writingGuidance.budget.primaryExperienceBullets, '3–5')
  assert.match(quality.writingGuidance.evidenceRule, /证据原子/)
})

test('resume prompt allows evidence-grounded strengthening without fabrication', async () => {
  const source = await fs.readFile(path.join(repoRoot, 'index.js'), 'utf8')
  assert.match(source, /Limited, defensible strengthening/)
  assert.match(source, /A single A4 page is a campus-recruiting preference/)
  assert.match(source, /evidence atoms/)
  assert.match(source, /The agent may adjust these settings/)
})

test('resume prompt discovers exact brand icons and omits unregistered substitutes', async () => {
  const source = await fs.readFile(path.join(repoRoot, 'index.js'), 'utf8')
  const guide = await import('../lib/resume-guide.js')
  assert.match(source, /scan factual entities.*employer\/company, school, project\/platform/i)
  assert.match(source, /exact registered brand match.*by default/i)
  assert.match(source, /no exact registered token exists, omit the brand icon/i)
  assert.match(source, /never substitute a similar company.*icon/i)
  assert.match(guide.getResumeGuide('icons').sections.icons.join('\n'), /exact registered brand token exists/i)
  assert.match(guide.getResumeGuide('icons').sections.icons.join('\n'), /no exact registered token exists/i)
})

test('resume prompt preserves campus section order and explicitly requested projects', async () => {
  const source = await fs.readFile(path.join(repoRoot, 'index.js'), 'utf8')
  const clientSource = await fs.readFile(path.join(repoRoot, 'client/client.js'), 'utf8')
  assert.match(source, /education.*internship\/work experience.*project experience.*skills.*awards/i)
  assert.match(clientSource, /教育经历.*实习\/工作经历.*项目经历.*专业技能.*荣誉奖项/)
  for (const text of [source, clientSource]) {
    assert.match(text, /用户.*要求.*三个.*项目|three projects/i)
    assert.match(text, /不得.*静默.*合并.*改名.*删除|do not silently merge, rename, or drop projects/i)
  }
  const guide = await import('../lib/resume-guide.js')
  const payload = guide.getResumeGuide('structure')
  assert.deepEqual(payload.sections.structure.defaultCampusOrder, ['profile', 'education', 'experience', 'projects', 'skills', 'awards'])
  assert.match(payload.sections.structure.projectRetention, /不得静默删除/)
})

test('template APIs keep gallery reads and mutations bound to the requested workspace root', async () => {
  const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-template-root-a-'))
  const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-template-root-b-'))
  try {
    await initJobhunt(firstRoot)
    await initJobhunt(secondRoot)
    const template = {
      ...TEMPLATE_DEFAULTS,
      id: 'workspace-only',
      name: '工作区模板',
      renderer: 'composition',
      composition: { page: 'stack', header: 'standard', section: 'line', entry: 'stack', meta: 'inline', skills: 'chips' },
      templateCss: '[data-template-id="workspace-only"] .header-block { color: #2563eb; }',
    }
    await saveTemplate(secondRoot, template)
    const routes = []
    registerPreviewRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
    const listRoute = routes.find((route) => route.path === '/dsh-resume/api/templates')
    const actionsRoute = routes.find((route) => route.path === '/dsh-resume/api/templates/actions')
    const response = () => {
      let result = null
      return {
        writeHead(status) { this.status = status },
        end(body) { result = JSON.parse(body) },
        get result() { return result },
      }
    }
    const listed = response()
    await listRoute.handler({ method: 'GET', url: `/dsh-resume/api/templates?root=${encodeURIComponent(secondRoot)}` }, listed)
    assert.equal(listed.status, 200)
    assert.ok(listed.result.templates.some((item) => item.id === 'workspace-only'))
    const isolated = response()
    await listRoute.handler({ method: 'GET', url: `/dsh-resume/api/templates?root=${encodeURIComponent(firstRoot)}` }, isolated)
    assert.equal(isolated.status, 200)
    assert.equal(isolated.result.templates.some((item) => item.id === 'workspace-only'), false)
    const copied = response()
    await actionsRoute.handler({
      method: 'POST',
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ action: 'copy', root: secondRoot, sourceId: 'workspace-only', newId: 'workspace-copy' })) },
    }, copied)
    assert.equal(copied.status, 200)
    assert.equal(copied.result.saved, true)
    assert.ok(await fs.stat(path.join(secondRoot, 'templates', 'workspace-copy.json')))
    await assert.rejects(fs.stat(path.join(firstRoot, 'templates', 'workspace-copy.json')))
  } finally {
    await fs.rm(firstRoot, { recursive: true, force: true })
    await fs.rm(secondRoot, { recursive: true, force: true })
  }
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
  assert.equal(templates.length, 6)
  assert.deepEqual(listRendererIds(), ['composition'])
  assert.equal(validateTemplateSpec({ ...TEMPLATE_DEFAULTS, renderer: 'clean-single' }).valid, false)
  assert.equal(new Set(templates.map((template) => template.renderer)).size, 1)
  assert.equal(templates.filter((template) => template.renderer === 'composition').length, 6)
  for (const id of ['campus-standard', 'portrait-profile', 'magazine-feature', 'geek-lab', 'case-study', 'business-ledger-plus']) {
    assert.ok(templates.some((template) => template.id === id), `missing built-in template: ${id}`)
  }
  for (const id of ['project-atlas', 'editorial-spread', 'terminal-console', 'two-column-brief', 'rail-engineering', 'research-dossier', 'swiss-modular', 'signal-sidebar', 'executive-ledger', 'metrics-board', 'color-block', 'chronicle-rail', 'minimal-typographic', 'heading-stack', 'social-profile']) {
    assert.equal(templates.some((template) => template.id === id), false, `similar template still active: ${id}`)
    assert.equal(getTemplatePreset(id), undefined, `deleted preset still loadable: ${id}`)
  }
})

test('legacy template ids are removed from the built-in catalog', () => {
  const templates = listTemplatePresets()
  assert.equal(templates.some((template) => template.id === 'portfolio-grid'), false)
  assert.equal(getTemplatePreset('portfolio-grid'), undefined)
})

test('entry markup exposes stable title, metadata, and bullet semantics', () => {
  const source = '# 林知远\n\n## 项目经历\n\n### 校园服务平台\n\n2025.09 - 2026.01 | React / TypeScript\n\n- **首屏加载** 降低 42%\n- 支持 20 万条记录查询'
  const template = getTemplatePreset('magazine-feature')
  const html = assembleResumeSections(markdownToHtml(source), null, template.layout, template)
  assert.match(html, /<h3 class="dsh-entry-title">校园服务平台<\/h3>/)
  assert.match(html, /<p class="dsh-entry-meta">2025\.09 - 2026\.01 \| React \/ TypeScript<\/p>/)
  assert.match(html, /<ul class="dsh-entry-bullets">[\s\S]*首屏加载/)
})

test('HeroHeader and EntryMeta expose reusable semantic hooks', () => {
  const source = '![头像](assets/avatar.png)\n\n# 林知远\n\n前端开发工程师\n\n## 项目经历\n\n### 校园服务平台\n\n公司 · 前端开发工程师\n\n2025.09 - 2026.01 | **技术栈**：`React` `TypeScript`\n\n- 结果指标'
  const layout = validateLayoutSpec({
    mode: 'single-column',
    ir: { type: 'stack', hero: { type: 'hero', layout: 'inline', avatar: 'left' }, items: ['projects'] },
    blocks: [{ id: 'projects', type: 'projects', source: '项目经历' }],
  }).value
  const html = assembleResumeSections(markdownToHtml(source), layout, { mode: 'single-column' }, TEMPLATE_DEFAULTS)
  assert.match(html, /class="header-block dsh-hero-header dsh-header-with-image" data-hero-layout="inline" data-hero-avatar="left"/)
  assert.match(html, /class="dsh-hero-name"/)
  assert.match(html, /class="dsh-hero-line dsh-hero-avatar"/)
  assert.match(html, /class="dsh-entry-role"/)
  assert.match(html, /class="dsh-entry-meta dsh-entry-tech"/)
})

test('business hero separates identity and contact lines for dense headers', () => {
  const source = '# 林知远\n\n前端开发工程师（2027 届校招） ｜ 北京 / 杭州 ｜ 158-0000-1234 ｜ lin.zhiyuan@example.com ｜ GitHub: github.com/example/lin-zhiyuan\n\n## 项目经历\n\n### 校园服务平台 · 前端负责人\n\n2025.09 - 2026.01 | React / TypeScript\n\n- 结果指标'
  const template = getTemplatePreset('business-ledger-plus')
  const html = assembleResumeSections(markdownToHtml(source), null, template.layout, template)
  assert.match(html, /class="dsh-hero-line dsh-hero-identity">[\s\S]*dsh-hero-identity-item[\s\S]*前端开发工程师（2027 届校招）[\s\S]*北京 \/ 杭州[\s\S]*<\/p>/)
  assert.match(html, /class="dsh-hero-line dsh-hero-contact">[\s\S]*dsh-contact-phone[\s\S]*158-0000-1234[\s\S]*dsh-contact-email[\s\S]*lin\.zhiyuan@example\.com[\s\S]*dsh-contact-github[\s\S]*<\/p>/)
  assert.equal((html.match(/dsh-contact-item/g) || []).length, 3)
})

test('hero header accepts full-width separators used by Chinese resumes', () => {
  const source = '# 林知远\n\n前端开发工程师（2027 届校招） ｜ 北京·可接受一线城市 ｜ 15859152182 ｜ lin_nll@qq.com ｜ GitHub: github.com/L3n3L ｜ 个人网站: me.guanfu.chat/resume'
  const template = getTemplatePreset('business-ledger-plus')
  const html = assembleResumeSections(markdownToHtml(source), null, template.layout, template)
  assert.match(html, /dsh-hero-identity/)
  assert.match(html, /dsh-contact-phone/)
  assert.match(html, /dsh-contact-email/)
  assert.match(html, /dsh-contact-github/)
  assert.match(html, /dsh-contact-website/)
  assert.doesNotMatch(html, /前端开发工程师（2027 届校招） ｜ 北京·可接受一线城市 ｜ 15859152182/)
})

test('legacy layouts normalize without adding hero metadata', () => {
  const legacy = normalizeLayoutSpec({
    mode: 'single-column',
    blocks: [{ id: 'projects', type: 'projects', source: '项目经历' }],
  })
  assert.equal(Object.hasOwn(legacy.ir, 'hero'), false)
})

test('registered semantic and brand icon tokens become local markup', () => {
  const source = '# 林知远\n\n## 联系方式\n\n邮箱 [icon:email] · GitHub [icon:github] · [icon:unknown]'
  const template = getTemplatePreset('campus-standard')
  const html = assembleResumeSections(markdownToHtml(source), null, template.layout, template)
  assert.match(html, /class="dsh-icon dsh-icon-email"[^>]*aria-label="邮箱"/)
  assert.match(html, /class="dsh-icon dsh-icon-github"[^>]*aria-label="GitHub"/)
  assert.match(html, /class="dsh-icon dsh-icon-email"[^>]*data-icon-name="email"[^>]*data-icon-index="0"/)
  assert.match(html, /class="dsh-icon dsh-icon-github"[^>]*data-icon-name="github"[^>]*data-icon-index="1"/)
  assert.match(html, /class="dsh-icon dsh-icon-unknown"/)
  assert.doesNotMatch(html, /\[icon:unknown\]/)
  assert.doesNotMatch(html, /https?:\/\//)
})

test('icon registry exposes semantic tokens and reports invented slugs', () => {
  const report = inspectIconTokens('[icon:school] [icon:code] [icon:github] [icon:not-real]')
  assert.deepEqual(report.used, ['school', 'code', 'github'])
  assert.deepEqual(report.unknown, ['not-real'])
  assert.ok(listIconTokens('school').some((icon) => icon.slug === 'school'))
  assert.ok(listIconTokens('github').some((icon) => icon.slug === 'github'))
})

test('header icons render and nested lists keep only the outer bullet class', () => {
  const source = '# 林知远\n\n邮箱 [icon:email] · GitHub [icon:github]\n\n## 项目经历\n\n### 校园服务平台\n\n2025.09 - 2026.01\n\n- 一级要点\n  - 二级要点'
  const template = getTemplatePreset('campus-standard')
  const html = assembleResumeSections(markdownToHtml(source), null, template.layout, template)
  assert.match(html, /<header[^>]*>[\s\S]*class="dsh-icon dsh-icon-email"/)
  assert.match(html, /<ul class="dsh-entry-bullets">[\s\S]*<ul>/)
  assert.equal((html.match(/class="dsh-entry-bullets"/g) || []).length, 1)
})

test('Layout IR normalizes legacy regions and preserves explicit composition', () => {
  const legacy = normalizeLayoutSpec({
    mode: 'two-column',
    regions: { main: ['projects'], side: ['skills'] },
    blocks: [
      { id: 'projects', type: 'projects', source: '项目经历' },
      { id: 'skills', type: 'skills', source: '专业技能' },
    ],
  })
  assert.equal(legacy.ir.type, 'split')
  assert.deepEqual(legacy.ir.columns.map((column) => column.items), [['projects'], ['skills']])

  const explicit = normalizeLayoutSpec({
    mode: 'single-column',
    ir: { type: 'grid', columns: 3, gap: 18, items: ['skills', 'projects'] },
    blocks: [
      { id: 'skills', type: 'skills', source: '技能' },
      { id: 'projects', type: 'projects', source: '项目' },
    ],
  })
  assert.deepEqual(explicit.ir, { type: 'grid', columns: 3, gap: 18, items: ['skills', 'projects'] })
  assert.equal(validateLayoutSpec(explicit).valid, true)
})

test('Layout IR controls module order and renderer wrappers', () => {
  const source = '# 林知远\n\n## 技能\n\n- TypeScript\n\n## 项目经历\n\n- 结果指标'
  const layout = validateLayoutSpec({
    ir: { type: 'grid', columns: 2, items: ['projects', 'skills'] },
    blocks: [
      { id: 'skills', type: 'skills', source: '技能' },
      { id: 'projects', type: 'projects', source: '项目经历' },
    ],
  }).value
  const html = assembleResumeSections(markdownToHtml(source), layout, { mode: 'single-column' }, { ...TEMPLATE_DEFAULTS, renderer: 'composition', composition: { ...TEMPLATE_DEFAULTS.composition, page: 'grid' } })
  assert.match(html, /dsh-layout-grid/)
  assert.ok(html.indexOf('data-module-id="projects"') < html.indexOf('data-module-id="skills"'))
  const generated = generateTemplateCandidate({ name: '作品网格', family: 'portfolio-grid', moduleOrder: ['profile', 'skills', 'projects'] })
  assert.equal(generated.layoutSpec.ir.type, 'grid')
})

test('Layout IR selects the structural renderer before template style', () => {
  const split = { ir: { type: 'split', columns: [{ id: 'main', width: '1fr', items: ['projects'] }, { id: 'side', width: '0.32fr', items: ['skills'] }] } }
  const grid = { ir: { type: 'grid', columns: 2, items: ['projects', 'skills'] } }
  assert.equal(resolveRendererId(TEMPLATE_DEFAULTS, split), 'composition')
  assert.equal(resolveRendererId(TEMPLATE_DEFAULTS, grid), 'composition')

  const layout = validateLayoutSpec({
    mode: 'single-column',
    ir: grid.ir,
    blocks: [
      { id: 'skills', type: 'skills', source: '技能' },
      { id: 'projects', type: 'projects', source: '项目经历' },
    ],
  }).value
  const terminal = { ...TEMPLATE_DEFAULTS, renderer: 'composition', visual: { ...TEMPLATE_DEFAULTS.visual, variant: 'terminal' } }
  const body = assembleResumeSections(markdownToHtml('# 林知远\n\n## 技能\n\n- TypeScript\n\n## 项目经历\n\n- 结果指标'), layout, terminal.layout, terminal)
  assert.match(body, /dsh-renderer-composition/)
  const document = buildPreviewDocument({ title: 'IR', bodyHtml: body, cssText: '', sourcePath: 'resume.md', templatePath: 'templates/default.css', previewPath: 'preview.html', templateSpec: terminal, layoutSpec: layout })
  assert.match(document, /data-renderer="composition"/)
  assert.match(document, /renderer-composition/)
  assert.match(document, /data-template-renderer="composition"/)
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

test('business composition keeps the hero header and timeline structure distinct', () => {
  const source = '# 林知远\n\n前端工程师 | lin@example.com\n\n## 项目经历\n\n### 项目名称\n\n- 结果指标'
  const template = getTemplatePreset('business-ledger-plus')
  const html = assembleResumeSections(markdownToHtml(source), null, template.layout, template)
  assert.match(html, /dsh-renderer-composition/)
  assert.match(html, /dsh-composed-layout/)
  assert.match(html, /dsh-entry-rail-timeline/)
  assert.match(html, /dsh-entry-rail-marker/)
  assert.match(html, /dsh-renderer-item-projects/)
  assert.match(html, /<div class="dsh-resume-root dsh-renderer-composition dsh-composed-layout"[^>]*>[\s\S]*<header[\s\S]*<\/header>[\s\S]*<article/)
})

test('business ledger plus is a selectable built-in with a scoped visual layer', async () => {
  const preset = getTemplatePreset('business-ledger-plus')
  assert.equal(preset.name, '商务履历增强')
  assert.equal(preset.renderer, 'composition')
  assert.equal(preset.family, 'business-timeline')
  assert.deepEqual(preset.composition, { page: 'stack', header: 'hero', section: 'badge', entry: 'timeline', meta: 'split', skills: 'list' })
  assert.ok(listTemplatePresets().some((item) => item.id === 'business-ledger-plus'))
  const template = await loadTemplate(null, 'business-ledger-plus')
  assert.match(template.templateCss, /\[data-template-id="business-ledger-plus"\]/)
  assert.match(template.templateCss, /:has\(img\)/)
  assert.match(template.templateCss, /dsh-entry-rail-content > \.dsh-resume-section > h3/)
  assert.match(template.templateCss, /dsh-section-heading::before/)
})

test('business composition creates reusable entry rows without changing stack templates', () => {
  const source = '# 林知远\n\n前端工程师 | lin@example.com\n\n## 教育经历\n\n### 东江理工大学\n\n2023.09 - 2027.06\n\n- 计算机科学与技术\n\n## 项目经历\n\n### 项目名称 · 核心成员\n\n2026.01 - 至今\n\n- 结果指标'
  const business = getTemplatePreset('business-ledger-plus')
  const stack = getTemplatePreset('campus-standard')
  const businessHtml = assembleResumeSections(markdownToHtml(source), null, business.layout, business)
  const stackHtml = assembleResumeSections(markdownToHtml(source), null, stack.layout, stack)
  assert.match(businessHtml, /dsh-entry-row/)
  assert.match(businessHtml, /dsh-entry-meta-slot/)
  assert.match(businessHtml, /dsh-entry-project/)
  assert.match(businessHtml, /dsh-entry-role-label/)
  assert.match(businessHtml, /dsh-header-composition-hero/)
  assert.match(businessHtml, /dsh-section-composition-badge/)
  assert.equal((businessHtml.match(/dsh-entry-row/g) || []).length, 2)
  assert.doesNotMatch(stackHtml, /dsh-entry-row/)
})

test('generated composition is explicit and renderer exposes it as a stable contract', () => {
  const result = generateTemplateCandidate({
    name: '商务履历候选',
    family: 'business-timeline',
    audience: 'general',
  })
  assert.equal(result.valid, true)
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.template.composition).filter(([key]) => key !== 'pageSpec')),
    { page: 'stack', header: 'hero', section: 'badge', entry: 'timeline', meta: 'split', skills: 'list' },
  )
  assert.equal(result.template.composition.pageSpec.page.column, 'single')
  const html = renderTemplateLayout({
    template: result.template,
    layout: result.layoutSpec,
    header: '<header></header>',
    ordered: [{ id: 'projects', sourceId: 'projects', type: 'projects', html: '<section data-module-id="projects"></section>' }],
  })
  assert.match(html, /data-composition-header="hero"/)
  assert.match(html, /data-composition-entry="timeline"/)
  assert.match(html, /dsh-renderer-composition/)
  assert.match(html, /dsh-entry-rail-timeline/)
  const documentHtml = buildPreviewDocument({
    title: result.template.name,
    bodyHtml: html,
    cssText: '',
    sourcePath: 'resume.md',
    templatePath: 'templates/business-ledger-plus.json',
    previewPath: 'preview.html',
    previewRoot: 'E:/resume',
    renderId: 'composition-render',
    contentHash: 'composition-hash',
    templateSpec: result.template,
    layoutSpec: result.layoutSpec,
  })
  assert.match(documentHtml, /data-composition-meta="split"/)
})

test('new single-column templates expose and consume the page design specification', () => {
  const result = generateTemplateCandidate({
    name: '案例纵向系统',
    family: 'case-study',
    layout: 'single-column',
    moduleOrder: ['profile', 'summary', 'projects', 'experience', 'education', 'skills'],
  })
  assert.equal(result.valid, true)
  const pageSpec = result.template.composition.pageSpec
  assert.equal(pageSpec.page.size, 'A4')
  assert.equal(pageSpec.page.column, 'single')
  assert.deepEqual(pageSpec.flow.order, ['profile', 'summary', 'projects', 'experience', 'education', 'skills'])
  assert.equal(pageSpec.modules.projects, 'feature-first')
  assert.equal(pageSpec.flow.keepEntryTogether, true)
  assert.equal(validateCompositionPageSpec(pageSpec).valid, true)
  assert.equal(validateCompositionPageSpec({ page: { column: 'split' } }).valid, false)

  const html = renderTemplateLayout({
    template: result.template,
    layout: result.layoutSpec,
    header: '<header class="header-block"><h1>林知远</h1></header>',
    ordered: [
      { id: 'skills', sourceId: 'skills', type: 'skill-tags', html: '<section data-module-id="skills"></section>' },
      { id: 'projects', sourceId: 'projects', type: 'projects', html: '<section data-module-id="projects"></section>' },
    ],
  })
  assert.match(html, /dsh-single-column-page/)
  assert.match(html, /data-page-size="A4"/)
  assert.match(html, /data-page-family="case-study"/)
  assert.match(html, /data-module-variant="feature-first"/)
  assert.match(html, /dsh-single-column-module-feature-first/)
})

test('generic composition renderer owns page structure for stack, split, and grid candidates', () => {
  const cases = [
    [{ name: '单栏候选', layout: 'single-column' }, 'stack', 'dsh-layout-stack'],
    [{ name: '双栏候选', layout: 'two-column' }, 'split', 'dsh-layout-split'],
    [{ name: '网格候选', family: 'portfolio-grid' }, 'grid', 'dsh-layout-grid'],
  ]
  for (const [brief, page, marker] of cases) {
    const result = generateTemplateCandidate(brief)
    assert.equal(result.valid, true, brief.name)
    assert.equal(result.template.renderer, 'composition')
    assert.equal(result.template.composition.page, page)
    const html = renderTemplateLayout({
      template: result.template,
      layout: result.layoutSpec,
      header: '<header></header>',
      ordered: [{ id: 'projects', sourceId: 'projects', type: 'projects', html: '<section data-module-id="projects"></section>' }],
    })
    assert.match(html, /dsh-composed-layout/, brief.name)
    assert.match(html, new RegExp(marker), brief.name)
  }
})

test('new visual directions are selected from design briefs', () => {
  const minimal = generateTemplateCandidate({ name: '极简网格', tone: 'minimal' })
  const terminal = generateTemplateCandidate({ name: '终端工程', tone: 'terminal', audience: 'engineering' })
  const sidebar = generateTemplateCandidate({ name: '信息侧栏', layout: 'two-column', audience: 'general' })
  assert.equal(minimal.template.renderer, 'composition')
  assert.equal(terminal.template.renderer, 'composition')
  assert.equal(sidebar.template.renderer, 'composition')
})

test('new visual families generate their own renderer instead of flattening to a shared layout', () => {
  const families = [
    ['avatar-profile', 'composition'],
    ['magazine-editorial', 'composition'],
    ['impact-board', 'composition'],
    ['operation-block', 'composition'],
    ['career-chronicle', 'composition'],
    ['simple-typographic', 'composition'],
    ['geek-lab', 'composition'],
    ['heading-stack', 'composition'],
    ['case-study', 'composition'],
    ['social-profile', 'composition'],
  ]
  for (const [family, renderer] of families) {
    const result = generateTemplateCandidate({ name: family, family })
    assert.equal(result.valid, true, family)
    assert.equal(result.template.renderer, renderer, family)
  }
})

test('the active renderer can render the same resume fixture', () => {
  const source = '# 张三\n\n前端开发 | demo@example.com\n\n## 教育经历\n\n某某大学 · 计算机科学与技术\n\n## 专业技能\n\n- JavaScript / TypeScript\n\n## 项目经历\n\n- 性能提升 30%\n\n## 实习经历\n\n- 负责前端交付'
  for (const renderer of listRendererIds()) {
    const template = listTemplatePresets().find((item) => item.renderer === renderer) || { ...TEMPLATE_DEFAULTS, id: `test-${renderer}`, renderer }
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
  assert.equal(result.template.renderer, 'composition')
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
  assert.equal(listThemeFamilies().length, 17)
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
  assert.equal(result.template.renderer, 'composition')
  assert.equal(result.template.metadata.family, 'business-timeline')
  assert.equal(result.layoutSpec.blocks.find((block) => block.id === 'experience').type, 'timeline')
})
