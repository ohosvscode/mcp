import type { ToolModule } from './tools/types'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/server'
import { version } from '../package.json'
import description from './description.md'

export interface ArktsMcpServerOptions {
  /**
   * Path to a custom icon for the MCP server. Should be a PNG file. If not provided, the default logo will be used.
   */
  iconPath?: string
}

export async function createArktsMcpServer(options: ArktsMcpServerOptions = {}): Promise<McpServer> {
  const server = new McpServer({
    name: '@arkts/mcp',
    version,
    description,
    icons: [{ src: options.iconPath || path.resolve(import.meta.dirname, 'assets/logo.png'), mimeType: 'image/png' }],
  })

  // Lazy or eager load the tools
  if (import.meta.env.BUILD_TYPE === 'BIN') {
    const mods = Object.entries(import.meta.glob<ToolModule>('./tools/**/*.tool.{ts,md}', { eager: true }))
    await Promise.all(mods.map(async ([path, mod]) => /* @__PURE__ */ await installTools(path, mod, mods)))
  }
  else {
    const mods = Object.entries(import.meta.glob<ToolModule>('./tools/**/*.tool.{ts,md}'))
    await Promise.all(mods.map(async ([path, mod]) => /* @__PURE__ */ await installTools(path, await mod(), mods)))
  }

  return server

  async function installTools(path: string, module: ToolModule, mods: [string, (() => Promise<ToolModule>) | ToolModule][]): Promise<void> {
    if (typeof module.default === 'object' && module.default !== null) {
      const description = await findDescription(path, mods)
      const title = await findTitle(description ?? '')

      server.registerTool(module.default.name, {
        title,
        description,
        ...module.default,
      }, module.default.execute)
    }
    await module.install?.(server)
  }

  async function findDescription(path: string, mods: [string, (() => Promise<ToolModule | MarkdownModule>) | ToolModule | MarkdownModule][]): Promise<string | undefined> {
    for (const [currentPath, mod] of mods) {
      if (!currentPath.endsWith('.md')) continue
      if (currentPath.split('.')?.[0] !== path.split('.')?.[0]) continue
      const loadedMod = typeof mod === 'function' ? await mod() : mod
      return loadedMod.default as string
    }
  }

  async function findTitle(description: string): Promise<string | undefined> {
    const maybeTitle = description.trim().split('\n')?.[0]
    if (maybeTitle?.startsWith('# ')) return maybeTitle.slice(2)
    return undefined
  }
}
