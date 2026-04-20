import type { McpServer, StandardSchemaWithJSON, ToolAnnotations, ToolCallback } from '@modelcontextprotocol/server'
import type { Awaitable } from '@vstils/core'

export type InstallHook = (server: McpServer) => Awaitable<unknown>

export interface McpTool<OutputArgs extends StandardSchemaWithJSON = StandardSchemaWithJSON, InputArgs extends StandardSchemaWithJSON | undefined = undefined> {
  readonly name: string
  readonly title?: string
  readonly description?: string
  readonly inputSchema?: InputArgs
  readonly outputSchema?: OutputArgs
  readonly annotations?: ToolAnnotations
  readonly _meta?: Record<string, unknown>
  readonly execute: ToolCallback<InputArgs>
}

export interface ToolModule {
  readonly install?: InstallHook
  readonly default?: McpTool
}

// eslint-disable-next-line antfu/top-level-function
export const defineMcpTool = <
  OutputArgs extends StandardSchemaWithJSON = StandardSchemaWithJSON,
  InputArgs extends StandardSchemaWithJSON | undefined = undefined,
>(mcpTool: McpTool<OutputArgs, InputArgs>): McpTool<OutputArgs, InputArgs> => mcpTool
