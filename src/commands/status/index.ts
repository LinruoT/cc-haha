import type { Command } from '../../commands.js'
import { shouldUseChinese } from '../../utils/language.js'

const status = {
  type: 'local-jsx',
  name: 'status',
  description: shouldUseChinese()
    ? '显示 Claude Code 状态，包括版本、模型、账户、API 连接和工具状态'
    : 'Show Claude Code status including version, model, account, API connectivity, and tool statuses',
  immediate: true,
  load: () => import('./status.js'),
} satisfies Command

export default status
