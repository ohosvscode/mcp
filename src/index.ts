import type { McpTool } from './tools/types'
import { McpServer } from '@modelcontextprotocol/server'
import { version } from '../package.json'
import description from './description.md'

export async function createArktsMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: '@arkts/mcp',
    version,
    description,
  })

  if (import.meta.env.BUILD_TYPE === 'BIN') {
    await Promise.all(
      Object.entries(
        import.meta.glob<{ install: McpTool }>('./tools/**/*.tool.ts', { eager: true }),
      ).map(([_, mod]) => mod.install(server)),
    )
  }
  else {
    await Promise.all(
      Object.entries(import.meta.glob<{ install: McpTool }>('./tools/**/*.tool.ts')).map(
        ([_, mod]) => mod().then(tool => tool.install(server)),
      ),
    )
  }

  return server
}
