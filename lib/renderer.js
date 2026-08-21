import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveUnderJobhunt } from './workspace.js'

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

export function buildPreviewDocument({ title, bodyHtml, cssText, sourcePath, templatePath }) {
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
  <main class="resume-document" data-source="${escapeHtml(sourcePath)}" data-template="${escapeHtml(templatePath)}">
    <div class="resume-content">
${bodyHtml}
    </div>
    <div class="resume-fit-indicator" role="status" aria-live="polite">正在计算页数…</div>
  </main>
  <script>
  (() => {
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
    const indicator = document.querySelector('.resume-fit-indicator');
    if (indicator) {
      indicator.textContent = overflow
        ? '内容超出页面：' + pages.length + ' 页，建议精简或调整模板间距'
        : '排版完成：' + pages.length + ' 页';
      indicator.dataset.state = overflow ? 'overflow' : (pages.length === 1 ? 'fit' : 'multi');
    }
    document.documentElement.dataset.pageCount = String(pages.length);
    document.documentElement.dataset.pageOverflow = String(overflow);
  })();
  </script>
</body>
</html>
`
}

export async function renderPreview(root, options = {}) {
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
  })

  await fs.mkdir(path.dirname(out.abs), { recursive: true })
  await fs.writeFile(out.abs, html, 'utf8')

  return {
    root,
    resumePath: resume.rel,
    templateCssPath: css.rel,
    previewPath: out.rel,
    previewAbsolutePath: out.abs,
    bytes: Buffer.byteLength(html, 'utf8'),
  }
}
