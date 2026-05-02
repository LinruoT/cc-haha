import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { shouldUseChinese } from '../../utils/language.js'

const compact = {
  type: 'local',
  name: 'compact',
  description: shouldUseChinese()
    ? '清除对话历史但保留摘要在上下文中。可选：/compact [摘要指令]'
    : 'Clear conversation history but keep a summary in context. Optional: /compact [instructions for summarization]',
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_COMPACT),
  supportsNonInteractive: true,
  argumentHint: shouldUseChinese() ? '<可选的自定义摘要指令>' : '<optional custom summarization instructions>',
  load: () => import('./compact.js'),
} satisfies Command

export default compact
