import { pathToFileURL } from 'node:url'

import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod/v4'

import { inspectIconTokens, listIconTokens } from '../lib/icons/registry.js'
import { validateLayoutSpec } from '../lib/layout-schema.js'
import { resumeQualityCheck } from '../lib/quality.js'
import { renderPreview } from '../lib/renderer.js'
import { applyPresentationOverride, loadPresentation, savePresentationOverride } from '../lib/presentation.js'
import { autoTuneTemplate } from '../lib/autotune.js'
import { auditTemplateCss, generateTemplateCandidate, validateDesignBrief } from '../lib/template-generation.js'
import { listThemeFamilies } from '../lib/theme-system.js'
import { copyTemplate, listAvailableTemplates, listTemplateVersions, loadTemplate, restoreLatestTemplate, saveTemplate, validateTemplate } from '../lib/template-presets.js'
import { getResumeGuide, RESUME_MCP_INSTRUCTIONS } from '../lib/resume-guide.js'
import { withWorkspaceLock } from '../lib/workspace-lock.js'
import { getWorkspaceInfo, initJobhunt, readJobhuntFile, resolveJobhuntRoot, writeJobhuntFile } from '../lib/workspace.js'

const SERVER_NAME = 'dsh-resume'
const SERVER_VERSION = '0.1.0'

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

async function readResume(root, resumePath) {
  const path = resumePath || 'resume.md'
  const { content } = await readJobhuntFile(root, path)
  return { path, content }
}

