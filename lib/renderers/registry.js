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

function renderSingle({ renderer, header, ordered, layout }) {
  const items = ordered.map((item) => renderItem(item)).join('\n')
  if (layout?.ir?.type === 'stack') return `<div class="dsh-resume-root dsh-renderer-${renderer}">${header}<div class="dsh-layout-stack" data-layout-type="stack">${items}</div></div>`
  return `<div class="dsh-resume-root dsh-renderer-${renderer}">${[header, items].filter(Boolean).join('\n')}</div>`
}

function renderSplitSidebar({ renderer, header, ordered, layout }) {
  const split = layout?.ir?.type === 'split' ? layout.ir : null
  const splitColumns = split?.columns || []
  const mainColumn = splitColumns.find((column) => column.id === 'main') || splitColumns[0]
  const sideColumn = splitColumns.find((column) => column.id === 'side') || splitColumns[1]
  const sideIds = new Set((sideColumn?.items || layout?.regions?.side || []).map(String))
  const fallbackSideTypes = new Set(['skills', 'links', 'awards', 'skill-tags'])
  const side = ordered.filter((item) => sideIds.has(item.sourceId) || (!sideIds.size && fallbackSideTypes.has(item.type)))
  const sideSet = new Set(side.map((item) => item.id))
  const main = ordered.filter((item) => !sideSet.has(item.id)).map((item) => renderItem(item, 'dsh-column-main-item')).join('\n')
  const sideHtml = side.map((item) => renderItem(item, 'dsh-column-side-item')).join('\n')
  const gap = Number.isFinite(split?.gap) ? split.gap : Number(layout?.columnGap) || 24
  return `<div class="dsh-resume-root dsh-renderer-${renderer}" data-layout-ir="split">${header}<div class="dsh-layout-split" data-layout-type="split" style="--layout-gap:${gap}px"><div class="dsh-layout-column dsh-layout-column-main" data-region="main">${main}</div><aside class="dsh-layout-column dsh-layout-column-side" data-region="side">${sideHtml}</aside></div></div>`
}

function renderTechnicalTimeline({ renderer, header, ordered }) {
  return `<div class="dsh-resume-root dsh-renderer-${renderer}">${[header, ...ordered.map((item) => renderItem(item))].filter(Boolean).join('\n')}</div>`
}

function renderPortfolioGrid({ renderer, header, ordered, layout }) {
  const grid = layout?.ir?.type === 'grid' ? layout.ir : null
  const columns = Number.isInteger(grid?.columns) ? grid.columns : 2
  const gap = Number.isFinite(grid?.gap) ? grid.gap : Number(layout?.columnGap) || 20
  const items = ordered.map((item) => renderItem(item, item.sourceId === 'projects' ? 'dsh-renderer-featured' : '')).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer}" data-layout-ir="grid">${header}<div class="dsh-layout-grid" data-layout-type="grid" style="--layout-grid-columns:${columns};--layout-gap:${gap}px">${items}</div></div>`
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
  // Layout IR is the structural contract.  A template renderer may provide
  // the visual language, but it must not silently flatten an explicit split
  // or grid composition into a single column.
  if (layout?.ir?.type === 'split') return 'split-sidebar'
  if (layout?.ir?.type === 'grid') return 'portfolio-grid'
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
