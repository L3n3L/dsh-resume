import { inspectIconTokens } from './icons/registry.js'

const PLACEHOLDER_PATTERNS = [
  /某某|待补充|请填写|your-id|demo@example\.com/i,
  /x\.x|xxx|TBD|TODO/i,
  /138-0000-0000/,
]

function countMatches(lines, pattern) {
  return lines.reduce((count, line) => count + (pattern.test(line) ? 1 : 0), 0)
}

/** Deterministic, local-only preflight. It does not judge whether a claim is true. */
export function resumeQualityCheck(content, options = {}) {
  const text = String(content || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const bullets = lines.filter((line) => /^\s*[-*]\s+/.test(line))
  const longBullets = bullets.filter((line) => line.replace(/^\s*[-*]\s+/, '').length > 110)
  const sections = lines.filter((line) => /^##\s+/.test(line)).length
  const checks = []
  let score = 100

  const add = (id, status, message, detail) => {
    checks.push({ id, status, message, ...(detail ? { detail } : {}) })
    if (status === 'error') score -= 20
    if (status === 'warn') score -= 8
  }

  add(
    'identity.name',
    /^\s*#\s+\S+/m.test(text) ? 'pass' : 'error',
    /^\s*#\s+\S+/m.test(text) ? '已发现姓名标题' : '缺少姓名一级标题',
    '建议第一行使用 # 姓名',
  )
  add(
    'contact.email',
    /(?:邮箱|email|@)/i.test(text) ? 'pass' : 'warn',
    /(?:邮箱|email|@)/i.test(text) ? '已发现邮箱信息' : '未发现邮箱信息',
  )
  add(
    'contact.phone',
    /(?:电话|手机|tel|1[3-9]\d{9})/i.test(text) ? 'pass' : 'warn',
    /(?:电话|手机|tel|1[3-9]\d{9})/i.test(text) ? '已发现联系电话' : '未发现联系电话',
  )
  add(
    'structure.sections',
    sections > 0 ? 'pass' : 'error',
    sections > 0 ? `已划分 ${sections} 个简历模块` : '没有用二级标题划分简历模块',
  )
  add(
    'content.bullets',
    bullets.length > 0 ? 'pass' : 'warn',
    bullets.length > 0 ? `已发现 ${bullets.length} 条项目要点` : '没有发现项目要点',
  )
  add(
    'content.long-bullets',
    longBullets.length === 0 ? 'pass' : 'warn',
    longBullets.length === 0 ? '项目要点长度适中' : `${longBullets.length} 条项目要点偏长，可能影响一页排版`,
    longBullets.length ? '优先拆分或删除重复信息，不要先缩小字号' : undefined,
  )
  const placeholderCount = PLACEHOLDER_PATTERNS.reduce((count, pattern) => count + countMatches(lines, pattern), 0)
  add(
    'content.placeholders',
    placeholderCount === 0 ? 'pass' : 'warn',
    placeholderCount === 0 ? '未发现明显占位内容' : `发现约 ${placeholderCount} 处待补充内容`,
    placeholderCount ? '请在导出前替换示例数据，并确认每项经历都有真实依据' : undefined,
  )
  const iconReport = inspectIconTokens(text)
  add(
    'format.icons',
    iconReport.unknown.length === 0 ? 'pass' : 'error',
    iconReport.unknown.length === 0
      ? '图标 token 均已注册'
      : `发现未注册图标：${iconReport.unknown.map((slug) => `[icon:${slug}]`).join('、')}`,
    iconReport.unknown.length ? '请删除未注册 token，或先调用 jobhunt_icon_list 查询可用图标。' : undefined,
  )

  const warnings = checks.filter((item) => item.status !== 'pass').map((item) => item.message)
  const errors = checks.filter((item) => item.status === 'error')
  const targetPages = Number(options.targetPages || 1)
  return {
    passed: errors.length === 0,
    score: Math.max(0, score),
    target: `校园求职优先 ${targetPages} 页 A4`,
    sections,
    bullets: bullets.length,
    longBullets: longBullets.length,
    placeholders: placeholderCount,
    icons: iconReport,
    checks,
    warnings,
    next: warnings.length ? '先处理提醒项，再调用 jobhunt_render 查看实际页数。' : '结构检查通过，调用 jobhunt_render 进行视觉和页数检查。',
  }
}
