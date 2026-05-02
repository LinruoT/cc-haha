import { isPDFSupported } from '../../utils/pdfUtils.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'
import { shouldUseChinese } from '../../utils/language.js'

// Use a string constant for tool names to avoid circular dependencies
export const FILE_READ_TOOL_NAME = 'Read'

export const FILE_UNCHANGED_STUB = shouldUseChinese()
  ? '文件自上次读取以来未更改。此对话中早期 Read 工具结果中的内容仍然有效——请参考该内容而不是重新读取。'
  : 'File unchanged since last read. The content from the earlier Read tool_result in this conversation is still current — refer to that instead of re-reading.'

export const MAX_LINES_TO_READ = 2000

export const DESCRIPTION = shouldUseChinese()
  ? '从本地文件系统读取文件。'
  : 'Read a file from the local filesystem.'

export const LINE_FORMAT_INSTRUCTION = shouldUseChinese()
  ? '- 结果使用 cat -n 格式返回，行号从 1 开始'
  : '- Results are returned using cat -n format, with line numbers starting at 1'

export const OFFSET_INSTRUCTION_DEFAULT = shouldUseChinese()
  ? '- 你可以选择指定行偏移量和限制（对于大文件特别有用），但建议不提供这些参数来读取整个文件'
  : "- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters"

export const OFFSET_INSTRUCTION_TARGETED = shouldUseChinese()
  ? '- 当你已经知道需要文件的哪一部分时，只读取该部分。这对于大文件很重要。'
  : '- When you already know which part of the file you need, only read that part. This can be important for larger files.'

/**
 * Renders the Read tool prompt template.  The caller (FileReadTool) supplies
 * the runtime-computed parts.
 */
export function renderPromptTemplate(
  lineFormat: string,
  maxSizeInstruction: string,
  offsetInstruction: string,
): string {
  if (shouldUseChinese()) {
    return `从本地文件系统读取文件。你可以使用此工具直接访问任何文件。
假设此工具能够读取机器上的所有文件。如果用户提供文件路径，假设该路径是有效的。读取不存在的文件是可以的；将返回错误。

用法：
- file_path 参数必须是绝对路径，不是相对路径
- 默认情况下，它从文件开头读取最多 ${MAX_LINES_TO_READ} 行${maxSizeInstruction}
${offsetInstruction}
${lineFormat}
- 此工具允许 Claude Code 读取图像（如 PNG、JPG 等）。读取图像文件时，内容以视觉方式呈现，因为 Claude Code 是多模态 LLM。${
      isPDFSupported()
        ? '\n- 此工具可以读取 PDF 文件（.pdf）。对于大型 PDF（超过 10 页），你必须提供 pages 参数来读取特定页面范围（例如 pages: "1-5"）。不使用 pages 参数读取大型 PDF 将失败。每次请求最多 20 页。'
        : ''
    }
- 此工具可以读取 Jupyter 笔记本（.ipynb 文件）并返回所有单元格及其输出，结合代码、文本和可视化。
- 此工具只能读取文件，不能读取目录。要读取目录，请通过 ${BASH_TOOL_NAME} 工具使用 ls 命令。
- 你会经常被要求读取截图。如果用户提供截图路径，请始终使用此工具查看该路径的文件。此工具适用于所有临时文件路径。
- 如果你读取一个存在但内容为空的文件，你将收到系统提醒警告代替文件内容。`
  }

  return `Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to ${MAX_LINES_TO_READ} lines starting from the beginning of the file${maxSizeInstruction}
${offsetInstruction}
${lineFormat}
- This tool allows Claude Code to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Claude Code is a multimodal LLM.${
    isPDFSupported()
      ? '\n- This tool can read PDF files (.pdf). For large PDFs (more than 10 pages), you MUST provide the pages parameter to read specific page ranges (e.g., pages: "1-5"). Reading a large PDF without the pages parameter will fail. Maximum 20 pages per request.'
      : ''
  }
- This tool can read Jupyter notebooks (.ipynb files) and returns all cells with their outputs, combining code, text, and visualizations.
- This tool can only read files, not directories. To read a directory, use an ls command via the ${BASH_TOOL_NAME} tool.
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot, ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.`
}
