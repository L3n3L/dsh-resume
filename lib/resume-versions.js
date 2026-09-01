import fs from 'node:fs/promises'
import crypto from 'node:crypto'

import { readJobhuntFile, writeJobhuntFile } from './workspace.js'
import { getPresentationOverride } from './presentation.js'

export const RESUME_VERSION_FILE = '.dsh-workspace/resume-versions.json'
export const RESUME_VERSION_SCHEMA = 1

function normalizeRelative(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').some((part) => !part || part === '..')) throw new Error('version path is invalid')
  return normalized
}

export function normalizeResumePath(value) {
  const normalized = normalizeRelative(value)
  if (normalized.startsWith('.dsh-workspace/') || !/(?:^|\/)resume\.md$/i.test(normalized)) {
    throw new Error('version resume path must point to a resume.md file')
  }
  return normalized
}

export function previewPathForResume(resumePath) {
  const normalized = normalizeResumePath(resumePath)
  const slash = normalized.lastIndexOf('/')
  return slash < 0 ? 'preview.html' : `${normalized.slice(0, slash)}/preview.html`
}

function displayNameForPath(resumePath) {
  const normalized = normalizeResumePath(resumePath)
  if (normalized === 'resume.md') return '主简历'
  const parts = normalized.split('/')
  return parts.length > 1 ? parts[parts.length - 2] : '投递版本'
}

function hashText(value) {
  return crypto.createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 12)
}

function cleanName(value, fallback) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80)
  return name || fallback
}

function cleanSnapshot(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    templateId: String(source.templateId || '').trim().slice(0, 64) || null,
    templateRevision: Number.isInteger(source.templateRevision) && source.templateRevision > 0 ? source.templateRevision : null,
    lineageId: String(source.lineageId || '').trim().slice(0, 64) || null,
    layout: source.layout && typeof source.layout === 'object' ? { ...source.layout } : {},
    visual: source.visual && typeof source.visual === 'object' ? { ...source.visual } : {},
    iconTuning: source.iconTuning && typeof source.iconTuning === 'object' ? { ...source.iconTuning } : {},
  }
}

function normalizeRecord(value) {
  if (!value || typeof value !== 'object') return null
  let resumePath
  try {
    resumePath = normalizeResumePath(value.resumePath)
  } catch {
    return null
  }
  const previewPath = value.previewPath ? normalizeRelative(value.previewPath) : previewPathForResume(resumePath)
  const id = String(value.id || '').trim()
  if (!id) return null
  const persisted = value.persisted !== false
  return {
    id: id.slice(0, 80),
    name: cleanName(value.name, displayNameForPath(resumePath)),
    resumePath,
    previewPath,
    kind: value.kind === 'master' || resumePath === 'resume.md' ? 'master' : 'delivery',
    targetRole: String(value.targetRole || '').trim().slice(0, 120) || null,
    company: String(value.company || '').trim().slice(0, 120) || null,
    presentation: cleanSnapshot(value.presentation),
    contentHash: String(value.contentHash || '').slice(0, 64) || null,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : persisted ? new Date().toISOString() : null,
    archived: Boolean(value.archived),
    persisted,
  }
}

export function emptyVersionRegistry() {
  return { schemaVersion: RESUME_VERSION_SCHEMA, versions: [] }
}

export async function loadResumeVersionRegistry(root) {
  try {
    const { content } = await readJobhuntFile(root, RESUME_VERSION_FILE)
    const parsed = JSON.parse(content)
    const versions = Array.isArray(parsed?.versions) ? parsed.versions.map(normalizeRecord).filter(Boolean) : []
    return { schemaVersion: RESUME_VERSION_SCHEMA, versions }
  } catch {
    return emptyVersionRegistry()
  }
}

export async function saveResumeVersionRegistry(root, registry) {
  const versions = Array.isArray(registry?.versions) ? registry.versions.map(normalizeRecord).filter(Boolean).slice(0, 100) : []
  return writeJobhuntFile(root, RESUME_VERSION_FILE, `${JSON.stringify({ schemaVersion: RESUME_VERSION_SCHEMA, versions }, null, 2)}\n`)
}

export async function listResumeVersions(root, previewPaths = []) {
  const registry = await loadResumeVersionRegistry(root)
  const byPreview = new Map(registry.versions.map((version) => [version.previewPath, version]))
  for (const preview of Array.isArray(previewPaths) ? previewPaths : []) {
    let previewPath
    try {
      previewPath = normalizeRelative(preview)
    } catch {
      continue
    }
    const resumePath = previewPath.endsWith('preview.html')
      ? `${previewPath.slice(0, -'preview.html'.length)}resume.md`
      : null
    if (!resumePath || byPreview.has(previewPath)) continue
    const id = `legacy-${hashText(previewPath)}`
    byPreview.set(previewPath, normalizeRecord({ id, name: displayNameForPath(resumePath), resumePath, previewPath, kind: resumePath === 'resume.md' ? 'master' : 'delivery', persisted: false }))
  }
  return [...byPreview.values()]
    .filter((version) => !version.archived)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'master' ? -1 : 1
      return String(b.updatedAt).localeCompare(String(a.updatedAt))
    })
}

export function versionPresentationSnapshot({ templateId, presentation, resumePath, template } = {}) {
  const override = templateId && getPresentationOverride(presentation, templateId, resumePath)
  return cleanSnapshot({
    templateId,
    templateRevision: template?.metadata?.revision,
    lineageId: template?.metadata?.lineageId,
    layout: override?.layout,
    visual: override?.visual,
    iconTuning: override?.iconTuning,
  })
}

export function makeVersionId(resumePath, content, now = new Date()) {
  return `version-${hashText(`${resumePath}:${content}:${now.toISOString()}`)}`
}

export function makeVersionRecord({ id, name, resumePath, previewPath, content, presentation, targetRole, company, previous } = {}) {
  const normalizedResume = normalizeResumePath(resumePath)
  const now = new Date().toISOString()
  return normalizeRecord({
    id: id || previous?.id || makeVersionId(normalizedResume, content, new Date(now)),
    name: cleanName(name, previous?.name || displayNameForPath(normalizedResume)),
    resumePath: normalizedResume,
    previewPath: previewPath || previous?.previewPath || previewPathForResume(normalizedResume),
    kind: normalizedResume === 'resume.md' ? 'master' : 'delivery',
    targetRole: targetRole ?? previous?.targetRole,
    company: company ?? previous?.company,
    presentation,
    contentHash: hashText(content),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  })
}

export function versionFolderSlug(name, fallback = 'resume') {
  const ascii = String(name || fallback)
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return (ascii || fallback).slice(0, 48)
}

export function nextDeliveryPaths(name, registry) {
  const base = versionFolderSlug(name, 'delivery')
  const used = new Set((registry?.versions || []).map((version) => version.resumePath))
  let slug = base
  let index = 2
  while (used.has(`companies/${slug}/resume.md`)) slug = `${base}-${index++}`
  return { resumePath: `companies/${slug}/resume.md`, previewPath: `companies/${slug}/preview.html` }
}
