/**
 * 反思Agent定义
 * 用于分析工具调用失败原因并提供解决方案
 */

import { BASH_TOOL_NAME } from 'src/tools/BashTool/toolName.js'
import { FILE_READ_TOOL_NAME } from 'src/tools/FileReadTool/prompt.js'
import { FILE_EDIT_TOOL_NAME } from 'src/tools/FileEditTool/constants.js'
import { FILE_WRITE_TOOL_NAME } from 'src/tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from 'src/tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from 'src/tools/GrepTool/prompt.js'
import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'
import { saveToolExperience } from '../../../memdir/toolExperiences.js'

const REFLECTION_SYSTEM_PROMPT = `你是一个专门分析工具调用失败原因的专家Agent。你的任务是：

## 核心职责
1. 分析工具调用失败的根本原因
2. 识别失败模式和常见错误
3. 提供具体的解决方案和建议
4. 将分析结果保存到经验系统

## 分析流程

### 第一步：理解失败上下文
- 读取失败的工具调用参数
- 分析错误消息和堆栈跟踪
- 检查相关文件和环境状态

### 第二步：分类失败类型
将失败归类为以下类型之一：
- **input_validation**: 输入参数格式或类型错误
- **execution_error**: 工具执行过程中出错
- **permission_denied**: 权限不足
- **timeout**: 操作超时
- **environment**: 环境配置问题
- **logic**: 逻辑错误或不合理的操作

### 第三步：根因分析
使用以下工具进行深入分析：
- ${FILE_READ_TOOL_NAME}: 读取相关文件理解上下文
- ${GLOB_TOOL_NAME} 和 ${GREP_TOOL_NAME}: 搜索相关代码和配置
- ${BASH_TOOL_NAME}: 执行诊断命令（只读操作）

### 第四步：提供解决方案
针对每个问题提供：
1. 问题的详细描述
2. 根本原因分析
3. 具体的修复步骤
4. 预防措施建议

## 输出格式

\`\`\`
## 工具调用失败分析报告

### 失败概要
- 工具名称: [tool_name]
- 失败类型: [failure_type]
- 错误消息: [error_message]

### 根本原因
[详细的原因分析]

### 解决方案
1. [步骤1]
2. [步骤2]
...

### 预防措施
- [建议1]
- [建议2]
...

### 经验总结
[一句话总结，用于保存到经验系统]
\`\`\`

## 重要规则
1. 只进行只读分析，不要修改任何项目文件
2. 专注于诊断和建议，不要尝试自行修复
3. 使用中文进行分析和输出
4. 确保分析结果准确、具体、可操作`

/**
 * 反思Agent的whenToUse描述
 */
const REFLECTION_WHEN_TO_USE =
  '当工具调用失败时使用此Agent进行深入分析。特别是当：' +
  '1. 文件编辑工具（FileEditTool）失败后需要分析原因' +
  '2. Bash命令执行失败需要诊断' +
  '3. 遇到重复的工具调用错误' +
  '4. 需要理解复杂的错误消息' +
  '传递失败的工具名称、错误消息和相关上下文。'

/**
 * 反思Agent回调函数 - 用于保存分析结果到经验系统
 */
async function reflectionCallback(): Promise<void> {
  // 回调会在Agent完成时触发
  // 经验保存逻辑在Agent执行过程中通过saveToolExperience调用
  logForDebugging('[ReflectionAgent] 分析完成')
}

/**
 * 日志工具
 */
function logForDebugging(message: string, options?: { level?: string }): void {
  // 简单的日志实现
  if (options?.level === 'warn' || options?.level === 'error') {
    console.warn(message)
  }
}

/**
 * 反思Agent定义
 */
export const REFLECTION_AGENT: BuiltInAgentDefinition = {
  agentType: 'reflection',
  whenToUse: REFLECTION_WHEN_TO_USE,
  color: 'yellow',
  background: true,
  tools: [
    FILE_READ_TOOL_NAME,
    GLOB_TOOL_NAME,
    GREP_TOOL_NAME,
    BASH_TOOL_NAME,
  ],
  disallowedTools: [
    AGENT_TOOL_NAME,
    FILE_EDIT_TOOL_NAME,
    FILE_WRITE_TOOL_NAME,
  ],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'inherit',
  getSystemPrompt: () => REFLECTION_SYSTEM_PROMPT,
  callback: reflectionCallback,
  criticalSystemReminder_EXPERIMENTAL:
    '重要：这是一个分析任务。你不能修改项目文件。只进行只读分析和诊断。输出中文分析报告。',
}

/**
 * 创建反思Agent的提示词
 */
export function createReflectionPrompt(params: {
  toolName: string
  errorMessage: string
  toolInput?: Record<string, unknown>
  context?: string
}): string {
  const { toolName, errorMessage, toolInput, context } = params

  let prompt = `请分析以下工具调用失败的原因：

## 失败信息
- 工具名称: ${toolName}
- 错误消息: ${errorMessage}
`

  if (toolInput) {
    prompt += `
## 工具输入参数
\`\`\`json
${JSON.stringify(toolInput, null, 2)}
\`\`\`
`
  }

  if (context) {
    prompt += `
## 额外上下文
${context}
`
  }

  prompt += `
请按照你的分析流程，深入分析失败原因并提供解决方案。
分析完成后，请将关键发现保存到经验系统。`

  return prompt
}

/**
 * 从反思结果中提取经验并保存
 */
export async function saveReflectionExperience(params: {
  toolName: string
  modelName: string
  failureType: string
  analysisResult: string
}): Promise<void> {
  const { toolName, modelName, failureType, analysisResult } = params

  // 从分析结果中提取关键信息
  const experienceMatch = analysisResult.match(/### 经验总结\n(.+)/)
  const solutionMatch = analysisResult.match(/### 解决方案\n([\s\S]*?)(?=###|$)/)

  const suggestedSolution = solutionMatch 
    ? solutionMatch[1].trim().split('\n').slice(0, 3).join('; ')
    : '参考详细分析报告'

  const failureReason = experienceMatch 
    ? experienceMatch[1].trim()
    : `${toolName}调用失败`

  await saveToolExperience({
    toolName,
    modelName,
    failureType: failureType as any,
    failureReason,
    suggestedSolution,
    verified: true, // 反思Agent分析的经验标记为已验证
    tags: ['reflection', 'analyzed'],
  })
}
