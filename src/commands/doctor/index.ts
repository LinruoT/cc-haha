import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { shouldUseChinese } from '../../utils/language.js'

const doctor: Command = {
  name: 'doctor',
  description: shouldUseChinese()
    ? '诊断和验证你的 Claude Code 安装和设置'
    : 'Diagnose and verify your Claude Code installation and settings',
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_DOCTOR_COMMAND),
  type: 'local-jsx',
  load: () => import('./doctor.js'),
}

export default doctor
