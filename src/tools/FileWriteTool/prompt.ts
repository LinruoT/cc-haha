import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { shouldUseChinese } from '../../utils/language.js'
import { logForDebugging } from '../../utils/debug.js'

export const FILE_WRITE_TOOL_NAME = 'Write'

const isZh = shouldUseChinese()
logForDebugging(`[FileWriteTool] language=${isZh ? 'zh' : 'en'}`)

export const DESCRIPTION = isZh
  ? '将文件写入本地文件系统。'
  : 'Write a file to the local filesystem.'

function getPreReadInstruction(): string {
  if (shouldUseChinese()) {
    return `\n- 如果这是现有文件，你必须先使用 ${FILE_READ_TOOL_NAME} 工具读取文件内容。如果你没有先读取文件，此工具将失败。`
  }
  return `\n- If this is an existing file, you MUST use the ${FILE_READ_TOOL_NAME} tool first to read the file's contents. This tool will fail if you did not read the file first.`
}

export function getWriteToolDescription(): string {
  if (shouldUseChinese()) {
    return `将文件写入本地文件系统。

用法：
- 如果提供的路径存在现有文件，此工具将覆盖它。${getPreReadInstruction()}
- 修改现有文件时优先使用 Edit 工具 — 它只发送差异部分。仅在创建新文件或完全重写时使用此工具。
- 除非用户明确要求，否则不要创建文档文件（*.md）或 README 文件。
- 只有在用户明确要求时才使用表情符号。除非被要求，否则不要在文件中写入表情符号。`
  }

  return `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.${getPreReadInstruction()}
- Prefer the Edit tool for modifying existing files \u2014 it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`
}
