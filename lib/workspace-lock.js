import path from 'node:path'

// DSH runs multiple tool calls and browser requests in one Node process. A
// workspace-level queue prevents a save in one session from being interleaved
// with a render/template mutation in another session.
const queues = new Map()

function lockKey(root) {
  const normalized = path.normalize(root)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export async function withWorkspaceLock(root, task) {
  if (typeof task !== 'function') throw new TypeError('workspace lock task must be a function')
  const key = lockKey(root)
  const previous = queues.get(key) || Promise.resolve()
  let release
  const current = new Promise((resolve) => { release = resolve })
  queues.set(key, current)

  await previous
  try {
    return await task()
  } finally {
    release()
    if (queues.get(key) === current) queues.delete(key)
  }
}

export function activeWorkspaceLockCount() {
  return queues.size
}
