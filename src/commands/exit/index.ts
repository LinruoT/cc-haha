import type { Command } from '../../commands.js'
import { shouldUseChinese } from '../../utils/language.js'

const exit = {
  type: 'local-jsx',
  name: 'exit',
  aliases: ['quit'],
  description: shouldUseChinese() ? '退出 REPL' : 'Exit the REPL',
  immediate: true,
  load: () => import('./exit.js'),
} satisfies Command

export default exit
