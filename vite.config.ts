import type { PackUserConfig } from 'vite-plus/pack'
import process from 'node:process'
import { defineConfig } from 'vite-plus'
import packageJson from './package.json'

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
        minify: true,
        env: { BUILD_TYPE: 'EXE' },
        exe: {
          enabled: true,
          outDir: 'target',
          fileName: 'arkts-mcp',
        },
      } satisfies PackUserConfig
      : undefined,
  ].filter(Boolean) as PackUserConfig[],
})
