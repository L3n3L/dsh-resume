import { validateTemplate } from './template-presets.js'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function autoTuneTemplate(templateInput, metrics, roundNumber = 1) {
  const validation = validateTemplate(templateInput)
  if (!validation.valid) return { changed: false, valid: false, errors: validation.errors, template: validation.value }
  if (!metrics || typeof metrics !== 'object') return { changed: false, valid: false, errors: ['metrics is required'], template: validation.value }
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 3) {
    return { changed: false, valid: false, errors: ['round must be an integer from 1 to 3'], template: validation.value }
  }

  const next = JSON.parse(JSON.stringify(validation.value))
  const overflow = Boolean(metrics.overflow) || Number(metrics.pageCount) > 1
  const blankRatio = Number(metrics.pages?.[0]?.blankRatio)
  const sparse = Boolean(metrics.sparse) || Number.isFinite(blankRatio) && blankRatio > 0.12
  const changes = []

  if (overflow) {
    const before = next.spacing.pageMargin
    next.spacing.pageMargin = clamp(round(before - 2), 24, 72)
    changes.push(`页边距 ${before}px → ${next.spacing.pageMargin}px`)
    if (roundNumber >= 2) {
      const oldGap = next.spacing.sectionGap
      next.spacing.sectionGap = clamp(round(oldGap - 2), 6, 30)
      changes.push(`模块间距 ${oldGap}px → ${next.spacing.sectionGap}px`)
    }
    if (roundNumber >= 3) {
      const oldFont = next.typography.fontSize
      next.typography.fontSize = clamp(round(oldFont - 0.5), 11, 18)
      changes.push(`字号 ${oldFont}px → ${next.typography.fontSize}px`)
    }
  } else if (sparse) {
    const before = next.typography.fontSize
    next.typography.fontSize = clamp(round(before + 0.5), 11, 18)
    changes.push(`字号 ${before}px → ${next.typography.fontSize}px`)
    if (roundNumber >= 2) {
      const oldGap = next.spacing.sectionGap
      next.spacing.sectionGap = clamp(round(oldGap + 2), 6, 30)
      changes.push(`模块间距 ${oldGap}px → ${next.spacing.sectionGap}px`)
    }
    if (roundNumber >= 3) {
      const oldMargin = next.spacing.pageMargin
      next.spacing.pageMargin = clamp(round(oldMargin + 2), 24, 72)
      changes.push(`页边距 ${oldMargin}px → ${next.spacing.pageMargin}px`)
    }
  }

  const checked = validateTemplate(next)
  return {
    changed: changes.length > 0,
    valid: checked.valid,
    errors: checked.errors,
    round: roundNumber,
    changes,
    reason: overflow ? '页面存在溢出，优先收紧外边距和模块间距。' : sparse ? '一页留白偏多，逐步增加可读的视觉密度。' : '当前测量已经处于可接受状态，不需要继续调整。',
    template: checked.value,
  }
}
