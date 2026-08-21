import fs from 'node:fs/promises'
import path from 'node:path'
import { listJobhunt, readJobhuntFile, resolveJobhuntRoot, resolveUnderJobhunt } from './workspace.js'
import { resumeQualityCheck } from './quality.js'

/** In-memory preview pointer updated by jobhunt_render. */
export const previewState = {
  root: null,
  previewRel: null,
  updatedAt: null,
}

export function rememberPreview(root, previewRel) {
  previewState.root = root
  previewState.previewRel = previewRel
  previewState.updatedAt = new Date().toISOString()
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

function sourcePathForPreview(previewRel) {
  const normalized = String(previewRel || '').replace(/\\/g, '/')
  return normalized.endsWith('preview.html') ? `${normalized.slice(0, -'preview.html'.length)}resume.md` : 'resume.md'
}

export function registerPreviewRoutes(ctx) {
  const disposers = []

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
        const { abs } = resolveUnderJobhunt(path.normalize(root), rel)
        const html = await fs.readFile(abs, 'utf8')
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


