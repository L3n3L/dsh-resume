import fs from 'node:fs/promises'
import path from 'node:path'
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

function inlineFormat(text) {
  let out = escapeHtml(text)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  return out
}

function flushParagraph(buf, out) {
  if (!buf.length) return
  out.push(`<p>${inlineFormat(buf.join(' ').trim())}</p>`)
  buf.length = 0
}

function flushList(list, out) {
  if (!list.length) return
  out.push('<ul>')
  for (const item of list) out.push(`<li>${inlineFormat(item)}</li>`)
  out.push('</ul>')
  list.length = 0
}

/** Lightweight Markdown → HTML. Independent of CodeCV. */
export function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  const para = []
  const list = []

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph(para, out)
      flushList(list, out)
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading) {
      flushParagraph(para, out)
      flushList(list, out)
      const level = heading[1].length
      out.push(`<h${level}>${inlineFormat(heading[2].trim())}</h${level}>`)
      continue
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed)
    if (bullet) {
      flushParagraph(para, out)
      list.push(bullet[1].trim())
      continue
    }

    flushList(list, out)
    para.push(trimmed)
  }

  flushParagraph(para, out)
  flushList(list, out)
  return out.join('\n')
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

function renderModuleBody(type, html, options = {}) {
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

export function assembleResumeSections(html, layoutSpec, templateLayout = null, templateSpec = {}) {
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
      const sectionBody = renderModuleBody(block.type, part, block.options)
      const classes = [moduleClass(block.type), presetClass(block.options)].filter(Boolean).join(' ')
      const family = block.options?.family ? ` data-theme-family="${escapeHtml(String(block.options.family))}"` : ''
      const section = `<section class="dsh-resume-section ${classes}" data-module-id="${escapeHtml(block.id)}" data-module-type="${escapeHtml(block.type)}"${family}>${sectionBody}</section>`
      sectionParts.push({ id, sourceId: block.id, type: block.type, html: section })
      headerDone = true
    } else if (!headerDone) {
      sectionParts.header = `<header class="header-block">${part}</header>`
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
  const header = sectionParts.header || ''
  const resolvedTemplate = { ...templateSpec, layout: templateLayout || templateSpec.layout || {} }
  const renderer = effectiveMode === 'two-column' && !templateSpec.renderer
    ? 'split-sidebar'
    : resolveRendererId(resolvedTemplate, { ...templateLayout, ...layout })
  return renderTemplateLayout({ template: { ...resolvedTemplate, renderer }, layout: { ...layout, regions: regionValues }, header, ordered })
}

export function buildPreviewDocument({ title, bodyHtml, cssText, sourcePath, templatePath, previewPath, templateSpec }) {
  const normalizedTemplate = assertTemplateSpec(templateSpec)
  const serializedTemplate = JSON.stringify(normalizedTemplate).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title || 'Resume Preview')}</title>
  <style>
${cssText}
  </style>
