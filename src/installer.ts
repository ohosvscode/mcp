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
const JSDELIVR_GH = `https://fastly.jsdelivr.net/gh/${REPO}`
const JSDELIVR_API = `https://data.jsdelivr.com/v1/package/gh/${REPO}`
const RELEASE_ASSETS_DIR = 'release-assets'
const GIT_REF = 'main'
const REQUEST_HEADERS = {
  'User-Agent': 'arkts-mcp-installer',
}

interface JsdelivrPackageInfo {
  versions: string[]
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

function normalizeVersion(value: string) {
  return value.replace(/^v/, '').replace(/^@arkts\/mcp@/, '')
}

function assetDownloadUrl(version: string, assetName: string, gitRef = GIT_REF) {
  return `${JSDELIVR_GH}@${gitRef}/${RELEASE_ASSETS_DIR}/${assetName}`
}

async function fetchLatestVersion() {
  const response = await axios.get<JsdelivrPackageInfo>(JSDELIVR_API, { headers: REQUEST_HEADERS })
  const latest = response.data.versions?.[0]
  if (!latest) throw new Error('Failed to resolve the latest version from jsDelivr.')
  return latest
}

async function releaseAssetExists(url: string) {
  try {
    await axios.head(url, { headers: REQUEST_HEADERS })
    return true
  }
  catch {
    return false
  }
}

async function resolveReleaseAsset(platform: string, version?: string) {
  const resolvedVersion = version ? normalizeVersion(version) : await fetchLatestVersion()
  const assetName = `${platform}-${resolvedVersion}.zip`
  const refs = [GIT_REF, resolvedVersion, `v${resolvedVersion}`]

  for (const gitRef of refs) {
    const url = assetDownloadUrl(resolvedVersion, assetName, gitRef)
    if (await releaseAssetExists(url)) {
      return { version: resolvedVersion, assetName, url }
    }
  }

  throw new Error(`No release asset found for platform: ${platform} (version: ${resolvedVersion})`)
}

async function downloadWithProgress(url: string, destination: string) {
  const response = await axios.get(url, {
    responseType: 'stream',
    headers: REQUEST_HEADERS,
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
  const asset = await resolveReleaseAsset(platform, version)

  console.log(`Platform: ${platform}`)
  console.log(`Install directory: ${installDir}`)
  console.log(`Version: ${asset.version}`)
  console.log(`Asset: ${asset.assetName}`)

  await fsp.mkdir(installDir, { recursive: true })
  const zipPath = path.join(installDir, asset.assetName)
  await downloadWithProgress(asset.url, zipPath)

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

  return asset.version
}

export async function updateArktsMcp(options: UpdateOptions = {}) {
  const installDir = resolveInstallDirectory()
  const latestVersion = options.version ? normalizeVersion(options.version) : await fetchLatestVersion()

  if (!options.version && latestVersion === currentVersion) {
    console.log(`Already up to date (${currentVersion}).`)
    return
  }

  const nextVersion = await installRelease(installDir, options.version)
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
