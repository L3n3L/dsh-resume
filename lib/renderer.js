import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveUnderJobhunt } from './workspace.js'
import { assertTemplateSpec } from './template-schema.js'

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

/** Wrap consecutive h2 sections into .resume-module blocks. */
export function moduleCombine(html) {
  const wrapped = `<div class="resume-root">${html}</div>`
  // Structural combine without DOM: split by h2 boundaries.
  const parts = html.split(/(?=<h2>)/g).filter(Boolean)
  if (parts.length <= 1) return `<div class="resume-root">${html}</div>`

  const rebuilt = []
  let headerDone = false
  for (const part of parts) {
    if (part.startsWith('<h2>')) {
      rebuilt.push(`<section class="resume-module">${part}</section>`)
      headerDone = true
    } else if (!headerDone) {
      rebuilt.push(`<header class="header-block">${part}</header>`)
      headerDone = true
    } else {
      rebuilt.push(part)
    }
  }
  return `<div class="resume-root">${rebuilt.join('\n')}</div>`
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
  <main class="resume-document" data-source="${escapeHtml(sourcePath)}" data-template="${escapeHtml(templatePath)}" data-template-id="${escapeHtml(normalizedTemplate.id)}">
    <div class="resume-content">
${bodyHtml}
    </div>
    <div class="resume-fit-indicator" role="status" aria-live="polite">正在计算页数…</div>
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
    rootStyle.setProperty('--resume-accent-color', template.visual.accentColor);
    rootStyle.setProperty('--resume-text-color', template.visual.textColor);
    rootStyle.setProperty('--resume-muted-color', template.visual.mutedColor);
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
      'body{font-family:' + templateFont + ';line-height:' + lineHeight + ' !important;color:' + template.visual.textColor + ' !important;}',
      '.resume-sheet-content{padding:' + pageMargin + ' !important;}',
      '.resume-module{margin-bottom:' + sectionGap + ' !important;}',
      'p,li{font-size:' + fontSize + ' !important;margin-bottom:' + template.spacing.paragraphGap + 'px;}',
      '.header-block{border-bottom-color:' + template.visual.accentColor + ' !important;border-radius:' + template.visual.cornerRadius + 'px;}',
      '.header-block p,.meta{color:' + template.visual.mutedColor + ' !important;}',
      '.resume-module > h2{color:' + template.visual.accentColor + ' !important;font-size:calc(' + fontSize + ' * ' + template.typography.headingScale + ') !important;border-bottom-color:' + template.visual.accentColor + ' !important;border-bottom-style:' + template.visual.divider + ' !important;}',
      'h3{font-size:calc(' + fontSize + ' * 1.08) !important;}',
    ].join('');
    document.head.append(tuningStyle);
    const source = document.querySelector('.resume-content');
    if (!source) return;
    const items = [...source.querySelector('.resume-root')?.children || []];
    const host = document.createElement('div');
    host.className = 'resume-pages';
    source.replaceWith(host);
    const pages = [];
    const makePage = () => {
      const page = document.createElement('section');
      page.className = 'resume-sheet';
      page.setAttribute('aria-label', '简历第 ' + (pages.length + 1) + ' 页');
      const content = document.createElement('div');
      content.className = 'resume-sheet-content';
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
      const moduleNames = [...content.querySelectorAll('.resume-module > h2')].map((node) => node.textContent?.trim()).filter(Boolean);
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
    const maxAcceptableBlankRatio = 0.12;
    const sparse = !overflow && pages.length === 1 && (primaryPage?.blankRatio || 0) > maxAcceptableBlankRatio;
    window.parent?.postMessage({
      source: 'dsh-resume-preview',
      metrics: {
        pageCount: pages.length,
        overflow,
        sparse,
        fit: !overflow && pages.length === 1 && !sparse,
        pageWidth: 794,
        pageHeight: 1123,
        pages: pageMetrics,
      },
    }, '*');
    const indicator = document.querySelector('.resume-fit-indicator');
    if (indicator) {
      indicator.textContent = overflow
        ? '内容超出页面：' + pages.length + ' 页，建议精简或调整模板间距'
        : sparse
          ? '一页但留白偏多：约 ' + Math.round(primaryPage.blankRatio * 100) + '% 空白'
          : pages.length === 1
            ? '一页通过：版面密度合适'
            : '排版完成：' + pages.length + ' 页';
      indicator.dataset.state = overflow ? 'overflow' : (sparse ? 'sparse' : (pages.length === 1 ? 'fit' : 'multi'));
    }
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

  const md = await fs.readFile(resume.abs, 'utf8')
  const cssText = await fs.readFile(css.abs, 'utf8')
  const bodyHtml = moduleCombine(markdownToHtml(md))
  const titleMatch = /^\s*#\s+(.+)$/m.exec(md)
  const html = buildPreviewDocument({
    title: titleMatch?.[1]?.trim() || 'Resume Preview',
    bodyHtml,
    cssText,
    sourcePath: resume.rel,
    templatePath: css.rel,
    templateSpec: options.templateSpec,
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
