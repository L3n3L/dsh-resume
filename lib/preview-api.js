import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEMO_RESUME, ensureWorkspaceManifest, getWorkspaceInfo, initJobhunt, listJobhunt, readJobhuntFile, resolveJobhuntRoot, resolveUnderJobhunt, resolveWorkspaceInput, writeJobhuntFile } from './workspace.js'
import { resumeQualityCheck } from './quality.js'
import {
  copyTemplate,
  listAvailableTemplates,
  listTemplateVersions,
  loadTemplate,
  restoreLatestTemplate,
  saveTemplate,
} from './template-presets.js'
import { validateCssText, validateTemplateSpec } from './template-schema.js'
import { renderPreviewHtml, renderPreviewUnlocked } from './renderer.js'
import { withWorkspaceLock } from './workspace-lock.js'
import { applyPresentationOverride, loadPresentation, presentationWithOverride, savePresentationOverride } from './presentation.js'
import { listResumeVersions, loadResumeVersionRegistry, makeVersionRecord, nextDeliveryPaths, normalizeResumePath, previewPathForResume, saveResumeVersionRegistry, versionPresentationSnapshot } from './resume-versions.js'

/** Preview state is isolated by normalized workspace root and preview path. */
export const previewState = new Map()
const editorDrafts = new Map()
let activePreviewKey = null
// Agent tools and the web panel can run in different request contexts. Keep a
// global selected workspace for the user's resume library, while retaining
// legacy per-session entries only for migration and compatibility.
const preferredWorkspaceRoots = new Map()
let globalWorkspaceRoot = null
let recentWorkspaceRoots = []
let activeWorkspaceSessionId = 'default'
let workspaceBindingsLoadPromise = null
let workspaceBindingsWritePromise = Promise.resolve()

function workspaceBindingsPath() {
  const dshHome = process.env.DSH_HOME
  return dshHome ? path.join(dshHome, 'dsh-resume', 'workspace-bindings.json') : null
}

export function loadWorkspaceBindings() {
  if (workspaceBindingsLoadPromise) return workspaceBindingsLoadPromise
  workspaceBindingsLoadPromise = (async () => {
    const file = workspaceBindingsPath()
    if (!file) return
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      const bindings = parsed?.bindings && typeof parsed.bindings === 'object' ? parsed.bindings : {}
      for (const [sessionId, root] of Object.entries(bindings)) {
        if (typeof root === 'string' && root.trim()) preferredWorkspaceRoots.set(normalizeSessionId(sessionId), path.normalize(root))
      }
      if (typeof parsed?.globalRoot === 'string' && parsed.globalRoot.trim()) globalWorkspaceRoot = path.normalize(parsed.globalRoot)
      recentWorkspaceRoots = Array.isArray(parsed?.recentRoots)
        ? parsed.recentRoots.filter((root) => typeof root === 'string' && root.trim()).map((root) => path.normalize(root)).slice(0, 12)
        : []
      // Migrate the old per-session registry to the global selection once.
      if (!globalWorkspaceRoot) {
        const activeKey = normalizeSessionId(parsed?.activeSessionId)
        globalWorkspaceRoot = preferredWorkspaceRoots.get(activeKey) || preferredWorkspaceRoots.get('default') || [...preferredWorkspaceRoots.values()][0] || null
      }
      if (globalWorkspaceRoot) recentWorkspaceRoots = [globalWorkspaceRoot, ...recentWorkspaceRoots.filter((root) => root !== globalWorkspaceRoot)].slice(0, 12)
      if (typeof parsed?.activeSessionId === 'string' && preferredWorkspaceRoots.has(normalizeSessionId(parsed.activeSessionId))) {
        activeWorkspaceSessionId = normalizeSessionId(parsed.activeSessionId)
      }
    } catch {
      // A missing or malformed registry should fall back to the session cwd.
    }
  })()
  return workspaceBindingsLoadPromise
}

