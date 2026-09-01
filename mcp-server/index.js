import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod/v4'

import { inspectIconTokens, listIconTokens } from '../lib/icons/registry.js'
import { validateLayoutSpec } from '../lib/layout-schema.js'
import { resumeQualityCheck } from '../lib/quality.js'
import { renderPreview } from '../lib/renderer.js'
import { applyPresentationOverride, getPresentationOverride, loadPresentation, savePresentationOverride } from '../lib/presentation.js'
import { autoTuneTemplate } from '../lib/autotune.js'
import { auditTemplateCss, generateTemplateCandidate, validateDesignBrief } from '../lib/template-generation.js'
import { listThemeFamilies } from '../lib/theme-system.js'
import { copyTemplate, listAvailableTemplates, listTemplateVersions, loadTemplate, restoreLatestTemplate, restoreTemplateVersion, saveTemplate, validateTemplate } from '../lib/template-presets.js'
import { getResumeGuide, RESUME_MCP_INSTRUCTIONS } from '../lib/resume-guide.js'
import { withWorkspaceLock } from '../lib/workspace-lock.js'
import { getWorkspaceInfo, initJobhunt, readJobhuntFile, resolveJobhuntRoot, writeJobhuntFile } from '../lib/workspace.js'

const SERVER_NAME = 'dsh-resume'
const SERVER_VERSION = '0.2.0'

const rootDirSchema = z.string().optional().describe('Standalone MCP only: optional absolute path or cwd-relative jobhunt workspace root. The DSH HTTP MCP is bound to the workspace selected in the DSH sidebar.')

function jsonResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

function workspaceRoot(rootDir) {
  return resolveJobhuntRoot(undefined, rootDir)
}

