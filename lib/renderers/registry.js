const RENDERER_IDS = Object.freeze([
  'clean-single',
  'split-sidebar',
  'technical-timeline',
  'portfolio-grid',
  'editorial',
  'academic',
  'swiss-grid',
  'midnight-terminal',
  'sidebar-signal',
  'business-timeline',
])

const RENDERER_BY_VARIANT = Object.freeze({
  technical: 'technical-timeline',
  editorial: 'editorial',
  terminal: 'midnight-terminal',
  standard: 'clean-single',
})

function itemClass(item) {
  const type = String(item?.type || 'custom-section').replace(/[^a-z0-9-]/gi, '-')
  return `dsh-renderer-item dsh-renderer-item-${type}`
}

function renderItem(item, extraClass = '') {
  return `<div class="${itemClass(item)}${extraClass ? ` ${extraClass}` : ''}">${item.html}</div>`
}

function renderSingle({ renderer, header, ordered }) {
  return `<div class="dsh-resume-root dsh-renderer-${renderer}">${[header, ...ordered.map((item) => renderItem(item))].filter(Boolean).join('\n')}</div>`
}

function renderSplitSidebar({ renderer, header, ordered, layout }) {
  const sideIds = new Set((layout?.regions?.side || []).map(String))
  const fallbackSideTypes = new Set(['skills', 'links', 'awards', 'skill-tags'])
  const side = ordered.filter((item) => sideIds.has(item.sourceId) || (!sideIds.size && fallbackSideTypes.has(item.type)))
  const sideSet = new Set(side.map((item) => item.id))
  const main = ordered.filter((item) => !sideSet.has(item.id))
  return `<div class="dsh-resume-root dsh-renderer-${renderer}">${header}<div class="dsh-resume-columns"><div class="dsh-resume-column dsh-resume-column-main">${main.map((item) => renderItem(item)).join('\n')}</div><aside class="dsh-resume-column dsh-resume-column-side">${side.map((item) => renderItem(item)).join('\n')}</aside></div></div>`
}

function renderTechnicalTimeline({ renderer, header, ordered }) {
  return `<div class="dsh-resume-root dsh-renderer-${renderer}">${[header, ...ordered.map((item) => renderItem(item))].filter(Boolean).join('\n')}</div>`
}

function renderPortfolioGrid({ renderer, header, ordered }) {
  return `<div class="dsh-resume-root dsh-renderer-${renderer}">${[header, ...ordered.map((item) => renderItem(item, item.sourceId === 'projects' ? 'dsh-renderer-featured' : ''))].filter(Boolean).join('\n')}</div>`
}

function renderEditorial({ renderer, header, ordered }) {
  return `<div class="dsh-resume-root dsh-renderer-${renderer}">${[header, ...ordered.map((item) => renderItem(item))].filter(Boolean).join('\n')}</div>`
}

function renderAcademic({ renderer, header, ordered }) {
  return `<div class="dsh-resume-root dsh-renderer-${renderer}">${[header, ...ordered.map((item) => renderItem(item))].filter(Boolean).join('\n')}</div>`
}

function renderSwissGrid({ renderer, header, ordered }) {
  return `<div class="dsh-resume-root dsh-renderer-${renderer}">${[header, ...ordered.map((item) => renderItem(item))].filter(Boolean).join('\n')}</div>`
}

function renderMidnightTerminal({ renderer, header, ordered }) {
  return `<div class="dsh-resume-root dsh-renderer-${renderer}">${[header, ...ordered.map((item) => renderItem(item))].filter(Boolean).join('\n')}</div>`
}

function renderSidebarSignal({ renderer, header, ordered, layout }) {
  return renderSplitSidebar({ renderer, header, ordered, layout })
}

function renderBusinessTimeline({ renderer, header, ordered }) {
  const entries = ordered.map((item) => `
    <article class="dsh-business-entry ${itemClass(item)}">
      <span class="dsh-business-marker" aria-hidden="true"></span>
      <div class="dsh-business-entry-content">${item.html}</div>
    </article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-business-timeline">${header}${entries}</div>`
}

const RENDERERS = new Map([
  ['clean-single', renderSingle],
  ['split-sidebar', renderSplitSidebar],
  ['technical-timeline', renderTechnicalTimeline],
  ['portfolio-grid', renderPortfolioGrid],
  ['editorial', renderEditorial],
  ['academic', renderAcademic],
  ['swiss-grid', renderSwissGrid],
  ['midnight-terminal', renderMidnightTerminal],
  ['sidebar-signal', renderSidebarSignal],
  ['business-timeline', renderBusinessTimeline],
])

export function resolveRendererId(template = {}, layout = {}) {
  if (RENDERERS.has(template.renderer)) return template.renderer
  if (layout.mode === 'two-column') return 'split-sidebar'
  return RENDERER_BY_VARIANT[template.visual?.variant] || 'clean-single'
}

export function listRendererIds() {
  return [...RENDERER_IDS]
}

export function renderTemplateLayout({ template = {}, layout = {}, header = '', ordered = [] }) {
  const renderer = resolveRendererId(template, layout)
  const render = RENDERERS.get(renderer) || renderSingle
  return render({ renderer, template, layout, header, ordered })
}
