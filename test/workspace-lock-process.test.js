import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const WORKER = path.resolve(TEST_DIR, '..', 'scripts', 'workspace-lock-worker.mjs')

function runWorker(root, label, logPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, root, label, '120', logPath], {
      cwd: path.resolve(TEST_DIR, '..'),
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`lock worker ${label} exited ${code}: ${stderr}`))
    })
  })
}

test('workspace lock serializes DSH and MCP writes across Node processes', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-resume-cross-process-lock-'))
  const logPath = path.join(root, 'events.log')
  const lockPath = `${root}.dsh-resume.lock`
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(lockPath, { recursive: true, force: true })
  })

  await Promise.all([
    runWorker(root, 'dsh', logPath),
    runWorker(root, 'mcp', logPath),
  ])

  const lines = (await fs.readFile(logPath, 'utf8')).trim().split(/\r?\n/)
  assert.equal(lines.length, 4)
  assert.ok(
    JSON.stringify(lines) === JSON.stringify(['start:dsh', 'end:dsh', 'start:mcp', 'end:mcp'])
      || JSON.stringify(lines) === JSON.stringify(['start:mcp', 'end:mcp', 'start:dsh', 'end:dsh']),
    `writes interleaved: ${lines.join(', ')}`,
  )
})
