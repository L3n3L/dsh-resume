import { spawn } from 'node:child_process'

function runPicker(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    const stdout = []
    const stderr = []
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('选择文件夹超时'))
    }, 120000)
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        const message = Buffer.concat(stderr).toString('utf8').trim()
        reject(Object.assign(new Error(message || `文件夹选择器退出（${code}）`), { code }))
        return
      }
      resolve(Buffer.concat(stdout).toString('utf8').trim() || null)
    })
  })
}

export async function pickWorkspaceDirectory(startDir = '') {
  if (process.platform === 'win32') {
    const script = [
      '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding',
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      '$dialog.Description = "选择简历工作区文件夹"',
      '$dialog.ShowNewFolderButton = $true',
      'if ($env:DSH_RESUME_PICKER_START -and (Test-Path -LiteralPath $env:DSH_RESUME_PICKER_START -PathType Container)) { $dialog.SelectedPath = $env:DSH_RESUME_PICKER_START }',
      'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) }',
    ].join('; ')
    // FolderBrowserDialog is a real GUI window. Hiding the child process can
    // also hide or background the dialog, leaving the plugin stuck on
    // "处理中…" while the picker is waiting for input.
    return runPicker('powershell.exe', ['-NoLogo', '-NoProfile', '-STA', '-Command', script], {
      windowsHide: false,
      env: { ...process.env, DSH_RESUME_PICKER_START: String(startDir || '') },
    })
  }

  if (process.platform === 'darwin') {
    try {
      return await runPicker('osascript', ['-e', 'POSIX path of (choose folder with prompt "选择简历工作区文件夹")'])
    } catch (error) {
      if (error?.code === 1) return null
      throw error
    }
  }

  for (const command of ['zenity', 'kdialog']) {
    try {
      return command === 'zenity'
        ? await runPicker(command, ['--file-selection', '--directory', '--title=选择简历工作区文件夹'])
        : await runPicker(command, ['--getexistingdirectory', String(startDir || '.')])
    } catch (error) {
      if (error?.code === 1) return null
      if (error?.code !== 'ENOENT') throw error
    }
  }
  throw new Error('当前系统没有可用的原生文件夹选择器；可在高级设置中输入路径。')
}
