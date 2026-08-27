import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// DSH runs multiple tool calls and browser requests in one Node process. A
// workspace-level queue prevents a save in one session from being interleaved
// with a render/template mutation in another session. The adjacent directory
// lock extends the same protection across the DSH and MCP Node processes.
const queues = new Map()
const DISK_LOCK_SUFFIX = '.dsh-resume.lock'
const RETRY_MS = 35
const STALE_LOCK_MS = 10 * 60 * 1000

function lockKey(root) {
  const normalized = path.normalize(root)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function diskLockPath(root) {
  return `${path.normalize(root)}${DISK_LOCK_SUFFIX}`
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function removeStaleDiskLock(lockPath) {
  let stat
  try {
    stat = await fs.stat(lockPath)
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }

  let owner = null
  try {
    owner = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') throw error
  }

  const oldEnough = Date.now() - stat.mtimeMs > STALE_LOCK_MS
  if (!oldEnough || (owner && processIsAlive(Number(owner.pid)))) return false
  await fs.rm(lockPath, { recursive: true, force: true })
  return true
}

async function acquireDiskLock(root) {
  const lockPath = diskLockPath(root)
  await fs.mkdir(path.dirname(lockPath), { recursive: true })
  const owner = { pid: process.pid, token: randomUUID(), acquiredAt: new Date().toISOString() }

  while (true) {
    try {
      await fs.mkdir(lockPath)
      try {
        await fs.writeFile(path.join(lockPath, 'owner.json'), JSON.stringify(owner), 'utf8')
      } catch (error) {
        await fs.rm(lockPath, { recursive: true, force: true }).catch(() => {})
        throw error
      }
      return async () => {
        try {
          const current = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf8'))
          if (current.token !== owner.token) return
        } catch (error) {
          if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') throw error
        }
        await fs.rm(lockPath, { recursive: true, force: true })
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      await removeStaleDiskLock(lockPath)
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
    }
  }
}

export async function withWorkspaceLock(root, task) {
  if (typeof task !== 'function') throw new TypeError('workspace lock task must be a function')
  const key = lockKey(root)
  const previous = queues.get(key) || Promise.resolve()
  let release
  const current = new Promise((resolve) => { release = resolve })
  queues.set(key, current)

  await previous
  const releaseDiskLock = await acquireDiskLock(root)
  try {
    return await task()
  } finally {
    try {
      await releaseDiskLock()
    } finally {
      release()
      if (queues.get(key) === current) queues.delete(key)
    }
  }
}

export function activeWorkspaceLockCount() {
  return queues.size
}
