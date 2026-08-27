import { pathToFileURL } from 'node:url'

import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod/v4'

import { inspectIconTokens, listIconTokens } from '../lib/icons/registry.js'
import { validateLayoutSpec } from '../lib/layout-schema.js'
import { resumeQualityCheck } from '../lib/quality.js'
import { renderPreview } from '../lib/renderer.js'
import { applyPresentationOverride, loadPresentation } from '../lib/presentation.js'
import { listAvailableTemplates, loadTemplate } from '../lib/template-presets.js'
import { withWorkspaceLock } from '../lib/workspace-lock.js'
import { initJobhunt, readJobhuntFile, resolveJobhuntRoot, writeJobhuntFile } from '../lib/workspace.js'

const SERVER_NAME = 'dsh-resume'
const SERVER_VERSION = '0.1.0'

const rootDirSchema = z.string().optional().describe('Optional absolute path or cwd-relative jobhunt workspace root.')

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

async function readResume(root, resumePath) {
  const path = resumePath || 'resume.md'
  const { content } = await readJobhuntFile(root, path)
  return { path, content }
}

export function createResumeMcpServer() {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })

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
    }),
  )

  server.registerTool(
    'resume_init',
    {
      description: 'Create the dsh-resume jobhunt workspace skeleton and demo files if they do not exist.',
      inputSchema: z.object({ rootDir: rootDirSchema }),
    },
    async ({ rootDir }) => {
      const root = workspaceRoot(rootDir)
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
        rootDir: rootDirSchema,
      }),
    },
    async ({ path, rootDir }) => {
      const root = workspaceRoot(rootDir)
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
        rootDir: rootDirSchema,
      }),
    },
    async ({ path, content, rootDir }) => {
      const root = workspaceRoot(rootDir)
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
        rootDir: rootDirSchema,
      }),
    },
    async ({ resumePath, rootDir }) => {
      const root = workspaceRoot(rootDir)
      const resume = await readResume(root, resumePath)
      return jsonResult({ root, resumePath: resume.path, ...resumeQualityCheck(resume.content) })
    },
  )

  server.registerTool(
    'resume_render',
    {
      description: 'Render a resume Markdown file into an A4 preview HTML file. This does not export PDF or change the resume source.',
      inputSchema: z.object({
        resumePath: z.string().optional().describe('Resume Markdown path relative to the jobhunt root. Defaults to resume.md.'),
        templateCssPath: z.string().optional().describe('Template CSS path relative to the jobhunt root. Defaults to templates/default.css.'),
        templateId: z.string().optional().describe('Optional built-in or saved composition template id.'),
        outPath: z.string().optional().describe('Preview HTML path relative to the jobhunt root. Defaults beside the resume.'),
        rootDir: rootDirSchema,
      }),
    },
    async ({ resumePath, templateCssPath, templateId, outPath, rootDir }) => {
      const root = workspaceRoot(rootDir)
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
      return jsonResult({
        root,
        resumePath: rendered.resumePath,
        templateCssPath: rendered.templateCssPath,
        previewPath: rendered.previewPath,
        renderId: rendered.renderId,
        contentHash: rendered.contentHash,
        bytes: rendered.bytes,
        templateId: effectiveTemplateId || null,
        message: 'Preview rendered. Use the DSH preview panel or a browser to inspect A4 metrics; this tool does not export PDF.',
      })
    },
  )

  server.registerTool(
    'resume_metrics',
    {
      description: 'Return compact render metadata and explain whether browser-measured A4 metrics are available to this standalone MCP process.',
      inputSchema: z.object({
        previewPath: z.string().optional().describe('Preview HTML path relative to the jobhunt root. Defaults to preview.html.'),
        rootDir: rootDirSchema,
      }),
    },
    async ({ previewPath, rootDir }) => jsonResult({
      root: workspaceRoot(rootDir),
      previewPath: previewPath || 'preview.html',
      available: false,
      status: 'pending',
      message: 'Browser-measured A4 metrics are owned by the DSH preview runtime and are not shared through the standalone stdio MCP process yet.',
    }),
  )

  server.registerTool(
    'layout_validate',
    {
      description: 'Validate a resume layout JSON file against the dsh-resume layout schema. Read-only.',
      inputSchema: z.object({
        layoutPath: z.string().optional().describe('Layout JSON path relative to the jobhunt root. Defaults to resume.layout.json.'),
        rootDir: rootDirSchema,
      }),
    },
    async ({ layoutPath, rootDir }) => {
      const root = workspaceRoot(rootDir)
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
      inputSchema: z.object({ rootDir: rootDirSchema }),
    },
    async ({ rootDir }) => {
      const root = workspaceRoot(rootDir)
      const templates = await listAvailableTemplates(root)
      return jsonResult({ root, templates: templates.map(templateSummary) })
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
