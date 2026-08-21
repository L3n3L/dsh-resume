import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_DIR = path.join(__dirname, 'templates')

export const JOBHUNT_DIRNAME = 'jobhunt'
export const ALLOWED_WRITE_EXT = new Set(['.md', '.css', '.txt', '.json'])
export const ALLOWED_READ_EXT = new Set(['.md', '.css', '.txt', '.html', '.json'])

const SEED_FILES = [
  ['profile.md', `# 求职意向\n\n- 方向：\n- 城市：\n- 阶段：校招 / 实习\n- 到岗时间：\n- 备注：\n`],
  ['resume.md', `# 张三\n\n前端开发 | 本科 | 138-0000-0000 | demo@example.com | GitHub: your-id\n\n## 教育经历\n\n**某某大学 · 计算机科学与技术 · 本科**  \n2022.09 - 2026.06\n\n- GPA：x.x / 4.0\n- 主修：数据结构、计算机网络、操作系统\n\n## 专业技能\n\n- 语言：JavaScript / TypeScript / Python\n- 框架：React / Vue / Node.js\n- 其他：Git、Linux、基本的工程化与测试\n\n## 项目经历\n\n### 项目名称 · 核心成员\n2025.01 - 2025.06\n\n- 用一句话说明项目目标与你的职责\n- 写可验证结果，例如性能、用户量、上线效果\n- 列出关键技术栈\n\n## 实习经历\n\n### 公司 · 岗位\n2025.07 - 2025.09\n\n- 业务背景与你的产出\n- 量化结果优先\n`],
  ['story-bank.md', `# 素材库（STAR）\n\n## 项目 A\n\n- Situation：\n- Task：\n- Action：\n- Result：\n- 可复用句子：\n\n## 项目 B\n\n- Situation：\n- Task：\n- Action：\n- Result：\n- 可复用句子：\n`],
  ['notes.md', `# 复盘笔记\n\n- 缺口：\n- 面试反馈：\n- 下一步：\n`],
  ['resume.layout.json', `${JSON.stringify({
    schemaVersion: 1,
    mode: 'single-column',
    regions: { main: ['profile', 'education', 'skills', 'projects', 'experience'] },
    blocks: [
      { id: 'profile', type: 'profile', source: '个人信息' },
      { id: 'education', type: 'education', source: '教育经历' },
      { id: 'skills', type: 'skill-tags', source: '专业技能', options: { style: 'plain' } },
      { id: 'projects', type: 'project-list', source: '项目经历', options: { showMetrics: true } },
      { id: 'experience', type: 'experience', source: '实习经历' },
    ],
  }, null, 2)}\n`],
]

function assertSafeRel(relPath) {
  if (typeof relPath !== 'string' || !relPath.trim()) {
    throw new Error('path is required')
  }
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (normalized.includes('\0') || normalized.split('/').some((p) => p === '..')) {
    throw new Error(`unsafe path: ${relPath}`)
  }
  return normalized
}

export function resolveSessionCwd(exec) {
  return exec?.agent?.session?.header?.cwd || process.cwd()
}

export function resolveJobhuntRoot(exec, rootDir) {
  if (rootDir && path.isAbsolute(rootDir)) return path.normalize(rootDir)
  const cwd = resolveSessionCwd(exec)
  if (rootDir) return path.normalize(path.join(cwd, rootDir))
  return path.normalize(path.join(cwd, JOBHUNT_DIRNAME))
}

export function resolveUnderJobhunt(root, relPath) {
  root = path.normalize(root)
  const safeRel = assertSafeRel(relPath)
  const abs = path.normalize(path.join(root, safeRel))
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    throw new Error(`path escapes jobhunt root: ${relPath}`)
  }
  return { abs, rel: safeRel }
}

async function pathExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function initJobhunt(root) {
  await fs.mkdir(root, { recursive: true })
  await fs.mkdir(path.join(root, 'templates'), { recursive: true })
  await fs.mkdir(path.join(root, 'companies'), { recursive: true })

  const created = []
  for (const [rel, content] of SEED_FILES) {
    const abs = path.join(root, rel)
    if (!(await pathExists(abs))) {
      await fs.writeFile(abs, content, 'utf8')
      created.push(rel)
    }
  }

  for (const name of ['default.css', 'default.md']) {
    const dest = path.join(root, 'templates', name)
    if (!(await pathExists(dest))) {
      await fs.copyFile(path.join(SEED_DIR, name), dest)
      created.push(`templates/${name}`)
    }
  }

  return { root, created }
}

export async function listJobhunt(root) {
  const out = []
  async function walk(dir, prefix = '') {
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        out.push({ path: rel + '/', type: 'dir' })
        await walk(abs, rel)
      } else {
        const st = await fs.stat(abs)
        out.push({ path: rel, type: 'file', bytes: st.size })
      }
    }
  }
  if (!(await pathExists(root))) {
    return { root, exists: false, entries: [] }
  }
  await walk(root)
  return { root, exists: true, entries: out }
}

export async function readJobhuntFile(root, relPath) {
  const { abs, rel } = resolveUnderJobhunt(root, relPath)
  const ext = path.extname(abs).toLowerCase()
  if (!ALLOWED_READ_EXT.has(ext)) {
    throw new Error(`read not allowed for extension: ${ext || '(none)'}`)
  }
  const content = await fs.readFile(abs, 'utf8')
  return { path: rel, content }
}

export async function writeJobhuntFile(root, relPath, content) {
  if (typeof content !== 'string') throw new Error('content must be a string')
  const { abs, rel } = resolveUnderJobhunt(root, relPath)
  const ext = path.extname(abs).toLowerCase()
  if (!ALLOWED_WRITE_EXT.has(ext)) {
    throw new Error(`write not allowed for extension: ${ext || '(none)'}; allowed: md/css/txt/json`)
  }
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
  return { path: rel, bytes: Buffer.byteLength(content, 'utf8') }
}
