/**
 * 工具经验管理模块
 * 实现模型相关的工具调用失败经验存储和检索
 */

import { join } from 'path'
import { getFsImplementation } from '../utils/fsOperations.js'
import { logForDebugging } from '../utils/debug.js'
import { logEvent } from '../services/analytics/index.js'
import { getAutoMemPath } from './paths.js'
import { getInitialSettings } from '../utils/settings/settings.js'

/**
 * 工具经验条目接口
 */
export interface ToolExperience {
  /** 经验ID */
  id: string
  /** 工具名称 */
  toolName: string
  /** 模型名称 */
  modelName: string
  /** 失败类型 */
  failureType: 'input_validation' | 'execution_error' | 'permission_denied' | 'timeout' | 'other'
  /** 失败原因描述 */
  failureReason: string
  /** 错误消息 */
  errorMessage?: string
  /** 建议的解决方案 */
  suggestedSolution: string
  /** 是否已验证有效 */
  verified: boolean
  /** 创建时间 */
  createdAt: string
  /** 最后使用时间 */
  lastUsedAt?: string
  /** 使用次数 */
  useCount: number
  /** 标签 */
  tags: string[]
}

/**
 * 经验配置接口
 */
export interface ToolExperienceConfig {
  /** 是否启用工具经验系统 */
  enabled: boolean
  /** 经验目录路径 */
  directory?: string
  /** 最大经验条目数 */
  maxEntries?: number
  /** 是否自动提取经验 */
  autoExtract?: boolean
  /** 模型特定配置 */
  modelConfigs?: Record<string, {
    enabled?: boolean
    directory?: string
  }>
}

/**
 * 默认经验配置
 */
const DEFAULT_CONFIG: ToolExperienceConfig = {
  enabled: true,
  maxEntries: 1000,
  autoExtract: true,
}

/**
 * 获取工具经验目录路径
 */
export function getToolExperiencePath(modelName?: string): string {
  const settings = getInitialSettings()
  const config = (settings as any).toolExperience as ToolExperienceConfig | undefined
  
  // 检查是否启用
  if (config?.enabled === false) {
    return ''
  }

  // 检查模型特定配置
  if (modelName && config?.modelConfigs?.[modelName]) {
    const modelConfig = config.modelConfigs[modelName]
    if (modelConfig.enabled === false) {
      return ''
    }
    if (modelConfig.directory) {
      return modelConfig.directory
    }
  }

  // 使用配置的目录或默认目录
  if (config?.directory) {
    return config.directory
  }

  // 默认使用记忆目录下的tool-experiences子目录
  const baseDir = getAutoMemPath()
  return modelName 
    ? join(baseDir, 'tool-experiences', modelName)
    : join(baseDir, 'tool-experiences')
}

/**
 * 确保经验目录存在
 */
export async function ensureExperienceDirExists(dirPath: string): Promise<void> {
  if (!dirPath) return
  
  const fs = getFsImplementation()
  try {
    await fs.mkdir(dirPath, { recursive: true })
  } catch (e) {
    const code = e instanceof Error && 'code' in e && typeof e.code === 'string' ? e.code : undefined
    logForDebugging(
      `ensureExperienceDirExists failed for ${dirPath}: ${code ?? String(e)}`,
      { level: 'debug' },
    )
  }
}

/**
 * 生成经验ID
 */
function generateExperienceId(): string {
  return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 保存工具经验
 */
export async function saveToolExperience(experience: Omit<ToolExperience, 'id' | 'createdAt' | 'useCount'>): Promise<string | null> {
  const experiencePath = getToolExperiencePath(experience.modelName)
  if (!experiencePath) return null

  const fs = getFsImplementation()
  await ensureExperienceDirExists(experiencePath)

  const id = generateExperienceId()
  const fullExperience: ToolExperience = {
    ...experience,
    id,
    createdAt: new Date().toISOString(),
    useCount: 0,
  }

  const filePath = join(experiencePath, `${id}.json`)
  
  try {
    await fs.writeFile(filePath, JSON.stringify(fullExperience, null, 2), 'utf-8')
    
    logEvent('tengu_tool_experience_saved', {
      toolName: experience.toolName,
      modelName: experience.modelName,
      failureType: experience.failureType,
    })

    return id
  } catch (e) {
    logForDebugging(
      `Failed to save tool experience: ${e}`,
      { level: 'warn' },
    )
    return null
  }
}

/**
 * 读取单个工具经验
 */
export async function readToolExperience(filePath: string): Promise<ToolExperience | null> {
  const fs = getFsImplementation()
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as ToolExperience
  } catch {
    return null
  }
}

/**
 * 获取指定模型的所有工具经验
 */
export async function getToolExperiences(modelName?: string): Promise<ToolExperience[]> {
  const experiencePath = getToolExperiencePath(modelName)
  if (!experiencePath) return []

  const fs = getFsImplementation()
  try {
    // 检查目录是否存在
    try {
      await fs.access(experiencePath)
    } catch {
      return []
    }

    const files = await fs.readdir(experiencePath)
    const experiences: ToolExperience[] = []

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      
      const filePath = join(experiencePath, file)
      const experience = await readToolExperience(filePath)
      if (experience) {
        experiences.push(experience)
      }
    }

    return experiences
  } catch (e) {
    logForDebugging(
      `Failed to read tool experiences: ${e}`,
      { level: 'warn' },
    )
    return []
  }
}

/**
 * 根据工具名称和失败类型检索相关经验
 */
export async function findRelevantExperiences(
  toolName: string,
  failureType: string,
  modelName?: string,
): Promise<ToolExperience[]> {
  const experiences = await getToolExperiences(modelName)
  
  return experiences.filter(exp => 
    exp.toolName === toolName && 
    exp.failureType === failureType &&
    exp.verified
  ).sort((a, b) => b.useCount - a.useCount)
}

