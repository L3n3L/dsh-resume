import fs from 'node:fs/promises'

import { withWorkspaceLock } from '../lib/workspace-lock.js'

const root = process.argv[2]
const label = process.argv[3]
const holdMs = Number(process.argv[4] || 100)
const logPath = process.argv[5]

if (!root || !label || !logPath) throw new Error('root, label, and logPath are required')

await withWorkspaceLock(root, async () => {
  await fs.appendFile(logPath, `start:${label}\n`, 'utf8')
  await new Promise((resolve) => setTimeout(resolve, holdMs))
  await fs.appendFile(logPath, `end:${label}\n`, 'utf8')
})