</head>
<body>
  <main class="resume-document template-${escapeHtml(normalizedTemplate.visual.variant)} renderer-${escapeHtml(normalizedTemplate.renderer)}" data-source="${escapeHtml(sourcePath)}" data-template="${escapeHtml(templatePath)}" data-preview-path="${escapeHtml(previewPath || '')}" data-template-id="${escapeHtml(normalizedTemplate.id)}" data-template-family="${escapeHtml(normalizedTemplate.family)}">
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
      '.dsh-skill-tags{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px;}',
      '.dsh-skill-tag{display:inline-flex;align-items:center;padding:3px 8px;border:1px solid color-mix(in srgb,var(--resume-accent-color) 26%,#dbe3ef);border-radius:999px;font-size:.92em;line-height:1.35;}',
      '.dsh-timeline{border-left:2px solid color-mix(in srgb,var(--resume-accent-color) 28%,transparent);padding-left:14px;}',
      '.dsh-metric-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}',
      '.dsh-portfolio-card{padding:10px 12px;border:1px solid color-mix(in srgb,var(--resume-accent-color) 20%,#e2e8f0);border-radius:var(--resume-corner-radius);background:color-mix(in srgb,var(--resume-background-color) 92%,#f8fafc);}',
      '.dsh-project-list > ul{padding-left:1.2em;}',
      '.dsh-qr-code{display:flex;justify-content:flex-end;}',
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
      '.resume-document.renderer-sidebar-signal .dsh-resume-column-side{background:#172033;color:#f8fafc;padding:14px;border-radius:var(--resume-corner-radius);}',
      '.resume-document.renderer-sidebar-signal .dsh-resume-column-side .dsh-resume-section > h2{color:#fbbf24 !important;border-bottom-color:rgba(251,191,36,.45) !important;}',
      '.resume-document.renderer-sidebar-signal .dsh-resume-column-side p,.resume-document.renderer-sidebar-signal .dsh-resume-column-side li{color:#e2e8f0 !important;}',
      '.resume-document.renderer-sidebar-signal .dsh-resume-column-side strong{color:#ffffff !important;}',
      '.resume-document.renderer-business-timeline .header-block{margin:calc(-1 * var(--resume-page-margin)) calc(-1 * var(--resume-page-margin)) 26px;padding:28px var(--resume-page-margin) 22px;background:#14263d;color:#f8fafc;border-bottom:4px solid var(--resume-accent-color);}',
      '.resume-document.renderer-business-timeline .header-block h1{color:#f2d48d !important;font-size:30px !important;letter-spacing:.01em;}',
      '.resume-document.renderer-business-timeline .header-block p,.resume-document.renderer-business-timeline .header-block .meta{color:#d7e0ea !important;}',
      '.resume-document.renderer-business-timeline .dsh-business-timeline{position:relative;margin:0 0 0 10px;padding-left:26px;}',
      '.resume-document.renderer-business-timeline .dsh-business-timeline::before{content:"";position:absolute;left:3px;top:8px;bottom:10px;width:2px;background:color-mix(in srgb,var(--resume-accent-color) 62%,#dbe3ec);}',
      '.resume-document.renderer-business-timeline .dsh-business-entry{position:relative;margin:0 0 var(--resume-section-gap);break-inside:avoid;}',
      '.resume-document.renderer-business-timeline .dsh-business-marker{position:absolute;left:-29px;top:3px;width:12px;height:12px;border:3px solid #ffffff;border-radius:50%;background:var(--resume-accent-color);box-shadow:0 0 0 2px var(--resume-accent-color);}',
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
    const items = [...source.querySelector('.dsh-resume-root')?.children || []];
    const host = document.createElement('div');
    host.className = 'dsh-resume-pages';
    source.replaceWith(host);
    const pages = [];
    const makePage = () => {
      const page = document.createElement('section');
      page.className = 'dsh-resume-page';
      page.setAttribute('aria-label', '简历第 ' + (pages.length + 1) + ' 页');
      const content = document.createElement('div');
      content.className = 'dsh-resume-page-content';
      page.append(content);
      host.append(page);
      pages.push({ page, content });
      return content;
    };
    let content = makePage();
    for (const item of items) {
      content.append(item);
      if (content.scrollHeight > content.clientHeight + 1 && content.children.length > 1) {
        content.removeChild(item);
        content = makePage();
        content.append(item);
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
    const overflow = pages.some(({ content }) => content.scrollHeight > content.clientHeight + 1);
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
        const lastChild = content.lastElementChild;
        const firstChild = content.firstElementChild;
        const usedHeight = lastChild
          ? Math.max(0, (lastChild.getBoundingClientRect().bottom - contentRect.top) / layoutScale - paddingTop)
          : 0;
        const topWhitespace = firstChild
          ? Math.max(0, (firstChild.getBoundingClientRect().top - contentRect.top) / layoutScale - paddingTop)
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
      previewPath: document.querySelector('.resume-document')?.dataset.previewPath || '',
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
  const bodyHtml = assembleResumeSections(markdownToHtml(md), layoutSpec, templateSpec.layout, templateSpec)
  const titleMatch = /^\s*#\s+(.+)$/m.exec(md)
  const html = buildPreviewDocument({
    title: titleMatch?.[1]?.trim() || 'Resume Preview',
    bodyHtml,
    cssText,
    sourcePath: resume.rel,
    templatePath: css.rel,
    previewPath: out.rel,
    templateSpec,
  })

  return {
    root,
    resumePath: resume.rel,
    templateCssPath: css.rel,
    previewPath: out.rel,
    previewAbsolutePath: out.abs,
    html,
    bytes: Buffer.byteLength(html, 'utf8'),
  }
}

export async function renderPreview(root, options = {}) {
  const rendered = await renderPreviewHtml(root, options)
  const out = resolveUnderJobhunt(root, rendered.previewPath)

  await fs.mkdir(path.dirname(out.abs), { recursive: true })
  await fs.writeFile(out.abs, rendered.html, 'utf8')

  const { html: _html, ...result } = rendered
  return result
}
