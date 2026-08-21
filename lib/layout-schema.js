const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const REGION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
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
  'custom-section',
])

export const LAYOUT_DEFAULTS = Object.freeze({
  schemaVersion: 1,
  mode: 'auto',
  regions: { main: [] },
  blocks: [],
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
  return { valid: errors.length === 0, errors, value: spec }
}

export function assertLayoutSpec(input) {
  const result = validateLayoutSpec(input)
  if (!result.valid) throw new Error(`invalid layout: ${result.errors.join('; ')}`)
  return result.value
}

export const LAYOUT_BLOCK_TYPES = Object.freeze([...BLOCK_TYPES])
