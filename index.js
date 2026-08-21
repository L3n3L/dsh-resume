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
6) optionally adjust templates/default.css, using the preview's page-count/overflow indicator as feedback
7) jobhunt_render to refresh preview.html, then re-render after any fit adjustment
8) summarize changes, unresolved evidence gaps, JD match choices, and page status; ask the user to review in Settings → 求职简历 and export themselves`

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
    name: 'jobhunt_write',
    description: 'Write a text file relative to jobhunt/. Allowed extensions: md, css, txt. Prefer company resume versions over master resume.',
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
