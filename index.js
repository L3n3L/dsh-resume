import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  initJobhunt,
  listJobhunt,
  readJobhuntFile,
  writeJobhuntFile,
  resolveJobhuntRoot,
} from './lib/workspace.js'
import { renderPreview } from './lib/renderer.js'
import { getLatestMetrics, registerPreviewRoutes, rememberPreview } from './lib/preview-api.js'
import { resumeQualityCheck } from './lib/quality.js'
import {
  copyTemplate,
  listAvailableTemplates,
  listTemplateVersions,
  loadTemplate,
  restoreLatestTemplate,
  saveTemplate,
  validateTemplate,
} from './lib/template-presets.js'
import { validateLayoutSpec } from './lib/layout-schema.js'
import { autoTuneTemplate } from './lib/autotune.js'
import { generateTemplateCandidate, validateDesignBrief } from './lib/template-generation.js'
import { listThemeFamilies } from './lib/theme-system.js'

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
6) use jobhunt_template_list to choose a visual baseline; if the user asks for a new visual direction, call jobhunt_template_family_list first, then use a DesignBrief with an explicit family id and let the generator select a compatible renderer; when the user has explicitly asked to create or apply the template, validate, save, render, and measure it in one flow without asking for a redundant confirmation
7) use resume.layout.json and jobhunt_layout_validate to declare extension modules without adding custom syntax to resume.md; available semantic types include photo, summary, contact, and skill-groups. Put local images under jobhunt/assets and use HTTPS URLs only when a local asset is unavailable.
8) after jobhunt_render, call jobhunt_layout_metrics to read the browser's real A4 measurement; it includes page count, top/bottom whitespace, occupancy, module details, and visual warnings; an open plugin preview refreshes itself when a new render lands
9) use visualAudit and the preview's page-count/overflow/blank-space indicator as feedback; if the page is sparse, has a large bottom blank, or isolates a module, adjust content/module spacing before shrinking type; prefer TemplateSpec controls over arbitrary CSS
10) jobhunt_render refreshes preview.html and an already-open plugin preview; if metrics are pending, continue the task and let the preview report them when ready rather than asking the user to reopen Settings
11) summarize changes, unresolved evidence gaps, JD match choices, template choice, and page status; ask the user to review in Settings → 求职简历 and export themselves`

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
    name: 'jobhunt_template_family_list',
    description: 'List the independent dsh-resume theme families and semantic block presets available for AI-generated templates. Use this before jobhunt_template_generate when the user asks for a new visual direction.',
    parameters: {},
    output: textResult(),
    async execute() {
      return { families: listThemeFamilies() }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_template_validate',
    description: 'Validate a generated resume template JSON against the safe visual template schema before applying it.',
    parameters: {
      templateJson: { type: 'string', required: true, description: 'JSON object containing schemaVersion, family, renderer, layout, typography, spacing, and visual fields.' },
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
    name: 'jobhunt_template_generate',
    description: 'Generate a safe visual resume template candidate from a compact DesignBrief. Returns a validated TemplateSpec and rationale; when the user explicitly asks to create or apply the template, continue with validation, jobhunt_template_save, rendering, and A4 measurement without waiting for a redundant confirmation.',
    parameters: {
      briefJson: { type: 'string', required: true, description: 'JSON DesignBrief: name, family, audience, optional layout/density/tone overrides, moduleOrder, palette, customCss, bestFor, and tags.' },
    },
    output: textResult(),
    async execute(args) {
      let parsed
      try {
        parsed = JSON.parse(args.briefJson)
      } catch {
        return { valid: false, errors: ['briefJson must be valid JSON'] }
      }
      const brief = validateDesignBrief(parsed)
      if (!brief.valid) return { valid: false, errors: brief.errors, brief: brief.value }
      return generateTemplateCandidate(brief.value)
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
    name: 'jobhunt_template_copy',
    description: 'Copy a built-in or custom template into a new editable custom template.',
    parameters: {
      sourceId: { type: 'string', required: true, description: 'Existing template id.' },
      newId: { type: 'string', required: true, description: 'New lower-kebab-case template id.' },
      name: { type: 'string', description: 'Optional display name for the copy.' },
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      const root = resolveJobhuntRoot(exec, args.rootDir)
      return { saved: true, ...(await copyTemplate(root, args.sourceId, args.newId, args.name)) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_template_versions',
    description: 'List saved versions for a custom template.',
    parameters: {
      id: { type: 'string', required: true, description: 'Custom template id.' },
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      const root = resolveJobhuntRoot(exec, args.rootDir)
      return { id: args.id, versions: await listTemplateVersions(root, args.id) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_template_restore',
    description: 'Restore the latest saved version of a custom template.',
    parameters: {
      id: { type: 'string', required: true, description: 'Custom template id.' },
      rootDir: { type: 'string', description: 'Optional jobhunt root override.' },
    },
    output: textResult(),
    async execute(args, exec) {
      const root = resolveJobhuntRoot(exec, args.rootDir)
      return { restored: true, ...(await restoreLatestTemplate(root, args.id)) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_layout_validate',
    description: 'Validate resume.layout.json structure for extension modules, regions, and content sources. Supported semantic types include photo, summary, contact, and skill-groups.',
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
    name: 'jobhunt_layout_metrics',
    description: 'Read the latest browser-measured A4 metrics from the resume preview, including page count, overflow, top/bottom whitespace, occupancy, module details, and visualAudit warnings. If the preview is still refreshing, return a pending status and continue without asking the user to reopen Settings.',
    parameters: {},
    output: textResult(),
    async execute() {
      return getLatestMetrics()
    },
  }))

  ctx.tools.register(defineTool({
    name: 'jobhunt_template_autotune',
    description: 'Suggest one bounded visual-template adjustment from real browser A4 metrics. Use at most three rounds, then save the returned template JSON if the user accepts it.',
    parameters: {
      templateJson: { type: 'string', required: true, description: 'Current TemplateSpec JSON.' },
      metricsJson: { type: 'string', required: true, description: 'Metrics returned by jobhunt_layout_metrics.' },
      round: { type: 'number', description: 'Adjustment round, from 1 to 3.' },
    },
    output: textResult(),
    async execute(args) {
      let template
      let metrics
      try {
        template = JSON.parse(args.templateJson)
        metrics = JSON.parse(args.metricsJson)
      } catch {
        return { changed: false, valid: false, errors: ['templateJson and metricsJson must be valid JSON'] }
      }
      return autoTuneTemplate(template, metrics.metrics || metrics, Number(args.round) || 1)
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
      rememberPreview(root, rendered.previewPath, rendered)
      return {
        ...rendered,
        latestMetrics: getLatestMetrics(),
        uiHint: 'If the resume preview is open, it will refresh automatically. The user owns the final export.',
        previewUrl: `/dsh-resume/preview?root=${encodeURIComponent(root)}&path=${encodeURIComponent(rendered.previewPath)}`,
      }
    },
  }))
}