function persistWorkspaceBindings() {
  const file = workspaceBindingsPath()
  if (!file) return
  const snapshot = JSON.stringify({
    schemaVersion: 2,
    globalRoot: globalWorkspaceRoot,
    recentRoots: recentWorkspaceRoots,
    activeSessionId: activeWorkspaceSessionId,
    bindings: Object.fromEntries(preferredWorkspaceRoots),
  }, null, 2) + '\n'
  workspaceBindingsWritePromise = workspaceBindingsWritePromise
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, snapshot, 'utf8')
    })
}

function normalizeSessionId(sessionId) {
  return String(sessionId || 'default')
}

function touchRecentWorkspace(root) {
  const normalized = path.normalize(root)
  recentWorkspaceRoots = [normalized, ...recentWorkspaceRoots.filter((item) => item !== normalized)].slice(0, 12)
}

export function rememberWorkspaceRoot(root, sessionId = 'default') {
  const key = normalizeSessionId(sessionId)
  if (root === null) {
    preferredWorkspaceRoots.delete(key)
    if (key === 'default') globalWorkspaceRoot = null
    if (activeWorkspaceSessionId === key) activeWorkspaceSessionId = 'default'
    persistWorkspaceBindings()
    return null
  }
  if (!root) return preferredWorkspaceRoots.get(key) || null
  const normalized = path.normalize(root)
  preferredWorkspaceRoots.set(key, normalized)
  activeWorkspaceSessionId = key
  if (key === 'default' && !globalWorkspaceRoot) {
    globalWorkspaceRoot = normalized
    touchRecentWorkspace(normalized)
  }
  persistWorkspaceBindings()
  return normalized
}

export function setGlobalWorkspaceRoot(root) {
  globalWorkspaceRoot = root ? path.normalize(root) : null
  if (globalWorkspaceRoot) touchRecentWorkspace(globalWorkspaceRoot)
  persistWorkspaceBindings()
  return globalWorkspaceRoot
}

export function getGlobalWorkspaceRoot() {
  return globalWorkspaceRoot
}

export async function getRecentWorkspaceInfos() {
  const roots = recentWorkspaceRoots.length > 0 ? recentWorkspaceRoots : (globalWorkspaceRoot ? [globalWorkspaceRoot] : [])
  const infos = await Promise.all(roots.map(async (root) => {
    const info = await getWorkspaceInfo(root)
    return {
      ...info,
      workspaceState: !info.exists ? 'missing' : info.initialized ? 'ready' : 'empty',
      current: root === globalWorkspaceRoot,
    }
  }))
  return infos
}

export function getWorkspaceRoot(sessionId = 'default') {
  return defaultRoot('', sessionId)
}

export function getActiveWorkspaceRoot() {
  return defaultRoot('', activeWorkspaceSessionId)
}

export function getActiveWorkspaceSessionId() {
  return activeWorkspaceSessionId
}

export function bindWorkspaceRoot(root, sessionId = 'default') {
  const normalized = path.normalize(root)
  rememberWorkspaceRoot(normalized, sessionId)
  setGlobalWorkspaceRoot(normalized)
  return normalized
}

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

function defaultRoot(value, sessionId = 'default') {
  const preferred = preferredWorkspaceRoots.get(normalizeSessionId(sessionId))
  return path.normalize(value || globalWorkspaceRoot || preferred || resolveJobhuntRoot(undefined))
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

// Reject cross-origin writes: a malicious page in the user's browser must not
// be able to POST text/plain JSON at the localhost workbench and overwrite
// resume files. Browsers send Sec-Fetch-Site on every cross-origin request.
function sameOriginRequest(req) {
  const headers = req.headers || {}
  const site = headers['sec-fetch-site']
  if (site) return site === 'same-origin' || site === 'none'
  const origin = headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === readUrl(req).host
  } catch {
    return false
  }
}

const DRAFT_TTL_MS = 30 * 60 * 1000

function pruneExpiredDrafts() {
  const now = Date.now()
  for (const [id, draft] of editorDrafts) {
    if (draft.expiresAt < now) editorDrafts.delete(id)
  }
}

