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

/** In-memory preview pointer updated by jobhunt_render. */
export const previewState = {
  root: null,
  previewRel: null,
  updatedAt: null,
  metrics: null,
  editorDraft: null,
}

export function getLatestMetrics() {
  return previewState.metrics || { available: false, message: 'Open the preview to collect browser A4 metrics.' }
}

export function rememberPreview(root, previewRel) {
  previewState.root = root
  previewState.previewRel = previewRel
  previewState.updatedAt = new Date().toISOString()
  previewState.metrics = null
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
        const root = path.normalize(url.searchParams.get('root') || previewState.root || resolveJobhuntRoot(undefined))
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          const mode = body.mode || 'demo'
          const initResult = await initJobhunt(root)
          if (mode === 'blank' && initResult.created.includes('resume.md')) {
            const blank = '# 你的姓名\n\n目标岗位 | 手机 | 邮箱\n\n## 教育经历\n\n## 专业技能\n\n## 项目经历\n\n## 实习经历\n'
            await fs.writeFile(resolveUnderJobhunt(root, 'resume.md').abs, blank, 'utf8')
          }
          const rendered = await renderPreview(root)
          rememberPreview(root, rendered.previewPath)
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
        const root = path.normalize(url.searchParams.get('root') || previewState.root || resolveJobhuntRoot(undefined))
        const previewRel = url.searchParams.get('preview') || previewState.previewRel || 'preview.html'
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
        const root = path.normalize(body.root || previewState.root || resolveJobhuntRoot(undefined))
        const previewRel = String(body.preview || previewState.previewRel || 'preview.html').replace(/\\/g, '/')
        const resumeRel = String(body.resume || sourcePathForPreview(previewRel)).replace(/\\/g, '/')
        const content = typeof body.content === 'string' ? body.content : ''
        if (!content.trim()) return sendJson(res, 400, { error: '简历内容不能为空' })
        if (content.length > 300000) return sendJson(res, 413, { error: '简历内容过长，暂不支持实时预览' })
        const draftId = randomUUID()
        previewState.editorDraft = { draftId, root, previewRel, resumeRel, content, templateId: body.templateId || null, updatedAt: new Date().toISOString() }
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
        const root = path.normalize(body.root || previewState.root || resolveJobhuntRoot(undefined))
        const previewRel = String(body.preview || previewState.previewRel || 'preview.html').replace(/\\/g, '/')
        const resumeRel = String(body.resume || sourcePathForPreview(previewRel)).replace(/\\/g, '/')
        const content = typeof body.content === 'string' ? body.content : ''
        if (!content.trim()) return sendJson(res, 400, { error: '简历内容不能为空' })
        const saved = await writeJobhuntFile(root, resumeRel, content)
        const rendered = await renderPreview(root, {
          resumePath: resumeRel,
          outPath: previewRel,
          templateSpec: body.templateId ? await loadTemplate(root, body.templateId) : undefined,
        })
        rememberPreview(root, rendered.previewPath)
        previewState.editorDraft = null
        sendJson(res, 200, { saved: true, ...saved, rendered })
      } catch (err) {
        sendJson(res, 400, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/status',
    async handler(_req, res) {
      try {
        const root = previewState.root || resolveJobhuntRoot(undefined)
        const previews = await collectPreviewFiles(root)
        sendJson(res, 200, {
          root,
          previewRel: previewState.previewRel,
          updatedAt: previewState.updatedAt,
          previewUrl: previewState.previewRel
            ? `/dsh-resume/preview?path=${encodeURIComponent(previewState.previewRel)}`
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
        const draft = previewState.editorDraft
        if (!draft || draft.draftId !== draftId) {
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
        const root = url.searchParams.get('root') || previewState.root || resolveJobhuntRoot(undefined)
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
        const root = url.searchParams.get('root') || previewState.root || resolveJobhuntRoot(undefined)
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
        const root = url.searchParams.get('root') || previewState.root || resolveJobhuntRoot(undefined)
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
        const root = path.normalize(previewState.root || resolveJobhuntRoot(undefined))
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
          previewState.metrics = {
            previewRel: body.preview || previewState.previewRel,
            metrics: body.metrics,
            updatedAt: new Date().toISOString(),
          }
        }
        sendJson(res, 200, { ...previewState.metrics, previewRel: previewState.previewRel })
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
        const root = url.searchParams.get('root') || previewState.root || resolveJobhuntRoot(undefined)
        const previewRel = url.searchParams.get('preview') || previewState.previewRel || ''
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
        const root = url.searchParams.get('root') || previewState.root || resolveJobhuntRoot(undefined)
        let rel = url.searchParams.get('path') || previewState.previewRel
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
        const html = templateId
          ? (await renderPreviewHtml(normalizedRoot, {
              resumePath: sourcePathForPreview(rel),
              templateCssPath: url.searchParams.get('templateCss') || 'templates/default.css',
              templateSpec: await loadTemplate(normalizedRoot, templateId),
            })).html
          : await fs.readFile(abs, 'utf8')
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


