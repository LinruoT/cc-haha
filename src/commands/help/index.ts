import type { Command } from '../../commands.js'
import { shouldUseChinese } from '../../utils/language.js'

const help = {
  type: 'local-jsx',
  name: 'help',
  description: shouldUseChinese() ? '显示帮助和可用命令' : 'Show help and available commands',
  load: () => import('./help.js'),
} satisfies Command

export default help
