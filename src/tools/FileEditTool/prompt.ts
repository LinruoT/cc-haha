import { isCompactLinePrefixEnabled } from '../../utils/file.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { shouldUseChinese } from '../../utils/language.js'

function getPreReadInstruction(): string {
  if (shouldUseChinese()) {
    return `\n- 你必须在编辑前至少使用一次 ${FILE_READ_TOOL_NAME} 工具。如果你尝试在没有读取文件的情况下进行编辑，此工具将报错。`
  }
  return `\n- You must use your \`${FILE_READ_TOOL_NAME}\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file. `
}

export function getEditToolDescription(): string {
  return getDefaultEditDescription()
}

function getDefaultEditDescription(): string {
  const prefixFormat = isCompactLinePrefixEnabled()
    ? 'line number + tab'
    : 'spaces + line number + arrow'
  const minimalUniquenessHint =
    process.env.USER_TYPE === 'ant'
      ? shouldUseChinese()
        ? `\n- 使用最小的明显唯一的 old_string — 通常 2-4 行相邻行就足够了。当更少的行能唯一标识目标时，避免包含 10+ 行上下文。`
        : `\n- Use the smallest old_string that's clearly unique — usually 2-4 adjacent lines is sufficient. Avoid including 10+ lines of context when less uniquely identifies the target.`
      : ''

  if (shouldUseChinese()) {
    return `在文件中执行精确的字符串替换。

用法：${getPreReadInstruction()}
- 编辑来自 Read 工具输出的文本时，确保保留行号前缀之后的精确缩进（制表符/空格）。行号前缀格式为：${prefixFormat}。之后的所有内容是要匹配的实际文件内容。永远不要在 old_string 或 new_string 中包含行号前缀的任何部分。
- **重要：正确处理制表符（\\t）**。Read 工具输出的行号前缀格式是 "行号:制表符"，冒号后的第一个制表符是分隔符，不属于文件内容。例如输出 "79:\\t\\t\\t// 注释" 表示文件内容是 2 个制表符 + "// 注释"，而不是 3 个。请仔细计算制表符数量。
- 始终优先编辑代码库中的现有文件。除非明确要求，否则不要写入新文件。
- 只有在用户明确要求时才使用表情符号。除非被要求，否则不要在文件中添加表情符号。
- 如果 old_string 在文件中不唯一，编辑将失败。提供更大的字符串和更多周围上下文以使其唯一，或使用 replace_all 更改 old_string 的每个实例。${minimalUniquenessHint}
- 使用 replace_all 在文件中替换和重命名字符串。如果你想重命名变量，此参数很有用。`
  }

  return `Performs exact string replacements in files.

Usage:${getPreReadInstruction()}
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: ${prefixFormat}. Everything after that is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- **Important: Handle tabs (\\t) correctly.** The Read tool output format is "line_number:tab", where the first tab after the colon is a separator and NOT part of the file content. For example, output "79:\\t\\t\\t// comment" means the file content has 2 tabs + "// comment", not 3. Count tabs carefully.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.${minimalUniquenessHint}
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`
}
