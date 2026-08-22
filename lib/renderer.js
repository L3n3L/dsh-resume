import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import MarkdownIt from 'markdown-it'
import { resolveUnderJobhunt } from './workspace.js'
import { assertTemplateSpec } from './template-schema.js'
import { assertLayoutSpec } from './layout-schema.js'
import { renderTemplateLayout, resolveRendererId } from './renderers/registry.js'

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: false,
  typographer: false,
})

const defaultLinkOpen = markdown.renderer.rules.link_open || ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noreferrer')
  return defaultLinkOpen(tokens, index, options, env, self)
}

/** Markdown → safe HTML. Raw HTML is disabled so resume.md cannot inject scripts. */
export function markdownToHtml(md) {
  return markdown.render(String(md || '').replace(/\r\n/g, '\n'))
}

/** Assemble Markdown sections into the plugin's own semantic resume tree. */
function sectionHeading(part) {
  return /<h2>([^<]*)<\/h2>/.exec(part)?.[1]?.trim() || ''
}

function moduleClass(type) {
  return `dsh-module-${String(type || 'custom-section').replace(/[^a-z0-9-]/gi, '-')}`
}

function presetClass(options = {}) {
  const preset = options?.preset
  if (!preset) return ''
  return `dsh-preset-${String(preset).replace(/[^a-z0-9-]/gi, '-')}`
}

function safeImageSource(source, context = {}) {
  const value = String(source || '').trim()
  if (!value) return ''
  if (/^https:\/\//i.test(value) || /^data:image\//i.test(value) || value.startsWith('/dsh-resume/api/asset?')) return value
  const relative = value.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!relative || relative.split('/').some((part) => part === '..')) return ''
  return context.root
    ? `/dsh-resume/api/asset?root=${encodeURIComponent(context.root)}&path=${encodeURIComponent(relative)}`
    : relative
}

function rewriteImageSources(html, context = {}) {
  return html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gi, (_match, prefix, source, suffix) => `${prefix}${escapeHtml(safeImageSource(source, context))}${suffix}`)
}

function photoShape(value) {
  return ['circle', 'square', 'rounded'].includes(value) ? value : 'rounded'
}

function photoSize(value) {
  const size = Number(value)
  return Number.isFinite(size) ? Math.min(180, Math.max(40, Math.round(size))) : 88
}

function renderPhoto(html, options = {}, context = {}) {
  const sourceFromMarkup = /<img\b[^>]*\bsrc="([^"]+)"[^>]*>/i.exec(html)?.[1] || ''
  const altFromMarkup = /<img\b[^>]*\balt="([^"]*)"[^>]*>/i.exec(html)?.[1] || ''
  const source = safeImageSource(options.source || sourceFromMarkup, context)
  const alt = escapeHtml(String(options.alt || altFromMarkup || '头像'))
  const shape = photoShape(options.shape)
  const size = photoSize(options.size)
  if (!source) return `<div class="dsh-photo dsh-photo-missing dsh-photo-${shape}" data-placement="${escapeHtml(String(options.placement || 'header'))}"><span>暂无头像</span></div>`
  return `<figure class="dsh-photo dsh-photo-${shape}" data-placement="${escapeHtml(String(options.placement || 'header'))}" style="--photo-size:${size}px"><img src="${escapeHtml(source)}" alt="${alt}" loading="lazy" /></figure>`
}

function renderSkillGroups(html) {
  const list = /<ul>([\s\S]*?)<\/ul>/.exec(html)
  if (!list) return `<div class="dsh-skill-groups">${html}</div>`
  const items = list[1].match(/<li>[\s\S]*?<\/li>/g) || []
  return html.replace(list[0], `<div class="dsh-skill-groups">${items.map((item) => `<div class="dsh-skill-group">${item.replace(/^<li>|<\/li>$/g, '')}</div>`).join('')}</div>`)
}

function renderModuleBody(type, html, options = {}, context = {}) {
  if (type === 'photo') return renderPhoto(html, options, context)
  if (type === 'summary') return `<div class="dsh-summary">${html}</div>`
  if (type === 'contact') return `<div class="dsh-contact">${html}</div>`
  if (type === 'skill-groups') return renderSkillGroups(html)
  if (type === 'skill-tags') {
    const list = /<ul>([\s\S]*?)<\/ul>/.exec(html)
    if (!list) return html
    const tags = list[1]
      .replaceAll(/<li>/g, '<span class="dsh-skill-tag">')
      .replaceAll(/<\/li>/g, '</span>')
    return html.replace(list[0], `<div class="dsh-skill-tags">${tags}</div>`)
  }
  if (type === 'timeline') return `<div class="dsh-timeline">${html}</div>`
  if (type === 'metric-row') return `<div class="dsh-metric-row">${html}</div>`
  if (type === 'portfolio-card') return `<div class="dsh-portfolio-card">${html}</div>`
  if (type === 'project-list') return `<div class="dsh-project-list">${html}</div>`
  if (type === 'qr-code') return `<div class="dsh-qr-code">${html}</div>`
  return html
}

