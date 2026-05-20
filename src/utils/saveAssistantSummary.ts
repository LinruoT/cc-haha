import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getSessionId } from '../bootstrap/state.js'
import { getCwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import { logError } from './log.js'
import { formatTimestamp } from './format.js'
import { firstLineOf } from './stringUtils.js'
import { isEnvTruthy } from './envUtils.js'

function sanitizeForFilename(text: string, maxLength: number = 20): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength)
}

function extractFirstLine(text: string): string {
  const first = firstLineOf(text).trim()
  if (!first) return ''
  return first.replace(/^[\d.\-*]+\s*/, '').slice(0, 30)
}

export function getLastAssistantText(messages: { message: { content: Array<{ type: string; text?: string }> } }[]): string | null {
  const last = messages.at(-1)
  if (!last) return null
  const textBlocks = last.message.content.filter(b => b.type === 'text')
  const lastBlock = textBlocks.at(-1)
  if (lastBlock && 'text' in lastBlock && lastBlock.text?.trim()) {
    return lastBlock.text.trim()
  }
  return null
}

export async function saveAssistantSummaryAsMarkdown(
  lastAssistantText: string,
  outputDir?: string,
): Promise<string | null> {
  try {
    if (!lastAssistantText || lastAssistantText.trim().length === 0) {
      return null
    }

    const currentSessionId = getSessionId()
    const now = new Date()
    const timestamp = formatTimestamp(now)
    const firstLine = extractFirstLine(lastAssistantText)
    const sanitizedFirstLine = sanitizeForFilename(firstLine)

    const filename = sanitizedFirstLine
      ? `${currentSessionId}_${timestamp}_${sanitizedFirstLine}.md`
      : `${currentSessionId}_${timestamp}.md`

    const cwd = getCwd()
    const summariesDir = outputDir || join(cwd, '.claude', 'summaries')

    await mkdir(summariesDir, { recursive: true })

    const filepath = join(summariesDir, filename)
    const markdownContent = `# Assistant Summary

**Session ID**: ${currentSessionId}
**Timestamp**: ${now.toISOString()}

---

${lastAssistantText}
`

    await writeFile(filepath, markdownContent, 'utf-8')
    logForDebugging(`Saved assistant summary to: ${filepath}`)
    return filepath
  } catch (error) {
    logError(error as Error)
    logForDebugging(`Failed to save assistant summary: ${error}`)
    return null
  }
}

export function isAssistantSummarySavingEnabled(): boolean {
  if (process.env.CLAUDE_CODE_SAVE_ASSISTANT_SUMMARY !== undefined) {
    return isEnvTruthy(process.env.CLAUDE_CODE_SAVE_ASSISTANT_SUMMARY)
  }
  return false
}
