import type { Command } from '../../commands.js'
import { shouldUseChinese } from '../../utils/language.js'

const permissions = {
  type: 'local-jsx',
  name: 'permissions',
  aliases: ['allowed-tools'],
  description: shouldUseChinese()
    ? '管理允许和拒绝工具权限规则'
    : 'Manage allow & deny tool permission rules',
  load: () => import('./permissions.js'),
} satisfies Command

export default permissions
