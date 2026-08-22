const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const REGION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const WIDTH_PATTERN = /^(?:\d+(?:\.\d+)?fr|\d+(?:\.\d+)?(?:px|%))$/
const LAYOUT_IR_TYPES = new Set(['stack', 'split', 'grid'])
const BLOCK_TYPES = new Set([
  'profile',
  'education',
  'skills',
  'projects',
  'experience',
  'awards',
  'links',
  'project-list',
  'skill-tags',
  'timeline',
  'metric-row',
  'portfolio-card',
  'qr-code',
  'photo',
  'summary',
  'contact',
  'skill-groups',
  'custom-section',
])

export const LAYOUT_DEFAULTS = Object.freeze({
  schemaVersion: 1,
  mode: 'auto',
  regions: { main: [] },
  blocks: [],
  ir: null,
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function merge(input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const regions = value.regions && typeof value.regions === 'object' && !Array.isArray(value.regions)
    ? value.regions
    : {}
  const blocks = Array.isArray(value.blocks) ? value.blocks : []
  return {
    ...clone(LAYOUT_DEFAULTS),
    ...value,
    regions: Object.fromEntries(Object.entries(regions).map(([name, ids]) => [name, Array.isArray(ids) ? ids : []])),
    blocks: blocks.map((block) => ({
      id: typeof block?.id === 'string' ? block.id : '',
      type: typeof block?.type === 'string' ? block.type : 'custom-section',
      source: typeof block?.source === 'string' ? block.source : '',
      options: block?.options && typeof block.options === 'object' && !Array.isArray(block.options) ? block.options : {},
    })),
  }
}

function validItemIds(items, validIds) {
  return [...new Set((Array.isArray(items) ? items : []).filter((id) => typeof id === 'string' && validIds.has(id)))]
}

function legacyIr(spec) {
  const main = spec.regions.main || spec.blocks.map((block) => block.id)
  const side = spec.regions.side || []
  if (spec.mode === 'two-column' || side.length) {
    return {
      type: 'split',
      gap: 24,
      columns: [
        { id: 'main', width: '1fr', items: main },
        { id: 'side', width: '0.32fr', items: side },
      ],
    }
  }
  return { type: 'stack', items: main }
}

function normalizeIr(raw, spec, validIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return legacyIr(spec)
  const type = typeof raw.type === 'string' ? raw.type : ''
  if (type === 'stack') return { type, items: validItemIds(raw.items, validIds) }
  if (type === 'grid') {
    return {
      type,
      columns: Math.min(4, Math.max(1, Number.isInteger(raw.columns) ? raw.columns : 2)),
      gap: Number.isFinite(raw.gap) ? Math.min(40, Math.max(0, raw.gap)) : 16,
      items: validItemIds(raw.items, validIds),
    }
  }
  if (type === 'split') {
    const columns = Array.isArray(raw.columns) ? raw.columns : []
    return {
      type,
      gap: Number.isFinite(raw.gap) ? Math.min(40, Math.max(0, raw.gap)) : 24,
      columns: columns.slice(0, 4).map((column, index) => ({
        id: typeof column?.id === 'string' && REGION_PATTERN.test(column.id) ? column.id : `column-${index + 1}`,
        width: typeof column?.width === 'string' && WIDTH_PATTERN.test(column.width) ? column.width : '1fr',
        items: validItemIds(column?.items, validIds),
      })),
    }
  }
  return { type, items: validItemIds(raw.items, validIds) }
}

export function normalizeLayoutSpec(input = {}) {
  const spec = merge(input)
  spec.schemaVersion = 1
  spec.mode = ['auto', 'single-column', 'two-column'].includes(spec.mode) ? spec.mode : 'auto'
  const blockIds = new Set()
  spec.blocks = spec.blocks.filter((block) => {
    if (!ID_PATTERN.test(block.id) || blockIds.has(block.id)) return false
    blockIds.add(block.id)
    return true
  })
  const validIds = new Set(spec.blocks.map((block) => block.id))
  for (const [region, ids] of Object.entries(spec.regions)) {
    spec.regions[region] = [...new Set(ids.filter((id) => typeof id === 'string' && validIds.has(id)))]
  }
  if (!spec.regions.main) spec.regions.main = spec.blocks.map((block) => block.id)
  spec.ir = normalizeIr(spec.ir, spec, validIds)
  return spec
}

export function validateLayoutSpec(input) {
  const spec = normalizeLayoutSpec(input)
  const errors = []
  if (!['auto', 'single-column', 'two-column'].includes(spec.mode)) errors.push('mode must be auto, single-column, or two-column')
  if (!spec.blocks.length) errors.push('blocks cannot be empty')
  const ids = new Set()
  for (const block of spec.blocks) {
    if (!ID_PATTERN.test(block.id)) errors.push(`block id is invalid: ${block.id || '(empty)'}`)
    if (ids.has(block.id)) errors.push(`duplicate block id: ${block.id}`)
    ids.add(block.id)
    if (!BLOCK_TYPES.has(block.type)) errors.push(`block type is invalid: ${block.type}`)
    if (block.source.length > 80) errors.push(`block source is too long: ${block.id}`)
  }
  for (const [region, idsInRegion] of Object.entries(spec.regions)) {
    if (!REGION_PATTERN.test(region)) errors.push(`region name is invalid: ${region}`)
    for (const id of idsInRegion) if (!ids.has(id)) errors.push(`region ${region} references unknown block: ${id}`)
  }
  if (!LAYOUT_IR_TYPES.has(spec.ir?.type)) errors.push('ir.type must be stack, split, or grid')
  if (spec.ir?.type === 'stack' || spec.ir?.type === 'grid') {
    for (const id of spec.ir.items || []) if (!ids.has(id)) errors.push(`ir references unknown block: ${id}`)
  }
  if (spec.ir?.type === 'grid' && (!Number.isInteger(spec.ir.columns) || spec.ir.columns < 1 || spec.ir.columns > 4)) errors.push('ir.grid columns must be between 1 and 4')
  if (spec.ir?.type === 'split') {
    if (!Array.isArray(spec.ir.columns) || spec.ir.columns.length < 2) errors.push('ir.split requires at least two columns')
    for (const column of spec.ir.columns || []) {
      if (!REGION_PATTERN.test(column.id)) errors.push(`ir column id is invalid: ${column.id || '(empty)'}`)
      if (!WIDTH_PATTERN.test(column.width)) errors.push(`ir column width is invalid: ${column.width || '(empty)'}`)
      for (const id of column.items || []) if (!ids.has(id)) errors.push(`ir column ${column.id} references unknown block: ${id}`)
    }
  }
  return { valid: errors.length === 0, errors, value: spec }
}

export function assertLayoutSpec(input) {
  const result = validateLayoutSpec(input)
  if (!result.valid) throw new Error(`invalid layout: ${result.errors.join('; ')}`)
  return result.value
}

export const LAYOUT_BLOCK_TYPES = Object.freeze([...BLOCK_TYPES])
export const LAYOUT_IR_NODE_TYPES = Object.freeze([...LAYOUT_IR_TYPES])
