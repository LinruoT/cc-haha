/**
 * 降级风险警告模块
 * 当高阶工具失败后，检测Agent是否尝试使用低风险命令降级处理
 */

import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js'
import { BASH_TOOL_NAME } from '../tools/BashTool/toolName.js'
import type { ToolUseContext } from '../Tool.js'

/**
 * 降级风险检测结果
 */
export interface DowngradeRiskResult {
  /** 是否存在降级风险 */
  hasRisk: boolean
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high'
  /** 警告消息 */
  warningMessage?: string
  /** 建议的操作 */
  suggestedAction?: string
}

/**
 * 工具调用历史记录
 */
interface ToolCallRecord {
  toolName: string
  timestamp: number
  success: boolean
  filePath?: string
}

// 存储最近的工具调用历史（按会话隔离）
const recentToolCalls = new Map<string, ToolCallRecord[]>()

/**
 * 记录工具调用
 */
export function recordToolCall(
  sessionId: string,
  toolName: string,
  success: boolean,
  filePath?: string,
): void {
  if (!recentToolCalls.has(sessionId)) {
    recentToolCalls.set(sessionId, [])
  }
  
  const calls = recentToolCalls.get(sessionId)!
  calls.push({
    toolName,
    timestamp: Date.now(),
    success,
    filePath,
  })
  
  // 只保留最近50条记录
  if (calls.length > 50) {
    calls.splice(0, calls.length - 50)
  }
}

/**
 * 清除会话历史
 */
export function clearSessionHistory(sessionId: string): void {
  recentToolCalls.delete(sessionId)
}

/**
 * 检测降级风险
 * 当FileEditTool/FileWriteTool失败后，检测是否尝试使用sed/python等命令修改代码
 */
export function detectDowngradeRisk(
  sessionId: string,
  currentCommand: string,
  context?: ToolUseContext,
): DowngradeRiskResult {
  const calls = recentToolCalls.get(sessionId) || []
  
  // 查找最近失败的文件编辑工具调用
  const recentFailedEdits = calls.filter(
    call => 
      !call.success && 
      (call.toolName === FILE_EDIT_TOOL_NAME || call.toolName === FILE_WRITE_TOOL_NAME) &&
      Date.now() - call.timestamp < 60000 // 1分钟内
  )
  
  if (recentFailedEdits.length === 0) {
    return { hasRisk: false, riskLevel: 'low' }
  }
  
  // 检测当前命令是否是sed、python等代码修改命令
  const riskyCommands = [
    { pattern: /\bsed\b/i, name: 'sed' },
    { pattern: /\bawk\b/i, name: 'awk' },
    { pattern: /\bpython[23]?\b.*-c/i, name: 'python -c' },
    { pattern: /\bperl\b/i, name: 'perl' },
    { pattern: /\bnode\b.*-e/i, name: 'node -e' },
    { pattern: /\bsed\b.*-i/i, name: 'sed -i' },
    { pattern: /\btee\b/i, name: 'tee' },
    { pattern: /\bcat\b.*>/i, name: 'cat >' },
    { pattern: /\becho\b.*>/i, name: 'echo >' },
    { pattern: /\bprintf\b.*>/i, name: 'printf >' },
  ]
  
  for (const cmd of riskyCommands) {
    if (cmd.pattern.test(currentCommand)) {
      // 检查命令是否可能修改文件（包含重定向或-i标志）
      const mayModifyFile = 
        currentCommand.includes('>') || 
        currentCommand.includes('>>') || 
        currentCommand.includes('-i') ||
        currentCommand.includes('tee')
      
      if (mayModifyFile) {
        const failedEdit = recentFailedEdits[0]!
        const riskLevel = cmd.name.includes('sed') || cmd.name.includes('awk') ? 'high' : 'medium'
        
        return {
          hasRisk: true,
          riskLevel,
          warningMessage: `检测到降级风险：${cmd.name}命令可能用于修改代码。之前${failedEdit.toolName}工具调用失败。`,
          suggestedAction: `建议：1) 分析${failedEdit.toolName}失败的原因；2) 修复问题后重试专用工具；3) 如果必须使用${cmd.name}，请明确说明原因。`,
        }
      }
    }
  }
  
  return { hasRisk: false, riskLevel: 'low' }
}

/**
 * 生成降级风险警告消息
 */
export function formatDowngradeRiskWarning(result: DowngradeRiskResult): string {
  if (!result.hasRisk || !result.warningMessage) {
    return ''
  }
  
  let warning = '⚠️ 降级风险警告\n\n'
  warning += result.warningMessage + '\n\n'
  
  if (result.suggestedAction) {
    warning += result.suggestedAction + '\n'
  }
  
  warning += '\n注意：使用低级命令修改代码可能导致格式混乱、难以回滚的修改。建议优先使用专用工具。'
  
  return warning
}

/**
 * 检查是否应该阻止降级操作
 * 对于高风险操作，返回阻止消息
 */
export function shouldBlockDowngrade(result: DowngradeRiskResult): {
  blocked: boolean
  message?: string
} {
  if (!result.hasRisk) {
    return { blocked: false }
  }
  
  // 高风险操作（如sed -i）返回警告但不阻止
  // 这是软性警告机制，让用户决定是否继续
  if (result.riskLevel === 'high') {
    return {
      blocked: false, // 不阻止，但返回警告
      message: formatDowngradeRiskWarning(result),
    }
  }
  
  return { blocked: false }
}

/**
 * 重置模块状态（用于测试）
 */
export function resetDowngradeRiskState(): void {
  recentToolCalls.clear()
}
