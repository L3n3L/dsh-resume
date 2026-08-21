import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  initJobhunt,
  listJobhunt,
  readJobhuntFile,
  writeJobhuntFile,
  resolveJobhuntRoot,
} from './lib/workspace.js'
import { renderPreview } from './lib/renderer.js'
import { registerPreviewRoutes, rememberPreview } from './lib/preview-api.js'
import { resumeQualityCheck } from './lib/quality.js'
import { listAvailableTemplates, loadTemplate, saveTemplate, validateTemplate } from './lib/template-presets.js'
import { validateLayoutSpec } from './lib/layout-schema.js'

export const name = 'dsh-resume'
export const inject = ['tools', 'systemPrompt', 'webServer']

const PROMPT = `You are the campus job application resume workbench for this workspace.

Product promise:
- Turn the user's real materials into a truthful, JD-targeted, readable投递版简历.
- Help the user decide what to keep, what evidence is missing, and whether the layout is ready to export.
- Treat each company/role as an independent version; never silently overwrite the master resume.

Role split (mandatory):
- You MAY read/write Markdown resumes, story-bank, profile, JD files, and text templates (md/css) under jobhunt/.
- You SHOULD optimize content and layout for a target JD.
- You MUST NOT invent experiences. If evidence is missing, write gaps into notes.md.
- Prefer editing companies/<company>/resume.md over overwriting the master resume.md.
- Final export is owned by the USER in Settings → 求职简历 (preview panel). After render, tell the user to open that panel; do not claim you exported a PDF.

Workflow:
1) jobhunt_init if needed
2) read profile/resume/story-bank and the target JD
3) run jobhunt_check before rewriting so missing evidence and layout risks are explicit
4) write companies/<name>/jd.md and companies/<name>/resume.md
5) aim for one A4 page for a campus resume: remove repetition and low-signal bullets before shrinking type; keep modules together when possible
6) use jobhunt_template_list to choose a visual baseline; if the user asks for a new visual direction, generate a TemplateSpec JSON and save it with jobhunt_template_save
7) use resume.layout.json and jobhunt_layout_validate to declare extension modules without adding custom syntax to resume.md
8) use the preview's page-count/overflow/blank-space indicator as feedback; prefer TemplateSpec controls over arbitrary CSS
9) jobhunt_render to refresh preview.html, then re-render after any fit adjustment
10) summarize changes, unresolved evidence gaps, JD match choices, template choice, and page status; ask the user to review in Settings → 求职简历 and export themselves`

