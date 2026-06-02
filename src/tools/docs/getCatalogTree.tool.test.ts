import { requestCatalogTree, searchCatalogTree, toFlattenCatalogTree } from './getCatalogTree.tool'

describe('getCatalogTreeTool', () => {
  it('should request and search catalog tree', async () => {
    const response = await requestCatalogTree('cn')
    const flattenTree = response.value.catalogTreeList.map(toFlattenCatalogTree).flat()
    const results = await searchCatalogTree('管理Web组件', flattenTree)
    for (const result of results) {
      const item = flattenTree.find(item => item.nodeId === result.id)
      expect(item).toBeDefined()
    }
  })
})