/**
 * 更新经验使用次数
 */
export async function updateExperienceUsage(experienceId: string, modelName?: string): Promise<void> {
  const experiencePath = getToolExperiencePath(modelName)
  if (!experiencePath) return

  const filePath = join(experiencePath, `${experienceId}.json`)
  const fs = getFsImplementation()
  
  try {
    const experience = await readToolExperience(filePath)
    if (experience) {
      experience.useCount++
      experience.lastUsedAt = new Date().toISOString()
      await fs.writeFile(filePath, JSON.stringify(experience, null, 2), 'utf-8')
    }
  } catch (e) {
    logForDebugging(
      `Failed to update experience usage: ${e}`,
      { level: 'debug' },
    )
  }
}

/**
 * 验证经验有效性
 */
export async function verifyExperience(experienceId: string, modelName?: string): Promise<void> {
  const experiencePath = getToolExperiencePath(modelName)
  if (!experiencePath) return

  const filePath = join(experiencePath, `${experienceId}.json`)
  const fs = getFsImplementation()
  
  try {
    const experience = await readToolExperience(filePath)
    if (experience) {
      experience.verified = true
      await fs.writeFile(filePath, JSON.stringify(experience, null, 2), 'utf-8')
    }
  } catch (e) {
    logForDebugging(
      `Failed to verify experience: ${e}`,
      { level: 'debug' },
    )
  }
}

/**
 * 删除过期或无效的经验
 */
export async function cleanupExperiences(modelName?: string): Promise<number> {
  const experiencePath = getToolExperiencePath(modelName)
  if (!experiencePath) return 0

  const fs = getFsImplementation()
  let deletedCount = 0
  
  try {
    const settings = getInitialSettings()
    const config = (settings as any).toolExperience as ToolExperienceConfig | undefined
    const maxEntries = config?.maxEntries || DEFAULT_CONFIG.maxEntries

    const experiences = await getToolExperiences(modelName)
    
    // 如果超过最大条目数，删除最旧的未验证经验
    if (experiences.length > maxEntries) {
      const unverified = experiences
        .filter(exp => !exp.verified)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      
      const toDelete = unverified.slice(0, experiences.length - maxEntries)
      
      for (const exp of toDelete) {
        const filePath = join(experiencePath, `${exp.id}.json`)
        try {
          await fs.unlink(filePath)
          deletedCount++
        } catch {
          // 忽略删除错误
        }
      }
    }

    return deletedCount
  } catch (e) {
    logForDebugging(
      `Failed to cleanup experiences: ${e}`,
      { level: 'warn' },
    )
    return deletedCount
  }
}

/**
 * 将经验格式化为提示词注入内容
 */
export function formatExperiencesForPrompt(experiences: ToolExperience[]): string {
  if (experiences.length === 0) return ''

  const groupedByTool = new Map<string, ToolExperience[]>()
  
  for (const exp of experiences) {
    const key = exp.toolName
    if (!groupedByTool.has(key)) {
      groupedByTool.set(key, [])
    }
    groupedByTool.get(key)!.push(exp)
  }

  const sections: string[] = ['# 工具调用经验参考\n']

  for (const [toolName, toolExperiences] of groupedByTool) {
    sections.push(`## ${toolName}`)
    
    for (const exp of toolExperiences.slice(0, 3)) { // 每个工具最多3条经验
      sections.push(`- **${exp.failureType}**: ${exp.failureReason}`)
      if (exp.suggestedSolution) {
        sections.push(`  建议: ${exp.suggestedSolution}`)
      }
    }
    
    sections.push('')
  }

  return sections.join('\n')
}

/**
 * 从工具调用失败中自动提取经验
 */
export async function extractExperienceFromFailure(
  toolName: string,
  error: Error | string,
  modelName?: string,
): Promise<void> {
  const settings = getInitialSettings()
  const config = (settings as any).toolExperience as ToolExperienceConfig | undefined
  
  if (config?.autoExtract === false) return

  const errorMessage = typeof error === 'string' ? error : error.message
  
  // 分析失败类型
  let failureType: ToolExperience['failureType'] = 'other'
  let suggestedSolution = '检查工具调用参数是否正确'

  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    failureType = 'input_validation'
    suggestedSolution = '检查输入参数的类型和格式是否符合工具要求'
  } else if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
    failureType = 'permission_denied'
    suggestedSolution = '检查是否有执行此操作的权限，或请求用户授权'
  } else if (errorMessage.includes('timeout')) {
    failureType = 'timeout'
    suggestedSolution = '操作超时，可以尝试增加超时时间或简化操作'
  } else if (errorMessage.includes('execution') || errorMessage.includes('failed')) {
    failureType = 'execution_error'
    suggestedSolution = '检查工具执行环境和依赖是否正常'
  }

  await saveToolExperience({
    toolName,
    modelName: modelName || 'unknown',
    failureType,
    failureReason: errorMessage.substring(0, 200),
    errorMessage: errorMessage.substring(0, 500),
    suggestedSolution,
    verified: false,
    tags: [],
  })
}

/**
 * 加载工具经验提示词
 */
export async function loadToolExperiencePrompt(modelName?: string): Promise<string | null> {
  const experiencePath = getToolExperiencePath(modelName)
  if (!experiencePath) return null

  const experiences = await getToolExperiences(modelName)
  if (experiences.length === 0) return null

  // 只返回已验证的经验
  const verifiedExperiences = experiences.filter(exp => exp.verified)
  if (verifiedExperiences.length === 0) return null

  return formatExperiencesForPrompt(verifiedExperiences)
}
