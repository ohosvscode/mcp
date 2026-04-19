import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = 'target'
const maxDepth = 3

function printTree(dir: string, prefix: string, depth: number) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  }
  catch {
    return
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  entries.forEach((ent, i) => {
    const isLast = i === entries.length - 1
    const branch = isLast ? '└── ' : '├── '
    console.log(prefix + branch + ent.name)
    if (ent.isDirectory() && depth < maxDepth) {
      const next = prefix + (isLast ? '    ' : '│   ')
      printTree(path.join(dir, ent.name), next, depth + 1)
    }
  })
}

try {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.log('No target directory')
    process.exit(0)
  }
}
catch {
  console.log('No target directory')
  process.exit(0)
}

console.log(root)
printTree(path.resolve(root), '', 0)
