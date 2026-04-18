import type { CopyEntry, PackUserConfig } from 'vite-plus/pack'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { defineConfig } from 'vite-plus'
import packageJson from './package.json'

const require = createRequire(import.meta.url)
const nodejieba = path.dirname(require.resolve('nodejieba'))
const baseCopyDir = ['.cache', 'target']

export default defineConfig({
  pack: [
    {
      entry: 'src/bin.ts',
      format: 'cjs',
      minify: true,
      dts: false,
      env: { BUILD_TYPE: 'BIN' },
      deps: {
        alwaysBundle: Object.keys(packageJson.dependencies).map(dep => new RegExp(`^${dep}`)),
        onlyBundle: false,
      },
    } satisfies PackUserConfig,
    {
      entry: 'src/index.ts',
      format: ['esm', 'cjs'],
      dts: true,
      env: { BUILD_TYPE: 'LIB' },
    } satisfies PackUserConfig,
    process.argv.includes('--build-exe')
      ? {
        entry: 'src/bin.ts',
        format: 'cjs',
        outDir: '.cache',
        // Use BIN here so the Rolldown graph matches dist/bin.cjs. EXE previously produced a
        // lazy-init Zod layout that broke @modelcontextprotocol/server's module-scope z.url().
        env: { BUILD_TYPE: 'BIN' },
        deps: {
          alwaysBundle: Object.keys(packageJson.dependencies).map(dep => new RegExp(`^${dep}`)),
          onlyBundle: false,
        },
        exe: {
          enabled: true,
          outDir: 'target',
          fileName: 'arkts-mcp',
        },
        copy: buildCopyConfig([
          { from: path.resolve(nodejieba, 'build', 'Release', '**', '*.node'), to: 'build/Release' },
          { from: path.resolve(nodejieba, 'submodules', 'cppjieba', 'dict'), to: 'submodules/cppjieba' },
        ]),
      } satisfies PackUserConfig
      : undefined,
  ].filter(Boolean) as PackUserConfig[],
})

function buildCopyConfig(options: CopyEntry[]): CopyEntry[] {
  const copyConfig: CopyEntry[] = []

  for (const option of options) {
    for (const baseDir of baseCopyDir) {
      copyConfig.push({ from: option.from, to: path.resolve(baseDir, option.to ?? 'dist') })
    }
  }

  return copyConfig
}
