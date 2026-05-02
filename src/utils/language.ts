/**
 * 语言工具模块
 * 提供语言检测和中英文内容切换功能
 */

import { getInitialSettings } from './settings/settings.js'
import { isEnvTruthy } from './envUtils.js'

/**
 * 判断是否应该使用中文
 * 基于language设置或环境变量
 */
export function shouldUseChinese(): boolean {
  const settings = getInitialSettings()
  // 检查language设置
  if (
    settings.language === 'chinese' ||
    settings.language === 'zh' ||
    settings.language === 'zh-CN' ||
    settings.language === '中文'
  ) {
    return true
  }
  // 检查环境变量
  if (isEnvTruthy(process.env.CLAUDE_CODE_CHINESE_PROMPTS)) {
    return true
  }
  return false
}

/**
 * 根据语言选择返回中文或英文内容
 * @param zhContent 中文内容
 * @param enContent 英文内容
 * @returns 根据语言设置返回对应内容
 */
export function localizedContent<T>(zhContent: T, enContent: T): T {
  return shouldUseChinese() ? zhContent : enContent
}

/**
 * 中文版环境信息模板
 */
export function getZhEnvTemplate(): {
  workingDirectory: string
  gitRepo: string
  platform: string
  shell: string
  osVersion: string
  modelPrefix: string
  knowledgeCutoff: string
  recentModels: string
  availability: string
  fastMode: string
} {
  return {
    workingDirectory: '主工作目录',
    gitRepo: '是否为git仓库',
    platform: '平台',
    shell: 'Shell',
    osVersion: '操作系统版本',
    modelPrefix: '你由以下模型驱动',
    knowledgeCutoff: '模型知识截止日期',
    recentModels: '最新的Claude模型系列是Claude 4.5/4.6。模型ID — Opus 4.7',
    availability: 'Claude Code可在终端CLI、桌面应用（Mac/Windows）、Web应用（claude.ai/code）和IDE扩展（VS Code、JetBrains）中使用',
    fastMode: 'Claude Code的快速模式使用相同的模型，但输出更快。它不会切换到不同的模型。可以通过 /fast 切换',
  }
}

/**
 * 英文版环境信息模板
 */
export function getEnEnvTemplate(): {
  workingDirectory: string
  gitRepo: string
  platform: string
  shell: string
  osVersion: string
  modelPrefix: string
  knowledgeCutoff: string
  recentModels: string
  availability: string
  fastMode: string
} {
  return {
    workingDirectory: 'Primary working directory',
    gitRepo: 'Is a git repository',
    platform: 'Platform',
    shell: 'Shell',
    osVersion: 'OS Version',
    modelPrefix: 'You are powered by the model',
    knowledgeCutoff: 'Assistant knowledge cutoff is',
    recentModels: 'The most recent Claude model family is Claude 4.5/4.6. Model IDs — Opus 4.7',
    availability: 'Claude Code is available as a CLI in the terminal, desktop app (Mac/Windows), web app (claude.ai/code), and IDE extensions (VS Code, JetBrains)',
    fastMode: 'Fast mode for Claude Code uses the same model with faster output. It does NOT switch to a different model. It can be toggled with /fast',
  }
}

/**
 * 获取环境信息模板（根据语言）
 */
export function getEnvTemplate() {
  return localizedContent(getZhEnvTemplate(), getEnEnvTemplate())
}
