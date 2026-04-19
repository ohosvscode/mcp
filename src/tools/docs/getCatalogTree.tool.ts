import type { SearchResult } from 'minisearch'
import type { McpTool } from '../types'
import axios from 'axios'
import MiniSearch from 'minisearch'
import nodeJieba from 'nodejieba'
import z from 'zod'

const baseSchema = z.object({
  language: z.enum(['cn', 'en']),
})

export const install: McpTool = (server) => {
  server.registerTool(
    'getCatalogTree',
    {
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: z.union([
        baseSchema.extend({
          queryType: z.literal('search'),
          language: z.enum(['cn', 'en']),
          text: z.string(),
        }),
        baseSchema.extend({
          queryType: z.literal('get'),
          language: z.enum(['cn', 'en']),
        }),
      ]),
      outputSchema: z.object({
        catalogs: z.array(z.record(z.string(), z.unknown())),
      }),
    },
    async (input) => {
      switch (input.queryType) {
        case 'search': {
          const response = await requestCatalogTree(input.language)
          const flattenTree = response.value.catalogTreeList.map(toFlattenCatalogTree).flat()
          const results = await searchCatalogTree(input.text, flattenTree)
          const contents = results.map(result => flattenTree.find(item => item.nodeId === result.id))
          return { structuredContent: { catalogs: contents }, content: [] }
        }
        case 'get': {
          const response = await requestCatalogTree(input.language)
          const flattenTree = response.value.catalogTreeList.map(toFlattenCatalogTree).flat()
          return { structuredContent: { catalogs: flattenTree }, content: [] }
        }
        default: throw new Error('Invalid query type')
      }
    },
  )
}

export async function requestCatalogTree(language: 'cn' | 'en'): Promise<CatalogTreeResponse> {
  const response = await axios.post<unknown>(
    'https://svc-drcn.developer.huawei.com/community/servlet/consumer/cn/documentPortal/getCatalogTree',
    {
      language,
      catalogName: 'harmonyos-guides',
      objectId: 'arkts-overview',
    },
  )
  if (!isValidCatalogTreeResponse(response.data)) throw new Error('Invalid catalog tree response')
  return response.data
}

export async function searchCatalogTree(
  text: string,
  flattenTree: FlattenCatalogTreeItem[],
): Promise<SearchResult[]> {
  const miniSearch = new MiniSearch({
    fields: ['nodeName'],
    idField: 'nodeId',
    tokenize: text => nodeJieba.cut(text),
  })
  miniSearch.addAll(flattenTree)
  return miniSearch.search(text)
}

interface CatalogTreeItem {
  nodeName?: string
  nodeId?: string
  labelNameCn?: string
  labelNameEn?: string
  relateDocument?: string
  isLeaf?: boolean
  children?: CatalogTreeItem[]
}

export interface FlattenCatalogTreeItem extends Omit<CatalogTreeItem, 'children'> {
  parentNodeId?: string
}

export function toFlattenCatalogTree(tree: CatalogTreeItem): FlattenCatalogTreeItem[] {
  const out: FlattenCatalogTreeItem[] = []
  function walk(node: CatalogTreeItem, parentNodeId?: string): void {
    const { children, ...rest } = node
    out.push(parentNodeId === undefined ? { ...rest } : { ...rest, parentNodeId })
    for (const child of children ?? []) walk(child, rest.nodeId)
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
  return (
    typeof tree === 'object'
    && tree !== null
    && 'value' in tree
    && typeof tree.value === 'object'
    && tree.value !== null
    && 'catalogTreeList' in tree.value
    && Array.isArray(tree.value.catalogTreeList)
  )
}
