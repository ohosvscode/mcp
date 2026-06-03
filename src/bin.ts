#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server'
import cac from 'cac'
import { version } from '../package.json'
import { createArktsMcpServer } from './index'
import { uninstallArktsMcp, updateArktsMcp } from './installer'
import 'source-map-support/register'

const cli = cac('arkts-mcp')

cli
  .command('[root]', 'Start the arkTS MCP server.')
  .action(async () => {
    const server = await createArktsMcpServer()
    await server.connect(new StdioServerTransport())
  })

cli
  .command('update', 'Update the arkTS MCP server.')
  .option('--version <version>', 'Install a specific release version')
  .action(async (options: { version?: string }) => {
    await updateArktsMcp({ version: options.version })
  })

cli
  .command('uninstall', 'Uninstall the arkTS MCP server.')
  .action(async () => {
    await uninstallArktsMcp()
  })

cli.help()
cli.version(version)
cli.parse()
