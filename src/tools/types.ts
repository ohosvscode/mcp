import type { McpServer } from '@modelcontextprotocol/server'
import type { Awaitable } from '@vstils/core'

export type McpTool = (server: McpServer) => Awaitable<unknown>
