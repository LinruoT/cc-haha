import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getSubscriptionType } from '../../utils/auth.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import { shouldUseChinese } from '../../utils/language.js'
import { isTeammate } from '../../utils/teammate.js'
import { isInProcessTeammate } from '../../utils/teammateContext.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from '../SendMessageTool/constants.js'
import { AGENT_TOOL_NAME } from './constants.js'
import { isForkSubagentEnabled } from './forkSubagent.js'
import type { AgentDefinition } from './loadAgentsDir.js'

function getToolsDescription(agent: AgentDefinition): string {
  const { tools, disallowedTools } = agent
  const hasAllowlist = tools && tools.length > 0
  const hasDenylist = disallowedTools && disallowedTools.length > 0

  if (hasAllowlist && hasDenylist) {
    // Both defined: filter allowlist by denylist to match runtime behavior
    const denySet = new Set(disallowedTools)
    const effectiveTools = tools.filter(t => !denySet.has(t))
    if (effectiveTools.length === 0) {
      return 'None'
    }
    return effectiveTools.join(', ')
  } else if (hasAllowlist) {
    // Allowlist only: show the specific tools available
    return tools.join(', ')
  } else if (hasDenylist) {
    // Denylist only: show "All tools except X, Y, Z"
    return `All tools except ${disallowedTools.join(', ')}`
  }
  // No restrictions
  return 'All tools'
}

/**
 * Format one agent line for the agent_listing_delta attachment message:
 * `- type: whenToUse (Tools: ...)`.
 */
export function formatAgentLine(agent: AgentDefinition): string {
  const toolsDescription = getToolsDescription(agent)
  return `- ${agent.agentType}: ${agent.whenToUse} (Tools: ${toolsDescription})`
}

/**
 * Whether the agent list should be injected as an attachment message instead
 * of embedded in the tool description. When true, getPrompt() returns a static
 * description and attachments.ts emits an agent_listing_delta attachment.
 *
 * The dynamic agent list was ~10.2% of fleet cache_creation tokens: MCP async
 * connect, /reload-plugins, or permission-mode changes mutate the list →
 * description changes → full tool-schema cache bust.
 *
 * Override with CLAUDE_CODE_AGENT_LIST_IN_MESSAGES=true/false for testing.
 */
export function shouldInjectAgentListInMessages(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES)) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES))
    return false
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_agent_list_attach', false)
}

