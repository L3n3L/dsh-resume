import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { once } from 'node:events'
import os from 'node:os'
import { spawn } from 'node:child_process'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createResumeMcpServer } from '../mcp-server/index.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(ROOT, '..')

function startServer() {
  const child = spawn(process.execPath, ['mcp-server/index.js'], {
    cwd: PACKAGE_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let buffer = ''
  const pending = new Map()
  let nextId = 1
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
      if (!line.trim()) continue
      const message = JSON.parse(line)
      if (message.id !== undefined) pending.get(message.id)?.(message)
    }
  })

  function request(method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, resolve)
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      setTimeout(() => {
        if (!pending.has(id)) return
        pending.delete(id)
        reject(new Error(`timed out waiting for ${method}`))
      }, 5000).unref()
    })
  }

  function notify(method, params = {}) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
  }

  return { child, request, notify }
}

test('MCP stdio server negotiates and exposes the basic dsh-resume tools', async (t) => {
  const server = startServer()
  t.after(() => server.child.kill())

  const initialized = await server.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'dsh-resume-test', version: '0.1.0' },
  })
  assert.equal(initialized.jsonrpc, '2.0')
  assert.ok(initialized.result?.serverInfo?.name)
  server.notify('notifications/initialized')

  const listed = await server.request('tools/list')
  const names = listed.result.tools.map((tool) => tool.name)
  assert.deepEqual(names, [
    'mcp_health',
    'workspace_info',
    'resume_guide',
    'resume_init',
    'resume_read',
    'resume_write',
    'resume_check',
    'resume_render',
    'resume_metrics',
    'layout_validate',
    'template_list',
    'template_family_list',
    'template_validate',
    'template_generate',
    'template_save',
    'template_copy',
    'template_versions',
    'template_restore',
    'layout_save',
    'presentation_save',
    'template_autotune',
    'icon_list',
  ])

  const health = await server.request('tools/call', { name: 'mcp_health', arguments: {} })
  assert.equal(health.result.isError, undefined)
  const payload = JSON.parse(health.result.content[0].text)
  assert.equal(payload.healthy, true)
  assert.deepEqual(payload.capabilities, ['tools/list', 'tools/call'])

  const guide = await server.request('tools/call', { name: 'resume_guide', arguments: { topic: 'workflow' } })
  assert.equal(guide.result.isError, undefined)
  const guidePayload = JSON.parse(guide.result.content[0].text)
  assert.equal(guidePayload.guide, 'dsh-resume-workflow')
  assert.equal(guidePayload.version, '1.6.0')
  assert.match(guidePayload.contract, /简历业务主契约/)
  assert.ok(guidePayload.sections.workflow.some((step) => step.tools.includes('resume_check')))

  const priorities = await server.request('tools/call', { name: 'resume_guide', arguments: { topic: 'priorities' } })
  assert.equal(priorities.result.isError, undefined)
  const priorityPayload = JSON.parse(priorities.result.content[0].text)
  assert.ok(priorityPayload.sections.priorities.order.includes('目标岗位相关性与证据密度'))
  assert.match(priorityPayload.sections.priorities.conflictRule, /一页/)

  const budget = await server.request('tools/call', { name: 'resume_guide', arguments: { topic: 'contentBudget' } })
  assert.equal(budget.result.isError, undefined)
  const budgetPayload = JSON.parse(budget.result.content[0].text)
  assert.match(budgetPayload.sections.contentBudget.experience, /3–5/)

  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-mcp-'))
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }))

  const call = async (name, args = {}) => {
    const response = await server.request('tools/call', { name, arguments: args })
    assert.equal(response.result?.isError, undefined, `${name} failed: ${response.result?.content?.[0]?.text || 'unknown error'}`)
    return JSON.parse(response.result.content[0].text)
  }

  const initializedWorkspace = await call('resume_init', { rootDir: fixtureRoot })
  assert.ok(initializedWorkspace.created.includes('resume.md'))

  const templates = await call('template_list', { rootDir: fixtureRoot })
  assert.ok(templates.templates.some((template) => template.id === 'campus-standard'))
  const copied = await call('template_copy', { rootDir: fixtureRoot, sourceId: 'campus-standard', newId: 'mcp-test-template', name: 'MCP 测试模板' })
  assert.equal(copied.saved, true)
  assert.equal(copied.template.id, 'mcp-test-template')
  const copiedTemplate = await call('resume_read', { rootDir: fixtureRoot, path: 'templates/mcp-test-template.json' })
  const validated = await call('template_validate', { rootDir: fixtureRoot, templateJson: copiedTemplate.content })
  assert.equal(validated.valid, true)
  const savedPresentation = await call('presentation_save', {
    rootDir: fixtureRoot,
    templateId: 'mcp-test-template',
    layoutJson: JSON.stringify({ fontSize: 13.5, lineHeight: 1.5, sectionGap: 16, pageMargin: 38 }),
    iconTuningJson: JSON.stringify({ github: { scale: 1, offsetY: 0 } }),
  })
  assert.equal(savedPresentation.saved, true)

  const resumeContent = '# 测试候选人\n\n## 项目经历\n\n- 完成简历制作闭环测试\n'
  const saved = await call('resume_write', { rootDir: fixtureRoot, path: 'resume.md', content: resumeContent })
  assert.equal(saved.saved, true)

  const read = await call('resume_read', { rootDir: fixtureRoot, path: 'resume.md' })
  assert.equal(read.content, resumeContent)

  const checked = await call('resume_check', { rootDir: fixtureRoot })
  assert.equal(checked.resumePath, 'resume.md')
  assert.equal(checked.sections, 1)

  const rendered = await call('resume_render', { rootDir: fixtureRoot })
  assert.equal(rendered.previewPath, 'preview.html')
  assert.ok(rendered.bytes > 0)

  server.child.stdin.end()
  await once(server.child, 'close')
})

test('MCP render can register preview state and return shared browser metrics when hosted by DSH', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-mcp-runtime-'))
  try {
    const server = createResumeMcpServer({
      resolveRoot: () => fixtureRoot,
      onRendered: (rendered) => ({ registered: true, renderId: rendered.renderId }),
      resolveMetrics: ({ previewPath }) => ({ available: true, status: 'measured', previewPath, metrics: { pageCount: 1, fit: true } }),
    })
    const tool = (name) => server._registeredTools[name].handler
    await tool('resume_init')({})
    await tool('resume_write')({ path: 'resume.md', content: '# 测试候选人\n\n## 项目经历\n\n- 完成简历制作闭环测试\n' })

    const rendered = await tool('resume_render')({ resumePath: 'resume.md' })
    const renderedPayload = JSON.parse(rendered.content[0].text)
    assert.equal(renderedPayload.previewRuntime.registered, true)
    assert.equal(renderedPayload.previewRuntime.renderId, renderedPayload.renderId)

    const measured = await tool('resume_metrics')({ previewPath: 'preview.html' })
    const measuredPayload = JSON.parse(measured.content[0].text)
    assert.equal(measuredPayload.available, true)
    assert.equal(measuredPayload.metrics.pageCount, 1)
    assert.equal(measuredPayload.metrics.fit, true)
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true })
  }
})
