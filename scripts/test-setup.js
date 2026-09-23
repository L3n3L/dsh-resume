import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Tests must never read or overwrite the developer's real DSH workspace
// binding. The production process still uses DSH_HOME when it is provided;
// this only scopes `pnpm test` to an isolated temporary user-data directory.
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-resume-test-home-'))
