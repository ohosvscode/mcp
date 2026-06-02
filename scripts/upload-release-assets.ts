import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
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

function resolveReleaseMeta() {
  const raw = process.env.PUBLISHED_PACKAGES ?? '[]'
  const publishedPackages = JSON.parse(raw) as PublishedPackage[]
  if (!Array.isArray(publishedPackages) || publishedPackages.length === 0) {
    throw new Error('No published packages returned by changesets/action')
  }
  const pkg = publishedPackages.find(item => item.name === '@arkts/mcp') ?? publishedPackages[0]
  const version = pkg.version
  const tagName = `${pkg.name}@${pkg.version}`
  return { version, tagName }
}

async function main() {
  const artifactsDir = resolve(process.env.ARTIFACTS_DIR ?? 'artifacts')
  const releaseAssetsDir = resolve(process.env.RELEASE_ASSETS_DIR ?? 'release-assets')
  const { version, tagName } = resolveReleaseMeta()

  await run('mkdir', ['-p', releaseAssetsDir])

  const entries = await readdir(artifactsDir, { withFileTypes: true })
  const artifactDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
  if (artifactDirs.length === 0) {
    throw new Error(`No artifact directories found in ${artifactsDir}`)
  }

  for (const artifactName of artifactDirs) {
    const artifactPath = join(artifactsDir, artifactName)
    const zipPath = join(releaseAssetsDir, `${artifactName}-${version}.zip`)
    await run('zip', ['-r', zipPath, '.'], { cwd: artifactPath })
  }

  await run('gh', ['release', 'upload', tagName, `${releaseAssetsDir}/*.zip`, '--clobber'], {
    shell: true,
  })
}

await main()
