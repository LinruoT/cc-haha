import { shouldUseChinese } from '../../utils/language.js'

export const GLOB_TOOL_NAME = 'Glob'

export const DESCRIPTION = shouldUseChinese()
  ? `- 快速文件模式匹配工具，适用于任何规模的代码库
- 支持 glob 模式，如 "**/*.js" 或 "src/**/*.ts"
- 返回匹配的文件路径，按修改时间排序
- 当你需要按名称模式查找文件时使用此工具
- 当你进行开放式搜索可能需要多轮 glob 和 grep 时，请改用 Agent 工具`
  : `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead`
