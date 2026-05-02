import type { Command } from '../../commands.js'
import { shouldUseChinese } from '../../utils/language.js'

const mcp = {
  type: 'local-jsx',
  name: 'mcp',
  description: shouldUseChinese() ? '管理 MCP 服务器' : 'Manage MCP servers',
  immediate: true,
  argumentHint: shouldUseChinese() ? '[启用|禁用 [服务器名称]]' : '[enable|disable [server-name]]',
  load: () => import('./mcp.js'),
} satisfies Command

export default mcp