export async function getPrompt(
  agentDefinitions: AgentDefinition[],
  isCoordinator?: boolean,
  allowedAgentTypes?: string[],
): Promise<string> {
  // Filter agents by allowed types when Agent(x,y) restricts which agents can be spawned
  const effectiveAgents = allowedAgentTypes
    ? agentDefinitions.filter(a => allowedAgentTypes.includes(a.agentType))
    : agentDefinitions

  // Fork subagent feature: when enabled, insert the "When to fork" section
  // (fork semantics, directive-style prompts) and swap in fork-aware examples.
  const forkEnabled = isForkSubagentEnabled()

  const isZh = shouldUseChinese()

  const whenToForkSection = forkEnabled
    ? isZh
      ? `

## 何时 fork

当工具的中间输出不值得保留在上下文中时，fork 自己（省略 \`subagent_type\`）。标准是定性的 — "我是否需要再次使用这个输出" — 而不是任务大小。
- **研究**：fork 开放性问题。如果研究可以分解为独立问题，在一条消息中启动并行 fork。对于这种情况，fork 比新的子代理更好 — 它继承上下文并共享你的缓存。
- **实现**：优先 fork 需要多次编辑的实现工作。在跳转到实现之前先做研究。

Fork 很便宜，因为它们共享你的提示缓存。不要在 fork 上设置 \`model\` — 不同的模型无法重用父级的缓存。传递一个简短的 \`name\`（一两个词，小写），这样用户可以在团队面板中看到 fork 并在运行中进行引导。

**不要偷看。** 工具结果包含一个 \`output_file\` 路径 — 除非用户明确要求进度检查，否则不要 Read 或 tail 它。你会收到完成通知；信任它。在运行中读取转录会将 fork 的工具噪音拉入你的上下文，这违背了 fork 的目的。

**不要竞争。** 启动后，你对 fork 发现的内容一无所知。永远不要以任何格式伪造或预测 fork 结果 — 无论是散文、摘要还是结构化输出。通知作为用户角色消息在后续轮次到达；它永远不是你自己写的东西。如果用户在通知到达前提出后续问题，告诉他们 fork 仍在运行 — 给出状态，而不是猜测。

**编写 fork 提示。** 由于 fork 继承你的上下文，提示是一个*指令* — 要做什么，而不是情况是什么。具体说明范围：什么在范围内，什么不在范围内，另一个代理正在处理什么。不要重新解释背景。
`
      : `

## When to fork

Fork yourself (omit \`subagent_type\`) when the intermediate tool output isn't worth keeping in your context. The criterion is qualitative \u2014 "will I need this output again" \u2014 not task size.
- **Research**: fork open-ended questions. If research can be broken into independent questions, launch parallel forks in one message. A fork beats a fresh subagent for this \u2014 it inherits context and shares your cache.
- **Implementation**: prefer to fork implementation work that requires more than a couple of edits. Do research before jumping to implementation.

Forks are cheap because they share your prompt cache. Don't set \`model\` on a fork \u2014 a different model can't reuse the parent's cache. Pass a short \`name\` (one or two words, lowercase) so the user can see the fork in the teams panel and steer it mid-run.

**Don't peek.** The tool result includes an \`output_file\` path — do not Read or tail it unless the user explicitly asks for a progress check. You get a completion notification; trust it. Reading the transcript mid-flight pulls the fork's tool noise into your context, which defeats the point of forking.

**Don't race.** After launching, you know nothing about what the fork found. Never fabricate or predict fork results in any format — not as prose, summary, or structured output. The notification arrives as a user-role message in a later turn; it is never something you write yourself. If the user asks a follow-up before the notification lands, tell them the fork is still running — give status, not a guess.

**Writing a fork prompt.** Since the fork inherits your context, the prompt is a *directive* — what to do, not what the situation is. Be specific about scope: what's in, what's out, what another agent is handling. Don't re-explain background.
`
    : ''

  const writingThePromptSection = isZh
    ? `

## 编写提示

${forkEnabled ? '当生成新代理（带 `subagent_type`）时，它从零上下文开始。' : ''}像向一个刚走进房间的聪明同事简报一样 — 它没有看到这个对话，不知道你尝试了什么，不理解为什么这个任务很重要。
- 解释你想要完成什么以及为什么。
- 描述你已经学到或排除的内容。
- 提供足够的关于周围问题的上下文，使代理能够做出判断，而不仅仅是遵循狭窄的指令。
- 如果你需要简短的回复，请说明（"200 字以内报告"）。
- 查询：交出确切命令。调查：交出问题 — 当前提错误时，规定的步骤会成为累赘。

${forkEnabled ? '对于新代理，简洁的' : '简洁的'}命令式提示会产生肤浅、通用的工作。

**永远不要委托理解。** 不要写 "根据你的发现，修复 bug" 或 "根据研究，实现它"。这些短语将综合推给代理，而不是自己完成。写证明你理解了的提示：包含文件路径、行号、具体要更改什么。
`
    : `

## Writing the prompt

${forkEnabled ? 'When spawning a fresh agent (with a `subagent_type`), it starts with zero context. ' : ''}Brief the agent like a smart colleague who just walked into the room — it hasn't seen this conversation, doesn't know what you've tried, doesn't understand why this task matters.
- Explain what you're trying to accomplish and why.
- Describe what you've already learned or ruled out.
- Give enough context about the surrounding problem that the agent can make judgment calls rather than just following a narrow instruction.
- If you need a short response, say so ("report in under 200 words").
- Lookups: hand over the exact command. Investigations: hand over the question — prescribed steps become dead weight when the premise is wrong.

${forkEnabled ? 'For fresh agents, terse' : 'Terse'} command-style prompts produce shallow, generic work.

**Never delegate understanding.** Don't write "based on your findings, fix the bug" or "based on the research, implement it." Those phrases push synthesis onto the agent instead of doing it yourself. Write prompts that prove you understood: include file paths, line numbers, what specifically to change.
`

  const forkExamples = isZh
    ? `示例用法：

<example>
user: "这个分支在发布前还有什么没完成？"
assistant: <thinking>Fork 这个 — 这是一个调查问题。我想要待办清单，而不是 git 输出在我的上下文中。</thinking>
${AGENT_TOOL_NAME}({
  name: "ship-audit",
  description: "分支发布就绪性审计",
  prompt: "审计此分支发布前还剩什么。检查：未提交的更改、领先于 main 的提交、测试是否存在、GrowthBook 门控是否已连接、CI 相关文件是否已更改。报告待办清单 — 已完成 vs 缺失。200 字以内。"
})
assistant: 发布就绪性审计运行中。
<commentary>
轮次在此结束。协调者对发现一无所知。接下来是一个单独的轮次 — 通知从外部到达，作为用户角色消息。它不是协调者写的东西。
</commentary>
[后续轮次 — 通知作为用户消息到达]
assistant: 审计回来了。三个阻碍：新提示路径没有测试、GrowthBook 门控已连接但不在 build_flags.yaml 中、一个未提交的文件。
</example>

<example>
user: "那门控到底连上了没有"
<commentary>
用户在等待中提问。审计 fork 被启动来回答这个问题，但还没有返回。协调者没有这个答案。给出状态，而不是伪造的结果。
</commentary>
assistant: 还在等审计 — 这是它正在检查的事情之一。应该很快就到了。
</example>

<example>
user: "你能对这个迁移是否安全给出第二意见吗？"
assistant: <thinking>我会问 code-reviewer 代理 — 它不会看到我的分析，所以可以给出独立的判断。</thinking>
<commentary>
指定了 subagent_type，所以代理从零开始。它需要在提示中获得完整的上下文。简报说明了要评估什么以及为什么。
</commentary>
${AGENT_TOOL_NAME}({
  name: "migration-review",
  description: "独立迁移审查",
  subagent_type: "code-reviewer",
  prompt: "审查迁移 0042_user_schema.sql 的安全性。上下文：我们正在向一个 5000 万行的表添加 NOT NULL 列。现有行会获得回填默认值。我想对回填方法在并发写入下是否安全给出第二意见 — 我已经检查了锁定行为，但需要独立验证。报告：这是否安全，如果不安全，具体会出什么问题？"
})
</example>
`
    : `Example usage:

<example>
user: "What's left on this branch before we can ship?"
assistant: <thinking>Forking this \u2014 it's a survey question. I want the punch list, not the git output in my context.</thinking>
${AGENT_TOOL_NAME}({
  name: "ship-audit",
  description: "Branch ship-readiness audit",
  prompt: "Audit what's left before this branch can ship. Check: uncommitted changes, commits ahead of main, whether tests exist, whether the GrowthBook gate is wired up, whether CI-relevant files changed. Report a punch list \u2014 done vs. missing. Under 200 words."
})
assistant: Ship-readiness audit running.
<commentary>
Turn ends here. The coordinator knows nothing about the findings yet. What follows is a SEPARATE turn \u2014 the notification arrives from outside, as a user-role message. It is not something the coordinator writes.
</commentary>
[later turn \u2014 notification arrives as user message]
assistant: Audit's back. Three blockers: no tests for the new prompt path, GrowthBook gate wired but not in build_flags.yaml, and one uncommitted file.
</example>

<example>
user: "so is the gate wired up or not"
<commentary>
User asks mid-wait. The audit fork was launched to answer exactly this, and it hasn't returned. The coordinator does not have this answer. Give status, not a fabricated result.
</commentary>
assistant: Still waiting on the audit \u2014 that's one of the things it's checking. Should land shortly.
</example>

<example>
user: "Can you get a second opinion on whether this migration is safe?"
assistant: <thinking>I'll ask the code-reviewer agent — it won't see my analysis, so it can give an independent read.</thinking>
<commentary>
A subagent_type is specified, so the agent starts fresh. It needs full context in the prompt. The briefing explains what to assess and why.
</commentary>
${AGENT_TOOL_NAME}({
  name: "migration-review",
  description: "Independent migration review",
  subagent_type: "code-reviewer",
  prompt: "Review migration 0042_user_schema.sql for safety. Context: we're adding a NOT NULL column to a 50M-row table. Existing rows get a backfill default. I want a second opinion on whether the backfill approach is safe under concurrent writes — I've checked locking behavior but want independent verification. Report: is this safe, and if not, what specifically breaks?"
})
</example>
`

  const currentExamples = isZh
    ? `示例用法：

<example_agent_descriptions>
"test-runner"：在你完成编写代码后使用此代理运行测试
"greeting-responder"：使用此代理以友好的玩笑回应用户问候
</example_agent_descriptions>

<example>
user: "请写一个函数检查一个数是否是质数"
assistant: 我将使用 ${FILE_WRITE_TOOL_NAME} 工具编写以下代码：
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
由于编写了重要代码且任务已完成，现在使用 test-runner 代理运行测试
</commentary>
assistant: 使用 ${AGENT_TOOL_NAME} 工具启动 test-runner 代理
</example>

<example>
user: "你好"
<commentary>
由于用户在打招呼，使用 greeting-responder 代理以友好的玩笑回应
</commentary>
assistant: "我将使用 ${AGENT_TOOL_NAME} 工具启动 greeting-responder 代理"
</example>
`
    : `Example usage:

<example_agent_descriptions>
"test-runner": use this agent after you are done writing code to run tests
"greeting-responder": use this agent to respond to user greetings with a friendly joke
</example_agent_descriptions>

<example>
user: "Please write a function that checks if a number is prime"
assistant: I'm going to use the ${FILE_WRITE_TOOL_NAME} tool to write the following code:
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
Since a significant piece of code was written and the task was completed, now use the test-runner agent to run the tests
</commentary>
assistant: Uses the ${AGENT_TOOL_NAME} tool to launch the test-runner agent
</example>

<example>
user: "Hello"
<commentary>
Since the user is greeting, use the greeting-responder agent to respond with a friendly joke
</commentary>
assistant: "I'm going to use the ${AGENT_TOOL_NAME} tool to launch the greeting-responder agent"
</example>
`

  // When the gate is on, the agent list lives in an agent_listing_delta
  // attachment (see attachments.ts) instead of inline here. This keeps the
  // tool description static across MCP/plugin/permission changes so the
  // tools-block prompt cache doesn't bust every time an agent loads.
  const listViaAttachment = shouldInjectAgentListInMessages()

  const agentListSection = listViaAttachment
    ? isZh
      ? `可用的代理类型在对话中的 <system-reminder> 消息中列出。`
      : `Available agent types are listed in <system-reminder> messages in the conversation.`
    : isZh
      ? `可用的代理类型及其可使用的工具：
${effectiveAgents.map(agent => formatAgentLine(agent)).join('\n')}`
      : `Available agent types and the tools they have access to:
${effectiveAgents.map(agent => formatAgentLine(agent)).join('\n')}`

  // Shared core prompt used by both coordinator and non-coordinator modes
  const shared = isZh
    ? `启动一个新代理来自主处理复杂的多步骤任务。

${AGENT_TOOL_NAME} 工具启动专门的代理（子进程），它们自主处理复杂任务。每种代理类型都有特定的功能和可用工具。

${agentListSection}

${
  forkEnabled
    ? `使用 ${AGENT_TOOL_NAME} 工具时，指定 subagent_type 使用专门的代理，或省略它来 fork 自己 — fork 继承你的完整对话上下文。`
    : `使用 ${AGENT_TOOL_NAME} 工具时，指定 subagent_type 参数选择要使用的代理类型。如果省略，则使用通用代理。`
}`
    : `Launch a new agent to handle complex, multi-step tasks autonomously.

The ${AGENT_TOOL_NAME} tool launches specialized agents (subprocesses) that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.

${agentListSection}

${
  forkEnabled
    ? `When using the ${AGENT_TOOL_NAME} tool, specify a subagent_type to use a specialized agent, or omit it to fork yourself — a fork inherits your full conversation context.`
    : `When using the ${AGENT_TOOL_NAME} tool, specify a subagent_type parameter to select which agent type to use. If omitted, the general-purpose agent is used.`
}`

  // Coordinator mode gets the slim prompt -- the coordinator system prompt
  // already covers usage notes, examples, and when-not-to-use guidance.
  if (isCoordinator) {
    return shared
  }

  // Ant-native builds alias find/grep to embedded bfs/ugrep and remove the
  // dedicated Glob/Grep tools, so point at find via Bash instead.
  const embedded = hasEmbeddedSearchTools()
  const fileSearchHint = embedded
    ? '`find` via the Bash tool'
    : `the ${GLOB_TOOL_NAME} tool`
  // The "class Foo" example is about content search. Non-embedded stays Glob
  // (original intent: find-the-file-containing). Embedded gets grep because
  // find -name doesn't look at file contents.
  const contentSearchHint = embedded
    ? '`grep` via the Bash tool'
    : `the ${GLOB_TOOL_NAME} tool`
  const whenNotToUseSection = forkEnabled
    ? ''
    : isZh
      ? `
何时不使用 ${AGENT_TOOL_NAME} 工具：
- 如果你想读取特定文件路径，使用 ${FILE_READ_TOOL_NAME} 工具或 ${fileSearchHint} 代替 ${AGENT_TOOL_NAME} 工具，以更快找到匹配
- 如果你正在搜索特定的类定义如 "class Foo"，使用 ${contentSearchHint} 代替，以更快找到匹配
- 如果你正在搜索特定文件或 2-3 个文件集中的代码，使用 ${FILE_READ_TOOL_NAME} 工具代替 ${AGENT_TOOL_NAME} 工具，以更快找到匹配
- 与上述代理描述无关的其他任务
`
      : `
When NOT to use the ${AGENT_TOOL_NAME} tool:
- If you want to read a specific file path, use the ${FILE_READ_TOOL_NAME} tool or ${fileSearchHint} instead of the ${AGENT_TOOL_NAME} tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use ${contentSearchHint} instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the ${FILE_READ_TOOL_NAME} tool instead of the ${AGENT_TOOL_NAME} tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above
`

  // When listing via attachment, the "launch multiple agents" note is in the
  // attachment message (conditioned on subscription there). When inline, keep
  // the existing per-call getSubscriptionType() check.
  const concurrencyNote =
    !listViaAttachment && getSubscriptionType() !== 'pro'
      ? isZh
        ? `
- 尽可能同时启动多个代理以最大化性能；为此，在单个消息中使用多个工具调用`
        : `
- Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses`
      : ''

  // Non-coordinator gets the full prompt with all sections
  if (isZh) {
    return `${shared}
${whenNotToUseSection}

使用说明：
- 始终包含简短描述（3-5 个词）总结代理将做什么${concurrencyNote}
- 代理完成后，会向你返回一条消息。代理返回的结果对用户不可见。要向用户显示结果，你应该向用户发送一条文本消息，简要总结结果。${
      // eslint-disable-next-line custom-rules/no-process-env-top-level
      !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) &&
      !isInProcessTeammate() &&
      !forkEnabled
        ? `
- 你可以选择使用 run_in_background 参数在后台运行代理。当代理在后台运行时，完成后会自动通知你 — 不要休眠、轮询或主动检查其进度。继续其他工作或回复用户。
- **前台与后台**：当你需要代理的结果才能继续时使用前台（默认）— 例如研究代理的发现会影响你的下一步。当你有真正独立的工作要并行处理时使用后台。`
        : ''
    }
- 要继续之前生成的代理，使用 ${SEND_MESSAGE_TOOL_NAME} 并将代理的 ID 或名称作为 \`to\` 字段。代理将恢复其完整上下文。${forkEnabled ? '每次使用 subagent_type 的新代理调用都从零上下文开始 — 请提供完整的任务描述。' : '每次代理调用都从零开始 — 请提供完整的任务描述。'}
- 代理的输出通常应该被信任
- 清楚告诉代理你期望它编写代码还是只做研究（搜索、文件读取、网页获取等）${forkEnabled ? '' : '，因为它不了解用户的意图'}
- 如果代理描述提到应该主动使用它，那么你应该尽力在用户要求之前使用它。运用你的判断力。
- 如果用户指定要 "并行" 运行代理，你必须在单个消息中发送多个 ${AGENT_TOOL_NAME} 工具使用内容块。例如，如果你需要同时启动 build-validator 代理和 test-runner 代理，在单个消息中发送两个工具调用。
- 你可以选择设置 \`isolation: "worktree"\` 在临时 git worktree 中运行代理，给它一个仓库的隔离副本。如果代理没有更改，worktree 会自动清理；如果有更改，worktree 路径和分支会在结果中返回。${
      process.env.USER_TYPE === 'ant'
        ? `\n- 你可以设置 \`isolation: "remote"\` 在远程 CCR 环境中运行代理。这始终是后台任务；完成后会收到通知。用于需要新沙箱的长时间运行任务。`
        : ''
    }${
      isInProcessTeammate()
        ? `
- run_in_background、name、team_name 和 mode 参数在此上下文中不可用。仅支持同步子代理。`
        : isTeammate()
          ? `
- name、team_name 和 mode 参数在此上下文中不可用 — 队友不能生成其他队友。省略它们以生成子代理。`
          : ''
    }${whenToForkSection}${writingThePromptSection}

${forkEnabled ? forkExamples : currentExamples}`
  }

  // English return
  return `${shared}
${whenNotToUseSection}

Usage notes:
- Always include a short description (3-5 words) summarizing what the agent will do${concurrencyNote}
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.${
    // eslint-disable-next-line custom-rules/no-process-env-top-level
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) &&
    !isInProcessTeammate() &&
    !forkEnabled
      ? `
- You can optionally run agents in the background using the run_in_background parameter. When an agent runs in the background, you will be automatically notified when it completes — do NOT sleep, poll, or proactively check on its progress. Continue with other work or respond to the user instead.
- **Foreground vs background**: Use foreground (default) when you need the agent's results before you can proceed — e.g., research agents whose findings inform your next steps. Use background when you have genuinely independent work to do in parallel.`
      : ''
  }
