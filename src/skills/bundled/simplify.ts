import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { shouldUseChinese } from '../../utils/language.js'
import { registerBundledSkill } from '../bundledSkills.js'

const SIMPLIFY_PROMPT_EN = `# Simplify: Code Review and Cleanup

Review all changed files for reuse, quality, and efficiency. Fix any issues found.

## Phase 1: Identify Changes

Run \`git diff\` (or \`git diff HEAD\` if there are staged changes) to see what changed. If there are no git changes, review the most recently modified files that the user mentioned or that you edited earlier in this conversation.

## Phase 2: Launch Three Review Agents in Parallel

Use the ${AGENT_TOOL_NAME} tool to launch all three agents concurrently in a single message. Pass each agent the full diff so it has the complete context.

### Agent 1: Code Reuse Review

For each change:

1. **Search for existing utilities and helpers** that could replace newly written code. Look for similar patterns elsewhere in the codebase — common locations are utility directories, shared modules, and files adjacent to the changed ones.
2. **Flag any new function that duplicates existing functionality.** Suggest the existing function to use instead.
3. **Flag any inline logic that could use an existing utility** — hand-rolled string manipulation, manual path handling, custom environment checks, ad-hoc type guards, and similar patterns are common candidates.

### Agent 2: Code Quality Review

Review the same changes for hacky patterns:

1. **Redundant state**: state that duplicates existing state, cached values that could be derived, observers/effects that could be direct calls
2. **Parameter sprawl**: adding new parameters to a function instead of generalizing or restructuring existing ones
3. **Copy-paste with slight variation**: near-duplicate code blocks that should be unified with a shared abstraction
4. **Leaky abstractions**: exposing internal details that should be encapsulated, or breaking existing abstraction boundaries
5. **Stringly-typed code**: using raw strings where constants, enums (string unions), or branded types already exist in the codebase
6. **Unnecessary JSX nesting**: wrapper Boxes/elements that add no layout value — check if inner component props (flexShrink, alignItems, etc.) already provide the needed behavior
7. **Unnecessary comments**: comments explaining WHAT the code does (well-named identifiers already do that), narrating the change, or referencing the task/caller — delete; keep only non-obvious WHY (hidden constraints, subtle invariants, workarounds)

### Agent 3: Efficiency Review

Review the same changes for efficiency:

1. **Unnecessary work**: redundant computations, repeated file reads, duplicate network/API calls, N+1 patterns
2. **Missed concurrency**: independent operations run sequentially when they could run in parallel
3. **Hot-path bloat**: new blocking work added to startup or per-request/per-render hot paths
4. **Recurring no-op updates**: state/store updates inside polling loops, intervals, or event handlers that fire unconditionally — add a change-detection guard so downstream consumers aren't notified when nothing changed. Also: if a wrapper function takes an updater/reducer callback, verify it honors same-reference returns (or whatever the "no change" signal is) — otherwise callers' early-return no-ops are silently defeated
5. **Unnecessary existence checks**: pre-checking file/resource existence before operating (TOCTOU anti-pattern) — operate directly and handle the error
6. **Memory**: unbounded data structures, missing cleanup, event listener leaks
7. **Overly broad operations**: reading entire files when only a portion is needed, loading all items when filtering for one

## Phase 3: Fix Issues

Wait for all three agents to complete. Aggregate their findings and fix each issue directly. If a finding is a false positive or not worth addressing, note it and move on — do not argue with the finding, just skip it.

When done, briefly summarize what was fixed (or confirm the code was already clean).
`

const SIMPLIFY_PROMPT_ZH = `# 简化：代码审查与清理

审查所有更改的文件，检查代码复用、质量和效率问题，并修复发现的任何问题。

## 阶段一：识别变更

运行 \`git diff\`（如果有暂存的更改则使用 \`git diff HEAD\`）来查看变更内容。如果没有 git 更改，则审查用户提到的或你在本次对话中编辑过的最近修改的文件。

## 阶段二：并行启动三个审查代理

使用 ${AGENT_TOOL_NAME} 工具在单条消息中同时启动所有三个代理。将完整的 diff 传递给每个代理，以便其拥有完整的上下文。

### 代理 1：代码复用审查

针对每个变更：

1. **搜索现有的工具函数和辅助函数**，看是否可以替换新编写的代码。在代码库的其他位置查找类似的模式——常见位置包括工具目录、共享模块以及变更文件相邻的文件。
2. **标记任何重复现有功能的新函数。**建议使用现有的替代函数。
3. **标记任何可以使用现有工具函数的内联逻辑**——手写的字符串处理、手动路径处理、自定义环境检查、临时类型守卫等类似模式都是常见的候选场景。

### 代理 2：代码质量审查

审查同样的变更，查找不规范的模式：

1. **冗余状态**：重复现有状态的状态、可以派生的缓存值、可以改为直接调用的观察者/副作用
2. **参数膨胀**：向函数添加新参数，而不是泛化或重构现有参数
3. **略有变化的复制粘贴**：应该通过共享抽象统一的近似重复代码块
4. **泄漏的抽象**：暴露应该封装的内部细节，或破坏现有的抽象边界
5. **字符串类型代码**：在代码库中已存在常量、枚举（字符串联合）或品牌类型的地方使用原始字符串
6. **不必要的 JSX 嵌套**：不提供布局价值的包装 Box/元素——检查内部组件属性（flexShrink、alignItems 等）是否已经提供了所需的行为
7. **不必要的注释**：解释代码做了什么的注释（命名良好的标识符已经能做到这一点）、叙述变更或引用任务/调用者——删除；仅保留不明显的"为什么"（隐藏的约束、微妙的不变量、变通方法）

### 代理 3：效率审查

审查同样的变更，检查效率问题：

1. **不必要的工作**：冗余计算、重复的文件读取、重复的网络/API 调用、N+1 模式
2. **错失的并发机会**：可以并行运行的独立操作被顺序执行
3. **热路径膨胀**：在启动或每个请求/每次渲染的热路径上添加了新的阻塞工作
4. **重复的空操作更新**：在轮询循环、间隔或无条件触发的事件处理程序中的状态/存储更新——添加变更检测守卫，以便在没有实际变更时不通知下游消费者。此外：如果包装函数接受更新器/归约器回调，请验证它是否尊重相同引用返回（或任何"无变更"信号）——否则调用者的提前返回空操作会被静默忽略
5. **不必要的存在性检查**：在操作前预先检查文件/资源存在性（TOCTOU 反模式）——直接操作并处理错误
6. **内存问题**：无界数据结构、缺少清理、事件监听器泄漏
7. **过于宽泛的操作**：只需要部分内容时读取整个文件，只需要筛选一个项目时加载所有项目

## 阶段三：修复问题

等待所有三个代理完成。汇总它们的发现并直接修复每个问题。如果某个发现是误报或不值得处理，记录下来并继续——不要与发现争论，直接跳过。

完成后，简要总结修复了什么（或确认代码本来就很干净）。
`

const SIMPLIFY_PROMPT = shouldUseChinese() ? SIMPLIFY_PROMPT_ZH : SIMPLIFY_PROMPT_EN

export function registerSimplifySkill(): void {
  registerBundledSkill({
    name: 'simplify',
    description: shouldUseChinese()
      ? '审查变更代码的复用性、质量和效率，然后修复发现的问题。'
      : 'Review changed code for reuse, quality, and efficiency, then fix any issues found.',
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = SIMPLIFY_PROMPT
      if (args) {
        prompt += shouldUseChinese()
          ? `\n\n## 额外关注点\n\n${args}`
          : `\n\n## Additional Focus\n\n${args}`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
