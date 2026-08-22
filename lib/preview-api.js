import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { initJobhunt, listJobhunt, readJobhuntFile, resolveJobhuntRoot, resolveUnderJobhunt, writeJobhuntFile } from './workspace.js'
import { resumeQualityCheck } from './quality.js'
import {
  copyTemplate,
  listAvailableTemplates,
  listTemplateVersions,
  loadTemplate,
  restoreLatestTemplate,
  saveTemplate,
} from './template-presets.js'
import { renderPreview, renderPreviewHtml } from './renderer.js'

/** Preview state is isolated by normalized workspace root and preview path. */
export const previewState = new Map()
const editorDrafts = new Map()
let activePreviewKey = null

function normalizePreviewRel(previewRel) {
  return String(previewRel || '').replace(/\\/g, '/')
}

function previewKey(root, previewRel) {
  return `${path.normalize(root)}::${normalizePreviewRel(previewRel)}`
}

function stateFor(root, previewRel) {
  if (!root || !previewRel) return null
  return previewState.get(previewKey(root, previewRel)) || null
}

function activeState() {
  return activePreviewKey ? previewState.get(activePreviewKey) || null : null
}

function requestState(root, previewRel) {
  if (root && previewRel) return stateFor(root, previewRel)
  if (root) return [...previewState.values()].reverse().find((state) => state.root === path.normalize(root)) || null
  if (previewRel) return [...previewState.values()].reverse().find((state) => state.previewRel === normalizePreviewRel(previewRel)) || null
  return activeState()
}

function defaultRoot(value) {
  return path.normalize(value || activeState()?.root || resolveJobhuntRoot(undefined))
}

function defaultPreview(value) {
  return normalizePreviewRel(value || activeState()?.previewRel || 'preview.html')
}

function buildPreviewUrl(root, previewRel) {
  const params = new URLSearchParams({ path: previewRel })
  if (root) params.set('root', root)
  return `/dsh-resume/preview?${params.toString()}`
}

export function getLatestMetrics(root, previewRel) {
  const state = requestState(root, previewRel)
  return state?.metrics || {
    available: false,
    status: 'pending',
    retryable: true,
    renderId: state?.renderId || null,
    previewPath: state?.previewRel || null,
    contentHash: state?.contentHash || null,
    message: 'A4 metrics are pending. The open dsh-resume preview will refresh automatically after rendering; do not ask the user to reopen Settings.',
  }
}

export function rememberPreview(root, previewRel, rendered = {}) {
  const normalizedRoot = path.normalize(root)
  const normalizedPreview = normalizePreviewRel(previewRel)
  const state = {
    root: normalizedRoot,
    previewRel: normalizedPreview,
    renderId: rendered.renderId || randomUUID(),
    contentHash: rendered.contentHash || null,
    updatedAt: new Date().toISOString(),
    metrics: null,
  }
  const key = previewKey(normalizedRoot, normalizedPreview)
  previewState.set(key, state)
  activePreviewKey = key
  return state
}

