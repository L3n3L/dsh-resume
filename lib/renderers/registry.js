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
  'portrait-profile',
  'magazine-feature',
  'metrics-board',
  'color-block',
  'chronicle-rail',
  'minimal-typographic',
  'geek-lab',
  'heading-stack',
  'case-study',
  'social-profile',
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

function renderSplitSidebar({ renderer, header, ordered, layout, rootClass = '' }) {
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
  return `<div class="dsh-resume-root dsh-renderer-${renderer}${rootClass ? ` ${rootClass}` : ''}" data-layout-ir="split">${header}<div class="dsh-layout-split" data-layout-type="split" style="--layout-gap:${gap}px"><div class="dsh-layout-column dsh-layout-column-main" data-region="main">${main}</div><aside class="dsh-layout-column dsh-layout-column-side" data-region="side">${sideHtml}</aside></div></div>`
}

function renderTechnicalTimeline({ renderer, header, ordered }) {
  const nodes = ordered.map((item, index) => `<article class="dsh-technical-node" data-node-index="${index + 1}"><span class="dsh-technical-index">${String(index + 1).padStart(2, '0')}</span>${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-technical-rail">${header}<div class="dsh-layout-stack dsh-technical-track" data-layout-type="stack">${nodes}</div></div>`
}

function renderPortfolioGrid({ renderer, header, ordered, layout }) {
  const grid = layout?.ir?.type === 'grid' ? layout.ir : null
  const columns = Number.isInteger(grid?.columns) ? grid.columns : 2
  const gap = Number.isFinite(grid?.gap) ? grid.gap : Number(layout?.columnGap) || 20
  const items = ordered.map((item) => renderItem(item, item.sourceId === 'projects' ? 'dsh-renderer-featured' : '')).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer}" data-layout-ir="grid">${header}<div class="dsh-layout-grid" data-layout-type="grid" style="--layout-grid-columns:${columns};--layout-gap:${gap}px">${items}</div></div>`
}

