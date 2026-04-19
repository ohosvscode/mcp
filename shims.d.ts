declare module '*.md' {
  type MarkdownString = string
  const content: MarkdownString
  export default content
}