function templateSummary(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    tags: template.tags,
    family: template.family,
    renderer: template.renderer,
    layout: template.layout,
    typography: template.typography,
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${label} must be valid JSON`)
  }
}

function contentHash(content) {
  return createHash('sha256').update(String(content), 'utf8').digest('hex').slice(0, 16)
}

function normalizeResumePath(resumePath) {
  return String(resumePath || 'resume.md').replace(/\\/g, '/')
}

function workflowErrorPayload(nextTool, message, extra = {}) {
  return {
    saved: false,
    workflowRequired: true,
    nextTool,
    message,
    ...extra,
  }
}

function layoutDecision(metrics = {}) {
  const measured = metrics.metrics || metrics
  if (metrics.status === 'pending' || metrics.available === false || !Number.isFinite(Number(measured.pageCount))) {
    return { state: 'pending', next: '等待 DSH 浏览器回传真实 A4 指标后再判断页数；不要凭感觉压缩或声称已通过。' }
  }
  const pageCount = Number(measured.pageCount)
  const overflow = Boolean(measured.overflow)
  const sparse = Boolean(measured.sparse)
  if (pageCount === 1 && !overflow && !sparse) {
    return { state: 'accepted', next: '一页且指标正常；转入内容证据和 HR 扫描复核，不再为了填满页面添加无依据内容。' }
  }
  if (pageCount > 1 || overflow) {
    return {
      state: pageCount > 2 ? 'severely-overfull' : 'overfull',
      next: '先微调并验收当前模板，再做容器/模块承载/信息密度/流向/CSS 结构改造；仍超页时才压缩或舍弃技能、荣誉细节、重复和低相关表达，保留全部实习与教育以及入选项目。',
      hardTarget: 'one-page-a4',
    }
  }
  return { state: 'sparse', next: '一页但信息密度偏低；先用当前模板的模块承载和版面流向补足真实信息，不添加装饰性空内容。' }
}

function entryTitles(content) {
  return String(content || '')
    .split(/\r?\n/)
    .filter((line) => /^###\s+\S/.test(line))
    .map((line) => line.replace(/^###\s+/, '').trim())
}

function entryTitleKey(title) {
  return String(title || '')
    .replace(/\[icon:[^\]]+\]/gi, '')
    .replace(/\*+/g, '')
    .replace(/20\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?(?:\s*[～~—-]\s*(?:至今|20\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?))?/g, '')
    .replace(/（[^）]*）|\([^)]*\)/g, '')
    .split(/[|｜]/, 1)[0]
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function missingEntryTitles(before, after) {
  const afterKeys = entryTitles(after).map(entryTitleKey).filter(Boolean)
  return entryTitles(before).filter((title) => {
    const key = entryTitleKey(title)
    return key && !afterKeys.some((candidate) => candidate === key || candidate.includes(key) || key.includes(candidate))
  })
}

export function createWorkflowState() {
  return {
    prepared: false,
    root: null,
    resumePath: null,
    resumeHash: null,
    checked: false,
    rendered: false,
    requiresVerification: false,
    lastMutation: null,
  }
}

async function readResume(root, resumePath) {
  const path = normalizeResumePath(resumePath)
  const { content } = await readJobhuntFile(root, path)
  return { path, content }
}

export function createResumeMcpServer(options = {}) {
  const allowRootOverride = options.allowRootOverride !== false
  const resolveBoundRoot = typeof options.resolveRoot === 'function' ? options.resolveRoot : null
  const onRendered = typeof options.onRendered === 'function' ? options.onRendered : null
  const resolveMetrics = typeof options.resolveMetrics === 'function' ? options.resolveMetrics : null
  const transport = options.transport || 'stdio'
  const rootInput = allowRootOverride ? { rootDir: rootDirSchema } : {}
  const workflow = options.workflowState || createWorkflowState()
  const resolveToolRoot = (rootDir) => {
    if (!allowRootOverride && rootDir) throw new Error('当前 DSH MCP 已绑定到插件页选择的工作区，不能通过 rootDir 切换目录。请先在 DSH 左侧栏切换工作区。')
    return resolveBoundRoot ? resolveBoundRoot() : workspaceRoot(rootDir)
  }
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: RESUME_MCP_INSTRUCTIONS })

  async function requirePrepared(root, resumePath, action) {
    const path = normalizeResumePath(resumePath || workflow.resumePath || 'resume.md')
    if (!workflow.prepared) {
      return {
        ok: false,
        result: workflowErrorPayload('resume_prepare', `调用 ${action} 前必须先调用 resume_prepare；MCP 不依赖 Agent 自觉阅读指南来保护简历。`),
      }
    }
    if (workflow.root !== root || workflow.resumePath !== path) {
      return {
        ok: false,
        result: workflowErrorPayload('resume_prepare', '当前工作区或简历路径已变化，必须重新准备本次 MCP 会话。', {
          preparedRoot: workflow.root,
          preparedResumePath: workflow.resumePath,
          currentRoot: root,
          currentResumePath: path,
        }),
      }
    }
    let resume
    try {
      resume = await readResume(root, path)
    } catch (error) {
      return {
        ok: false,
        result: workflowErrorPayload('resume_prepare', '准备基线对应的简历文件已不存在或不可读取，请重新调用 resume_prepare。', {
          error: error?.message || String(error),
        }),
      }
    }
    const currentHash = contentHash(resume.content)
    if (currentHash !== workflow.resumeHash) {
      return {
        ok: false,
        result: workflowErrorPayload('resume_prepare', '检测到简历在本 MCP 会话外发生变化，已阻止继续写入，避免覆盖 DSH 或其他 Agent 的最新内容。', {
          preparedHash: workflow.resumeHash,
          currentHash,
        }),
      }
    }
    return { ok: true, resume, path }
  }

  function markMutation(tool, path, nextHash = workflow.resumeHash) {
    workflow.resumeHash = nextHash
    workflow.checked = false
    workflow.rendered = false
    workflow.requiresVerification = true
    workflow.lastMutation = { tool, path, at: new Date().toISOString() }
  }

  function markVerified(kind) {
    if (kind === 'check') workflow.checked = true
    if (kind === 'render') workflow.rendered = true
    if (workflow.checked && workflow.rendered) workflow.requiresVerification = false
  }

  server.registerTool(
    'mcp_health',
    {
      description: 'Return the dsh-resume MCP server health and supported basic tool capabilities.',
      inputSchema: z.object({}),
    },
    async () => jsonResult({
      healthy: true,
      server: SERVER_NAME,
      version: SERVER_VERSION,
      transport,
      capabilities: ['tools/list', 'tools/call'],
      cwd: process.cwd(),
      workspaceRoot: resolveToolRoot(),
      workflow: { ...workflow },
    }),
  )

  server.registerTool(
    'workspace_info',
    {
      description: 'Return the current dsh-resume workspace identity and binding. Read-only; the DSH HTTP MCP always reports the workspace selected in the plugin sidebar.',
      inputSchema: z.object({}),
    },
    async () => jsonResult(await getWorkspaceInfo(resolveToolRoot())),
  )

  server.registerTool(
    'resume_guide',
    {
      description: 'Return the dsh-resume workflow guide. Call this before the first resume task or after context has been reset; read-only.',
      inputSchema: z.object({
        topic: z.enum(['all', 'workflow', 'modes', 'priorities', 'contentBudget', 'content', 'layout', 'icons', 'permissions']).optional().describe('Optional guide section. Defaults to all sections.'),
      }),
    },
    async ({ topic }) => jsonResult(getResumeGuide(topic || 'all')),
  )

  server.registerTool(
    'resume_prepare',
    {
      description: 'Prepare a resume production session. This is mandatory before any MCP write, template mutation, presentation save, or render; it returns the current evidence baseline and the authoritative workflow contract.',
      inputSchema: z.object({
        resumePath: z.string().optional().describe('Resume Markdown path relative to the jobhunt root. Defaults to resume.md.'),
        templateId: z.string().optional().describe('Optional template to use for this production session.'),
        ...rootInput,
      }),
    },
    async ({ resumePath, templateId, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const resume = await readResume(root, resumePath)
      const selectedTemplateId = templateId || (await loadPresentation(root)).activeTemplateId || null
      const template = selectedTemplateId ? await loadTemplate(root, selectedTemplateId) : null
      const preflight = resumeQualityCheck(resume.content)
      workflow.prepared = true
      workflow.root = root
      workflow.resumePath = resume.path
      workflow.resumeHash = contentHash(resume.content)
      workflow.checked = true
      workflow.rendered = false
      workflow.requiresVerification = false
      workflow.lastMutation = null
      const guide = getResumeGuide('workflow')
      return jsonResult({
        prepared: true,
        root,
        resumePath: resume.path,
        contentHash: workflow.resumeHash,
        templateId: selectedTemplateId,
        template: template ? templateSummary(template) : null,
        preflight,
        guide: {
          name: guide.guide,
          version: guide.version,
          contract: guide.contract,
          workflow: guide.sections.workflow,
        },
        deliveryPolicy: {
          target: 'one-page-a4',
          requiredModules: ['education', 'internship', 'selected-projects'],
          projectSelection: { defaultCount: 2, maximumCount: 3, rule: 'Select by target-role relevance, evidence strength, personal ownership, and distinctiveness; do not include every available project.' },
          compressionOrder: ['skills', 'honors-detail', 'repetition', 'low-relevance-wording'],
          protectedEvidence: ['education', 'all-internships', 'selected-projects', 'ownership', 'actions', 'methods', 'results-or-artifacts'],
          acceptance: ['pageCount=1', 'overflow=false', 'readable-density=true', 'core-evidence-preserved=true'],
        },
        mutationPolicy: {
          requiredBeforeMutation: 'resume_prepare',
          afterMutation: ['resume_read', 'resume_check', 'resume_render', 'resume_metrics'],
          staleContent: 'If the Markdown changes outside this MCP session, call resume_prepare again before writing.',
        },
      })
    },
  )

  server.registerTool(
    'resume_init',
    {
      description: 'Create the dsh-resume jobhunt workspace skeleton and demo files if they do not exist.',
      inputSchema: z.object(rootInput),
    },
    async ({ rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const result = await withWorkspaceLock(root, () => initJobhunt(root))
      return jsonResult({ ...result, message: 'Workspace initialized without overwriting existing user files.' })
    },
  )

  server.registerTool(
    'resume_read',
    {
      description: 'Read a text file relative to the dsh-resume jobhunt workspace. Read-only.',
      inputSchema: z.object({
        path: z.string().min(1).describe('Relative path under the jobhunt workspace, such as resume.md or profile.md.'),
        ...rootInput,
      }),
    },
    async ({ path, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const result = await readJobhuntFile(root, path)
      return jsonResult({ root, ...result })
    },
  )

  server.registerTool(
    'resume_write',
    {
      description: 'Write an allowed text file in the dsh-resume jobhunt workspace. Requires resume_prepare first and an explicit full content payload. Resume content may be freely rewritten; semantic entry changes are reported as warnings, not blocked. After writing, read/check/render/metrics are recommended next steps, not a block on another intentional iteration.',
      inputSchema: z.object({
        path: z.string().min(1).describe('Relative path under jobhunt/. Allowed extensions are md, css, txt, and json.'),
        content: z.string().describe('Complete file content to save.'),
        allowCoreChanges: z.boolean().optional().describe('Deprecated compatibility field; content changes are allowed without this flag.'),
        changeSummary: z.string().optional().describe('Optional explanation of intentional content changes, returned in the audit result.'),
        ...rootInput,
      }),
    },
    async ({ path, content, allowCoreChanges, changeSummary, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      return jsonResult(await withWorkspaceLock(root, async () => {
        const isResume = /(^|\/)resume\.md$/i.test(String(path).replace(/\\/g, '/'))
        const gate = await requirePrepared(root, isResume ? path : undefined, 'resume_write')
        if (!gate.ok) return gate.result
        const coreChangeWarnings = isResume ? missingEntryTitles(gate.resume.content, content) : []
        if (isResume) {
          // This is an audit signal only. The agent must be able to rewrite a
          // resume when the user asks for a better structure or emphasis.
        }
        const iconReport = isResume ? inspectIconTokens(content) : null
        if (iconReport?.unknown.length) {
          return {
            saved: false,
            root,
            path,
            error: `resume contains unregistered icon token(s): ${iconReport.unknown.map((slug) => `[icon:${slug}]`).join(', ')}`,
            unknownIcons: iconReport.unknown,
            hint: 'Remove or replace only the unknown token, then retry with icon_list.',
          }
        }
        const saved = {
          saved: true,
          root,
          ...(await writeJobhuntFile(root, path, content)),
          iconWarnings: [],
          verificationRecommended: true,
          nextTools: ['resume_read', 'resume_check', 'resume_render', 'resume_metrics'],
          ...(coreChangeWarnings.length ? { contentWarnings: [{ code: 'core-entry-changed', entries: coreChangeWarnings, message: '检测到已有经历/项目标题语义发生变化；已允许保存，请结合用户意图和检查结果确认。' }] } : { contentWarnings: [] }),
          ...(changeSummary ? { changeSummary } : {}),
        }
        markMutation('resume_write', path, contentHash(content))
        return saved
      }))
    },
  )

  server.registerTool(
    'resume_check',
    {
      description: 'Run a deterministic local preflight on a resume Markdown file. Read-only.',
      inputSchema: z.object({
        resumePath: z.string().optional().describe('Resume Markdown path relative to the jobhunt root. Defaults to resume.md.'),
        ...rootInput,
      }),
    },
    async ({ resumePath, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const resume = await readResume(root, resumePath)
      if (workflow.prepared && workflow.root === root && workflow.resumePath === resume.path && workflow.resumeHash === contentHash(resume.content)) {
        markVerified('check')
      }
      return jsonResult({ root, resumePath: resume.path, ...resumeQualityCheck(resume.content) })
    },
  )

  server.registerTool(
    'resume_render',
    {
      description: 'Render a resume Markdown file into an A4 preview HTML file and, when hosted by DSH, register the render so the open preview can refresh and report measurements. This does not export PDF or change the resume source.',
      inputSchema: z.object({
        resumePath: z.string().optional().describe('Resume Markdown path relative to the jobhunt root. Defaults to resume.md.'),
        templateCssPath: z.string().optional().describe('Template CSS path relative to the jobhunt root. Defaults to templates/default.css.'),
        templateId: z.string().optional().describe('Optional built-in or saved composition template id.'),
        outPath: z.string().optional().describe('Preview HTML path relative to the jobhunt root. Defaults beside the resume.'),
        ...rootInput,
      }),
    },
    async ({ resumePath, templateCssPath, templateId, outPath, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const gate = await requirePrepared(root, resumePath, 'resume_render')
      if (!gate.ok) return jsonResult(gate.result)
      const effectiveResumePath = resumePath || gate.path
      let templateSpec
      let initialIconTuning = {}
      const presentation = await loadPresentation(root)
      const effectiveTemplateId = templateId || presentation.activeTemplateId
      if (effectiveTemplateId) {
        try {
          templateSpec = applyPresentationOverride(await loadTemplate(root, effectiveTemplateId), presentation, effectiveTemplateId, effectiveResumePath)
          initialIconTuning = getPresentationOverride(presentation, effectiveTemplateId, effectiveResumePath).iconTuning || {}
        } catch (error) {
          const available = await listAvailableTemplates(root).catch(() => [])
          throw new Error(`templateId "${effectiveTemplateId}" could not be loaded: ${error?.message || String(error)}; available: ${available.map((item) => item.id).join(', ')}`)
        }
      }
      const rendered = await renderPreview(root, {
        resumePath: effectiveResumePath,
        templateCssPath,
        templateSpec,
        outPath,
        initialIconTuning,
      })
      const previewRuntime = onRendered ? await onRendered(rendered) : null
      markVerified('render')
      return jsonResult({
        root,
        resumePath: rendered.resumePath,
        templateCssPath: rendered.templateCssPath,
        previewPath: rendered.previewPath,
        renderId: rendered.renderId,
        contentHash: rendered.contentHash,
        bytes: rendered.bytes,
        templateId: effectiveTemplateId || null,
        ...(previewRuntime ? { previewRuntime } : {}),
        message: 'Preview rendered. Use the DSH preview panel or a browser to inspect A4 metrics; this tool does not export PDF.',
      })
    },
  )

  server.registerTool(
    'resume_metrics',
    {
      description: 'Return the latest browser-measured A4 metrics when hosted by DSH; standalone MCP returns pending because it has no browser preview runtime.',
      inputSchema: z.object({
        previewPath: z.string().optional().describe('Preview HTML path relative to the jobhunt root. Defaults to preview.html.'),
        ...rootInput,
      }),
    },
    async ({ previewPath, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const requestedPreviewPath = previewPath || 'preview.html'
      if (resolveMetrics) {
        const measured = await resolveMetrics({ root, previewPath: requestedPreviewPath })
        return jsonResult({ root, previewPath: requestedPreviewPath, ...measured, decision: layoutDecision(measured) })
      }
      const pending = {
        root,
        previewPath: requestedPreviewPath,
        available: false,
        status: 'pending',
        message: 'Browser-measured A4 metrics are owned by the DSH preview runtime and are not shared through the standalone stdio MCP process yet.',
      }
      return jsonResult({ ...pending, decision: layoutDecision(pending) })
    },
  )

  server.registerTool(
    'layout_validate',
    {
      description: 'Validate a resume layout JSON file against the dsh-resume layout schema. Read-only.',
      inputSchema: z.object({
        layoutPath: z.string().optional().describe('Layout JSON path relative to the jobhunt root. Defaults to resume.layout.json.'),
        ...rootInput,
      }),
    },
    async ({ layoutPath, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const layout = await readJobhuntFile(root, layoutPath || 'resume.layout.json')
      let parsed
      try {
        parsed = JSON.parse(layout.content)
      } catch (error) {
        throw new Error(`invalid JSON in ${layout.path}: ${error?.message || String(error)}`)
      }
      const result = validateLayoutSpec(parsed)
      return jsonResult({ root, layoutPath: layout.path, valid: result.valid, errors: result.errors })
    },
  )

  server.registerTool(
    'template_list',
    {
      description: 'List available dsh-resume composition templates with compact metadata. Read-only.',
      inputSchema: z.object(rootInput),
    },
    async ({ rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const templates = await listAvailableTemplates(root)
      return jsonResult({ root, templates: templates.map(templateSummary) })
    },
  )

  server.registerTool(
    'template_family_list',
    {
      description: 'List theme families and semantic block presets available for generated resume templates. Read-only.',
      inputSchema: z.object(rootInput),
    },
    async () => jsonResult({ families: listThemeFamilies() }),
  )

  server.registerTool(
    'template_validate',
    {
      description: 'Validate a generated resume TemplateSpec before saving or applying it. Read-only.',
      inputSchema: z.object({ templateJson: z.string().describe('Complete TemplateSpec JSON.'), ...rootInput }),
    },
    async ({ templateJson }) => {
      const parsed = parseJson(templateJson, 'templateJson')
      const result = validateTemplate(parsed)
      return jsonResult({
        valid: result.valid,
        active: result.valid && result.value.renderer === 'composition',
        qualityAudit: auditTemplateCss(result.value.templateCss, result.value.id),
        errors: result.errors,
        template: result.value,
      })
    },
  )

  server.registerTool(
    'template_generate',
    {
      description: 'Generate a safe visual resume template candidate from a DesignBrief. Does not save it until template_save is called.',
      inputSchema: z.object({ briefJson: z.string().describe('DesignBrief JSON with name, family, audience, density, moduleOrder, composition, palette, and tags.'), ...rootInput }),
    },
    async ({ briefJson }) => {
      const brief = validateDesignBrief(parseJson(briefJson, 'briefJson'))
      if (!brief.valid) return jsonResult({ valid: false, errors: brief.errors, brief: brief.value })
      return jsonResult(await generateTemplateCandidate(brief.value))
    },
  )

  server.registerTool(
    'template_save',
    {
      description: 'Save a validated composition template as a new workspace template JSON/CSS. Existing custom IDs are protected by default; use template_copy for an isolated revision. Explicit replacement requires replaceExisting=true and confirmImpact=true. Built-in templates are immutable.',
      inputSchema: z.object({ templateJson: z.string().describe('Complete validated composition TemplateSpec JSON.'), replaceExisting: z.boolean().optional(), confirmImpact: z.boolean().optional(), ...rootInput }),
    },
    async ({ templateJson, replaceExisting, confirmImpact, rootDir }) => {
      const parsed = parseJson(templateJson, 'templateJson')
      const validation = validateTemplate(parsed)
      if (!validation.valid) return jsonResult({ saved: false, valid: false, errors: validation.errors, template: validation.value })
      if (replaceExisting === true && confirmImpact !== true) return jsonResult({ saved: false, valid: true, conflict: true, errors: ['replaceExisting requires confirmImpact=true; use template_copy for an isolated revision'] })
      const root = resolveToolRoot(rootDir)
      try {
        const result = await withWorkspaceLock(root, async () => {
          const gate = await requirePrepared(root, undefined, 'template_save')
          if (!gate.ok) return gate.result
          const saved = await saveTemplate(root, parsed, { replaceExisting: replaceExisting === true })
          markMutation('template_save', `templates/${parsed.id}.json`)
          return { saved: true, valid: true, qualityAudit: auditTemplateCss(saved.template?.templateCss, parsed.id), ...saved, verificationRecommended: true, nextTools: ['resume_check', 'resume_render', 'resume_metrics'] }
        })
        return jsonResult(result)
      } catch (error) {
        return jsonResult({ saved: false, valid: true, errors: [String(error?.message || error)], template: validation.value })
      }
    },
  )

  server.registerTool(
    'template_copy',
    {
      description: 'Copy a built-in or custom template into a new editable custom template. This is the default operation for structural or CSS revisions of a selected template; the source remains unchanged.',
      inputSchema: z.object({ sourceId: z.string(), newId: z.string(), name: z.string().optional(), ...rootInput }),
    },
    async ({ sourceId, newId, name, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const result = await withWorkspaceLock(root, async () => {
        const gate = await requirePrepared(root, undefined, 'template_copy')
        if (!gate.ok) return gate.result
        const copied = await copyTemplate(root, sourceId, newId, name)
        markMutation('template_copy', `templates/${newId}.json`)
        return { saved: true, ...copied, verificationRecommended: true, nextTools: ['resume_check', 'resume_render', 'resume_metrics'] }
      })
      return jsonResult(result)
    },
  )

  server.registerTool(
    'template_versions',
    {
      description: 'List saved versions for a custom template. Read-only.',
      inputSchema: z.object({ id: z.string(), ...rootInput }),
    },
    async ({ id, rootDir }) => jsonResult({ id, versions: await listTemplateVersions(resolveToolRoot(rootDir), id) }),
  )

  server.registerTool(
    'template_restore',
    {
      description: 'Restore a saved custom-template version as a new current revision. If versionId is omitted, restore the latest saved version.',
      inputSchema: z.object({ id: z.string(), versionId: z.string().optional(), ...rootInput }),
    },
    async ({ id, versionId, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const result = await withWorkspaceLock(root, async () => {
        const gate = await requirePrepared(root, undefined, 'template_restore')
        if (!gate.ok) return gate.result
        const restored = versionId ? await restoreTemplateVersion(root, id, versionId) : await restoreLatestTemplate(root, id)
        markMutation('template_restore', `templates/${id}.json`)
        return { restored: true, ...restored, verificationRecommended: true, nextTools: ['resume_check', 'resume_render', 'resume_metrics'] }
      })
      return jsonResult(result)
    },
  )

  server.registerTool(
    'layout_save',
    {
      description: 'Validate and save a per-resume composable layout JSON. This changes layout structure, not Markdown content.',
      inputSchema: z.object({ layoutJson: z.string(), resumePath: z.string().optional(), ...rootInput }),
    },
    async ({ layoutJson, resumePath, rootDir }) => {
      const parsed = parseJson(layoutJson, 'layoutJson')
      const validation = validateLayoutSpec(parsed)
      if (!validation.valid) return jsonResult({ saved: false, valid: false, errors: validation.errors, layout: validation.value })
      const root = resolveToolRoot(rootDir)
      const sourcePath = resumePath || 'resume.md'
      const layoutPath = sourcePath.replace(/\.md$/i, '.layout.json')
      const result = await withWorkspaceLock(root, async () => {
        const gate = await requirePrepared(root, sourcePath, 'layout_save')
        if (!gate.ok) return gate.result
        const saved = await writeJobhuntFile(root, layoutPath, `${JSON.stringify(validation.value, null, 2)}\n`)
        markMutation('layout_save', layoutPath)
        return { saved: true, valid: true, ...saved, layout: validation.value, verificationRecommended: true, nextTools: ['resume_check', 'resume_render', 'resume_metrics'] }
      })
      return jsonResult(result)
    },
  )

  server.registerTool(
    'presentation_save',
    {
      description: 'Persist presentation overrides for the current resume version. With resumePath, layout values, visual tokens, and icon tuning are isolated to that resume; without it, legacy workspace/template scope is used.',
      inputSchema: z.object({
        templateId: z.string(),
        layoutJson: z.string().optional(),
        visualJson: z.string().optional(),
        iconTuningJson: z.string().optional(),
        activePreviewPath: z.string().optional(),
        resumePath: z.string().optional().describe('Optional resume.md path. New saves should provide this to avoid affecting other resumes.'),
        reset: z.boolean().optional(),
        ...rootInput,
      }),
    },
    async ({ templateId, layoutJson, visualJson, iconTuningJson, activePreviewPath, resumePath, reset, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const result = await withWorkspaceLock(root, async () => {
        const gate = await requirePrepared(root, resumePath, 'presentation_save')
        if (!gate.ok) return gate.result
        const saved = await savePresentationOverride(root, {
          templateId,
          layout: layoutJson ? parseJson(layoutJson, 'layoutJson') : {},
          visual: visualJson ? parseJson(visualJson, 'visualJson') : {},
          iconTuning: iconTuningJson ? parseJson(iconTuningJson, 'iconTuningJson') : {},
          activePreviewPath,
          resumePath,
          reset: Boolean(reset),
          activeTemplateId: templateId,
        })
        markMutation('presentation_save', 'presentation.json')
        return { saved: true, ...saved, scope: resumePath ? 'resume' : 'legacy-workspace-template', verificationRecommended: true, nextTools: ['resume_check', 'resume_render', 'resume_metrics'] }
      })
      return jsonResult(result)
    },
  )

  server.registerTool(
    'template_autotune',
    {
      description: 'Suggest one bounded template adjustment from real browser A4 metrics. It only persists when persist=true is explicitly passed.',
      inputSchema: z.object({
        templateJson: z.string(),
        metricsJson: z.string(),
        round: z.number().int().min(1).max(3).optional(),
        templateId: z.string().optional(),
        persist: z.boolean().optional(),
        ...rootInput,
      }),
    },
    async ({ templateJson, metricsJson, round, templateId, persist, rootDir }) => {
      const result = autoTuneTemplate(parseJson(templateJson, 'templateJson'), parseJson(metricsJson, 'metricsJson'), round || 1)
      if (templateId && persist === true && result.changed && result.template) {
        const root = resolveToolRoot(rootDir)
        const saved = await withWorkspaceLock(root, async () => {
          const gate = await requirePrepared(root, undefined, 'template_autotune')
          if (!gate.ok) return gate.result
          const presentation = await savePresentationOverride(root, {
            templateId,
            layout: {
              fontFamily: result.template.typography?.fontFamily,
              fontSize: result.template.typography?.fontSize,
              lineHeight: result.template.typography?.lineHeight,
              sectionGap: result.template.spacing?.sectionGap,
              pageMargin: result.template.spacing?.pageMargin,
            },
            visual: result.template.visual,
            activeTemplateId: templateId,
          })
          markMutation('template_autotune', 'presentation.json')
          return { ...result, persisted: true, presentation: presentation.presentation, verificationRecommended: true, nextTools: ['resume_check', 'resume_render', 'resume_metrics'] }
        })
        return jsonResult(saved)
      }
      return jsonResult({ ...result, persisted: false })
    },
  )

  server.registerTool(
    'icon_list',
    {
      description: 'List registered dsh-resume icon tokens. Use this before adding an icon token; read-only.',
      inputSchema: z.object({
        query: z.string().optional().describe('Optional slug or label filter.'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum result count. Defaults to 40.'),
      }),
    },
    async ({ query, limit }) => {
      const items = listIconTokens(query).slice(0, limit || 40)
      return jsonResult({ query: query || '', count: items.length, items })
    },
  )

  return server
}

export async function startResumeMcpServer() {
  await serveStdio(createResumeMcpServer)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startResumeMcpServer().catch((error) => {
    console.error(`[${SERVER_NAME}] MCP server stopped: ${error?.stack || error}`)
    process.exitCode = 1
  })
}
