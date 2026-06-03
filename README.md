# ArkTS MCP Server

面向 [ArkTS](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts) 的 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 服务器，可在 Cursor 等 AI 工具中提供 HarmonyOS / OpenHarmony 文档检索等能力。

## 功能

- 启动标准 MCP stdio 服务，供编辑器与 Agent 调用
- 提供 HarmonyOS 开发者文档目录检索工具 `docs_get_catalog_tree`
  - 支持中文 / 英文目录
  - 支持全文搜索与完整目录获取

## 安装

### 独立可执行文件（推荐）

安装脚本与 Release 压缩包均通过 [jsDelivr](https://www.jsdelivr.com/) 从 GitHub 仓库分发，无需 GitHub Token。

**macOS / Linux**

```bash
curl -fsSL https://fastly.jsdelivr.net/gh/ohosvscode/mcp@main/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://fastly.jsdelivr.net/gh/ohosvscode/mcp@main/install.ps1 | iex
```

安装脚本会：

1. 自动检测平台（`darwin-x64`、`darwin-arm64`、`linux-x64`、`linux-arm64`、`win-x64`、`win-arm64`）
2. 通过 jsDelivr Data API 解析最新版本
3. 从 `https://fastly.jsdelivr.net/gh/ohosvscode/mcp@main/release-assets/` 下载对应平台压缩包
4. 解压到当前目录
5. 注册全局命令 `arkts-mcp`

可选参数：

```bash
./install.sh --version 0.0.1-alpha.2
./install.sh --dir ~/apps/arkts-mcp --no-global
```

```powershell
.\install.ps1 -Version 0.0.1-alpha.2
.\install.ps1 -Dir "$env:LOCALAPPDATA\arkts-mcp" -NoGlobal
```

### npm

```bash
pnpm add -g @arkts/mcp
# 或
npx @arkts/mcp
```

## 在 Cursor 中使用

在 MCP 配置中加入 `arkts-mcp`：

```json
{
  "mcpServers": {
    "arkts": {
      "command": "arkts-mcp"
    }
  }
}
```

若使用 npm 安装且命令不在 PATH 中，可改为：

```json
{
  "mcpServers": {
    "arkts": {
      "command": "npx",
      "args": ["@arkts/mcp"]
    }
  }
}
```

本地开发时可指向构建产物：

```json
{
  "mcpServers": {
    "arkts": {
      "command": "node",
      "args": ["dist/bin.mjs"]
    }
  }
}
```

## CLI

| 命令 | 说明 |
| --- | --- |
| `arkts-mcp` | 启动 MCP 服务器（stdio） |
| `arkts-mcp update` | 更新到最新 Release |
| `arkts-mcp update --version <version>` | 更新到指定版本 |
| `arkts-mcp uninstall` | 卸载全局命令并删除安装文件 |
| `arkts-mcp --help` | 查看帮助 |
| `arkts-mcp --version` | 查看版本 |

`update` / `uninstall` 仅适用于通过 `install.sh` / `install.ps1` 安装的独立可执行文件。

## 开发

环境要求见 [package.json](./package.json) 中的 `packageManager` 与 [.node-version](./.node-version)。

```bash
pnpm install
pnpm build              # 构建 npm 包，输出到 dist/
pnpm build --build-exe  # 同时构建独立可执行文件，输出到 target/
pnpm test               # 运行测试
```

独立可执行文件构建完成后，产物位于 `target/`，包含：

- `arkts-mcp`（Windows 为 `arkts-mcp.exe`）
- `lib/`（原生依赖，如 nodejieba）
- `assets/`（如图标等资源）

## 许可证

[MIT](./LICENSE)