export function createResumeMcpServer(options = {}) {
  const allowRootOverride = options.allowRootOverride !== false
  const resolveBoundRoot = typeof options.resolveRoot === 'function' ? options.resolveRoot : null
  const onRendered = typeof options.onRendered === 'function' ? options.onRendered : null
  const resolveMetrics = typeof options.resolveMetrics === 'function' ? options.resolveMetrics : null
  const rootInput = allowRootOverride ? { rootDir: rootDirSchema } : {}
  const resolveToolRoot = (rootDir) => {
    if (!allowRootOverride && rootDir) throw new Error('当前 DSH MCP 已绑定到插件页选择的工作区，不能通过 rootDir 切换目录。请先在 DSH 左侧栏切换工作区。')
    return resolveBoundRoot ? resolveBoundRoot() : workspaceRoot(rootDir)
  }
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: RESUME_MCP_INSTRUCTIONS })

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
      transport: 'stdio',
      capabilities: ['tools/list', 'tools/call'],
      cwd: process.cwd(),
      workspaceRoot: resolveToolRoot(),
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
      description: 'Write an allowed text file in the dsh-resume jobhunt workspace. Requires an explicit full content payload; Markdown icon tokens are validated before saving.',
      inputSchema: z.object({
        path: z.string().min(1).describe('Relative path under jobhunt/. Allowed extensions are md, css, txt, and json.'),
        content: z.string().describe('Complete file content to save.'),
        ...rootInput,
      }),
    },
    async ({ path, content, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      return jsonResult(await withWorkspaceLock(root, async () => {
        const isResume = /(^|\/)resume\.md$/i.test(String(path).replace(/\\/g, '/'))
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
        return {
          saved: true,
          root,
          ...(await writeJobhuntFile(root, path, content)),
          iconWarnings: [],
        }
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
      let templateSpec
      let initialIconTuning = {}
      const presentation = await loadPresentation(root)
      const effectiveTemplateId = templateId || presentation.activeTemplateId
      if (effectiveTemplateId) {
        try {
          templateSpec = applyPresentationOverride(await loadTemplate(root, effectiveTemplateId), presentation, effectiveTemplateId)
          initialIconTuning = presentation.overrides?.[effectiveTemplateId]?.iconTuning || {}
        } catch (error) {
          const available = await listAvailableTemplates(root).catch(() => [])
          throw new Error(`templateId "${effectiveTemplateId}" could not be loaded: ${error?.message || String(error)}; available: ${available.map((item) => item.id).join(', ')}`)
        }
      }
      const rendered = await renderPreview(root, {
        resumePath,
        templateCssPath,
        templateSpec,
        outPath,
        initialIconTuning,
      })
      const previewRuntime = onRendered ? await onRendered(rendered) : null
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
        return jsonResult({ root, previewPath: requestedPreviewPath, ...(await resolveMetrics({ root, previewPath: requestedPreviewPath })) })
      }
      return jsonResult({
        root,
        previewPath: requestedPreviewPath,
        available: false,
        status: 'pending',
        message: 'Browser-measured A4 metrics are owned by the DSH preview runtime and are not shared through the standalone stdio MCP process yet.',
      })
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
      description: 'Save a validated composition template as a workspace template JSON/CSS. Use a new id for a revision; built-in templates are not overwritten.',
      inputSchema: z.object({ templateJson: z.string().describe('Complete validated composition TemplateSpec JSON.'), ...rootInput }),
    },
    async ({ templateJson, rootDir }) => {
      const parsed = parseJson(templateJson, 'templateJson')
      const validation = validateTemplate(parsed)
      if (!validation.valid) return jsonResult({ saved: false, valid: false, errors: validation.errors, template: validation.value })
      const root = resolveToolRoot(rootDir)
      try {
        const saved = await withWorkspaceLock(root, () => saveTemplate(root, parsed))
        return jsonResult({ saved: true, valid: true, qualityAudit: auditTemplateCss(saved.template?.templateCss, parsed.id), ...saved })
      } catch (error) {
        return jsonResult({ saved: false, valid: true, errors: [String(error?.message || error)], template: validation.value })
      }
    },
  )

  server.registerTool(
    'template_copy',
    {
      description: 'Copy a built-in or custom template into a new editable custom template.',
      inputSchema: z.object({ sourceId: z.string(), newId: z.string(), name: z.string().optional(), ...rootInput }),
    },
    async ({ sourceId, newId, name, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      return jsonResult({ saved: true, ...(await withWorkspaceLock(root, () => copyTemplate(root, sourceId, newId, name))) })
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
      description: 'Restore the latest saved version of a custom template.',
      inputSchema: z.object({ id: z.string(), ...rootInput }),
    },
    async ({ id, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      return jsonResult({ restored: true, ...(await withWorkspaceLock(root, () => restoreLatestTemplate(root, id))) })
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
      const saved = await withWorkspaceLock(root, () => writeJobhuntFile(root, layoutPath, `${JSON.stringify(validation.value, null, 2)}\n`))
      return jsonResult({ saved: true, valid: true, ...saved, layout: validation.value })
    },
  )

  server.registerTool(
    'presentation_save',
    {
      description: 'Persist per-workspace presentation overrides for a template, including layout values, visual tokens, icon tuning, and active preview selection.',
      inputSchema: z.object({
        templateId: z.string(),
        layoutJson: z.string().optional(),
        visualJson: z.string().optional(),
        iconTuningJson: z.string().optional(),
        activePreviewPath: z.string().optional(),
        reset: z.boolean().optional(),
        ...rootInput,
      }),
    },
    async ({ templateId, layoutJson, visualJson, iconTuningJson, activePreviewPath, reset, rootDir }) => {
      const root = resolveToolRoot(rootDir)
      const saved = await withWorkspaceLock(root, () => savePresentationOverride(root, {
        templateId,
        layout: layoutJson ? parseJson(layoutJson, 'layoutJson') : {},
        visual: visualJson ? parseJson(visualJson, 'visualJson') : {},
        iconTuning: iconTuningJson ? parseJson(iconTuningJson, 'iconTuningJson') : {},
        activePreviewPath,
        reset: Boolean(reset),
        activeTemplateId: templateId,
      }))
      return jsonResult({ saved: true, ...saved })
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
        const saved = await withWorkspaceLock(root, () => savePresentationOverride(root, {
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
        }))
        return jsonResult({ ...result, persisted: true, presentation: saved.presentation })
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
