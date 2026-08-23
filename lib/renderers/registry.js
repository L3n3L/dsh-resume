const RENDERER_IDS = Object.freeze([
  'composition',
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

// Shared entry primitive. Renderer IDs remain stable for compatibility, but
// rail/card-like templates now share one structural implementation and keep
// their old classes as visual hooks.
function renderIndexedEntries(items, options = {}) {
  const {
    entryClass = '',
    indexAttribute = 'data-entry-index',
    renderIndex = (index) => `<span class="dsh-entry-index">${String(index + 1).padStart(2, '0')}</span>`,
    contentClass = '',
    renderContent = (item) => renderItem(item),
    includeItemClass = false,
    tag = 'article',
  } = options
  return items.map((item, index) => {
    const classes = ['dsh-entry-rail', entryClass, includeItemClass ? itemClass(item) : ''].filter(Boolean).join(' ')
    const indexAttr = indexAttribute ? ` ${indexAttribute}="${index + 1}"` : ''
    const content = contentClass
      ? `<div class="${contentClass}">${renderContent(item, index)}</div>`
      : renderContent(item, index)
    return `<${tag} class="${classes}" data-entry-layout="rail"${indexAttr}>${renderIndex(index, item)}${content}</${tag}>`
  }).join('\n')
}

const INDEXED_RENDERER_CONFIG = Object.freeze({
  'technical-timeline': {
    rootClass: 'dsh-technical-rail',
    bodyClass: 'dsh-layout-stack dsh-technical-track',
    entry: { entryClass: 'dsh-technical-node', indexAttribute: 'data-node-index', renderIndex: (index) => `<span class="dsh-technical-index">${String(index + 1).padStart(2, '0')}</span>` },
  },
  academic: {
    rootClass: 'dsh-academic-dossier',
    bodyClass: 'dsh-layout-stack dsh-academic-entries',
    entry: { entryClass: 'dsh-academic-entry', renderIndex: (index) => `<span class="dsh-academic-number">${String(index + 1).padStart(2, '0')}</span>` },
  },
  'business-timeline': {
    rootClass: 'dsh-business-timeline',
    entry: { entryClass: 'dsh-business-entry', indexAttribute: null, renderIndex: () => '<span class="dsh-business-marker" aria-hidden="true"></span>', contentClass: 'dsh-business-entry-content', renderContent: (item) => item.html, includeItemClass: true },
  },
  'chronicle-rail': {
    rootClass: 'dsh-chronicle-rail',
    header: (header) => `<div class="dsh-chronicle-head"><span class="dsh-chronicle-mark">/</span>${header}</div>`,
    bodyClass: 'dsh-chronicle-track dsh-layout-stack',
    entry: { entryClass: 'dsh-chronicle-entry', renderIndex: (index) => `<div class="dsh-chronicle-date">${String(index + 1).padStart(2, '0')}<span>—</span></div>`, contentClass: 'dsh-chronicle-content' },
  },
  'minimal-typographic': {
    rootClass: 'dsh-minimal-typographic',
    beforeHeader: '<div class="dsh-minimal-watermark">CV</div>',
    bodyClass: 'dsh-minimal-list dsh-layout-stack',
    entry: { entryClass: 'dsh-minimal-entry', renderIndex: (index) => `<span class="dsh-minimal-index">${String(index + 1).padStart(2, '0')}</span>` },
  },
  'geek-lab': {
    rootClass: 'dsh-geek-lab',
    beforeHeader: '<div class="dsh-geek-command">$ whoami <span>--resume</span></div>',
    bodyClass: 'dsh-geek-list dsh-layout-stack',
    entry: { entryClass: 'dsh-geek-block', indexAttribute: null, renderIndex: (index) => `<div class="dsh-geek-label">module_${String(index + 1).padStart(2, '0')}</div>` },
  },
  'metrics-board': {
    rootClass: 'dsh-metrics-board',
    beforeHeader: '<div class="dsh-metrics-topline"><span>SELECTED SIGNALS</span><span>01—06</span></div>',
    bodyClass: 'dsh-metrics-grid dsh-layout-grid',
    layoutType: 'grid',
    entry: { entryClass: 'dsh-metrics-card', indexAttribute: 'data-metric-index', renderIndex: (index) => `<span class="dsh-metrics-card-index">${String(index + 1).padStart(2, '0')}</span>` },
  },
  'color-block': {
    rootClass: 'dsh-color-block',
    header: (header) => `<div class="dsh-color-block-header">${header}<span class="dsh-color-block-label">DESIGN / DELIVERY / IMPACT</span></div>`,
    bodyClass: 'dsh-color-block-list dsh-layout-stack',
    entry: { entryClass: 'dsh-color-block-item', indexAttribute: 'data-color-index', renderIndex: (index) => `<span class="dsh-color-block-number">${String(index + 1).padStart(2, '0')}</span>` },
  },
})

function renderIndexedRenderer({ renderer, header, ordered }) {
  const config = INDEXED_RENDERER_CONFIG[renderer]
  const entries = renderIndexedEntries(ordered, config.entry)
  const headerHtml = config.header ? config.header(header) : header
  const beforeHeader = config.beforeHeader || ''
  const body = config.bodyClass
    ? `<div class="${config.bodyClass}" data-layout-type="${config.layoutType || 'stack'}">${entries}</div>`
    : entries
  return `<div class="dsh-resume-root dsh-renderer-${renderer} ${config.rootClass}">${beforeHeader}${headerHtml}${body}</div>`
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

function renderPortraitProfile({ renderer, header, ordered }) {
  const photo = ordered.find((item) => item.type === 'photo')
  const items = ordered.filter((item) => item !== photo).map((item) => renderItem(item)).join('\n')
  const portrait = photo?.html || '<div class="dsh-portrait-placeholder" aria-label="头像占位">CV</div>'
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-portrait-profile"><div class="dsh-portrait-head"><div class="dsh-portrait-frame">${portrait}</div><div class="dsh-portrait-copy">${header}</div></div><div class="dsh-portrait-body dsh-layout-stack" data-layout-type="stack">${items}</div></div>`
}

function renderMagazineFeature({ renderer, header, ordered }) {
  const priority = new Map([
    ['projects', 0],
    ['project-list', 0],
    ['experience', 1],
    ['summary', 2],
    ['education', 3],
    ['skills', 4],
    ['skill-tags', 4],
  ])
  const magazineOrdered = ordered
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (priority.get(a.item.type) ?? 8) - (priority.get(b.item.type) ?? 8) || a.index - b.index)
    .map(({ item }) => item)
  const [lead, ...rest] = magazineOrdered
  const secondary = rest.map((item, index) => `<article class="dsh-magazine-entry" data-magazine-index="${index + 2}">${renderItem(item)}</article>`).join('\n')
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-magazine-feature"><div class="dsh-magazine-kicker">CURRICULUM / PORTFOLIO / 2026</div>${header}<div class="dsh-magazine-layout dsh-layout-grid" data-layout-type="grid"><article class="dsh-magazine-lead">${lead ? renderItem(lead) : ''}</article>${secondary}</div></div>`
}

function renderHeadingStack({ renderer, header, ordered }) {
  const items = renderIndexedEntries(ordered, {
    entryClass: 'dsh-heading-entry',
    renderIndex: (index) => `<span class="dsh-heading-entry-index">${String(index + 1).padStart(2, '0')}</span>`,
  })
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

function renderComposedModules(ordered, composition = {}) {
  if (composition.entry !== 'timeline') return ordered.map((item) => renderItem(item)).join('\n')
  return ordered.map((item, index) => `<article class="dsh-entry-rail dsh-entry-rail-timeline ${itemClass(item)}" data-entry-index="${index + 1}"><span class="dsh-entry-rail-marker" aria-hidden="true"></span><div class="dsh-entry-rail-content">${item.html}</div></article>`).join('\n')
}

function renderComposedLayout({ renderer, template, header, ordered, layout }) {
  const composition = template.composition || {}
  const page = composition.page || (layout?.ir?.type === 'split' ? 'split' : layout?.ir?.type === 'grid' ? 'grid' : 'stack')
  if (page === 'split') {
    const splitHtml = renderSplitSidebar({ renderer, header, ordered, layout, rootClass: 'dsh-composed-layout' })
    return splitHtml.replace(/<div class="dsh-layout-split"/, '<div class="dsh-composed-modules dsh-layout-split"')
  }
  if (page === 'grid') {
    const gridHtml = renderPortfolioGrid({ renderer, header, ordered, layout })
    return gridHtml
      .replace(/class="dsh-resume-root dsh-renderer-composition"/, 'class="dsh-resume-root dsh-renderer-composition dsh-composed-layout"')
      .replace(/<div class="dsh-layout-grid"/, '<div class="dsh-composed-modules dsh-layout-grid"')
  }
  const modules = renderComposedModules(ordered, composition)
  return `<div class="dsh-resume-root dsh-renderer-${renderer} dsh-composed-layout">${header}<div class="dsh-composed-modules dsh-layout-stack" data-layout-type="stack">${modules}</div></div>`
}

const RENDERERS = new Map([
  ['composition', renderComposedLayout],
  ['clean-single', renderSingle],
  ['split-sidebar', renderSplitSidebar],
  ['technical-timeline', renderIndexedRenderer],
  ['portfolio-grid', renderPortfolioGrid],
  ['editorial', renderEditorial],
  ['academic', renderIndexedRenderer],
  ['swiss-grid', renderSwissGrid],
  ['midnight-terminal', renderMidnightTerminal],
  ['sidebar-signal', renderSidebarSignal],
  ['business-timeline', renderIndexedRenderer],
  ['portrait-profile', renderPortraitProfile],
  ['magazine-feature', renderMagazineFeature],
  ['metrics-board', renderIndexedRenderer],
  ['color-block', renderIndexedRenderer],
  ['chronicle-rail', renderIndexedRenderer],
  ['minimal-typographic', renderIndexedRenderer],
  ['geek-lab', renderIndexedRenderer],
  ['heading-stack', renderHeadingStack],
  ['case-study', renderCaseStudy],
  ['social-profile', renderSocialProfile],
])

export function resolveRendererId(template = {}, layout = {}) {
  if (template?.renderer === 'composition' || ['stack', 'split', 'grid'].includes(template?.composition?.page)) return 'composition'
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
  const html = render({ renderer, template, layout, header, ordered })
  if (!template.composition || typeof template.composition !== 'object') return html
  const attrs = Object.entries(template.composition)
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => ` data-composition-${key}="${String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`)
    .join('')
  return attrs
    ? html.replace(/^(<div\b[^>]*class="[^"]*dsh-resume-root[^"]*")>/i, `$1${attrs}>`)
    : html
}
