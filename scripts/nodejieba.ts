import type { Plugin } from 'vite-plus'
import type { CopyEntry } from 'vite-plus/pack'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export interface NodeJiebaPluginApi {
  buildCopyConfig(dirs: string[]): CopyEntry[]
}

export function nodejieba(): Plugin<NodeJiebaPluginApi> {
  const require = createRequire(import.meta.url)
  const nodejiebaPath = path.dirname(require.resolve('nodejieba'))
  const copyOptions = [
    { from: 'build/Release/**/*.node', to: 'lib/nodejieba/build/Release' },
    { from: 'submodules/cppjieba/dict', to: 'lib/nodejieba/submodules/cppjieba' },
  ]

  return {
    name: 'local:nodejieba',
    api: {
      buildCopyConfig: (baseDirs: string[]) => {
        const copyConfig: CopyEntry[] = []

        for (const option of copyOptions) {
          for (const baseDir of baseDirs) {
            copyConfig.push({ from: path.resolve(nodejiebaPath, option.from), to: path.resolve(baseDir, option.to ?? 'dist') })
          }
        }

        return copyConfig
      },
    },
    transform: code => code.replace(/build\/Release\/nodejieba\.node/g, 'lib/nodejieba/build/Release/nodejieba.node')
      .replace(/\/submodules\/cppjieba\/dict\//g, 'lib/nodejieba/submodules/cppjieba/dict/'),
    writeBundle: (outputOptions) => {
      if (!outputOptions.dir) return
      if (!fs.existsSync(path.resolve(outputOptions.dir, 'lib'))) fs.mkdirSync(path.resolve(outputOptions.dir, 'lib'))
      fs.writeFileSync(path.resolve(outputOptions.dir, 'lib', 'README.md'), fs.readFileSync('scripts/LIB_BUILD.md'))
    },
  }
}
