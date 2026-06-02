import type { Plugin } from 'vite-plus'
import fs from 'node:fs'
import path from 'node:path'

export function markdown(): Plugin {
  return {
    name: 'local:markdown',
    resolveId: (id, importer) => id.endsWith('.md') ? importer ? path.resolve(path.dirname(importer), id) : id : null,
    load: (id) => {
      if (!id.endsWith('.md')) return null
      const content = fs.readFileSync(id, 'utf-8')
      return `export default ${JSON.stringify(content)}`
    },
  }
}