export function assembleResumeSections(html, layoutSpec, templateLayout = null, templateSpec = {}, context = {}) {
  // Structural combine without DOM: split by h2 boundaries.
  const parts = html.split(/(?=<h2>)/g).filter(Boolean)
  if (parts.length <= 1 && !html.includes('<h2>')) return `<div class="dsh-resume-root">${html}</div>`

  const layout = layoutSpec ? assertLayoutSpec(layoutSpec) : null
  const blocks = layout ? layout.blocks : []
  const byHeading = new Map(blocks.map((block) => [block.source || block.id, block]))
  const byId = new Map(blocks.map((block) => [block.id, block]))
  const sectionParts = []
  let headerDone = false
  for (const [index, part] of parts.entries()) {
    if (part.startsWith('<h2>')) {
      const heading = sectionHeading(part)
      const inferred = [
        ['教育', 'education'],
        ['技能', 'skills'],
        ['项目', 'projects'],
        ['实习', 'experience'],
        ['经历', 'experience'],
        ['获奖', 'awards'],
        ['链接', 'links'],
      ].find(([key]) => heading.includes(key))
      const block = byHeading.get(heading) || byId.get(heading) || (inferred && byId.get(inferred[1])) || {
        id: inferred?.[1] || `section-${index + 1}`,
        type: inferred?.[1] || 'custom-section',
        source: heading,
      }
      const id = sectionParts.some((item) => item.id === block.id) ? `${block.id}-${index + 1}` : block.id
      const sectionBody = renderModuleBody(block.type, part, block.options, context)
      const classes = [moduleClass(block.type), presetClass(block.options)].filter(Boolean).join(' ')
      const family = block.options?.family ? ` data-theme-family="${escapeHtml(String(block.options.family))}"` : ''
      const section = `<section class="dsh-resume-section ${classes}" data-module-id="${escapeHtml(block.id)}" data-module-type="${escapeHtml(block.type)}"${family}>${sectionBody}</section>`
      sectionParts.push({ id, sourceId: block.id, type: block.type, html: section })
      headerDone = true
    } else if (!headerDone) {
      const headerClass = /<img\b/i.test(part) ? 'header-block dsh-header-with-image' : 'header-block'
      sectionParts.header = `<header class="${headerClass}">${part}</header>`
      headerDone = true
    }
  }
  const effectiveMode = layout?.mode && layout.mode !== 'auto' ? layout.mode : (templateLayout?.mode || 'single-column')
  const regionValues = layout?.regions || {}
  const orderIds = [...Object.values(regionValues).flat(), ...(templateLayout?.moduleOrder || [])]
  const ordered = []
  const used = new Set()
  for (const id of orderIds) {
    const section = sectionParts.find((item) => item.sourceId === id || item.id === id)
    if (section && !used.has(section.id)) {
      ordered.push(section)
      used.add(section.id)
    }
  }
  for (const section of sectionParts) {
    if (!used.has(section.id)) ordered.push(section)
  }
  const irOrder = layout?.ir?.type === 'split'
    ? layout.ir.columns.flatMap((column) => column.items || [])
    : (layout?.ir?.type === 'stack' || layout?.ir?.type === 'grid' ? layout.ir.items || [] : [])
  if (irOrder.length) {
    const bySourceId = new Map(ordered.map((section) => [section.sourceId, section]))
    const reordered = []
    const seen = new Set()
    for (const id of irOrder) {
      const section = bySourceId.get(id)
      if (section && !seen.has(section.id)) {
        reordered.push(section)
        seen.add(section.id)
      }
    }
    for (const section of ordered) if (!seen.has(section.id)) reordered.push(section)
    ordered.splice(0, ordered.length, ...reordered)
  }
  const header = sectionParts.header || ''
  const resolvedTemplate = { ...templateSpec, layout: templateLayout || templateSpec.layout || {} }
  const renderer = effectiveMode === 'two-column' && !templateSpec.renderer
    ? 'split-sidebar'
    : resolveRendererId(resolvedTemplate, { ...templateLayout, ...layout })
  return renderTemplateLayout({ template: { ...resolvedTemplate, renderer }, layout: { ...layout, regions: regionValues }, header, ordered })
}

function hashRenderInput(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function scopedCustomCss(templateId, customCss) {
  if (!customCss) return ''
  return `@scope (.resume-document[data-template-id="${templateId}"]) {\n${customCss}\n}`
}

export function buildPreviewDocument({ title, bodyHtml, cssText, sourcePath, templatePath, previewPath, previewRoot, renderId, contentHash, templateSpec }) {
  const normalizedTemplate = assertTemplateSpec(templateSpec)
  const serializedTemplate = JSON.stringify(normalizedTemplate).replace(/</g, '\\u003c')
  const customCss = scopedCustomCss(normalizedTemplate.id, normalizedTemplate.customCss)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title || 'Resume Preview')}</title>
  <style>
${cssText}
  </style>
${customCss ? `  <style data-template-custom-css>\n${customCss}\n  </style>` : ''}
</head>
<body>
  <main class="resume-document template-${escapeHtml(normalizedTemplate.visual.variant)} renderer-${escapeHtml(normalizedTemplate.renderer)}" data-source="${escapeHtml(sourcePath)}" data-template="${escapeHtml(templatePath)}" data-preview-root="${escapeHtml(previewRoot || '')}" data-preview-path="${escapeHtml(previewPath || '')}" data-render-id="${escapeHtml(renderId || '')}" data-content-hash="${escapeHtml(contentHash || '')}" data-template-id="${escapeHtml(normalizedTemplate.id)}" data-template-family="${escapeHtml(normalizedTemplate.family)}">
    <div class="resume-content">
