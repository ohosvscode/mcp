/* eslint-disable no-console */
import type { Buffer } from 'node:buffer'
import child_process from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import axios from 'axios'
import { version as currentVersion } from '../package.json'

const REPO = 'ohosvscode/mcp'
const GITHUB_API = `https://api.github.com/repos/${REPO}`
const GITHUB_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'arkts-mcp-installer',
}

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  assets: GitHubReleaseAsset[]
}

export interface UpdateOptions {
  version?: string
}

function binaryName() {
  return process.platform === 'win32' ? 'arkts-mcp.exe' : 'arkts-mcp'
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    child_process.spawn(command, args, { stdio: 'inherit' })
      .on('error', reject)
      .on('close', code => code === 0 ? resolve() : reject(new Error(`Command failed: ${command} ${args.join(' ')}`)))
  })
}

function detectPlatform() {
  const { platform, arch } = process
  if (platform === 'darwin') {
    if (arch === 'x64') return 'darwin-x64'
    if (arch === 'arm64') return 'darwin-arm64'
  }
  if (platform === 'linux') {
    if (arch === 'x64') return 'linux-x64'
    if (arch === 'arm64') return 'linux-arm64'
  }
  if (platform === 'win32') {
    if (arch === 'x64') return 'win-x64'
    if (arch === 'arm64') return 'win-arm64'
  }
  throw new Error(`Unsupported platform: ${platform} ${arch}`)
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await axios.get<T>(url, { headers: GITHUB_HEADERS })
  return response.data
}

async function fetchRelease(version?: string): Promise<GitHubRelease> {
  if (!version) {
    try {
      return await fetchJson<GitHubRelease>(`${GITHUB_API}/releases/latest`)
    }
    catch {
      const releases = await fetchJson<GitHubRelease[]>(`${GITHUB_API}/releases?per_page=1`)
      const latest = releases[0]
      if (!latest) throw new Error('No releases found')
      return latest
    }
  }

  const normalized = version.replace(/^v/, '').replace(/^@arkts\/mcp@/, '')
  const candidates = [version, `v${normalized}`, `@arkts/mcp@${normalized}`]
  for (const candidate of candidates) {
    try {
      return await fetchJson<GitHubRelease>(`${GITHUB_API}/releases/tags/${candidate}`)
    }
    catch {
      continue
    }
  }
  throw new Error(`Release not found for version: ${version}`)
}

function normalizeVersion(tag: string) {
  return tag.replace(/^v/, '').replace(/^@arkts\/mcp@/, '')
}

function pickAsset(release: GitHubRelease, platform: string) {
  const pattern = new RegExp(`^${platform.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-.*\\.zip$`)
  const asset = release.assets.find(item => pattern.test(item.name))
  if (!asset) throw new Error(`No release asset found for platform: ${platform}`)
  return asset
}

async function downloadWithProgress(url: string, destination: string) {
  const response = await axios.get(url, {
    responseType: 'stream',
    headers: GITHUB_HEADERS,
  })
  const total = Number(response.headers['content-length'] ?? 0)
  let downloaded = 0

  process.stderr.write('Downloading...')
  response.data.on('data', (chunk: Buffer) => {
    downloaded += chunk.length
    if (total > 0) {
      const percent = Math.floor((downloaded / total) * 100)
      process.stderr.write(`\rDownloading... ${percent}%`)
    }
  })

  await pipeline(response.data, fs.createWriteStream(destination))
  process.stderr.write('\n')
}