async function collectPreviewFiles(root) {
  const listed = await listJobhunt(root)
  if (!listed.exists) return []
  return listed.entries
    .filter((e) => e.type === 'file' && e.path.replace(/\\/g, '/').endsWith('preview.html'))
    .map((e) => e.path.replace(/\\/g, '/'))
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

function readUrl(req) {
  return new URL(req.url || '/', 'http://127.0.0.1')
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

function sourcePathForPreview(previewRel) {
  const normalized = String(previewRel || '').replace(/\\/g, '/')
  return normalized.endsWith('preview.html') ? `${normalized.slice(0, -'preview.html'.length)}resume.md` : 'resume.md'
}

async function onboardingState(root) {
  const listed = await listJobhunt(root)
  const resumeExists = listed.entries.some((entry) => entry.type === 'file' && entry.path === 'resume.md')
  const previews = listed.entries
    .filter((entry) => entry.type === 'file' && entry.path.replace(/\\/g, '/').endsWith('preview.html'))
    .map((entry) => entry.path.replace(/\\/g, '/'))
  return { root, exists: listed.exists, initialized: resumeExists, previewReady: previews.length > 0, previews }
}

export function registerPreviewRoutes(ctx) {
  const disposers = []

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/onboarding',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'))
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          const mode = body.mode || 'demo'
          const initResult = await initJobhunt(root)
          if (mode === 'blank' && initResult.created.includes('resume.md')) {
            const blank = '# 你的姓名\n\n目标岗位 | 手机 | 邮箱\n\n## 教育经历\n\n## 专业技能\n\n## 项目经历\n\n## 实习经历\n'
            await fs.writeFile(resolveUnderJobhunt(root, 'resume.md').abs, blank, 'utf8')
          }
          const rendered = await renderPreview(root)
          rememberPreview(root, rendered.previewPath, rendered)
          return sendJson(res, 200, { mode, ...initResult, rendered, onboarding: await onboardingState(root) })
        }
        sendJson(res, 200, await onboardingState(root))
      } catch (err) {
        sendJson(res, 500, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/editor/source',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'))
        const previewRel = defaultPreview(url.searchParams.get('preview'))
        const resumeRel = url.searchParams.get('resume') || sourcePathForPreview(previewRel)
        const { content } = await readJobhuntFile(root, resumeRel)
        sendJson(res, 200, { root, resumePath: resumeRel, previewPath: previewRel, content })
      } catch (err) {
        sendJson(res, 404, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/editor/preview',
    async handler(req, res) {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST required' })
        const body = await readJsonBody(req)
        const root = defaultRoot(body.root)
        const previewRel = defaultPreview(body.preview)
        const resumeRel = String(body.resume || sourcePathForPreview(previewRel)).replace(/\\/g, '/')
        const content = typeof body.content === 'string' ? body.content : ''
        if (!content.trim()) return sendJson(res, 400, { error: '简历内容不能为空' })
        if (content.length > 300000) return sendJson(res, 413, { error: '简历内容过长，暂不支持实时预览' })
        const draftId = randomUUID()
        editorDrafts.set(draftId, { draftId, root, previewRel, resumeRel, content, templateId: body.templateId || null, updatedAt: new Date().toISOString() })
        sendJson(res, 200, { draftId, previewUrl: `/dsh-resume/editor-preview?draft=${encodeURIComponent(draftId)}` })
      } catch (err) {
        sendJson(res, 400, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/editor/save',
    async handler(req, res) {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST required' })
        const body = await readJsonBody(req)
        const root = defaultRoot(body.root)
        const previewRel = defaultPreview(body.preview)
        const resumeRel = String(body.resume || sourcePathForPreview(previewRel)).replace(/\\/g, '/')
        const content = typeof body.content === 'string' ? body.content : ''
        if (!content.trim()) return sendJson(res, 400, { error: '简历内容不能为空' })
        const saved = await writeJobhuntFile(root, resumeRel, content)
        const rendered = await renderPreview(root, {
          resumePath: resumeRel,
          outPath: previewRel,
          templateSpec: body.templateId ? await loadTemplate(root, body.templateId) : undefined,
        })
        rememberPreview(root, rendered.previewPath, rendered)
        if (body.draftId) editorDrafts.delete(body.draftId)
        sendJson(res, 200, { saved: true, ...saved, rendered })
      } catch (err) {
        sendJson(res, 400, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/status',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const requestedRoot = url.searchParams.get('root')
        const requestedPreview = url.searchParams.get('preview')
        const state = requestState(requestedRoot ? defaultRoot(requestedRoot) : null, requestedPreview)
        const root = state?.root || defaultRoot(requestedRoot)
        const previews = await collectPreviewFiles(root)
        const currentPreview = state?.previewRel || null
        sendJson(res, 200, {
          root,
          previewRel: currentPreview,
          renderId: state?.renderId || null,
          contentHash: state?.contentHash || null,
          updatedAt: state?.updatedAt || null,
          previewUrl: currentPreview
            ? buildPreviewUrl(root, currentPreview)
            : null,
          previews,
        })
      } catch (err) {
        sendJson(res, 500, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/editor-preview',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const draftId = url.searchParams.get('draft')
        const draft = editorDrafts.get(draftId)
        if (!draft) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('编辑草稿已过期，请重新打开编辑器。')
          return
        }
        const html = await renderPreviewHtml(path.normalize(draft.root), {
          resumePath: draft.resumeRel,
          resumeContent: draft.content,
          outPath: draft.previewRel,
          templateSpec: draft.templateId ? await loadTemplate(path.normalize(draft.root), draft.templateId) : undefined,
        })
        rememberPreview(draft.root, draft.previewRel, html)
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(html.html)
      } catch (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(String(err?.message || err))
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/previews',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'))
        const previews = await collectPreviewFiles(root)
        sendJson(res, 200, { root, previews })
      } catch (err) {
        sendJson(res, 500, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/templates',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'))
        sendJson(res, 200, { templates: await listAvailableTemplates(path.normalize(root)) })
      } catch (err) {
        sendJson(res, 500, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/templates/versions',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'))
        const id = url.searchParams.get('id')
        if (!id) return sendJson(res, 400, { error: 'id is required' })
        sendJson(res, 200, { id, versions: await listTemplateVersions(path.normalize(root), id) })
      } catch (err) {
        sendJson(res, 404, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/templates/actions',
    async handler(req, res) {
      try {
        const root = defaultRoot()
        const body = req.method === 'POST' ? await readJsonBody(req) : {}
        if (body.action === 'save') {
          const parsed = typeof body.templateJson === 'string' ? JSON.parse(body.templateJson) : body.templateJson
          return sendJson(res, 200, { saved: true, ...(await saveTemplate(root, parsed)) })
        }
        if (body.action === 'copy') {
          return sendJson(res, 200, { saved: true, ...(await copyTemplate(root, body.sourceId, body.newId, body.name)) })
        }
        if (body.action === 'restore-latest') {
          return sendJson(res, 200, { restored: true, ...(await restoreLatestTemplate(root, body.id)) })
        }
        sendJson(res, 400, { error: 'unsupported template action' })
      } catch (err) {
        sendJson(res, 400, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/metrics',
    async handler(req, res) {
      try {
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          if (!body.metrics || typeof body.metrics !== 'object') return sendJson(res, 400, { error: 'metrics is required' })
          const metricRoot = defaultRoot(body.previewRoot || body.root)
          const metricPreview = normalizePreviewRel(body.previewPath || body.preview)
          const state = stateFor(metricRoot, metricPreview)
          if (!state) {
            return sendJson(res, 409, {
              error: 'metrics belong to an unregistered preview render',
              expectedPreview: activeState()?.previewRel || null,
              receivedPreview: metricPreview,
            })
          }
          const receivedRenderId = String(body.renderId || '')
          const receivedContentHash = String(body.contentHash || '')
          if (receivedRenderId !== state.renderId || receivedContentHash !== state.contentHash) {
            return sendJson(res, 409, {
              error: 'metrics belong to a stale or mismatched preview render',
              expectedRenderId: state.renderId,
              receivedRenderId,
              expectedContentHash: state.contentHash,
              receivedContentHash,
            })
          }
          state.metrics = {
            renderId: state.renderId,
            contentHash: state.contentHash,
            previewRel: state.previewRel,
            root: state.root,
            metrics: body.metrics,
            updatedAt: new Date().toISOString(),
          }
        }
        const state = requestState(null, null)
        sendJson(res, 200, { ...state?.metrics, previewRel: state?.metrics?.previewRel || state?.previewRel || null, renderId: state?.renderId || null, contentHash: state?.contentHash || null })
      } catch (err) {
        sendJson(res, 400, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/check',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'))
        const previewRel = normalizePreviewRel(url.searchParams.get('preview') || activeState()?.previewRel || '')
        const resumeRel = url.searchParams.get('resume') || sourcePathForPreview(previewRel)
        const { content } = await readJobhuntFile(path.normalize(root), resumeRel)
        sendJson(res, 200, { resumePath: resumeRel, ...resumeQualityCheck(content) })
      } catch (err) {
        sendJson(res, 404, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/preview',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'))
        let rel = normalizePreviewRel(url.searchParams.get('path') || activeState()?.previewRel)
        if (!rel) {
          const previews = await collectPreviewFiles(root)
          rel = previews[0]
        }
        if (!root || !rel) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('No preview yet. Ask the agent to run jobhunt_render first.')
          return
        }
        const normalizedRoot = path.normalize(root)
        const { abs } = resolveUnderJobhunt(normalizedRoot, rel)
        const templateId = url.searchParams.get('template')
        const isThumbnail = url.searchParams.get('thumbnail') === '1'
        let html
        if (templateId) {
          const rendered = await renderPreviewHtml(normalizedRoot, {
              resumePath: sourcePathForPreview(rel),
              templateCssPath: url.searchParams.get('templateCss') || 'templates/default.css',
              templateSpec: await loadTemplate(normalizedRoot, templateId),
            })
          if (!isThumbnail) rememberPreview(normalizedRoot, rel, rendered)
          html = rendered.html
        } else {
          html = await fs.readFile(abs, 'utf8')
          if (!isThumbnail && !stateFor(normalizedRoot, rel)) {
            const renderId = /data-render-id="([^"]*)"/.exec(html)?.[1]
            const contentHash = /data-content-hash="([^"]*)"/.exec(html)?.[1]
            if (renderId && contentHash) rememberPreview(normalizedRoot, rel, { renderId, contentHash })
          }
        }
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(html)
      } catch (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(String(err?.message || err))
      }
    },
  }))

  return () => {
    for (const dispose of disposers) dispose()
  }
}


