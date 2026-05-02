import type { Command } from '../../commands.js'
import { shouldUseChinese } from '../../utils/language.js'

const stats = {
  type: 'local-jsx',
  name: 'stats',
  description: shouldUseChinese()
    ? '显示你的 Claude Code 使用统计和活动'
    : 'Show your Claude Code usage statistics and activity',
  load: () => import('./stats.js'),
} satisfies Command

export default stats
