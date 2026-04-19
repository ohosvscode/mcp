import type { ToolModule } from './tools/types'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/server'
import { version } from '../package.json'
import description from './description.md'

export interface ArktsMcpServerOptions {
  iconPath?: string
}

export async function createArktsMcpServer(options: ArktsMcpServerOptions = {}): Promise<McpServer> {
  const server = new McpServer({
    name: '@arkts/mcp',
    version,
    description,
    icons: [{ src: options.iconPath || path.resolve(import.meta.dirname, 'assets/image.png'), mimeType: 'image/png' }],
  })

  // Lazy or eager load the tools
  if (import.meta.env.BUILD_TYPE === 'BIN') {
    const mods = Object.entries(import.meta.glob<ToolModule>('./tools/**/*.tool.{ts,md}', { eager: true }))
    for (const [path, mod] of mods) {
      installTools(path, mod, mods)
    }
  }
  else {
    const mods = Object.entries(import.meta.glob<ToolModule>('./tools/**/*.tool.{ts,md}'))
    for (const [path, mod] of mods) {
      if (path.endsWith('.md')) continue
      installTools(path, await mod(), mods)
    }
  }

  return server

  async function installTools(path: string, module: ToolModule, mods: [string, (() => Promise<ToolModule>) | ToolModule][]): Promise<void> {
    if (typeof module.default === 'object' && module.default !== null) {
      server.registerTool(module.default.name, {
        description: await findDescription(path, mods),
        ...module.default,
      }, module.default.execute)
    }
    module.install?.(server)
  }

  async function findDescription(path: string, mods: [string, (() => Promise<ToolModule | MarkdownModule>) | ToolModule | MarkdownModule][]): Promise<string | undefined> {
    for (const [currentPath, mod] of mods) {
      if (!currentPath.endsWith('.md')) continue
      if (currentPath.split('.')?.[0] !== path.split('.')?.[0]) continue
      const loadedMod = typeof mod === 'function' ? await mod() : mod
      return loadedMod.default as string
    }
  }
}
