#!/usr/bin/env node
import process from 'node:process'
import { StdioServerTransport } from '@modelcontextprotocol/server'
import { createArktsMcpServer } from './index'
import 'source-map-support/register'

async function main(): Promise<void> {
  const server = await createArktsMcpServer()
  await server.connect(new StdioServerTransport())
}

main().catch((error) => {
  console.error('Fatal error in main():', error)
  process.exit(1)
})
