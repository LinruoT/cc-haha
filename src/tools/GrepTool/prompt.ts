import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'
import { shouldUseChinese } from '../../utils/language.js'

export const GREP_TOOL_NAME = 'Grep'

export function getDescription(): string {
  if (shouldUseChinese()) {
    return `基于 ripgrep 构建的强大搜索工具

  用法：
  - 始终使用 ${GREP_TOOL_NAME} 进行搜索任务。永远不要将 \`grep\` 或 \`rg\` 作为 ${BASH_TOOL_NAME} 命令调用。${GREP_TOOL_NAME} 工具已针对正确的权限和访问进行了优化。
  - 支持完整的正则表达式语法（例如 "log.*Error"、"function\\s+\\w+"）
  - 使用 glob 参数（如 "*.js"、"**/*.tsx"）或 type 参数（如 "js"、"py"、"rust"）过滤文件
  - 输出模式："content" 显示匹配行，"files_with_matches" 仅显示文件路径（默认），"count" 显示匹配计数
  - 对于需要多轮搜索的开放式搜索，使用 ${AGENT_TOOL_NAME} 工具
  - 模式语法：使用 ripgrep（不是 grep）— 字面量花括号需要转义（使用 \`interface\\{\\}\` 在 Go 代码中查找 \`interface{}\`）
  - 多行匹配：默认情况下模式仅在单行内匹配。对于跨行模式如 \`struct \\{[\\s\\S]*?field\`，使用 \`multiline: true\`
`
  }
  return `A powerful search tool built on ripgrep

  Usage:
  - ALWAYS use ${GREP_TOOL_NAME} for search tasks. NEVER invoke \`grep\` or \`rg\` as a ${BASH_TOOL_NAME} command. The ${GREP_TOOL_NAME} tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Use ${AGENT_TOOL_NAME} tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true\`
`
}
