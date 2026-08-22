import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveUnderJobhunt } from './workspace.js'
import { assertTemplateSpec } from './template-schema.js'
import { assertLayoutSpec } from './layout-schema.js'

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

export function assembleResumeSections(html, layoutSpec) {
  const templateLayout = arguments[2] || null
  // Structural combine without DOM: split by h2 boundaries.
  const parts = html.split(/(?=<h2>)/g).filter(Boolean)
  if (parts.length <= 1) return `<div class="dsh-resume-root">${html}</div>`

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
      const block = byHeading.get(heading) || byId.get(heading) || {
        id: inferred?.[1] || `section-${index + 1}`,
        type: inferred?.[1] || 'custom-section',
        source: heading,
      }
      const id = sectionParts.some((item) => item.id === block.id) ? `${block.id}-${index + 1}` : block.id
      const section = `<section class="dsh-resume-section ${moduleClass(block.type)}" data-module-id="${escapeHtml(block.id)}" data-module-type="${escapeHtml(block.type)}">${part}</section>`
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
  if (effectiveMode !== 'two-column') return `<div class="dsh-resume-root">${[header, ...ordered.map((item) => item.html)].filter(Boolean).join('\n')}</div>`

  const sideIds = new Set((regionValues.side || []).map(String))
  const fallbackSideTypes = new Set(['skills', 'links', 'awards', 'skill-tags'])
  const side = ordered.filter((item) => sideIds.has(item.sourceId) || (!sideIds.size && fallbackSideTypes.has(item.type)))
  const sideSet = new Set(side.map((item) => item.id))
  const main = ordered.filter((item) => !sideSet.has(item.id))
  return `<div class="dsh-resume-root">${header}<div class="dsh-resume-columns"><div class="dsh-resume-column dsh-resume-column-main">${main.map((item) => item.html).join('\n')}</div><aside class="dsh-resume-column dsh-resume-column-side">${side.map((item) => item.html).join('\n')}</aside></div></div>`
}

export function buildPreviewDocument({ title, bodyHtml, cssText, sourcePath, templatePath, templateSpec }) {
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
  <main class="resume-document template-${escapeHtml(normalizedTemplate.visual.variant)}" data-source="${escapeHtml(sourcePath)}" data-template="${escapeHtml(templatePath)}" data-template-id="${escapeHtml(normalizedTemplate.id)}">
    <div class="resume-content">
${bodyHtml}
    </div>
  </main>
  <script>
  (() => {
    const query = new URLSearchParams(window.location.search);
    const rootStyle = document.documentElement.style;
    const template = ${serializedTemplate};
    const fontFamilies = {
      'system-sans': '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      'modern-sans': 'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      serif: 'Georgia, "Songti SC", "SimSun", serif',
    };
    const templateFont = fontFamilies[template.typography.fontFamily] || fontFamilies['system-sans'];
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
    rootStyle.setProperty('--resume-accent-color', template.visual.accentColor);
    rootStyle.setProperty('--resume-text-color', template.visual.textColor);
    rootStyle.setProperty('--resume-muted-color', template.visual.mutedColor);
    rootStyle.setProperty('--resume-background-color', template.visual.backgroundColor);
    rootStyle.setProperty('--bg', template.visual.backgroundColor);
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
      'body{font-family:' + templateFont + ';line-height:' + lineHeight + ' !important;color:' + template.visual.textColor + ' !important;}',
      '.dsh-resume-page-content{padding:' + pageMargin + ' !important;}',
      '.dsh-resume-page{background:var(--bg) !important;border-radius:' + template.visual.cornerRadius + 'px;}',
      '.dsh-resume-page-content{background-color:var(--bg) !important;border-radius:' + template.visual.cornerRadius + 'px;}',
      '.dsh-resume-section{margin-bottom:' + sectionGap + ' !important;}',
      '.dsh-resume-section{border-radius:' + template.visual.cornerRadius + 'px;}',
      'p,li{font-size:' + fontSize + ' !important;margin-bottom:' + template.spacing.paragraphGap + 'px;}',
      '.header-block{border-bottom-color:' + template.visual.accentColor + ' !important;border-radius:' + template.visual.cornerRadius + 'px;}',
      '.header-block p,.meta{color:' + template.visual.mutedColor + ' !important;}',
      '.dsh-resume-section > h2{color:' + template.visual.accentColor + ' !important;font-size:calc(' + fontSize + ' * ' + template.typography.headingScale + ') !important;border-bottom-color:' + template.visual.accentColor + ' !important;border-bottom-style:' + template.visual.divider + ' !important;}',
      '.dsh-resume-columns{grid-template-columns:minmax(0,' + Math.max(0.55, 1 - template.layout.sidebarRatio) + 'fr) minmax(0,' + template.layout.sidebarRatio + 'fr) !important;gap:' + template.layout.columnGap + 'px !important;}',
      'h3{font-size:calc(' + fontSize + ' * 1.08) !important;}',
      '.resume-document.template-technical .dsh-resume-page-content{border-left:8px solid ' + template.visual.accentColor + ' !important;}',
      '.resume-document.template-technical .header-block{padding-left:14px;border-bottom:0 !important;}',
      '.resume-document.template-editorial .header-block{padding:16px 18px;background:linear-gradient(135deg,' + template.visual.accentColor + '16,transparent 72%);border-bottom:0 !important;border-left:3px solid ' + template.visual.accentColor + ' !important;}',
      '.resume-document.template-editorial .dsh-resume-section > h2{display:inline-block;padding:4px 10px;border:0 !important;background:' + template.visual.accentColor + '12;}',
      '.resume-document.template-terminal .dsh-resume-page-content{background:linear-gradient(90deg,' + template.visual.backgroundColor + ' 0,' + template.visual.backgroundColor + ' 96%,#f1f5f9 96%) !important;}',
      '.resume-document.template-terminal .header-block{border-bottom:2px solid ' + template.visual.accentColor + ' !important;}',
      '.resume-document.template-terminal .dsh-resume-section > h2{letter-spacing:.08em;text-transform:uppercase;border-bottom:0 !important;}',
      '@media print{.dsh-resume-page{background:var(--bg) !important;}}',
    ].join('');
    document.head.append(tuningStyle);
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
      const lastChild = content.lastElementChild;
      const usedHeight = lastChild
        ? Math.max(0, lastChild.getBoundingClientRect().bottom - contentRect.top - paddingTop)
        : 0;
      const moduleNames = [...content.querySelectorAll('.dsh-resume-section > h2')].map((node) => node.textContent?.trim()).filter(Boolean);
      return {
        page: index + 1,
        usedHeight,
        availableHeight,
        blankRatio: Math.max(0, Number((1 - Math.min(usedHeight, availableHeight) / availableHeight).toFixed(3))),
        modules: moduleNames,
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
    const sparse = !overflow && pages.length === 1 && (primaryPage?.blankRatio || 0) > maxAcceptableBlankRatio;
    window.parent?.postMessage({
      source: 'dsh-resume-preview',
      metrics: {
        pageCount: pages.length,
        overflow,
        sparse,
        fit: !overflow && pages.length === 1 && !sparse,
        targetBlankRatio,
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
  const bodyHtml = assembleResumeSections(markdownToHtml(md), layoutSpec, templateSpec.layout)
  const titleMatch = /^\s*#\s+(.+)$/m.exec(md)
  const html = buildPreviewDocument({
    title: titleMatch?.[1]?.trim() || 'Resume Preview',
    bodyHtml,
    cssText,
    sourcePath: resume.rel,
    templatePath: css.rel,
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
