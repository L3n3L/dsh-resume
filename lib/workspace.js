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
  ['resume.md', ''],
  ['story-bank.md', `# 素材库（STAR）\n\n## 项目 A\n\n- Situation：\n- Task：\n- Action：\n- Result：\n- 可复用句子：\n\n## 项目 B\n\n- Situation：\n- Task：\n- Action：\n- Result：\n- 可复用句子：\n`],
  ['notes.md', `# 复盘笔记\n\n- 缺口：\n- 面试反馈：\n- 下一步：\n`],
  ['resume.layout.json', `${JSON.stringify({
    schemaVersion: 1,
    mode: 'auto',
    regions: { main: ['profile', 'education', 'skills', 'projects', 'experience', 'awards', 'links'] },
    blocks: [
      { id: 'profile', type: 'profile', source: '个人信息' },
      { id: 'education', type: 'education', source: '教育经历' },
      { id: 'skills', type: 'skill-tags', source: '专业技能', options: { style: 'plain' } },
      { id: 'projects', type: 'project-list', source: '项目经历', options: { showMetrics: true } },
      { id: 'experience', type: 'experience', source: '实习经历' },
      { id: 'awards', type: 'awards', source: '获奖与补充' },
      { id: 'links', type: 'links', source: '作品与链接' },
    ],
  }, null, 2)}\n`],
]

const LEGACY_PLACEHOLDER_RESUME = `# 张三

前端开发 | 本科 | 138-0000-0000 | demo@example.com | GitHub: your-id

## 教育经历

**某某大学 · 计算机科学与技术 · 本科**${'  '}
2022.09 - 2026.06

- GPA：x.x / 4.0
- 主修：数据结构、计算机网络、操作系统

## 专业技能

- 语言：JavaScript / TypeScript / Python
- 框架：React / Vue / Node.js
- 其他：Git、Linux、基本的工程化与测试

## 项目经历

### 项目名称 · 核心成员
2025.01 - 2025.06

- 用一句话说明项目目标与你的职责
- 写可验证结果，例如性能、用户量、上线效果
- 列出关键技术栈

## 实习经历

### 公司 · 岗位
2025.07 - 2025.09

- 业务背景与你的产出
- 量化结果优先
`

export const DEMO_RESUME = [
  '# 林知远',
  '',
  '前端开发工程师（2027 届校招） | 北京 / 杭州 | 158-0000-1234 | lin.zhiyuan@example.com | GitHub: github.com/example/lin-zhiyuan',
  '',
  '## 教育经历',
  '',
  '**东江理工大学 · 信息工程学院 · 计算机科学与技术（本科）**  ',
  '2023.09 - 2027.06 | 专业前 8%',
  '',
  '- GPA：3.78 / 4.0；核心课程：数据结构、计算机网络、操作系统、数据库原理',
  '- 校级一等奖学金（2024）、优秀学生干部；担任前端技术社团负责人',
  '',
  '## 专业技能',
  '',
  '- **前端**：HTML5 / CSS3 / JavaScript / TypeScript；React、Vue、Vite、响应式布局',
  '- **工程**：Node.js、Git、Linux、Vitest、Playwright、Chrome DevTools、CI 基础配置',
  '- **服务与数据**：REST API、SSE、WebSocket、SQL；了解 Flask、FastAPI、Docker',
  '- **工作方式**：组件抽象、接口协作、性能分析、异常状态设计、测试和发布检查',
  '',
  '## 项目经历',
  '',
  '### 校园服务平台 · 前端负责人',
  '2025.09 - 2026.01 | React / TypeScript / SSE',
  '',
  '- 负责从需求拆解到上线的前端实现，抽象表格、筛选、表单和状态反馈等 14 个可复用模块',
  '- 使用 SSE 推送审批和任务进度，配合增量渲染将首屏可交互时间从 2.8s 降至 1.8s',
  '- 通过空状态、重试和权限异常设计减少误操作，核心流程测试通过率达到 99%',
  '',
  '### 实验室数据看板 · 核心成员',
  '2025.03 - 2025.08 | Vue / ECharts / Web Worker',
  '',
  '- 设计筛选、表格、图表和导出模块，支持 20 万条实验记录的分页查询与多条件组合筛选',
  '- 使用虚拟列表、请求缓存和 Web Worker 拆分计算，筛选响应时间降低 40%，导出失败率下降 25%',
  '- 编写组件使用说明和联调清单，帮助 3 名同学复用模块完成后续页面开发',
  '',
  '### 求职信息助手 · 独立开发',
  '2024.10 - 2025.02 | Node.js / Markdown / LLM API',
  '',
  '- 将简历素材、目标 JD 和投递版本拆分为可维护的 Markdown 文件，支持按公司保存版本',
  '- 设计“内容检查 → 生成草稿 → 预览复核”的交互流程，补充字段缺失和超长要点提示',
  '- 用 32 条固定样例验证 Markdown 渲染、链接安全和文件路径边界，修复 7 个异常场景',
  '',
  '## 实习经历',
  '',
  '### 杭州云栈科技 · 前端开发实习生',
  '2026.07 - 2026.09 | 业务中台组',
  '',
  '- 参与内部运营工具建设，完成 8 个业务页面和 12 个通用组件，统一加载、空状态和错误态规范',
  '- 与后端协作定义接口字段和异常码，整理 20 个高频联调问题，减少重复返工',
  '- 根据埋点和用户反馈优化表单流程，关键操作完成率提升 18%',
  '',
  '## 获奖与补充',
  '',
  '- 2025 校级一等奖学金、优秀学生干部；全国大学生计算机设计大赛省赛二等奖',
  '- 技术社团负责人：组织 8 次前端分享和代码评审，维护社团组件示例仓库',
  '- 个人特点：能把复杂需求拆成页面、接口和验收指标，重视可读性、边界状态与真实反馈',
  '',
  '## 作品与链接',
  '',
  '- GitHub：github.com/example/lin-zhiyuan | 作品集：lin-zhiyuan.example.com',
  '- 技术关键词：前端工程化 / 实时交互 / 数据看板 / 可访问性 / 测试与质量',
].join('\n') + '\n'

SEED_FILES[1] = ['resume.md', DEMO_RESUME]

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
  await fs.mkdir(path.join(root, 'assets'), { recursive: true })

  const created = []
  const upgraded = []
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

  const resumePath = path.join(root, 'resume.md')
  if (await pathExists(resumePath)) {
    const existing = await fs.readFile(resumePath, 'utf8')
    if (existing.trim() === LEGACY_PLACEHOLDER_RESUME.trim()) {
      await fs.writeFile(resumePath, DEMO_RESUME, 'utf8')
      upgraded.push('resume.md')
    }
  }

  return { root, created, upgraded }
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
