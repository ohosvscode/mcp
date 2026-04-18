import type { SearchResult } from 'minisearch'
import type { InstallTool } from '../types'
import axios from 'axios'
import MiniSearch from 'minisearch'
import nodeJieba from 'nodejieba'
import z from 'zod'

export const install: InstallTool = (server) => {
  server.registerTool('searchHarmonyosGuidesCatalogs', {
    inputSchema: z.object({
      language: z.enum(['cn', 'en']),
      text: z.string(),
    }),
  }, async (ctx) => {
    const response = await requestCatalogTree(ctx.language)
    const flattenTree = response.value.catalogTreeList.map(toFlattenCatalogTree)
    const results = await searchCatalogTree(ctx.text, flattenTree.flat())
    console.error(results)
    return { content: [{ type: 'text', text: JSON.stringify(results) }] }
  })
}

export async function requestCatalogTree(language: 'cn' | 'en'): Promise<CatalogTreeResponse> {
  const response = await axios.post<unknown>('https://svc-drcn.developer.huawei.com/community/servlet/consumer/cn/documentPortal/getCatalogTree', {
    language,
    catalogName: 'harmonyos-guides',
    objectId: 'arkts-overview',
  })
  if (!isValidCatalogTreeResponse(response.data))
    throw new Error('Invalid catalog tree response')
  return response.data
}

export async function searchCatalogTree(text: string, flattenTree: FlattenCatalogTreeItem[]): Promise<SearchResult[]> {
  const miniSearch = new MiniSearch({
    fields: ['nodeName'],
    idField: 'nodeId',
    tokenize: text => nodeJieba.cut(text),
  })
  miniSearch.addAll(flattenTree)
  return miniSearch.search(text, {
    tokenize: text => nodeJieba.cut(text),
  })
}

interface CatalogTreeItem {
  nodeName?: string
  nodeId?: string
  labelNameCn?: string
  labelNameEn?: string
  children?: CatalogTreeItem[]
}

export interface FlattenCatalogTreeItem extends Omit<CatalogTreeItem, 'children'> {
  parentNodeId?: string
}

export function toFlattenCatalogTree(tree: CatalogTreeItem): FlattenCatalogTreeItem[] {
  const out: FlattenCatalogTreeItem[] = []
  function walk(node: CatalogTreeItem, parentNodeId?: string): void {
    const { children, ...rest } = node
    out.push(
      parentNodeId === undefined
        ? { ...rest }
        : { ...rest, parentNodeId },
    )
    for (const child of children ?? [])
      walk(child, rest.nodeId)
  }
  walk(tree)
  return out
}

interface CatalogTreeResponse {
  value: {
    catalogTreeList: CatalogTreeItem[]
  }
}

function isValidCatalogTreeResponse(tree: unknown): tree is CatalogTreeResponse {
  return typeof tree === 'object'
    && tree !== null
    && 'value' in tree
    && typeof tree.value === 'object'
    && tree.value !== null
    && 'catalogTreeList' in tree.value
    && Array.isArray(tree.value.catalogTreeList)
}
