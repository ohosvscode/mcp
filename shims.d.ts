declare module '*.md' {
  type MarkdownString = string
  const content: MarkdownString
  export default content
}

declare interface MarkdownModule {
  readonly default?: string
}

declare interface ImportMetaEnv {
  /** The type of build, `BIN` for binary, `LIB` for library. */
  BUILD_TYPE: string
}