function textResult() {
  return {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'dsh-resume',
    order: 40,
    text: PROMPT,
  }))

  ctx.effect(() => registerPreviewRoutes(ctx))

  ctx.tools.register(defineTool({
    name: 'jobhunt_init',
    description: 'Create the jobhunt/ workspace skeleton and default resume template files if missing.',
    parameters: {
      rootDir: { type: 'string', description: 'Optional absolute path or cwd-relative path for jobhunt root. Default: <session-cwd>/jobhunt' },
    },
    output: textResult(),
    async execute(args, exec) {
      const root = resolveJobhuntRoot(exec, args.rootDir)
      return await initJobhunt(root)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_list',
    description: 'List files under the jobhunt workspace.',
    parameters: {
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      const root = resolveJobhuntRoot(exec, args.rootDir)
      return await listJobhunt(root)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_read',
    description: 'Read a text file relative to jobhunt/ (md/css/txt/html/json).',
    parameters: {
      path: { type: 'string', required: true, description: 'Relative path under jobhunt/, e.g. resume.md or companies/foo/jd.md' },
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      const root = resolveJobhuntRoot(exec, args.rootDir)
      return await readJobhuntFile(root, args.path)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_check',
    description: 'Run a deterministic preflight on a resume draft: section/bullet counts, suspiciously long bullets, and missing high-signal fields. This is a planning check, not a replacement for visual preview.',
    parameters: {
      resumePath: { type: 'string', description: 'Resume md relative to jobhunt/. Default: resume.md' },
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      const root = resolveJobhuntRoot(exec, args.rootDir)
      const resumePath = args.resumePath || 'resume.md'
      const { content } = await readJobhuntFile(root, resumePath)
      return {
        ...resumeQualityCheck(content),
        resumePath,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_template_list',
    description: 'List safe built-in and saved resume visual templates. Templates change layout styling only and do not overwrite resume content.',
    parameters: {
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      const root = resolveJobhuntRoot(exec, args.rootDir)
      return { templates: await listAvailableTemplates(root) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_template_validate',
    description: 'Validate a generated resume template JSON against the safe visual template schema before applying it.',
    parameters: {
      templateJson: { type: 'string', required: true, description: 'JSON object containing schemaVersion, layout, typography, spacing, and visual fields.' },
    },
    output: textResult(),
    async execute(args) {
      let parsed
      try {
        parsed = JSON.parse(args.templateJson)
      } catch {
        return { valid: false, errors: ['templateJson must be valid JSON'] }
      }
      const result = validateTemplate(parsed)
      return { valid: result.valid, errors: result.errors, template: result.value }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_template_save',
    description: 'Save an AI-generated, validated visual resume template as jobhunt/templates/<id>.json so it appears in the template library.',
    parameters: {
      templateJson: { type: 'string', required: true, description: 'Validated TemplateSpec JSON. The id must be lower-kebab-case and must not use a built-in id.' },
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      let parsed
      try {
        parsed = JSON.parse(args.templateJson)
      } catch {
        return { saved: false, valid: false, errors: ['templateJson must be valid JSON'] }
      }
      const validation = validateTemplate(parsed)
      if (!validation.valid) return { saved: false, valid: false, errors: validation.errors, template: validation.value }
      try {
        const root = resolveJobhuntRoot(exec, args.rootDir)
        return { saved: true, valid: true, ...(await saveTemplate(root, validation.value)) }
      } catch (err) {
        return { saved: false, valid: true, errors: [String(err?.message || err)], template: validation.value }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_layout_validate',
    description: 'Validate resume.layout.json structure for extension modules, regions, and content sources.',
    parameters: {
      layoutJson: { type: 'string', required: true, description: 'JSON object containing mode, regions, and blocks.' },
    },
    output: textResult(),
    async execute(args) {
      let parsed
      try {
        parsed = JSON.parse(args.layoutJson)
      } catch {
        return { valid: false, errors: ['layoutJson must be valid JSON'] }
      }
      const result = validateLayoutSpec(parsed)
      return { valid: result.valid, errors: result.errors, layout: result.value }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_layout_save',
    description: 'Validate and save resume.layout.json next to a resume so the renderer can apply extension module types and order.',
    parameters: {
      layoutJson: { type: 'string', required: true, description: 'JSON object containing mode, regions, and blocks.' },
      resumePath: { type: 'string', description: 'Resume md relative to jobhunt/. Default: resume.md' },
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      let parsed
      try {
        parsed = JSON.parse(args.layoutJson)
      } catch {
        return { saved: false, valid: false, errors: ['layoutJson must be valid JSON'] }
      }
      const validation = validateLayoutSpec(parsed)
      if (!validation.valid) return { saved: false, valid: false, errors: validation.errors, layout: validation.value }
      const root = resolveJobhuntRoot(exec, args.rootDir)
      const resumePath = args.resumePath || 'resume.md'
      const layoutPath = resumePath.replace(/\.md$/i, '.layout.json')
      const result = await writeJobhuntFile(root, layoutPath, `${JSON.stringify(validation.value, null, 2)}\n`)
      return { saved: true, valid: true, ...result, layout: validation.value }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_write',
    description: 'Write a text file relative to jobhunt/. Allowed extensions: md, css, txt, json. Prefer company resume versions over master resume.',
    parameters: {
      path: { type: 'string', required: true, description: 'Relative path under jobhunt/' },
      content: { type: 'string', required: true, description: 'Full file content to write' },
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      const root = resolveJobhuntRoot(exec, args.rootDir)
      return await writeJobhuntFile(root, args.path, args.content)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_render',
    description: 'Render a resume markdown file with a CSS template into preview.html. User reviews/exports in Settings → 求职简历. This is not final PDF export.',
    parameters: {
      resumePath: { type: 'string', description: 'Resume md relative to jobhunt/. Default: resume.md' },
      templateCssPath: { type: 'string', description: 'Template css relative to jobhunt/. Default: templates/default.css' },
      templateId: { type: 'string', description: 'Optional safe built-in visual template id, e.g. campus-standard or tech-compact.' },
      outPath: { type: 'string', description: 'Output html relative to jobhunt/. Default: sibling preview.html' },
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      const root = resolveJobhuntRoot(exec, args.rootDir)
      const rendered = await renderPreview(root, {
        resumePath: args.resumePath,
        templateCssPath: args.templateCssPath,
        outPath: args.outPath,
        templateSpec: args.templateId ? await loadTemplate(root, args.templateId) : undefined,
      })
      rememberPreview(root, rendered.previewPath)
      return {
        ...rendered,
        uiHint: 'Open Settings → 求职简历 to preview. Export is user-owned.',
        previewUrl: `/dsh-resume/preview?path=${encodeURIComponent(rendered.previewPath)}`,
      }
    },
  }))
}