async function extractArchive(zipPath: string, destination: string) {
  if (process.platform === 'win32') {
    const escapedZip = zipPath.replace(/'/g, '\'\'')
    const escapedDest = destination.replace(/'/g, '\'\'')
    await run('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${escapedZip}' -DestinationPath '${escapedDest}' -Force`,
    ])
    return
  }

  await run('unzip', ['-oq', zipPath, '-d', destination])
}

function resolveInstallDirectory() {
  const execPath = fs.realpathSync(process.execPath)
  const base = path.basename(execPath).toLowerCase()
  if (base === 'node' || base === 'node.exe') {
    throw new Error('This command is only supported for standalone installations installed via install.sh or install.ps1.')
  }
  return path.dirname(execPath)
}

function globalCommandPath() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'bin', binaryName())
  }
  return path.join(os.homedir(), '.local', 'bin', binaryName())
}

async function refreshGlobalCommand(installDir: string) {
  const binaryPath = path.join(installDir, binaryName())

  if (process.platform === 'win32') {
    await addWindowsInstallDirToPath(installDir)
    console.log(`Global command available: ${binaryName()}`)
    return
  }

  const linkPath = globalCommandPath()
  await fsp.mkdir(path.dirname(linkPath), { recursive: true })
  try {
    await fsp.unlink(linkPath)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await fsp.symlink(binaryPath, linkPath)
  console.log(`Global command installed: ${linkPath}`)
}

async function addWindowsInstallDirToPath(installDir: string) {
  const script = `
$installDir = '${installDir.replace(/'/g, '\'\'')}'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = @()
if ($userPath) { $entries = $userPath -split ';' | Where-Object { $_ -ne '' } }
if ($entries -notcontains $installDir) {
  $newPath = if ($userPath) { "$userPath;$installDir" } else { $installDir }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}
`
  await run('powershell', ['-NoProfile', '-Command', script])
}

async function removeWindowsInstallDirFromPath(installDir: string) {
  const script = `
$installDir = '${installDir.replace(/'/g, '\'\'')}'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) { return }
$entries = $userPath -split ';' | Where-Object { $_ -ne '' -and $_ -ne $installDir }
[Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')
`
  await run('powershell', ['-NoProfile', '-Command', script])
}

async function removeGlobalCommand(installDir: string) {
  if (process.platform === 'win32') {
    await removeWindowsInstallDirFromPath(installDir)
    console.log(`Removed install directory from user PATH: ${installDir}`)
    return
  }

  const linkPath = globalCommandPath()
  if (!fs.existsSync(linkPath)) return

  const binaryPath = path.join(installDir, binaryName())
  const linkTarget = fs.realpathSync(linkPath)
  if (linkTarget === binaryPath) {
    await fsp.unlink(linkPath)
    console.log(`Removed global command: ${linkPath}`)
  }
}

async function removeInstalledFiles(installDir: string) {
  const targets = [
    path.join(installDir, binaryName()),
    path.join(installDir, 'lib'),
    path.join(installDir, 'assets'),
  ]

  for (const target of targets) {
    await fsp.rm(target, { recursive: true, force: true })
    console.log(`Removed: ${target}`)
  }
}

async function installRelease(installDir: string, version?: string) {
  const platform = detectPlatform()
  const release = await fetchRelease(version)
  const asset = pickAsset(release, platform)

  console.log(`Platform: ${platform}`)
  console.log(`Install directory: ${installDir}`)
  console.log(`Asset: ${asset.name}`)

  await fsp.mkdir(installDir, { recursive: true })
  const zipPath = path.join(installDir, asset.name)
  await downloadWithProgress(asset.browser_download_url, zipPath)

  console.log('Extracting...')
  await extractArchive(zipPath, installDir)
  await fsp.rm(zipPath, { force: true })

  const binaryPath = path.join(installDir, binaryName())
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Expected binary not found after extraction: ${binaryPath}`)
  }
  if (process.platform !== 'win32') {
    await fsp.chmod(binaryPath, 0o755)
  }
}

export async function updateArktsMcp(options: UpdateOptions = {}) {
  const installDir = resolveInstallDirectory()
  const release = await fetchRelease(options.version)
  const nextVersion = normalizeVersion(release.tag_name)

  if (!options.version && nextVersion === currentVersion) {
    console.log(`Already up to date (${currentVersion}).`)
    return
  }

  await installRelease(installDir, options.version)
  await refreshGlobalCommand(installDir)

  console.log('')
  console.log(`Updated to ${nextVersion}.`)
  console.log(`Run: ${binaryName()} --help`)
}

export async function uninstallArktsMcp() {
  const installDir = resolveInstallDirectory()

  console.log(`Install directory: ${installDir}`)
  await removeGlobalCommand(installDir)
  await removeInstalledFiles(installDir)

  console.log('')
  console.log('Uninstallation complete.')
}
