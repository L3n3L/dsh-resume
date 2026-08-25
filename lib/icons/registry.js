import { ICON_CATALOG } from './catalog.js'

// Semantic resume icons are kept outside the generated Simple Icons catalog.
export const SEMANTIC_ICON_TOKENS = Object.freeze({
  school: { label: '教育经历', glyph: '◆', kind: 'semantic' },
  code: { label: '专业技能', glyph: '</>', kind: 'semantic' },
  work: { label: '工作经历', glyph: '▣', kind: 'semantic' },
})

export const TEXT_ICON_TOKENS = Object.freeze({
  email: { label: '邮箱', glyph: '@', kind: 'semantic' },
  phone: { label: '电话', glyph: '☎', kind: 'semantic' },
  link: { label: '链接', glyph: '↗', kind: 'semantic' },
  ...SEMANTIC_ICON_TOKENS,
})

export function normalizeIconName(name) {
  return String(name || '').trim().toLowerCase()
}

export function getIconDefinition(name) {
  const normalized = normalizeIconName(name)
  const svg = ICON_CATALOG[normalized]
  if (svg) {
    return { slug: normalized, label: svg.label || svg.title || normalized, kind: 'brand', svg }
  }
  const text = TEXT_ICON_TOKENS[normalized]
  return text ? { slug: normalized, ...text } : null
}

export function inspectIconTokens(source) {
  const found = []
  const seen = new Set()
  const pattern = /\[icon:([a-z0-9_-]+)\]/gi
  for (const match of String(source || '').matchAll(pattern)) {
    const slug = normalizeIconName(match[1])
    const item = found.find((entry) => entry.slug === slug)
    if (item) {
      item.count += 1
      continue
    }
    if (seen.has(slug)) continue
    seen.add(slug)
    found.push({ slug, known: Boolean(getIconDefinition(slug)), count: 1 })
  }
  return {
    used: found.filter((item) => item.known).map((item) => item.slug),
    unknown: found.filter((item) => !item.known).map((item) => item.slug),
    tokens: found,
  }
}

export function listIconTokens(query = '') {
  const needle = normalizeIconName(query)
  const semantic = Object.entries(TEXT_ICON_TOKENS).map(([slug, definition]) => ({ slug, ...definition }))
  const brand = Object.entries(ICON_CATALOG).map(([slug, definition]) => ({
    slug,
    label: definition.label || definition.title || slug,
    kind: 'brand',
  }))
  return [...semantic, ...brand]
    .filter((item) => !needle || item.slug.includes(needle) || item.label.toLowerCase().includes(needle))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}
