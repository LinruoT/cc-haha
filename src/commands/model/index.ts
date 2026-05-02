import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'
import { getMainLoopModel, renderModelName } from '../../utils/model/model.js'
import { shouldUseChinese } from '../../utils/language.js'

export default {
  type: 'local-jsx',
  name: 'model',
  get description() {
    const currentModel = renderModelName(getMainLoopModel())
    return shouldUseChinese()
      ? `设置 Claude Code 的 AI 模型（当前：${currentModel}）`
      : `Set the AI model for Claude Code (currently ${currentModel})`
  },
  argumentHint: shouldUseChinese() ? '[模型]' : '[model]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./model.js'),
} satisfies Command