${bodyHtml}
    </div>
  </main>
  <script>
  (() => {
    const query = new URLSearchParams(window.location.search);
    const isThumbnail = query.get('thumbnail') === '1';
    const rootStyle = document.documentElement.style;
    const template = ${serializedTemplate};
    const fontFamilies = {
      'system-sans': '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      'modern-sans': 'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      serif: 'Georgia, "Songti SC", "SimSun", serif',
    };
    const templateFont = fontFamilies[template.typography.fontFamily] || fontFamilies['system-sans'];
    const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
    const safeNumber = (value, min, max, fallback) => {
      const number = Number(value);
      return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
    };
    const applyVisualTokens = (tokens = {}) => {
      const accentColor = safeColor(tokens.accentColor, template.visual.accentColor);
      const textColor = safeColor(tokens.textColor, template.visual.textColor);
      const mutedColor = safeColor(tokens.mutedColor, template.visual.mutedColor);
      const backgroundColor = safeColor(tokens.backgroundColor, template.visual.backgroundColor);
      const cornerRadius = safeNumber(tokens.cornerRadius, 0, 16, template.visual.cornerRadius);
      const divider = ['none', 'solid', 'dashed'].includes(tokens.divider) ? tokens.divider : template.visual.divider;
      rootStyle.setProperty('--resume-accent-color', accentColor);
      rootStyle.setProperty('--resume-text-color', textColor);
      rootStyle.setProperty('--resume-muted-color', mutedColor);
      rootStyle.setProperty('--resume-background-color', backgroundColor);
      rootStyle.setProperty('--bg', backgroundColor);
      rootStyle.setProperty('--resume-corner-radius', cornerRadius + 'px');
      rootStyle.setProperty('--resume-divider', divider);
    };
    rootStyle.setProperty('--resume-font-size', template.typography.fontSize + 'px');
    rootStyle.setProperty('--resume-line-height', template.typography.lineHeight);
    rootStyle.setProperty('--resume-section-gap', template.spacing.sectionGap + 'px');
    rootStyle.setProperty('--resume-page-margin', template.spacing.pageMargin + 'px');
    rootStyle.setProperty('--resume-paragraph-gap', template.spacing.paragraphGap + 'px');
    rootStyle.setProperty('--resume-heading-scale', template.typography.headingScale);
    // The active workspace may provide an older template CSS that does not
    // declare the page-height contract. Keep the preview renderer authoritative
    // so an A4 page cannot silently grow into a long canvas.
    rootStyle.setProperty('--page-width', '794px');
    rootStyle.setProperty('--page-height', '1123px');
    applyVisualTokens({
      accentColor: query.get('accentColor'),
      textColor: query.get('textColor'),
      mutedColor: query.get('mutedColor'),
      backgroundColor: query.get('backgroundColor'),
      cornerRadius: query.get('cornerRadius'),
      divider: query.get('divider'),
    });
    const settingMap = [
      ['fontSize', '--resume-font-size', 'px', 11, 18],
      ['lineHeight', '--resume-line-height', '', 1.2, 2],
      ['sectionGap', '--resume-section-gap', 'px', 6, 30],
      ['pageMargin', '--resume-page-margin', 'px', 24, 72],
    ];
    for (const [key, variable, unit, min, max] of settingMap) {
      const value = Number(query.get(key));
      if (Number.isFinite(value) && value >= min && value <= max) rootStyle.setProperty(variable, value + unit);
    }
    const tuningStyle = document.createElement('style');
    const fontSize = rootStyle.getPropertyValue('--resume-font-size').trim() || '14px';
    const lineHeight = rootStyle.getPropertyValue('--resume-line-height').trim() || '1.55';
    const sectionGap = rootStyle.getPropertyValue('--resume-section-gap').trim() || '20px';
    const pageMargin = rootStyle.getPropertyValue('--resume-page-margin').trim() || '48px';
    tuningStyle.textContent = [
      'html,body{background:#fff !important;overflow-x:hidden !important;}',
      '.resume-document{min-height:0 !important;padding:0 !important;background:#fff !important;}',
      '.dsh-resume-pages{display:flex !important;flex-direction:column !important;align-items:center !important;gap:18px !important;width:100% !important;}',
      '.dsh-resume-page{box-sizing:border-box !important;width:794px !important;height:1123px !important;min-height:1123px !important;flex:0 0 1123px !important;margin:0 !important;overflow:hidden !important;box-shadow:0 8px 30px rgba(15,23,42,.08) !important;}',
      '.dsh-resume-page-content{box-sizing:border-box !important;width:100% !important;height:100% !important;overflow:hidden !important;}',
      'body{font-family:' + templateFont + ';line-height:' + lineHeight + ' !important;color:var(--resume-text-color) !important;}',
      '.dsh-resume-page-content{padding:' + pageMargin + ' !important;}',
      '.dsh-resume-page{background:var(--bg) !important;border-radius:var(--resume-corner-radius);}',
      '.dsh-resume-page-content{background-color:var(--bg) !important;border-radius:var(--resume-corner-radius);}',
      '.dsh-resume-section{margin-bottom:' + sectionGap + ' !important;}',
      '.dsh-resume-section{border-radius:var(--resume-corner-radius);}',
      'p,li{font-size:' + fontSize + ' !important;margin-bottom:' + template.spacing.paragraphGap + 'px;}',
      '.header-block{border-bottom-color:var(--resume-accent-color) !important;border-radius:var(--resume-corner-radius);}',
      '.header-block p,.meta{color:var(--resume-muted-color) !important;}',
      '.dsh-resume-section > h2{color:var(--resume-accent-color) !important;font-size:calc(' + fontSize + ' * ' + template.typography.headingScale + ') !important;border-bottom-color:var(--resume-accent-color) !important;border-bottom-style:var(--resume-divider) !important;}',
      '.dsh-resume-columns{grid-template-columns:minmax(0,' + Math.max(0.55, 1 - template.layout.sidebarRatio) + 'fr) minmax(0,' + template.layout.sidebarRatio + 'fr) !important;gap:' + template.layout.columnGap + 'px !important;}',
      '.resume-document.renderer-split-sidebar .dsh-layout-split,.resume-document.renderer-sidebar-signal .dsh-layout-split{display:grid !important;grid-template-columns:minmax(0,' + Math.max(0.55, 1 - template.layout.sidebarRatio) + 'fr) minmax(0,' + template.layout.sidebarRatio + 'fr) !important;gap:var(--layout-gap,' + template.layout.columnGap + 'px) !important;align-items:start;}',
      '.resume-document.renderer-split-sidebar .dsh-layout-column,.resume-document.renderer-sidebar-signal .dsh-layout-column{min-width:0;min-height:0;overflow:hidden;}',
      '.resume-document.renderer-split-sidebar .dsh-column-main-item,.resume-document.renderer-sidebar-signal .dsh-column-main-item{min-width:0;}',
      '.resume-document.renderer-split-sidebar .dsh-column-side-item,.resume-document.renderer-sidebar-signal .dsh-column-side-item{min-width:0;}',
      '.resume-document.renderer-portfolio-grid .dsh-layout-grid{display:grid;grid-template-columns:repeat(var(--layout-grid-columns,2),minmax(0,1fr));gap:var(--layout-gap,20px);align-items:start;}',
      '.dsh-skill-tags{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px;}',
      '.dsh-skill-tag{display:inline-flex;align-items:center;padding:3px 8px;border:1px solid color-mix(in srgb,var(--resume-accent-color) 26%,#dbe3ef);border-radius:999px;font-size:.92em;line-height:1.35;}',
      '.dsh-timeline{border-left:2px solid color-mix(in srgb,var(--resume-accent-color) 28%,transparent);padding-left:14px;}',
      '.dsh-metric-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}',
      '.dsh-portfolio-card{padding:10px 12px;border:1px solid color-mix(in srgb,var(--resume-accent-color) 20%,#e2e8f0);border-radius:var(--resume-corner-radius);background:color-mix(in srgb,var(--resume-background-color) 92%,#f8fafc);}',
      '.dsh-project-list > ul{padding-left:1.2em;}',
      '.dsh-qr-code{display:flex;justify-content:flex-end;}',
      '.resume-document img{max-width:100%;height:auto;}',
      '.dsh-photo{display:flex;align-items:center;justify-content:center;width:var(--photo-size,88px);height:var(--photo-size,88px);margin:0 0 var(--resume-paragraph-gap) 0;overflow:hidden;background:#f1f5f9;color:var(--resume-muted-color);}',
      '.dsh-photo img{display:block;width:100%;height:100%;object-fit:cover;}',
      '.dsh-photo-circle,.dsh-photo-circle img{border-radius:50%;}',
      '.dsh-photo-rounded,.dsh-photo-rounded img{border-radius:var(--resume-corner-radius,8px);}',
      '.dsh-photo-square,.dsh-photo-square img{border-radius:0;}',
      '.dsh-photo-missing{border:1px dashed color-mix(in srgb,var(--resume-muted-color) 45%,#e2e8f0);font-size:11px;}',
      '.dsh-header-with-image{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;}',
      '.dsh-header-with-image img{width:var(--photo-size,72px);height:var(--photo-size,72px);object-fit:cover;border-radius:var(--resume-corner-radius,8px);}',
      '.dsh-summary{padding:10px 12px;border-left:3px solid color-mix(in srgb,var(--resume-accent-color) 55%,transparent);background:color-mix(in srgb,var(--resume-accent-color) 6%,transparent);}',
      '.dsh-contact{display:flex;flex-wrap:wrap;gap:4px 12px;color:var(--resume-muted-color);}',
      '.dsh-contact p{margin:0 0 var(--resume-paragraph-gap) 0;}',
      '.dsh-skill-groups{display:grid;gap:6px;}',
      '.dsh-skill-group{padding:6px 8px;border:1px solid color-mix(in srgb,var(--resume-accent-color) 18%,#e2e8f0);border-radius:var(--resume-corner-radius,4px);}',
      'h3{font-size:calc(' + fontSize + ' * 1.08) !important;}',
      '.resume-document.template-technical .dsh-resume-page-content{border-left:8px solid var(--resume-accent-color) !important;}',
      '.resume-document.template-technical .header-block{padding-left:14px;border-bottom:0 !important;}',
      '.resume-document.template-editorial .header-block{padding:16px 18px;background:color-mix(in srgb,var(--resume-accent-color) 8%,transparent);border-bottom:0 !important;border-left:3px solid var(--resume-accent-color) !important;}',
      '.resume-document.template-editorial .dsh-resume-section > h2{display:inline-block;padding:4px 10px;border:0 !important;background:color-mix(in srgb,var(--resume-accent-color) 7%,transparent);}',
      '.resume-document.template-terminal .dsh-resume-page-content{background:linear-gradient(90deg,var(--resume-background-color) 0,var(--resume-background-color) 96%,#f1f5f9 96%) !important;}',
      '.resume-document.template-terminal .header-block{border-bottom:2px solid var(--resume-accent-color) !important;}',
      '.resume-document.template-terminal .dsh-resume-section > h2{letter-spacing:.08em;text-transform:uppercase;border-bottom:0 !important;}',
      '.resume-document.renderer-technical-timeline .dsh-renderer-item{position:relative;padding-left:16px;border-left:2px solid color-mix(in srgb,var(--resume-accent-color) 30%,transparent);}',
      '.resume-document.renderer-technical-timeline .dsh-renderer-item::before{content:"";position:absolute;left:-5px;top:8px;width:7px;height:7px;border-radius:50%;background:var(--resume-accent-color);}',
      '.resume-document.renderer-portfolio-grid .dsh-renderer-featured{padding:12px;border:1px solid color-mix(in srgb,var(--resume-accent-color) 22%,#e2e8f0);border-radius:var(--resume-corner-radius);background:color-mix(in srgb,var(--resume-background-color) 94%,#f8fafc);}',
      '.resume-document.renderer-editorial .dsh-renderer-item{padding-left:8px;border-left:3px solid color-mix(in srgb,var(--resume-accent-color) 22%,transparent);}',
      '.resume-document.renderer-academic .dsh-resume-section > h2{font-family:Georgia,"Noto Serif SC",serif;letter-spacing:.02em;border-bottom-style:dashed !important;}',
      '.resume-document.renderer-swiss-grid .header-block{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:end;gap:18px;border-bottom-width:3px !important;padding-bottom:14px;}',
      '.resume-document.renderer-swiss-grid .header-block h1{font-size:36px !important;letter-spacing:-.06em;line-height:1 !important;}',
      '.resume-document.renderer-swiss-grid .dsh-resume-section > h2{font-size:12px !important;text-transform:uppercase;letter-spacing:.12em;border-bottom:0 !important;}',
      '.resume-document.renderer-swiss-grid .dsh-renderer-item{border-top:1px solid color-mix(in srgb,var(--resume-text-color) 18%,transparent);padding-top:8px;}',
      '.resume-document.renderer-midnight-terminal .dsh-resume-page,.resume-document.renderer-midnight-terminal .dsh-resume-page-content{background:#0f172a !important;color:#f8fafc !important;}',
      '.resume-document.renderer-midnight-terminal .dsh-resume-page-content{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace !important;}',
      '.resume-document.renderer-midnight-terminal .header-block{border-bottom:1px solid var(--resume-accent-color) !important;}',
      '.resume-document.renderer-midnight-terminal .dsh-resume-section > h2{color:var(--resume-accent-color) !important;text-transform:uppercase;letter-spacing:.12em;border-bottom:0 !important;}',
      '.resume-document.renderer-midnight-terminal strong{color:#ffffff !important;}',
      '.resume-document.renderer-midnight-terminal .header-block p,.resume-document.renderer-midnight-terminal .meta{color:#cbd5e1 !important;}',
      '.resume-document.renderer-sidebar-signal .dsh-column-side-item{background:#172033;color:#f8fafc;padding:14px;border-radius:var(--resume-corner-radius);}',
      '.resume-document.renderer-sidebar-signal .dsh-column-side-item .dsh-resume-section > h2{color:#fbbf24 !important;border-bottom-color:rgba(251,191,36,.45) !important;}',
      '.resume-document.renderer-sidebar-signal .dsh-column-side-item p,.resume-document.renderer-sidebar-signal .dsh-column-side-item li{color:#e2e8f0 !important;}',
      '.resume-document.renderer-sidebar-signal .dsh-column-side-item strong{color:#ffffff !important;}',
      '.resume-document.renderer-business-timeline .header-block{margin:calc(-1 * var(--resume-page-margin)) calc(-1 * var(--resume-page-margin)) 26px;padding:28px var(--resume-page-margin) 22px;background:#14263d;color:#f8fafc;border-bottom:4px solid var(--resume-accent-color);}',
      '.resume-document.renderer-business-timeline .header-block h1{color:#f2d48d !important;font-size:30px !important;letter-spacing:.01em;}',
      '.resume-document.renderer-business-timeline .header-block p,.resume-document.renderer-business-timeline .header-block .meta{color:#d7e0ea !important;}',
      '.resume-document.renderer-business-timeline .dsh-business-entry{position:relative;margin:0 0 var(--resume-section-gap) 10px;padding-left:26px;border-left:2px solid color-mix(in srgb,var(--resume-accent-color) 62%,#dbe3ec);break-inside:avoid;}',
      '.resume-document.renderer-business-timeline .dsh-business-marker{position:absolute;left:-8px;top:3px;width:12px;height:12px;border:3px solid #ffffff;border-radius:50%;background:var(--resume-accent-color);box-shadow:0 0 0 2px var(--resume-accent-color);}',
      '.resume-document.renderer-business-timeline .dsh-business-entry-content > h2{display:inline-block;margin:0 0 10px;padding:0 0 5px;color:#14263d !important;border-bottom:2px solid var(--resume-accent-color) !important;font-size:calc(' + fontSize + ' * ' + template.typography.headingScale + ') !important;}',
      '.resume-document.renderer-business-timeline .dsh-business-entry-content > h3{font-weight:700;color:#14263d;margin-top:12px;}',
      '.resume-document.renderer-business-timeline .dsh-business-entry-content strong{color:#14263d !important;}',
      '.resume-document.renderer-business-timeline .dsh-business-entry-content a{color:#9a762e !important;}',
      '.resume-document.renderer-business-timeline .dsh-business-entry-content ul{padding-left:1.15em;}',
      '@media print{.dsh-resume-page{background:var(--bg) !important;}}',
    ].join('');
    document.head.append(tuningStyle);
    window.addEventListener('message', (event) => {
      if (event.data?.source !== 'dsh-resume-token-preview') return;
      applyVisualTokens(event.data.tokens || {});
    });
    const source = document.querySelector('.resume-content');
    if (!source) return;
    const root = source.querySelector('.dsh-resume-root');
    const rootChildren = [...root?.children || []];
    const splitLayout = root?.querySelector(':scope > .dsh-layout-split[data-layout-type="split"]');
    const gridLayout = root?.querySelector(':scope > .dsh-layout-grid[data-layout-type="grid"]');
    const stackLayout = root?.querySelector(':scope > .dsh-layout-stack[data-layout-type="stack"]');
    const splitMeta = splitLayout ? {
      headers: rootChildren.filter((node) => node !== splitLayout),
      columns: [...splitLayout.children].map((column) => ({
        id: column.dataset.region || column.className,
        prototype: column.cloneNode(false),
        items: [...column.children],
      })),
    } : null;
    const gridMeta = gridLayout ? {
      headers: rootChildren.filter((node) => node !== gridLayout),
      prototype: gridLayout.cloneNode(false),
      items: [...gridLayout.children],
    } : null;
    const stackMeta = stackLayout ? {
      headers: rootChildren.filter((node) => node !== stackLayout),
      prototype: stackLayout.cloneNode(false),
      items: [...stackLayout.children],
    } : null;
    const host = document.createElement('div');
    host.className = 'dsh-resume-pages';
    source.replaceWith(host);
    const pages = [];
    let paginationOverflow = false;
    const makePage = (kind = 'single', includeHeaders = false, meta = null) => {
      const page = document.createElement('section');
      page.className = 'dsh-resume-page';
      page.setAttribute('aria-label', '简历第 ' + (pages.length + 1) + ' 页');
      const content = document.createElement('div');
      content.className = 'dsh-resume-page-content';
      page.append(content);
      host.append(page);
      const record = { page, content };
      if (kind === 'split' && meta) {
        if (includeHeaders) for (const header of meta.headers) content.append(header.cloneNode(true));
        const layout = splitLayout.cloneNode(false);
        layout.innerHTML = '';
        const columns = new Map();
        for (const column of meta.columns) {
          const clone = column.prototype.cloneNode(false);
          clone.innerHTML = '';
          layout.append(clone);
          columns.set(column.id, clone);
        }
        content.append(layout);
        const contentStyle = getComputedStyle(content);
        const paddingTop = Number.parseFloat(contentStyle.paddingTop) || 0;
        const paddingBottom = Number.parseFloat(contentStyle.paddingBottom) || 0;
        const headerHeight = includeHeaders ? content.querySelector('.header-block')?.getBoundingClientRect().height || 0 : 0;
        const columnHeight = Math.max(1, content.clientHeight - paddingTop - paddingBottom - headerHeight);
        for (const column of columns.values()) {
          column.style.height = columnHeight + 'px';
          column.style.maxHeight = columnHeight + 'px';
          column.style.overflow = 'hidden';
        }
        record.columns = columns;
      } else if ((kind === 'grid' || kind === 'stack') && meta) {
        if (includeHeaders) for (const header of meta.headers) content.append(header.cloneNode(true));
        const layout = meta.prototype.cloneNode(false);
        layout.innerHTML = '';
        content.append(layout);
        record.layout = layout;
      }
      pages.push(record);
      return record;
    };
    if (splitMeta) {
      if (!pages.length) makePage('split', true, splitMeta);
      const ensurePage = (index) => {
        while (pages.length <= index) makePage('split', pages.length === 0, splitMeta);
        return pages[index];
      };
      for (const columnMeta of splitMeta.columns) {
        let pageIndex = 0;
        for (const item of columnMeta.items) {
          let pageRecord = ensurePage(pageIndex);
          let column = pageRecord.columns.get(columnMeta.id);
          column.append(item);
          if (column.scrollHeight > column.clientHeight + 1 && column.children.length > 1) {
            column.removeChild(item);
            pageIndex += 1;
            pageRecord = ensurePage(pageIndex);
            column = pageRecord.columns.get(columnMeta.id);
            column.append(item);
          }
          if (column.scrollHeight > column.clientHeight + 1) paginationOverflow = true;
        }
      }
    } else if (gridMeta || stackMeta) {
      const flowMeta = gridMeta || stackMeta;
      const flowKind = gridMeta ? 'grid' : 'stack';
      let pageIndex = 0;
      const ensurePage = (index) => {
        while (pages.length <= index) makePage(flowKind, pages.length === 0, flowMeta);
        return pages[index];
      };
      if (!pages.length) makePage(flowKind, true, flowMeta);
      for (const item of flowMeta.items) {
        let pageRecord = ensurePage(pageIndex);
        pageRecord.layout.append(item);
        if (pageRecord.content.scrollHeight > pageRecord.content.clientHeight + 1 && pageRecord.layout.children.length > 1) {
          pageRecord.layout.removeChild(item);
          pageIndex += 1;
          pageRecord = ensurePage(pageIndex);
          pageRecord.layout.append(item);
        }
        if (pageRecord.content.scrollHeight > pageRecord.content.clientHeight + 1) paginationOverflow = true;
      }
    } else {
      const items = rootChildren;
      let content = makePage().content;
      for (const item of items) {
        content.append(item);
        if (content.scrollHeight > content.clientHeight + 1 && content.children.length > 1) {
          content.removeChild(item);
          content = makePage().content;
          content.append(item);
        }
        if (content.scrollHeight > content.clientHeight + 1) paginationOverflow = true;
      }
    }
    const fitSheets = () => {
      const availableWidth = Math.max(280, document.documentElement.clientWidth - 24);
      const baseWidth = 794;
      const scale = Math.min(1, availableWidth / baseWidth);
      for (const { page } of pages) {
        page.style.transformOrigin = 'top center';
        page.style.transform = 'scale(' + scale + ')';
        page.style.marginBottom = '-' + Math.round(page.offsetHeight * (1 - scale)) + 'px';
      }
    };
    fitSheets();
    window.addEventListener('resize', fitSheets);
    const overflow = paginationOverflow || pages.some(({ content }) => content.scrollHeight > content.clientHeight + 1);
      const pageMetrics = pages.map(({ content, page }, index) => {
        const contentRect = content.getBoundingClientRect();
        const contentStyle = getComputedStyle(content);
      const paddingTop = Number.parseFloat(contentStyle.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(contentStyle.paddingBottom) || 0;
      const availableHeight = Math.max(1, content.clientHeight - paddingTop - paddingBottom);
        // The preview sheet is scaled down when the iframe is narrower than
        // A4. getBoundingClientRect() then reports scaled pixels, while
        // clientHeight is still in the document's layout pixels. Normalize
        // all rect-based measurements back to the unscaled A4 coordinate
        // system before calculating blank space or occupancy.
        const layoutScale = content.offsetHeight ? Math.max(0.01, content.getBoundingClientRect().height / content.offsetHeight) : 1;
        const measuredNodes = [...content.querySelectorAll('.header-block,.dsh-resume-section,.dsh-business-entry')];
        const fallbackNodes = measuredNodes.length ? measuredNodes : [...content.children].filter((node) => !node.matches('.dsh-layout-stack,.dsh-layout-grid,.dsh-layout-split'));
        const bottoms = fallbackNodes.map((node) => node.getBoundingClientRect().bottom).filter(Number.isFinite);
        const tops = fallbackNodes.map((node) => node.getBoundingClientRect().top).filter(Number.isFinite);
        const usedHeight = bottoms.length
          ? Math.max(0, (Math.max(...bottoms) - contentRect.top) / layoutScale - paddingTop)
          : 0;
        const topWhitespace = tops.length
          ? Math.max(0, (Math.min(...tops) - contentRect.top) / layoutScale - paddingTop)
          : availableHeight;
        const moduleNames = [...content.querySelectorAll('.dsh-resume-section > h2')].map((node) => node.textContent?.trim()).filter(Boolean);
        const moduleDetails = [...content.querySelectorAll('.dsh-resume-section')].map((node) => {
          const heading = node.querySelector(':scope > h2');
          return {
            id: node.dataset.moduleId || '',
            type: node.dataset.moduleType || 'custom-section',
            name: heading?.textContent?.trim() || node.dataset.moduleId || '未命名模块',
            top: Math.max(0, Math.round((node.getBoundingClientRect().top - contentRect.top) / layoutScale - paddingTop)),
            height: Math.max(0, Math.round(node.getBoundingClientRect().height / layoutScale)),
          };
        });
        return {
          page: index + 1,
          usedHeight,
          availableHeight,
          topWhitespace: Math.round(topWhitespace),
          bottomWhitespace: Math.max(0, Math.round(availableHeight - usedHeight)),
          occupancyRatio: Number((Math.min(usedHeight, availableHeight) / availableHeight).toFixed(3)),
          blankRatio: Math.max(0, Number((1 - Math.min(usedHeight, availableHeight) / availableHeight).toFixed(3))),
          modules: moduleNames,
          moduleDetails,
          overflow: content.scrollHeight > content.clientHeight + 1,
          width: page.offsetWidth,
          height: page.offsetHeight,
        };
      });
      const primaryPage = pageMetrics[0];
      // A resume that merely fits is not necessarily ready to submit. Keep a
      // small breathing margin, but reject visibly sparse one-page layouts.
      const targetBlankRatio = { min: 0.04, max: 0.10 };
      const maxAcceptableBlankRatio = targetBlankRatio.max;
      const occupancy = pageMetrics.map((page) => page.occupancyRatio);
      const visualWarnings = [];
      if (primaryPage?.bottomWhitespace > primaryPage.availableHeight * 0.18) visualWarnings.push({ code: 'bottom-whitespace', message: '页面底部留白偏多' });
      if (primaryPage?.topWhitespace > primaryPage.availableHeight * 0.12) visualWarnings.push({ code: 'top-whitespace', message: '页面顶部留白偏多' });
      if (pages.length > 1 && pageMetrics.some((page) => page.moduleDetails.length === 1)) visualWarnings.push({ code: 'isolated-module', message: '存在只有一个模块的页面，建议检查分页' });
      const balanceState = overflow
        ? 'overflow'
        : pages.length > 1
          ? 'multi-page'
          : (primaryPage?.blankRatio || 0) > maxAcceptableBlankRatio
            ? 'sparse'
            : visualWarnings.length
              ? 'needs-review'
              : 'balanced';
      const visualAudit = {
        state: balanceState,
        occupancy,
        warnings: visualWarnings,
        moduleCount: pageMetrics.reduce((count, page) => count + page.moduleDetails.length, 0),
        pageBalance: pages.length === 1 ? Number((1 - Math.abs((primaryPage?.occupancyRatio || 0) - 0.92)).toFixed(3)) : null,
      };
      const sparse = !overflow && pages.length === 1 && (primaryPage?.blankRatio || 0) > maxAcceptableBlankRatio;
    if (!isThumbnail) window.parent?.postMessage({
      source: 'dsh-resume-preview',
      previewRoot: document.querySelector('.resume-document')?.dataset.previewRoot || '',
      previewPath: document.querySelector('.resume-document')?.dataset.previewPath || '',
      renderId: document.querySelector('.resume-document')?.dataset.renderId || '',
      contentHash: document.querySelector('.resume-document')?.dataset.contentHash || '',
      metrics: {
        pageCount: pages.length,
        overflow,
        sparse,
        fit: !overflow && pages.length === 1 && !sparse,
        targetBlankRatio,
        visualAudit,
        pageWidth: 794,
        pageHeight: 1123,
        pages: pageMetrics,
      },
    }, '*');
    document.documentElement.dataset.pageCount = String(pages.length);
    document.documentElement.dataset.pageOverflow = String(overflow);
  })();
  </script>
</body>
</html>
`
}

export async function renderPreviewHtml(root, options = {}) {
  const resumeRel = options.resumePath || 'resume.md'
  const cssRel = options.templateCssPath || 'templates/default.css'
  const outRel = options.outPath || (resumeRel.includes('/')
    ? path.posix.join(path.posix.dirname(resumeRel.replace(/\\/g, '/')), 'preview.html')
    : 'preview.html')

  const resume = resolveUnderJobhunt(root, resumeRel)
  const css = resolveUnderJobhunt(root, cssRel)
  const out = resolveUnderJobhunt(root, outRel)

  const md = typeof options.resumeContent === 'string'
    ? options.resumeContent
    : await fs.readFile(resume.abs, 'utf8')
  const cssText = await fs.readFile(css.abs, 'utf8')
  const templateSpec = assertTemplateSpec(options.templateSpec)
  let layoutSpec
  const layoutRel = resumeRel.replace(/\.md$/i, '.layout.json')
  try {
    layoutSpec = JSON.parse(await fs.readFile(resolveUnderJobhunt(root, layoutRel).abs, 'utf8'))
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  const bodyHtml = assembleResumeSections(rewriteImageSources(markdownToHtml(md), { root }), layoutSpec, templateSpec.layout, templateSpec, { root, resumeRel: resume.rel })
  const titleMatch = /^\s*#\s+(.+)$/m.exec(md)
  const renderId = options.renderId || randomUUID()
  const contentHash = hashRenderInput({
    resumePath: resume.rel,
    source: md,
    templatePath: css.rel,
    css: cssText,
    template: templateSpec,
    bodyHtml,
    previewPath: out.rel,
  })
  const html = buildPreviewDocument({
    title: titleMatch?.[1]?.trim() || 'Resume Preview',
    bodyHtml,
    cssText,
    sourcePath: resume.rel,
    templatePath: css.rel,
    previewPath: out.rel,
    previewRoot: root,
    renderId,
    contentHash,
    templateSpec,
  })

  return {
    root,
    resumePath: resume.rel,
    templateCssPath: css.rel,
    previewPath: out.rel,
    previewAbsolutePath: out.abs,
    renderId,
    contentHash,
    html,
    bytes: Buffer.byteLength(html, 'utf8'),
  }
}

export async function renderPreview(root, options = {}) {
  const rendered = await renderPreviewHtml(root, options)
  const out = resolveUnderJobhunt(root, rendered.previewPath)

  await fs.mkdir(path.dirname(out.abs), { recursive: true })
  const tempPath = `${out.abs}.${rendered.renderId}.tmp`
  await fs.writeFile(tempPath, rendered.html, 'utf8')
  await fs.rename(tempPath, out.abs)

  const { html: _html, ...result } = rendered
  return result
}
