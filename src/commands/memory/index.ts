import type { Command } from '../../commands.js'
import { shouldUseChinese } from '../../utils/language.js'

const memory: Command = {
  type: 'local-jsx',
  name: 'memory',
  description: shouldUseChinese() ? '编辑 Claude 记忆文件' : 'Edit Claude memory files',
  load: () => import('./memory.js'),
}

export default memory
