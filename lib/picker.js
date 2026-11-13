/** Native multi-file picker for the drawing translator (Windows dialog). */
import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const SCRIPT = String.raw`Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '选择要翻译的文件'
$dialog.Multiselect = $true
$dialog.CheckFileExists = $true
$dialog.Filter = '可翻译文件 (*.pdf;*.dwg;*.docx)|*.pdf;*.dwg;*.docx|PDF 图纸 (*.pdf)|*.pdf|DWG 图纸 (*.dwg)|*.dwg|Word 文档 (*.docx)|*.docx|所有文件 (*.*)|*.*'
$dialog.RestoreDirectory = $true
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.WindowState = 'Minimized'
$owner.ShowInTaskbar = $false
$result = $dialog.ShowDialog($owner)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  $names = @($dialog.FileNames)
  Write-Output (ConvertTo-Json -InputObject $names -Compress)
} else {
  Write-Output '[]'
}
$owner.Dispose()
`

/** Open the Windows file dialog and return the selected absolute paths. */
export async function pickFiles({ timeoutMs = 300_000 } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-drawing-pick-'))
  const scriptPath = path.join(dir, 'pick.ps1')
  await fsp.writeFile(scriptPath, SCRIPT, 'utf8')
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', [
        '-NoProfile', '-STA', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      const out = []
      const err = []
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        try { child.kill() } catch { /* ignore */ }
        reject(new Error('文件选择超时，请改用面板内的文件浏览器'))
      }, timeoutMs)
      child.stdout.on('data', (chunk) => out.push(chunk))
      child.stderr.on('data', (chunk) => err.push(chunk))
      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error(`无法打开文件选择框：${error.message}`))
      })
      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const stdout = Buffer.concat(out).toString('utf8').replace(/^\uFEFF/, '').trim()
        const stderr = Buffer.concat(err).toString('utf8').trim()
        if (code !== 0 && !stdout) {
          reject(new Error(`文件选择框失败（退出码 ${code}）${stderr ? `：${stderr.split(/\r?\n/).slice(-2).join(' | ')}` : ''}`))
          return
        }
        try {
          const first = stdout.indexOf('[')
          const last = stdout.lastIndexOf(']')
          const text = first >= 0 && last > first ? stdout.slice(first, last + 1) : '[]'
          const parsed = JSON.parse(text)
          resolve(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [])
        } catch {
          reject(new Error('文件选择框返回了无法解析的内容'))
        }
      })
    })
  } finally {
    try { await fsp.rm(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