- To continue a previously spawned agent, use ${SEND_MESSAGE_TOOL_NAME} with the agent's ID or name as the \`to\` field. The agent resumes with its full context preserved. ${forkEnabled ? 'Each fresh Agent invocation with a subagent_type starts without context — provide a complete task description.' : 'Each Agent invocation starts fresh — provide a complete task description.'}
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.)${forkEnabled ? '' : ", since it is not aware of the user's intent"}
- If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.
- If the user specifies that they want you to run agents "in parallel", you MUST send a single message with multiple ${AGENT_TOOL_NAME} tool use content blocks. For example, if you need to launch both a build-validator agent and a test-runner agent in parallel, send a single message with both tool calls.
- You can optionally set \`isolation: "worktree"\` to run the agent in a temporary git worktree, giving it an isolated copy of the repository. The worktree is automatically cleaned up if the agent makes no changes; if changes are made, the worktree path and branch are returned in the result.${
    process.env.USER_TYPE === 'ant'
      ? `\n- You can set \`isolation: "remote"\` to run the agent in a remote CCR environment. This is always a background task; you'll be notified when it completes. Use for long-running tasks that need a fresh sandbox.`
      : ''
  }${
    isInProcessTeammate()
      ? `
- The run_in_background, name, team_name, and mode parameters are not available in this context. Only synchronous subagents are supported.`
      : isTeammate()
        ? `
- The name, team_name, and mode parameters are not available in this context — teammates cannot spawn other teammates. Omit them to spawn a subagent.`
        : ''
  }${whenToForkSection}${writingThePromptSection}

${forkEnabled ? forkExamples : currentExamples}`
}
