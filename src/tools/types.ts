import type { McpServer, StandardSchemaWithJSON, ToolCallback } from '@modelcontextprotocol/server'
import type { Awaitable } from '@vstils/core'

export type InstallHook = (server: McpServer) => Awaitable<unknown>

export interface McpTool<OutputArgs extends StandardSchemaWithJSON = StandardSchemaWithJSON, InputArgs extends StandardSchemaWithJSON | undefined = undefined> {
  readonly name: string
  readonly description?: string
  readonly inputSchema?: InputArgs
  readonly outputSchema?: OutputArgs
  readonly execute: ToolCallback<InputArgs>
}

export interface ToolModule {
  readonly install?: InstallHook
  readonly default?: McpTool
}

export function defineMcpTool<OutputArgs extends StandardSchemaWithJSON = StandardSchemaWithJSON, InputArgs extends StandardSchemaWithJSON | undefined = undefined>(mcpTool: McpTool<OutputArgs, InputArgs>): McpTool<OutputArgs, InputArgs> {
  return mcpTool
}
