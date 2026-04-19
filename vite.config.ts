import type { PackUserConfig } from 'vite-plus/pack'
import process from 'node:process'
import { defineConfig } from 'vite-plus'
import packageJson from './package.json' with { type: 'json' }
import { markdown } from './scripts/markdown'
import { nodejieba } from './scripts/nodejieba'

const baseCopyDir = ['.cache', 'target']
const markdownPlugin = markdown()
const nodejiebaPlugin = nodejieba()

export default defineConfig({
  staged: {
    '*': 'eslint --fix',
  },

  pack: [
    {
      entry: 'src/bin.ts',
      format: 'esm',
      minify: true,
      dts: false,
      env: { BUILD_TYPE: 'BIN' },
      plugins: [markdownPlugin],
      deps: {
        onlyBundle: false,
      },
    } satisfies PackUserConfig,
    {
      entry: 'src/index.ts',
      format: ['esm', 'cjs'],
      dts: true,
      env: { BUILD_TYPE: 'LIB' },
      plugins: [markdownPlugin],
      deps: {
        onlyBundle: false,
      },
    } satisfies PackUserConfig,
    process.argv.includes('--build-exe')
      ? ({
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
          plugins: [markdownPlugin, nodejiebaPlugin],
          copy: nodejiebaPlugin.api?.buildCopyConfig(baseCopyDir),
        } satisfies PackUserConfig)
      : undefined,
  ].filter(Boolean) as PackUserConfig[],
})
