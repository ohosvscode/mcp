import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

type RunOptions = Parameters<typeof spawn>[2]

interface PublishedPackage {
  name: string
  version: string
}

function run(command: string, args: string[], options: RunOptions = {}) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(new Error(`Command failed: ${command} ${args.join(' ')}`))
    })
  })
}

function runJson<T>(command: string, args: string[], options: RunOptions = {}) {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    let stdout = ''
    let stderr = ''
    const child = spawn(command, args, { ...options })
    child.stdout?.on('data', chunk => (stdout += String(chunk)))
    child.stderr?.on('data', chunk => (stderr += String(chunk)))
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) {
        try {
          resolvePromise(JSON.parse(stdout) as T)
        }
        catch (error) {
          rejectPromise(new Error(`Failed to parse JSON output: ${String(error)}`))
        }
        return
      }
      rejectPromise(new Error(`Command failed: ${command} ${args.join(' ')}\n${stderr}`))
    })
  })
}

function resolveReleaseMeta() {
  const raw = process.env.PUBLISHED_PACKAGES ?? '[]'
  const publishedPackages = JSON.parse(raw) as PublishedPackage[]
  if (!Array.isArray(publishedPackages) || publishedPackages.length === 0) {
    throw new Error('No published packages returned by changesets/action')
  }
  const pkg = publishedPackages.find(item => item.name === '@arkts/mcp') ?? publishedPackages[0]
  const version = pkg.version
  const packageTag = `${pkg.name}@${pkg.version}`
  const versionTag = `v${pkg.version}`
  return { version, packageTag, versionTag }
}

async function resolveExistingReleaseTag(packageTag: string, versionTag: string): Promise<string> {
  const releases = await runJson<Array<{ tagName: string }>>('gh', ['release', 'list', '--limit', '100', '--json', 'tagName'])
  const tagSet = new Set(releases.map(item => item.tagName))
  if (tagSet.has(packageTag)) return packageTag
  if (tagSet.has(versionTag)) return versionTag
  throw new Error(`Could not find a GitHub release for tags: ${packageTag}, ${versionTag}`)
}

async function main() {
  const artifactsDir = path.resolve(process.env.ARTIFACTS_DIR ?? 'artifacts')
  const releaseAssetsDir = path.resolve(process.env.RELEASE_ASSETS_DIR ?? 'release-assets')
  const { version, packageTag, versionTag } = resolveReleaseMeta()

  await fs.mkdir(releaseAssetsDir, { recursive: true })

  const entries = await fs.readdir(artifactsDir, { withFileTypes: true })
  const artifactDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
  if (artifactDirs.length === 0) {
    throw new Error(`No artifact directories found in ${artifactsDir}`)
  }

  for (const artifactName of artifactDirs) {
    const artifactPath = path.join(artifactsDir, artifactName)
    const zipPath = path.join(releaseAssetsDir, `${artifactName}-${version}.zip`)
    await run('zip', ['-r', zipPath, '.'], { cwd: artifactPath })
  }

  const releaseTag = await resolveExistingReleaseTag(packageTag, versionTag)
  const zippedAssets = (await fs.readdir(releaseAssetsDir))
    .filter(file => file.endsWith('.zip'))
    .map(file => path.join(releaseAssetsDir, file))
  if (zippedAssets.length === 0) {
    throw new Error(`No zip assets generated in ${releaseAssetsDir}`)
  }

  await run('gh', ['release', 'upload', releaseTag, ...zippedAssets, '--clobber'])
}

await main()