function sourcePathForPreview(previewRel) {
  const normalized = String(previewRel || '').replace(/\\/g, '/')
  return normalized.endsWith('preview.html') ? `${normalized.slice(0, -'preview.html'.length)}resume.md` : 'resume.md'
}

const ASSET_MIME = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
})
const MAX_ASSET_BYTES = 5 * 1024 * 1024
const ASSET_PLACEHOLDER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120"><rect width="160" height="120" rx="10" fill="#eef2f7"/><path d="M80 34a20 20 0 1 0 0 40 20 20 0 0 0 0-40Zm-34 64c4-17 16-26 34-26s30 9 34 26" fill="none" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/><text x="80" y="115" text-anchor="middle" fill="#64748b" font-size="10">图片不可用</text></svg>')

function sendAssetPlaceholder(res, status = 404) {
  res.writeHead(status, {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(ASSET_PLACEHOLDER)
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
  void loadWorkspaceBindings()

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/workspace',
    async handler(req, res) {
      try {
        await loadWorkspaceBindings()
        const url = readUrl(req)
        const sessionId = url.searchParams.get('sessionId') || 'default'
        if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { error: 'GET or POST required' })
        if (req.method === 'POST' && !sameOriginRequest(req)) return sendJson(res, 403, { error: 'cross-origin request rejected' })
        const body = req.method === 'POST' ? await readJsonBody(req) : {}
        const requestedAction = body.action || 'bind'
        const action = requestedAction === 'pick' ? 'bind' : requestedAction === 'create-default' ? 'create' : requestedAction
        let root = getWorkspaceRoot(body.sessionId || sessionId)
        let redirectedFrom = null
        let pickedFolder = false
        if (requestedAction === 'pick') {
          // The picker is owned by DSH's client/host flow. The plugin receives
          // the already selected absolute path and only performs the safe bind
          // and initialization step here. Keeping this route free of an OS
          // dialog prevents a second, invisible PowerShell picker from being
          // opened behind the DSH window.
          if (typeof body.root !== 'string' || !body.root.trim()) {
            return sendJson(res, 400, { error: '请先通过 DSH 的选择文件夹完成选择' })
          }
          if (!path.isAbsolute(body.root.trim())) {
            return sendJson(res, 400, { error: '工作区文件夹无效，请重新选择' })
          }
          const resolvedInput = await resolveWorkspaceInput(body.root.trim())
          root = resolvedInput.root
          redirectedFrom = resolvedInput.redirected ? resolvedInput.requestedRoot : null
          pickedFolder = true
        } else if (action === 'reset-default' || requestedAction === 'create-default') {
          root = resolveJobhuntRoot(undefined)
        } else if (req.method === 'POST') {
          if (typeof body.root !== 'string' || !body.root.trim()) return sendJson(res, 400, { error: '请选择一个工作区文件夹' })
          if (!path.isAbsolute(body.root.trim())) return sendJson(res, 400, { error: '工作区文件夹无效，请重新选择' })
          const resolvedInput = await resolveWorkspaceInput(body.root.trim())
          root = resolvedInput.root
          redirectedFrom = resolvedInput.redirected ? resolvedInput.requestedRoot : null
        }
        if (req.method === 'POST') {
          if (!['bind', 'create', 'reset-default'].includes(action)) return sendJson(res, 400, { error: 'action must be pick, create-default, bind, create, or reset-default' })
          const info = await getWorkspaceInfo(root)
          if (action === 'bind' && (!info.exists || !info.directory)) return sendJson(res, 404, { error: info.exists ? `工作区路径不是目录：${root}` : `工作区不存在：${root}`, workspace: info, requiresCreate: true })
          const selectedEntries = pickedFolder ? (await listJobhunt(root)).entries : []
          const initializePickedFolder = pickedFolder && !info.initialized && !info.registered && selectedEntries.length === 0
          if (pickedFolder && !info.initialized && !info.registered && selectedEntries.length > 0) {
            return sendJson(res, 200, {
              action: requestedAction,
              requiresConfirmation: true,
              candidate: { ...info, fileCount: selectedEntries.length },
              defaultWorkspace: await getWorkspaceInfo(resolveJobhuntRoot(undefined)),
              recentWorkspaces: await getRecentWorkspaceInfos(),
            })
          }
          const result = await withWorkspaceLock(root, async () => {
            if (action === 'create' || action === 'reset-default' || initializePickedFolder) await initJobhunt(root)
            const manifest = await ensureWorkspaceManifest(root, body.name)
            return { manifest, ...(await getWorkspaceInfo(root)) }
          })
          bindWorkspaceRoot(root, body.sessionId || sessionId)
          const current = await getWorkspaceInfo(root)
          return sendJson(res, 200, { action: requestedAction, redirectedFrom, initializedPickedFolder: initializePickedFolder, ...current, workspace: result, defaultWorkspace: await getWorkspaceInfo(resolveJobhuntRoot(undefined)), recentWorkspaces: await getRecentWorkspaceInfos() })
        }
        sendJson(res, 200, { ...(await getWorkspaceInfo(root)), defaultWorkspace: await getWorkspaceInfo(resolveJobhuntRoot(undefined)), recentWorkspaces: await getRecentWorkspaceInfos() })
      } catch (err) {
        sendJson(res, 400, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/onboarding',
    async handler(req, res) {
      try {
        await loadWorkspaceBindings()
        const url = readUrl(req)
        const sessionId = url.searchParams.get('sessionId') || 'default'
        if (req.method === 'POST' && !sameOriginRequest(req)) return sendJson(res, 403, { error: 'cross-origin request rejected' })
        const body = req.method === 'POST' ? await readJsonBody(req) : {}
        const root = defaultRoot(body.root || url.searchParams.get('root'), body.sessionId || sessionId)
        rememberWorkspaceRoot(root, body.sessionId || sessionId)
        if (req.method === 'POST') {
          const mode = body.mode || 'demo'
          const { initResult, rendered } = await withWorkspaceLock(root, async () => {
            const initResult = await initJobhunt(root)
            await ensureWorkspaceManifest(root)
            if (mode === 'blank' && initResult.created.includes('resume.md')) {
              const blank = '# 你的姓名\n\n目标岗位 | 手机 | 邮箱\n\n## 教育经历\n\n## 专业技能\n\n## 项目经历\n\n## 实习经历\n'
              await writeJobhuntFile(root, 'resume.md', blank)
            }
            const rendered = await renderPreviewUnlocked(root)
            return { initResult, rendered }
          })
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
    path: '/dsh-resume/api/versions',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const sessionId = url.searchParams.get('sessionId') || 'default'
        if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { error: 'GET or POST required' })
        if (req.method === 'POST' && !sameOriginRequest(req)) return sendJson(res, 403, { error: 'cross-origin request rejected' })
        const body = req.method === 'POST' ? await readJsonBody(req) : {}
        const root = defaultRoot(req.method === 'POST' ? body.root : url.searchParams.get('root'), sessionId)
        if (req.method === 'GET') {
          return sendJson(res, 200, { root, versions: await listResumeVersions(root, await collectPreviewFiles(root)) })
        }
        if (body.action === 'rename') {
          const registry = await loadResumeVersionRegistry(root)
          const id = String(body.id || '').trim()
          const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80)
          if (!name) return sendJson(res, 400, { error: '版本名称不能为空' })
          let version = registry.versions.find((item) => item.id === id)
          if (!version && body.resumePath) {
            const resumePath = normalizeResumePath(body.resumePath)
            const { content } = await readJobhuntFile(root, resumePath)
            const presentation = await loadPresentation(root)
            version = makeVersionRecord({
              id,
              name,
              resumePath,
              previewPath: body.previewPath,
              content,
              presentation: versionPresentationSnapshot({ templateId: body.templateId || presentation.activeTemplateId, presentation }),
            })
            registry.versions.push(version)
          }
          if (!version) return sendJson(res, 404, { error: '投递版本不存在或已归档' })
          version.name = name
          version.updatedAt = new Date().toISOString()
          await saveResumeVersionRegistry(root, registry)
          return sendJson(res, 200, { saved: true, version, versions: await listResumeVersions(root, await collectPreviewFiles(root)) })
        }
        if (body.action === 'archive') {
          const registry = await loadResumeVersionRegistry(root)
          const id = String(body.id || '').trim()
          let version = registry.versions.find((item) => item.id === id)
          if (!version && body.resumePath) {
            const resumePath = normalizeResumePath(body.resumePath)
            let content = ''
            try {
              content = (await readJobhuntFile(root, resumePath)).content
            } catch {
              // A legacy preview can outlive its source file; archive the record
              // without manufacturing or deleting any resume content.
            }
            const presentation = await loadPresentation(root)
            version = makeVersionRecord({
              id,
              name: body.name,
              resumePath,
              previewPath: body.previewPath,
              content,
              presentation: versionPresentationSnapshot({ templateId: body.templateId || presentation.activeTemplateId, presentation }),
            })
            registry.versions.push(version)
          }
          if (!version) return sendJson(res, 404, { error: '投递版本不存在或已归档' })
          if (version.kind === 'master') return sendJson(res, 400, { error: '主简历不能归档' })
          version.archived = true
          version.updatedAt = new Date().toISOString()
          await saveResumeVersionRegistry(root, registry)
          return sendJson(res, 200, { saved: true, version, versions: await listResumeVersions(root, await collectPreviewFiles(root)) })
        }
        if (body.action !== 'save') return sendJson(res, 400, { error: 'action must be save, rename, or archive' })
        const content = typeof body.content === 'string' ? body.content : ''
        if (!content.trim()) return sendJson(res, 400, { error: '简历内容不能为空' })
        if (content.length > 300000) return sendJson(res, 413, { error: '简历内容过长，暂不支持保存' })
        const mode = body.mode === 'copy' ? 'copy' : 'current'
        const requestedResume = normalizeResumePath(body.resume || 'resume.md')
        const requestedPreview = resolveUnderJobhunt(root, body.preview ? String(body.preview).replace(/\\/g, '/') : previewPathForResume(requestedResume)).rel
        const result = await withWorkspaceLock(root, async () => {
          const registry = await loadResumeVersionRegistry(root)
          const previous = registry.versions.find((version) => version.resumePath === requestedResume)
          let resumePath = requestedResume
          let previewPath = requestedPreview
          if (mode === 'copy') {
            let copyPaths = nextDeliveryPaths(body.name || '投递版本', registry)
            let suffix = 2
            while (true) {
              const target = resolveUnderJobhunt(root, copyPaths.resumePath).abs
              try {
                await fs.access(target)
                copyPaths = nextDeliveryPaths(`${body.name || '投递版本'}-${suffix++}`, registry)
              } catch (error) {
                if (error?.code === 'ENOENT') break
                throw error
              }
            }
            resumePath = copyPaths.resumePath
            previewPath = copyPaths.previewPath
          }
          const savedFile = await writeJobhuntFile(root, resumePath, content)
          let presentation = await loadPresentation(root)
          if (body.templateId) {
            presentation = body.persistPresentation === false
              ? presentationWithOverride(presentation, {
                templateId: body.templateId,
                layout: body.layout,
                visual: body.visual,
                iconTuning: body.iconTuning,
                activePreviewPath: previewPath,
              })
              : (await savePresentationOverride(root, {
                templateId: body.templateId,
                layout: body.layout,
                visual: body.visual,
                iconTuning: body.iconTuning,
                activeTemplateId: body.templateId,
                activePreviewPath: previewPath,
              })).presentation
          }
          const template = body.templateId
            ? applyPresentationOverride(await loadTemplate(root, body.templateId), presentation, body.templateId)
            : undefined
          const rendered = await renderPreviewUnlocked(root, {
            resumePath,
            outPath: previewPath,
            templateSpec: template,
            initialIconTuning: body.templateId ? presentation.overrides?.[body.templateId]?.iconTuning || {} : {},
          })
          const version = makeVersionRecord({
            id: mode === 'copy' ? undefined : previous?.id,
            name: body.name || previous?.name,
            resumePath,
            previewPath,
            content,
            presentation: versionPresentationSnapshot({ templateId: body.templateId, presentation }),
            targetRole: body.targetRole,
            company: body.company,
            previous: mode === 'current' ? previous : undefined,
          })
          const withoutSamePath = registry.versions.filter((item) => item.resumePath !== resumePath)
          await saveResumeVersionRegistry(root, { ...registry, versions: [version, ...withoutSamePath] })
          return { savedFile, rendered, version, presentation }
        })
        rememberPreview(root, result.rendered.previewPath, result.rendered)
        return sendJson(res, 200, { saved: true, mode, root, ...result, versions: await listResumeVersions(root, await collectPreviewFiles(root)) })
      } catch (err) {
        sendJson(res, 400, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/editor/source',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const sessionId = url.searchParams.get('sessionId') || 'default'
        const root = defaultRoot(url.searchParams.get('root'), sessionId)
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
        if (!sameOriginRequest(req)) return sendJson(res, 403, { error: 'cross-origin request rejected' })
        const body = await readJsonBody(req)
        const root = defaultRoot(body.root, body.sessionId)
        const previewRel = defaultPreview(body.preview)
        const resumeRel = String(body.resume || sourcePathForPreview(previewRel)).replace(/\\/g, '/')
        const content = typeof body.content === 'string' ? body.content : ''
        if (!content.trim()) return sendJson(res, 400, { error: '简历内容不能为空' })
        if (content.length > 300000) return sendJson(res, 413, { error: '简历内容过长，暂不支持实时预览' })
        const draftId = randomUUID()
        pruneExpiredDrafts()
        editorDrafts.set(draftId, {
          draftId,
          root,
          previewRel,
          resumeRel,
          content,
          templateId: body.templateId || null,
          layout: body.layout,
          visual: body.visual,
          iconTuning: body.iconTuning,
          updatedAt: new Date().toISOString(),
          expiresAt: Date.now() + DRAFT_TTL_MS,
        })
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
        if (!sameOriginRequest(req)) return sendJson(res, 403, { error: 'cross-origin request rejected' })
        const body = await readJsonBody(req)
        const root = defaultRoot(body.root, body.sessionId)
        const previewRel = defaultPreview(body.preview)
        const resumeRel = String(body.resume || sourcePathForPreview(previewRel)).replace(/\\/g, '/')
        const content = typeof body.content === 'string' ? body.content : ''
        if (!content.trim()) return sendJson(res, 400, { error: '简历内容不能为空' })
        const { saved, rendered } = await withWorkspaceLock(root, async () => {
          const saved = await writeJobhuntFile(root, resumeRel, content)
          const presentation = await loadPresentation(root)
          const template = body.templateId
            ? applyPresentationOverride(await loadTemplate(root, body.templateId), presentation, body.templateId)
            : undefined
          const rendered = await renderPreviewUnlocked(root, {
            resumePath: resumeRel,
            outPath: previewRel,
            templateSpec: template,
            initialIconTuning: body.templateId ? presentation.overrides?.[body.templateId]?.iconTuning || {} : {},
          })
          return { saved, rendered }
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
    path: '/dsh-resume/api/presentation',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const sessionId = url.searchParams.get('sessionId') || 'default'
        if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { error: 'GET or POST required' })
        if (req.method === 'POST' && !sameOriginRequest(req)) return sendJson(res, 403, { error: 'cross-origin request rejected' })
        const body = req.method === 'POST' ? await readJsonBody(req) : {}
        const root = defaultRoot(body.root || url.searchParams.get('root'), body.sessionId || sessionId)
        if (req.method === 'GET') return sendJson(res, 200, { presentation: await loadPresentation(root) })
        if (!body.templateId) return sendJson(res, 400, { error: 'templateId is required' })
        const result = await withWorkspaceLock(root, () => savePresentationOverride(root, body))
        rememberWorkspaceRoot(root, body.sessionId || sessionId)
        return sendJson(res, 200, { saved: true, ...result })
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
        await loadWorkspaceBindings()
        const url = readUrl(req)
        const requestedRoot = url.searchParams.get('root')
        const requestedPreview = url.searchParams.get('preview')
        const sessionId = url.searchParams.get('sessionId') || 'default'
        const boundRoot = defaultRoot(requestedRoot, sessionId)
        const state = requestState(boundRoot, requestedPreview)
        const root = state?.root || boundRoot
        if (requestedRoot) rememberWorkspaceRoot(root, sessionId)
        const listed = await listJobhunt(root)
        const previews = await collectPreviewFiles(root)
        const presentation = await loadPresentation(root)
        const initialized = listed.entries.some((entry) => entry.type === 'file' && entry.path === 'resume.md')
        const workspaceState = !listed.exists ? 'missing' : initialized || previews.length ? 'ready' : 'empty'
        const persistedPreview = !requestedPreview && presentation.activePreviewPath && previews.includes(presentation.activePreviewPath)
          ? presentation.activePreviewPath
          : null
        // The persisted presentation is the user's explicit choice. The in-memory
        // render state may still point at an older preview after a version switch
        // or an MCP render, so it must not win over the saved selection.
        const currentPreview = persistedPreview || (state?.previewRel && previews.includes(state.previewRel) ? state.previewRel : null)
        sendJson(res, 200, {
          sessionId,
          root,
          ...(await getWorkspaceInfo(root)),
          previewRel: currentPreview,
          renderId: state?.renderId || null,
          contentHash: state?.contentHash || null,
          updatedAt: state?.updatedAt || null,
          workspaceState,
          workspaceExists: listed.exists,
          initialized,
          defaultWorkspace: await getWorkspaceInfo(resolveJobhuntRoot(undefined)),
          previewUrl: currentPreview
            ? buildPreviewUrl(root, currentPreview)
            : null,
          previews,
          recentWorkspaces: await getRecentWorkspaceInfos(),
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
        if (!draft || draft.expiresAt < Date.now()) {
          if (draft) editorDrafts.delete(draftId)
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('编辑草稿已过期，请重新打开编辑器。')
          return
        }
        const root = path.normalize(draft.root)
        const savedPresentation = await loadPresentation(root)
        const presentation = draft.templateId
          ? presentationWithOverride(savedPresentation, {
            templateId: draft.templateId,
            layout: draft.layout,
            visual: draft.visual,
            iconTuning: draft.iconTuning,
            activePreviewPath: draft.previewRel,
          })
          : savedPresentation
        const html = await renderPreviewHtml(root, {
          resumePath: draft.resumeRel,
          resumeContent: draft.content,
          outPath: draft.previewRel,
          templateSpec: draft.templateId
            ? applyPresentationOverride(await loadTemplate(root, draft.templateId), presentation, draft.templateId)
            : undefined,
          initialIconTuning: draft.templateId ? presentation.overrides?.[draft.templateId]?.iconTuning || {} : {},
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
    path: '/dsh-resume/api/asset',
    async handler(req, res) {
      try {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' })
          res.end('GET required')
          return
        }
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'), url.searchParams.get('sessionId'))
        const assetRel = url.searchParams.get('path') || ''
        const { abs } = resolveUnderJobhunt(root, assetRel)
        const ext = path.extname(abs).toLowerCase()
        const mime = ASSET_MIME[ext]
        if (!mime) return sendAssetPlaceholder(res, 415)
        const rootReal = await fs.realpath(root)
        const assetReal = await fs.realpath(abs)
        const rootPrefix = rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`
        if (assetReal !== rootReal && !assetReal.startsWith(rootPrefix)) return sendAssetPlaceholder(res, 403)
        const stat = await fs.stat(assetReal)
        if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) return sendAssetPlaceholder(res, stat.size > MAX_ASSET_BYTES ? 413 : 404)
        const content = await fs.readFile(assetReal)
        res.writeHead(200, {
          'content-type': mime,
          'cache-control': 'private, max-age=300',
          'content-length': String(content.length),
          'x-content-type-options': 'nosniff',
        })
        res.end(content)
      } catch {
        sendAssetPlaceholder(res)
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/previews',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'), url.searchParams.get('sessionId'))
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
        const root = defaultRoot(url.searchParams.get('root'), url.searchParams.get('sessionId'))
        sendJson(res, 200, { templates: await listAvailableTemplates(path.normalize(root)) })
      } catch (err) {
        sendJson(res, 500, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/templates/detail',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'), url.searchParams.get('sessionId'))
        const id = url.searchParams.get('id')
        if (!id) return sendJson(res, 400, { error: 'id is required' })
        sendJson(res, 200, { template: await loadTemplate(path.normalize(root), id) })
      } catch (err) {
        sendJson(res, 404, { error: String(err?.message || err) })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/templates/versions',
    async handler(req, res) {
      try {
        const url = readUrl(req)
        const root = defaultRoot(url.searchParams.get('root'), url.searchParams.get('sessionId'))
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
        if (req.method === 'POST' && !sameOriginRequest(req)) return sendJson(res, 403, { error: 'cross-origin request rejected' })
        const body = req.method === 'POST' ? await readJsonBody(req) : {}
        const root = defaultRoot(body.root, body.sessionId)
        if (body.action === 'validate') {
          const parsed = typeof body.templateJson === 'string' ? JSON.parse(body.templateJson) : body.templateJson
          const templateResult = validateTemplateSpec(parsed)
          const cssResult = validateCssText(parsed?.templateCss, { kind: 'templateCss' })
          const errors = [...new Set([...templateResult.errors, ...cssResult.errors])]
          return sendJson(res, 200, { valid: errors.length === 0, errors })
        }
        if (body.action === 'save') {
          const parsed = typeof body.templateJson === 'string' ? JSON.parse(body.templateJson) : body.templateJson
          return sendJson(res, 200, { saved: true, ...(await withWorkspaceLock(root, () => saveTemplate(root, parsed))) })
        }
        if (body.action === 'copy') {
          return sendJson(res, 200, { saved: true, ...(await withWorkspaceLock(root, () => copyTemplate(root, body.sourceId, body.newId, body.name))) })
        }
        if (body.action === 'restore-latest') {
          return sendJson(res, 200, { restored: true, ...(await withWorkspaceLock(root, () => restoreLatestTemplate(root, body.id))) })
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
          if (!sameOriginRequest(req)) return sendJson(res, 403, { error: 'cross-origin request rejected' })
          const body = await readJsonBody(req)
          if (!body.metrics || typeof body.metrics !== 'object') return sendJson(res, 400, { error: 'metrics is required' })
          const metricRoot = defaultRoot(body.previewRoot || body.root, body.sessionId)
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
        const root = defaultRoot(url.searchParams.get('root'), url.searchParams.get('sessionId'))
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
        const root = defaultRoot(url.searchParams.get('root'), url.searchParams.get('sessionId'))
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
          const template = await loadTemplate(normalizedRoot, templateId)
          const presentation = isThumbnail ? null : await loadPresentation(normalizedRoot)
          const rendered = await renderPreviewHtml(normalizedRoot, {
              resumePath: sourcePathForPreview(rel),
              templateCssPath: url.searchParams.get('templateCss') || 'templates/default.css',
              templateSpec: isThumbnail ? template : applyPresentationOverride(template, presentation, templateId),
              initialIconTuning: isThumbnail ? {} : presentation.overrides?.[templateId]?.iconTuning || {},
              // The gallery is a visual catalog, not a preview of whichever
              // sparse draft happens to be selected. Keep its specimen dense
              // and stable; the normal preview path always uses real content.
              resumeContent: isThumbnail ? DEMO_RESUME : undefined,
              // A new installation may not have initialized its jobhunt root
              // yet. Use the bundled base stylesheet for catalog thumbnails;
              // never make the first template gallery depend on a user file.
              cssText: isThumbnail
                ? await fs.readFile(new URL('./templates/default.css', import.meta.url), 'utf8')
                : undefined,
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