function renderEditorial({ renderer, header, ordered }) {
  const blocks = ordered.map((item, index) => `<article class="dsh-editorial-block" data-editorial-index="${index + 1}">${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-editorial-spread">${header}<div class="dsh-layout-stack dsh-editorial-flow" data-layout-type="stack">${blocks}</div></div>`
}

function renderAcademic({ renderer, header, ordered }) {
  const entries = ordered.map((item, index) => `<article class="dsh-academic-entry"><span class="dsh-academic-number">${String(index + 1).padStart(2, '0')}</span>${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-academic-dossier">${header}<div class="dsh-layout-stack dsh-academic-entries" data-layout-type="stack">${entries}</div></div>`
}

function renderSwissGrid({ renderer, header, ordered }) {
  const modules = ordered.map((item, index) => `<article class="dsh-swiss-module" data-module-order="${index + 1}">${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-swiss-modular">${header}<div class="dsh-layout-stack dsh-swiss-module-grid" data-layout-type="stack">${modules}</div></div>`
}

function renderMidnightTerminal({ renderer, header, ordered }) {
  const items = ordered.map((item) => `<section class="dsh-terminal-block"><div class="dsh-terminal-label">./${String(item.sourceId || item.type || 'section')}</div>${renderItem(item)}</section>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-terminal-console"><div class="dsh-terminal-status"><span class="dsh-terminal-dot"></span> resume://preview <span class="dsh-terminal-ok">READY</span></div>${header}<div class="dsh-layout-stack dsh-terminal-body" data-layout-type="stack">${items}</div></div>`
}

function renderSidebarSignal({ renderer, header, ordered, layout }) {
  return renderSplitSidebar({ renderer, header, ordered, layout, rootClass: 'dsh-sidebar-signal' })
}

function renderBusinessTimeline({ renderer, header, ordered }) {
  const entries = ordered.map((item) => `
    <article class="dsh-business-entry ${itemClass(item)}">
      <span class="dsh-business-marker" aria-hidden="true"></span>
      <div class="dsh-business-entry-content">${item.html}</div>
    </article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-business-timeline">${header}${entries}</div>`
}

function renderPortraitProfile({ renderer, header, ordered }) {
  const photo = ordered.find((item) => item.type === 'photo')
  const items = ordered.filter((item) => item !== photo).map((item) => renderItem(item)).join('\n')
  const portrait = photo?.html || '<div class="dsh-portrait-placeholder" aria-label="头像占位">CV</div>'
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-portrait-profile"><div class="dsh-portrait-head"><div class="dsh-portrait-frame">${portrait}</div><div class="dsh-portrait-copy">${header}</div></div><div class="dsh-portrait-body dsh-layout-stack" data-layout-type="stack">${items}</div></div>`
}

function renderMagazineFeature({ renderer, header, ordered }) {
  const [lead, ...rest] = ordered
  const secondary = rest.map((item, index) => `<article class="dsh-magazine-entry" data-magazine-index="${index + 2}">${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-magazine-feature"><div class="dsh-magazine-kicker">CURRICULUM / PORTFOLIO / 2026</div>${header}<div class="dsh-magazine-layout dsh-layout-stack" data-layout-type="stack"><article class="dsh-magazine-lead">${lead ? renderItem(lead) : ''}</article><div class="dsh-magazine-secondary">${secondary}</div></div></div>`
}

function renderMetricsBoard({ renderer, header, ordered }) {
  const cards = ordered.map((item, index) => `<article class="dsh-metrics-card" data-metric-index="${String(index + 1).padStart(2, '0')}"><span class="dsh-metrics-card-index">${String(index + 1).padStart(2, '0')}</span>${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-metrics-board"><div class="dsh-metrics-topline"><span>SELECTED SIGNALS</span><span>01—06</span></div>${header}<div class="dsh-metrics-grid dsh-layout-grid" data-layout-type="grid">${cards}</div></div>`
}

function renderColorBlock({ renderer, header, ordered }) {
  const blocks = ordered.map((item, index) => `<article class="dsh-color-block-item" data-color-index="${index + 1}"><span class="dsh-color-block-number">${String(index + 1).padStart(2, '0')}</span>${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-color-block"><div class="dsh-color-block-header">${header}<span class="dsh-color-block-label">DESIGN / DELIVERY / IMPACT</span></div><div class="dsh-color-block-list dsh-layout-stack" data-layout-type="stack">${blocks}</div></div>`
}

function renderChronicleRail({ renderer, header, ordered }) {
  const entries = ordered.map((item, index) => `<article class="dsh-chronicle-entry"><div class="dsh-chronicle-date">${String(index + 1).padStart(2, '0')}<span>—</span></div><div class="dsh-chronicle-content">${renderItem(item)}</div></article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-chronicle-rail"><div class="dsh-chronicle-head"><span class="dsh-chronicle-mark">/</span>${header}</div><div class="dsh-chronicle-track dsh-layout-stack" data-layout-type="stack">${entries}</div></div>`
}

function renderMinimalTypographic({ renderer, header, ordered }) {
  const items = ordered.map((item, index) => `<article class="dsh-minimal-entry"><span class="dsh-minimal-index">${String(index + 1).padStart(2, '0')}</span>${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-minimal-typographic"><div class="dsh-minimal-watermark">CV</div>${header}<div class="dsh-minimal-list dsh-layout-stack" data-layout-type="stack">${items}</div></div>`
}

function renderGeekLab({ renderer, header, ordered }) {
  const items = ordered.map((item, index) => `<article class="dsh-geek-block"><div class="dsh-geek-label">module_${String(index + 1).padStart(2, '0')}</div>${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-geek-lab"><div class="dsh-geek-command">$ whoami <span>--resume</span></div>${header}<div class="dsh-geek-list dsh-layout-stack" data-layout-type="stack">${items}</div></div>`
}

function renderHeadingStack({ renderer, header, ordered }) {
  const items = ordered.map((item, index) => `<article class="dsh-heading-entry"><span class="dsh-heading-entry-index">${String(index + 1).padStart(2, '0')}</span>${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-heading-stack"><div class="dsh-heading-layout"><aside class="dsh-heading-rail">SELECTED<br/>PROFILE</aside><div class="dsh-heading-main">${header}<div class="dsh-heading-list dsh-layout-stack" data-layout-type="stack">${items}</div></div></div></div>`
}

function renderCaseStudy({ renderer, header, ordered }) {
  const feature = ordered.find((item) => item.type === 'projects' || item.type === 'project-list') || ordered[0]
  const rest = ordered.filter((item) => item !== feature).map((item) => `<article class="dsh-case-support">${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-case-study"><div class="dsh-case-intro">${header}<span class="dsh-case-label">CASE / IMPACT / ROLE</span></div><div class="dsh-case-layout dsh-layout-stack" data-layout-type="stack"><article class="dsh-case-feature">${feature ? renderItem(feature) : ''}</article><div class="dsh-case-support-list">${rest}</div></div></div>`
}

function renderSocialProfile({ renderer, header, ordered }) {
  const items = ordered.map((item) => `<article class="dsh-social-entry">${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-social-profile"><div class="dsh-social-header"><span class="dsh-social-status">OPEN TO WORK</span>${header}</div><div class="dsh-social-feed dsh-layout-stack" data-layout-type="stack">${items}</div></div>`
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
  ['portrait-profile', renderPortraitProfile],
  ['magazine-feature', renderMagazineFeature],
  ['metrics-board', renderMetricsBoard],
  ['color-block', renderColorBlock],
  ['chronicle-rail', renderChronicleRail],
  ['minimal-typographic', renderMinimalTypographic],
  ['geek-lab', renderGeekLab],
  ['heading-stack', renderHeadingStack],
  ['case-study', renderCaseStudy],
  ['social-profile', renderSocialProfile],
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
