import type { PackUserConfig } from 'vite-plus/pack'
import { createRequire } from 'node:module'
import path from 'node:path'
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
        copy: [
          {
            from: path.resolve(path.dirname(createRequire(import.meta.url).resolve('nodejieba')), 'build', 'Release', '**', '*'),
            to: 'target/build/Release',
          },
        ],
      } satisfies PackUserConfig
      : undefined,
  ].filter(Boolean) as PackUserConfig[],
})
