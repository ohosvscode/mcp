## Setup & build

- Basic environment: See [package.json](package.json) `packageManager` field and [.node-version](.node-version) file.
- Install steps: `pnpm install`
- Build library: `pnpm build`, outDir is `dist`
- Build library and executable: `pnpm build --build-exe`, the executable outDir is `target`, binary name is `arkts-mcp`
  - Executable outDir is `target`
  - Executable binary name is `arkts-mcp`; if current platform is Windows, the binary name is `arkts-mcp.exe`
  - Must copy the `.node` dynamic library to the executable directory `target/lib`, and the assets (like [logo.png](target/assets/logo.png)) to the executable directory `target/assets`.

## About this mcp server

- This mcp server is for the ArkTS language. ArkTS is a programming language for the HarmonyOS/OpenHarmony platform, It is a superset of TypeScript.
