import { feature } from 'bun:bundle'
import { prependBullets } from '../../constants/prompts.js'
import { getAttributionTexts } from '../../utils/attribution.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { shouldIncludeGitInstructions } from '../../utils/gitSettings.js'
import { shouldUseChinese } from '../../utils/language.js'
import { getClaudeTempDir } from '../../utils/permissions/filesystem.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../utils/timeouts.js'
import {
  getUndercoverInstructions,
  isUndercover,
} from '../../utils/undercover.js'
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import { TodoWriteTool } from '../TodoWriteTool/TodoWriteTool.js'
import { BASH_TOOL_NAME } from './toolName.js'

export function getDefaultTimeoutMs(): number {
  return getDefaultBashTimeoutMs()
}

export function getMaxTimeoutMs(): number {
  return getMaxBashTimeoutMs()
}

function getBackgroundUsageNote(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  if (shouldUseChinese()) {
    return '你可以使用 `run_in_background` 参数在后台运行命令。仅在不需要立即获取结果且可以接受稍后收到命令完成通知时使用。你不需要立即检查输出 - 命令完成时会收到通知。使用此参数时不需要在命令末尾添加 `&`。'
  }
  return "You can use the `run_in_background` parameter to run the command in the background. Only use this if you don't need the result immediately and are OK being notified when the command completes later. You do not need to check the output right away - you'll be notified when it finishes. You do not need to use '&' at the end of the command when using this parameter."
}

function getCommitAndPRInstructions(): string {
  // Defense-in-depth: undercover instructions must survive even if the user
  // has disabled git instructions entirely. Attribution stripping and model-ID
  // hiding are mechanical and work regardless, but the explicit "don't blow
  // your cover" instructions are the last line of defense against the model
  // volunteering an internal codename in a commit message.
  const undercoverSection =
    process.env.USER_TYPE === 'ant' && isUndercover()
      ? getUndercoverInstructions() + '\n'
      : ''

  if (!shouldIncludeGitInstructions()) return undercoverSection

  // For ant users, use the short version pointing to skills
  if (process.env.USER_TYPE === 'ant') {
    const skillsSection = !isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
      ? shouldUseChinese()
        ? `对于 git 提交和拉取请求，使用 \`/commit\` 和 \`/commit-push-pr\` 技能：
- \`/commit\` - 创建包含暂存更改的 git 提交
- \`/commit-push-pr\` - 提交、推送并创建拉取请求

这些技能处理 git 安全协议、正确的提交消息格式和 PR 创建。

在创建拉取请求之前，运行 \`/simplify\` 审查你的更改，然后进行端到端测试（例如通过 \`/tmux\` 测试交互功能）。

`
        : `For git commits and pull requests, use the \`/commit\` and \`/commit-push-pr\` skills:
- \`/commit\` - Create a git commit with staged changes
- \`/commit-push-pr\` - Commit, push, and create a pull request

These skills handle git safety protocols, proper commit message formatting, and PR creation.

Before creating a pull request, run \`/simplify\` to review your changes, then test end-to-end (e.g. via \`/tmux\` for interactive features).

`
      : ''
    if (shouldUseChinese()) {
      return `${undercoverSection}# Git 操作

${skillsSection}重要：永远不要跳过钩子（--no-verify、--no-gpg-sign 等），除非用户明确要求。

使用 Bash 工具中的 gh 命令处理其他 GitHub 相关任务，包括 issues、检查和 releases。如果收到 Github URL，使用 gh 命令获取所需信息。

# 其他常见操作
- 查看 Github PR 上的评论：gh api repos/foo/bar/pulls/123/comments`
    }
    return `${undercoverSection}# Git operations

${skillsSection}IMPORTANT: NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it.

Use the gh command via the Bash tool for other GitHub-related tasks including working with issues, checks, and releases. If given a Github URL use the gh command to get the information needed.

# Other common operations
- View comments on a Github PR: gh api repos/foo/bar/pulls/123/comments`
  }

  // For external users, include full inline instructions
  const { commit: commitAttribution, pr: prAttribution } = getAttributionTexts()

  if (shouldUseChinese()) {
    return `# 使用 git 提交更改

仅在用户请求时创建提交。如有疑问，先询问。当用户要求你创建新的 git 提交时，请仔细遵循以下步骤：

你可以在单个响应中调用多个工具。当请求多个独立信息且所有命令都可能成功时，并行运行多个工具调用以获得最佳性能。下面的编号步骤指示哪些命令应该批量并行执行。

Git 安全协议：
- 永远不要更新 git 配置
- 永远不要运行破坏性 git 命令（push --force、reset --hard、checkout .、restore .、clean -f、branch -D），除非用户明确要求这些操作。未经授权的破坏性操作无益且可能导致工作丢失，因此最好仅在收到直接指示时才运行这些命令
- 永远不要跳过钩子（--no-verify、--no-gpg-sign 等），除非用户明确要求
- 永远不要对 main/master 运行强制推送，如果用户请求则警告
- 关键：始终创建新提交而不是修改（amend），除非用户明确要求 git amend。当 pre-commit 钩子失败时，提交并未发生 — 因此 --amend 会修改前一个提交，这可能导致工作丢失或之前的更改丢失。在钩子失败后，修复问题，重新暂存，并创建新提交
- 暂存文件时，优先按名称添加特定文件，而不是使用 "git add -A" 或 "git add ."，这可能意外包含敏感文件（.env、凭据）或大型二进制文件
- 永远不要提交更改，除非用户明确要求。仅在明确要求时提交非常重要，否则用户会觉得你过于主动

1. 并行运行以下 bash 命令，每个使用 ${BASH_TOOL_NAME} 工具：
  - 运行 git status 命令查看所有未跟踪文件。重要：永远不要使用 -uall 标志，因为它可能导致大型仓库的内存问题。
  - 运行 git diff 命令查看将要提交的暂存和未暂存更改。
  - 运行 git log 命令查看最近的提交消息，以便遵循此仓库的提交消息风格。
2. 分析所有暂存更改（包括之前暂存和新添加的）并起草提交消息：
  - 总结更改的性质（例如新功能、现有功能增强、错误修复、重构、测试、文档等）。确保消息准确反映更改及其目的（即 "add" 表示全新功能，"update" 表示现有功能增强，"fix" 表示错误修复等）。
  - 不要提交可能包含秘密的文件（.env、credentials.json 等）。如果用户特别要求提交这些文件，请警告
  - 起草简洁的（1-2 句）提交消息，重点关注 "为什么" 而不是 "做了什么"
  - 确保它准确反映更改及其目的
3. 并行运行以下命令：
   - 将相关未跟踪文件添加到暂存区。
   - 使用消息创建提交${commitAttribution ? `，以以下内容结尾：\n   ${commitAttribution}` : '。'}
   - 提交完成后运行 git status 验证成功。
   注意：git status 依赖于提交完成，因此在提交之后顺序运行。
4. 如果提交因 pre-commit 钩子失败：修复问题并创建新提交

重要说明：
- 永远不要运行额外的命令来读取或探索代码，除了 git bash 命令
- 永远不要使用 ${TodoWriteTool.name} 或 ${AGENT_TOOL_NAME} 工具
- 除非用户明确要求，否则不要推送到远程仓库
- 重要：永远不要使用带有 -i 标志的 git 命令（如 git rebase -i 或 git add -i），因为它们需要不支持的交互式输入。
- 重要：不要在 git rebase 命令中使用 --no-edit，因为 --no-edit 不是 git rebase 的有效选项。
- 如果没有要提交的更改（即没有未跟踪文件且没有修改），不要创建空提交
- 为确保良好的格式，始终通过 HEREDOC 传递提交消息，如下例：
<example>
git commit -m "$(cat <<'EOF'
   提交消息在此。${commitAttribution ? `\n\n   ${commitAttribution}` : ''}
   EOF
   )"
</example>

# 创建拉取请求
使用 Bash 工具中的 gh 命令处理所有 GitHub 相关任务，包括 issues、拉取请求、检查和 releases。如果收到 Github URL，使用 gh 命令获取所需信息。

重要：当用户要求你创建拉取请求时，请仔细遵循以下步骤：

1. 使用 ${BASH_TOOL_NAME} 工具并行运行以下 bash 命令，以了解分支自偏离主分支以来的当前状态：
   - 运行 git status 命令查看所有未跟踪文件（永远不要使用 -uall 标志）
   - 运行 git diff 命令查看将要提交的暂存和未暂存更改
   - 检查当前分支是否跟踪远程分支并与远程同步，以便知道是否需要推送到远程
   - 运行 git log 命令和 \`git diff [base-branch]...HEAD\` 了解当前分支的完整提交历史（从偏离基础分支开始）
2. 分析将包含在拉取请求中的所有更改，确保查看所有相关提交（不仅仅是最新提交，而是将包含在拉取请求中的所有提交！！！），并起草拉取请求标题和摘要：
   - 保持 PR 标题简短（不超过 70 个字符）
   - 使用描述/正文说明详情，而不是标题
3. 并行运行以下命令：
   - 如需创建新分支
   - 如需使用 -u 标志推送到远程
   - 使用以下格式通过 gh pr create 创建 PR。使用 HEREDOC 传递正文以确保正确格式。
<example>
gh pr create --title "PR 标题" --body "$(cat <<'EOF'
## 摘要
<1-3 个要点>

## 测试计划
[用于测试拉取请求的待办事项清单...]${prAttribution ? `\n\n${prAttribution}` : ''}
EOF
)"
</example>

重要：
- 不要使用 ${TodoWriteTool.name} 或 ${AGENT_TOOL_NAME} 工具
- 完成后返回 PR URL，以便用户查看

# 其他常见操作
- 查看 Github PR 上的评论：gh api repos/foo/bar/pulls/123/comments`
  }

  return `# Committing changes with git

Only create commits when requested by the user. If unclear, ask first. When the user asks you to create a new git commit, follow these steps carefully:

You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. The numbered steps below indicate which commands should be batched in parallel.

Git Safety Protocol:
- NEVER update the git config
- NEVER run destructive git commands (push --force, reset --hard, checkout ., restore ., clean -f, branch -D) unless the user explicitly requests these actions. Taking unauthorized destructive actions is unhelpful and can result in lost work, so it's best to ONLY run these commands when given direct instructions 
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it
- NEVER run force push to main/master, warn the user if they request it
- CRITICAL: Always create NEW commits rather than amending, unless the user explicitly requests a git amend. When a pre-commit hook fails, the commit did NOT happen — so --amend would modify the PREVIOUS commit, which may result in destroying work or losing previous changes. Instead, after hook failure, fix the issue, re-stage, and create a NEW commit
- When staging files, prefer adding specific files by name rather than using "git add -A" or "git add .", which can accidentally include sensitive files (.env, credentials) or large binaries
- NEVER commit changes unless the user explicitly asks you to. It is VERY IMPORTANT to only commit when explicitly asked, otherwise the user will feel that you are being too proactive

1. Run the following bash commands in parallel, each using the ${BASH_TOOL_NAME} tool:
  - Run a git status command to see all untracked files. IMPORTANT: Never use the -uall flag as it can cause memory issues on large repos.
  - Run a git diff command to see both staged and unstaged changes that will be committed.
  - Run a git log command to see recent commit messages, so that you can follow this repository's commit message style.
2. Analyze all staged changes (both previously staged and newly added) and draft a commit message:
  - Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.). Ensure the message accurately reflects the changes and their purpose (i.e. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.).
  - Do not commit files that likely contain secrets (.env, credentials.json, etc). Warn the user if they specifically request to commit those files
  - Draft a concise (1-2 sentences) commit message that focuses on the "why" rather than the "what"
  - Ensure it accurately reflects the changes and their purpose
3. Run the following commands in parallel:
   - Add relevant untracked files to the staging area.
   - Create the commit with a message${commitAttribution ? ` ending with:\n   ${commitAttribution}` : '.'}
   - Run git status after the commit completes to verify success.
   Note: git status depends on the commit completing, so run it sequentially after the commit.
4. If the commit fails due to pre-commit hook: fix the issue and create a NEW commit

Important notes:
- NEVER run additional commands to read or explore code, besides git bash commands
- NEVER use the ${TodoWriteTool.name} or ${AGENT_TOOL_NAME} tools
- DO NOT push to the remote repository unless the user explicitly asks you to do so
- IMPORTANT: Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input which is not supported.
- IMPORTANT: Do not use --no-edit with git rebase commands, as the --no-edit flag is not a valid option for git rebase.
- If there are no changes to commit (i.e., no untracked files and no modifications), do not create an empty commit
- In order to ensure good formatting, ALWAYS pass the commit message via a HEREDOC, a la this example:
<example>
git commit -m "$(cat <<'EOF'
   Commit message here.${commitAttribution ? `\n\n   ${commitAttribution}` : ''}
   EOF
   )"
</example>

# Creating pull requests
Use the gh command via the Bash tool for ALL GitHub-related tasks including working with issues, pull requests, checks, and releases. If given a Github URL use the gh command to get the information needed.

IMPORTANT: When the user asks you to create a pull request, follow these steps carefully:

1. Run the following bash commands in parallel using the ${BASH_TOOL_NAME} tool, in order to understand the current state of the branch since it diverged from the main branch:
   - Run a git status command to see all untracked files (never use -uall flag)
   - Run a git diff command to see both staged and unstaged changes that will be committed
   - Check if the current branch tracks a remote branch and is up to date with the remote, so you know if you need to push to the remote
   - Run a git log command and \`git diff [base-branch]...HEAD\` to understand the full commit history for the current branch (from the time it diverged from the base branch)
2. Analyze all changes that will be included in the pull request, making sure to look at all relevant commits (NOT just the latest commit, but ALL commits that will be included in the pull request!!!), and draft a pull request title and summary:
   - Keep the PR title short (under 70 characters)
   - Use the description/body for details, not the title
3. Run the following commands in parallel:
   - Create new branch if needed
   - Push to remote with -u flag if needed
   - Create PR using gh pr create with the format below. Use a HEREDOC to pass the body to ensure correct formatting.
<example>
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Test plan
[Bulleted markdown checklist of TODOs for testing the pull request...]${prAttribution ? `\n\n${prAttribution}` : ''}
EOF
)"
</example>

Important:
- DO NOT use the ${TodoWriteTool.name} or ${AGENT_TOOL_NAME} tools
- Return the PR URL when you're done, so the user can see it

# Other common operations
- View comments on a Github PR: gh api repos/foo/bar/pulls/123/comments`
}

// SandboxManager merges config from multiple sources (settings layers, defaults,
// CLI flags) without deduping, so paths like ~/.cache appear 3× in allowOnly.
// Dedup here before inlining into the prompt — affects only what the model sees,
// not sandbox enforcement. Saves ~150-200 tokens/request when sandbox is enabled.
function dedup<T>(arr: T[] | undefined): T[] | undefined {
  if (!arr || arr.length === 0) return arr
  return [...new Set(arr)]
}

function getSimpleSandboxSection(): string {
  if (!SandboxManager.isSandboxingEnabled()) {
    return ''
  }

  const fsReadConfig = SandboxManager.getFsReadConfig()
  const fsWriteConfig = SandboxManager.getFsWriteConfig()
  const networkRestrictionConfig = SandboxManager.getNetworkRestrictionConfig()
  const allowUnixSockets = SandboxManager.getAllowUnixSockets()
  const ignoreViolations = SandboxManager.getIgnoreViolations()
  const allowUnsandboxedCommands =
    SandboxManager.areUnsandboxedCommandsAllowed()

  // Replace the per-UID temp dir literal (e.g. /private/tmp/claude-1001/) with
  // "$TMPDIR" so the prompt is identical across users — avoids busting the
  // cross-user global prompt cache. The sandbox already sets $TMPDIR at runtime.
  const claudeTempDir = getClaudeTempDir()
  const normalizeAllowOnly = (paths: string[]): string[] =>
    [...new Set(paths)].map(p => (p === claudeTempDir ? '$TMPDIR' : p))

  const filesystemConfig = {
    read: {
      denyOnly: dedup(fsReadConfig.denyOnly),
      ...(fsReadConfig.allowWithinDeny && {
        allowWithinDeny: dedup(fsReadConfig.allowWithinDeny),
      }),
    },
    write: {
      allowOnly: normalizeAllowOnly(fsWriteConfig.allowOnly),
      denyWithinAllow: dedup(fsWriteConfig.denyWithinAllow),
    },
  }

  const networkConfig = {
    ...(networkRestrictionConfig?.allowedHosts && {
      allowedHosts: dedup(networkRestrictionConfig.allowedHosts),
    }),
    ...(networkRestrictionConfig?.deniedHosts && {
      deniedHosts: dedup(networkRestrictionConfig.deniedHosts),
    }),
    ...(allowUnixSockets && { allowUnixSockets: dedup(allowUnixSockets) }),
  }

  const restrictionsLines = []
  if (Object.keys(filesystemConfig).length > 0) {
    restrictionsLines.push(`Filesystem: ${jsonStringify(filesystemConfig)}`)
  }
  if (Object.keys(networkConfig).length > 0) {
    restrictionsLines.push(`Network: ${jsonStringify(networkConfig)}`)
  }
  if (ignoreViolations) {
    restrictionsLines.push(
      `Ignored violations: ${jsonStringify(ignoreViolations)}`,
    )
  }

  const isZh = shouldUseChinese()

  const sandboxOverrideItems: Array<string | string[]> =
    allowUnsandboxedCommands
      ? isZh
        ? [
            '你应该始终默认在沙箱内运行命令。不要尝试设置 `dangerouslyDisableSandbox: true`，除非：',
            [
              '用户*明确*要求你绕过沙箱',
              '某个命令刚刚失败，你看到沙箱限制导致失败的证据。注意命令可能因与沙箱无关的多种原因失败（文件缺失、参数错误、网络问题等）。',
            ],
            '沙箱导致失败的证据包括：',
            [
              '文件/网络操作的 "Operation not permitted" 错误',
              '访问允许目录之外的特定路径被拒绝',
              '连接到非白名单主机的网络连接失败',
              'Unix 套接字连接错误',
            ],
            '当你看到沙箱导致失败的证据时：',
            [
              '立即使用 `dangerouslyDisableSandbox: true` 重试（不要询问，直接执行）',
              '简要说明可能是哪个沙箱限制导致了失败。务必提及用户可以使用 `/sandbox` 命令管理限制。',
              '这将提示用户授予权限',
            ],
            '对你使用 `dangerouslyDisableSandbox: true` 执行的每条命令单独处理。即使你最近使用此设置运行过命令，也应该默认在沙箱内运行未来的命令。',
            '不要建议将 ~/.bashrc、~/.zshrc、~/.ssh/* 或凭据文件等敏感路径添加到沙箱允许列表。',
          ]
        : [
            'You should always default to running commands within the sandbox. Do NOT attempt to set `dangerouslyDisableSandbox: true` unless:',
            [
              'The user *explicitly* asks you to bypass sandbox',
              'A specific command just failed and you see evidence of sandbox restrictions causing the failure. Note that commands can fail for many reasons unrelated to the sandbox (missing files, wrong arguments, network issues, etc.).',
            ],
            'Evidence of sandbox-caused failures includes:',
            [
              '"Operation not permitted" errors for file/network operations',
              'Access denied to specific paths outside allowed directories',
              'Network connection failures to non-whitelisted hosts',
              'Unix socket connection errors',
            ],
            'When you see evidence of sandbox-caused failure:',
            [
              "Immediately retry with `dangerouslyDisableSandbox: true` (don't ask, just do it)",
              'Briefly explain what sandbox restriction likely caused the failure. Be sure to mention that the user can use the `/sandbox` command to manage restrictions.',
              'This will prompt the user for permission',
            ],
            'Treat each command you execute with `dangerouslyDisableSandbox: true` individually. Even if you have recently run a command with this setting, you should default to running future commands within the sandbox.',
            'Do not suggest adding sensitive paths like ~/.bashrc, ~/.zshrc, ~/.ssh/*, or credential files to the sandbox allowlist.',
          ]
      : isZh
        ? [
            '所有命令必须在沙箱模式下运行 - `dangerouslyDisableSandbox` 参数已被策略禁用。',
            '命令在任何情况下都不能在沙箱外运行。',
            '如果命令因沙箱限制而失败，请与用户合作调整沙箱设置。',
          ]
        : [
            'All commands MUST run in sandbox mode - the `dangerouslyDisableSandbox` parameter is disabled by policy.',
            'Commands cannot run outside the sandbox under any circumstances.',
            'If a command fails due to sandbox restrictions, work with the user to adjust sandbox settings instead.',
          ]

  const items: Array<string | string[]> = [
    ...sandboxOverrideItems,
    isZh
      ? '对于临时文件，始终使用 `$TMPDIR` 环境变量。TMPDIR 在沙箱模式下会自动设置为正确的沙箱可写目录。不要直接使用 `/tmp` - 请改用 `$TMPDIR`。'
      : 'For temporary files, always use the `$TMPDIR` environment variable. TMPDIR is automatically set to the correct sandbox-writable directory in sandbox mode. Do NOT use `/tmp` directly - use `$TMPDIR` instead.',
  ]

  if (isZh) {
    return [
      '',
      '## 命令沙箱',
      '默认情况下，你的命令将在沙箱中运行。此沙箱控制命令可以在没有显式覆盖的情况下访问或修改哪些目录和网络主机。',
      '',
      '沙箱具有以下限制：',
      restrictionsLines.join('\n'),
      '',
      ...prependBullets(items),
    ].join('\n')
  }

  return [
    '',
    '## Command sandbox',
    'By default, your command will be run in a sandbox. This sandbox controls which directories and network hosts commands may access or modify without an explicit override.',
    '',
    'The sandbox has the following restrictions:',
    restrictionsLines.join('\n'),
    '',
    ...prependBullets(items),
  ].join('\n')
}

export function getSimplePrompt(): string {
  // Ant-native builds alias find/grep to embedded bfs/ugrep in Claude's shell,
  // so we don't steer away from them (and Glob/Grep tools are removed).
  const embedded = hasEmbeddedSearchTools()
  const isZh = shouldUseChinese()

  const toolPreferenceItems = isZh
    ? [
        ...(embedded
          ? []
          : [
              `文件搜索：使用 ${GLOB_TOOL_NAME}（不要用 find 或 ls）`,
              `内容搜索：使用 ${GREP_TOOL_NAME}（不要用 grep 或 rg）`,
            ]),
        `读取文件：使用 ${FILE_READ_TOOL_NAME}（不要用 cat/head/tail）`,
        `编辑文件：使用 ${FILE_EDIT_TOOL_NAME}（不要用 sed/awk）`,
        `写入文件：使用 ${FILE_WRITE_TOOL_NAME}（不要用 echo >/cat <<EOF）`,
        '通信：直接输出文本（不要用 echo/printf）',
      ]
    : [
        ...(embedded
          ? []
          : [
              `File search: Use ${GLOB_TOOL_NAME} (NOT find or ls)`,
              `Content search: Use ${GREP_TOOL_NAME} (NOT grep or rg)`,
            ]),
        `Read files: Use ${FILE_READ_TOOL_NAME} (NOT cat/head/tail)`,
        `Edit files: Use ${FILE_EDIT_TOOL_NAME} (NOT sed/awk)`,
        `Write files: Use ${FILE_WRITE_TOOL_NAME} (NOT echo >/cat <<EOF)`,
        'Communication: Output text directly (NOT echo/printf)',
      ]

  const avoidCommands = embedded
    ? isZh
      ? '`cat`、`head`、`tail`、`sed`、`awk` 或 `echo`'
      : '`cat`, `head`, `tail`, `sed`, `awk`, or `echo`'
    : isZh
      ? '`find`、`grep`、`cat`、`head`、`tail`、`sed`、`awk` 或 `echo`'
      : '`find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo`'

  const multipleCommandsSubitems = isZh
    ? [
        `如果命令是独立的且可以并行运行，在单个消息中使用多个 ${BASH_TOOL_NAME} 工具调用。例如：如果你需要运行 "git status" 和 "git diff"，在单个消息中并行发送两个 ${BASH_TOOL_NAME} 工具调用。`,
        `如果命令相互依赖且必须顺序运行，使用单个 ${BASH_TOOL_NAME} 调用并用 '&&' 链接它们。`,
        "仅在需要顺序运行命令但不关心早期命令是否失败时使用 ';'。",
        '不要使用换行符分隔命令（在引号字符串中可以使用换行符）。',
      ]
    : [
        `If the commands are independent and can run in parallel, make multiple ${BASH_TOOL_NAME} tool calls in a single message. Example: if you need to run "git status" and "git diff", send a single message with two ${BASH_TOOL_NAME} tool calls in parallel.`,
        `If the commands depend on each other and must run sequentially, use a single ${BASH_TOOL_NAME} call with '&&' to chain them together.`,
        "Use ';' only when you need to run commands sequentially but don't care if earlier commands fail.",
        'DO NOT use newlines to separate commands (newlines are ok in quoted strings).',
      ]

  const gitSubitems = isZh
    ? [
        '优先创建新提交而不是修改现有提交。',
        '在运行破坏性操作（如 git reset --hard、git push --force、git checkout --）之前，考虑是否有更安全的替代方案来实现相同的目标。仅在破坏性操作确实是最佳方法时才使用。',
        '永远不要跳过钩子（--no-verify）或绕过签名（--no-gpg-sign、-c commit.gpgsign=false），除非用户明确要求。如果钩子失败，调查并修复根本问题。',
      ]
    : [
        'Prefer to create a new commit rather than amending an existing commit.',
        'Before running destructive operations (e.g., git reset --hard, git push --force, git checkout --), consider whether there is a safer alternative that achieves the same goal. Only use destructive operations when they are truly the best approach.',
        'Never skip hooks (--no-verify) or bypass signing (--no-gpg-sign, -c commit.gpgsign=false) unless the user has explicitly asked for it. If a hook fails, investigate and fix the underlying issue.',
      ]

  const sleepSubitems = isZh
    ? [
        '不要在可以立即运行的命令之间休眠 — 直接运行它们。',
        ...(feature('MONITOR_TOOL')
          ? [
              '使用 Monitor 工具从后台进程流式传输事件（每行 stdout 都是一个通知）。对于一次性的 "等待完成"，请改用带 run_in_background 的 Bash。',
            ]
          : []),
        '如果你的命令运行时间较长且希望在完成时收到通知 — 使用 `run_in_background`。无需休眠。',
        '不要在休眠循环中重试失败的命令 — 诊断根本原因。',
        '如果等待你用 `run_in_background` 启动的后台任务，完成后会收到通知 — 不要轮询。',
        ...(feature('MONITOR_TOOL')
          ? [
              '作为第一条命令的 `sleep N`（N ≥ 2）会被阻止。如果你需要延迟（速率限制、刻意控制节奏），请保持在 2 秒以下。',
            ]
          : [
              '如果必须轮询外部进程，使用检查命令（如 `gh run view`）而不是先休眠。',
              '如果必须休眠，保持时间较短（1-5 秒）以避免阻塞用户。',
            ]),
      ]
    : [
        'Do not sleep between commands that can run immediately — just run them.',
        ...(feature('MONITOR_TOOL')
          ? [
              'Use the Monitor tool to stream events from a background process (each stdout line is a notification). For one-shot "wait until done," use Bash with run_in_background instead.',
            ]
          : []),
        'If your command is long running and you would like to be notified when it finishes — use `run_in_background`. No sleep needed.',
        'Do not retry failing commands in a sleep loop — diagnose the root cause.',
        'If waiting for a background task you started with `run_in_background`, you will be notified when it completes — do not poll.',
        ...(feature('MONITOR_TOOL')
          ? [
              '`sleep N` as the first command with N ≥ 2 is blocked. If you need a delay (rate limiting, deliberate pacing), keep it under 2 seconds.',
            ]
          : [
              'If you must poll an external process, use a check command (e.g. `gh run view`) rather than sleeping first.',
              'If you must sleep, keep the duration short (1-5 seconds) to avoid blocking the user.',
            ]),
      ]
  const backgroundNote = getBackgroundUsageNote()

  const instructionItems: Array<string | string[]> = isZh
    ? [
        '如果你的命令将创建新目录或文件，首先使用此工具运行 `ls` 验证父目录存在且位置正确。',
        '始终在命令中用双引号引用包含空格的文件路径（例如 cd "path with spaces/file.txt"）',
        '尝试在整个会话中通过使用绝对路径和避免使用 `cd` 来维持当前工作目录。如果用户明确请求，可以使用 `cd`。',
        `你可以指定可选的超时时间（以毫秒为单位，最大 ${getMaxTimeoutMs()}ms / ${getMaxTimeoutMs() / 60000} 分钟）。默认情况下，你的命令将在 ${getDefaultTimeoutMs()}ms（${getDefaultTimeoutMs() / 60000} 分钟）后超时。`,
        ...(backgroundNote !== null ? [backgroundNote] : []),
        '发出多个命令时：',
        multipleCommandsSubitems,
        '对于 git 命令：',
        gitSubitems,
        '避免不必要的 `sleep` 命令：',
        sleepSubitems,
        ...(embedded
          ? [
              "When using `find -regex` with alternation, put the longest alternative first. Example: use `'.*\\.\\(tsx\\|ts\\)'` not `'.*\\.\\(ts\\|tsx\\)'` — the second form silently skips `.tsx` files.",
            ]
          : []),
      ]
    : [
        'If your command will create new directories or files, first use this tool to run `ls` to verify the parent directory exists and is the correct location.',
        'Always quote file paths that contain spaces with double quotes in your command (e.g., cd "path with spaces/file.txt")',
        'Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of `cd`. You may use `cd` if the User explicitly requests it.',
        `You may specify an optional timeout in milliseconds (up to ${getMaxTimeoutMs()}ms / ${getMaxTimeoutMs() / 60000} minutes). By default, your command will timeout after ${getDefaultTimeoutMs()}ms (${getDefaultTimeoutMs() / 60000} minutes).`,
        ...(backgroundNote !== null ? [backgroundNote] : []),
        'When issuing multiple commands:',
        multipleCommandsSubitems,
        'For git commands:',
        gitSubitems,
        'Avoid unnecessary `sleep` commands:',
        sleepSubitems,
        ...(embedded
          ? [
              "When using `find -regex` with alternation, put the longest alternative first. Example: use `'.*\\.\\(tsx\\|ts\\)'` not `'.*\\.\\(ts\\|tsx\\)'` — the second form silently skips `.tsx` files.",
            ]
          : []),
      ]

  if (isZh) {
    return [
      '执行给定的 bash 命令并返回其输出。',
      '',
      '工作目录在命令之间保持不变，但 shell 状态不会。Shell 环境从用户的配置文件（bash 或 zsh）初始化。',
      '',
      `重要：避免使用此工具运行 ${avoidCommands} 命令，除非明确指示或你已验证专用工具无法完成你的任务。相反，使用适当的专用工具，这将为用户提供更好的体验：`,
      '',
      ...prependBullets(toolPreferenceItems),
      `虽然 ${BASH_TOOL_NAME} 工具可以做类似的事情，但最好使用内置工具，因为它们提供更好的用户体验，并使审查工具调用和授予权限更容易。`,
      '',
      '# 指示',
      ...prependBullets(instructionItems),
      getSimpleSandboxSection(),
      ...(getCommitAndPRInstructions() ? ['', getCommitAndPRInstructions()] : []),
    ].join('\n')
  }

  return [
    'Executes a given bash command and returns its output.',
    '',
    "The working directory persists between commands, but shell state does not. The shell environment is initialized from the user's profile (bash or zsh).",
    '',
    `IMPORTANT: Avoid using this tool to run ${avoidCommands} commands, unless explicitly instructed or after you have verified that a dedicated tool cannot accomplish your task. Instead, use the appropriate dedicated tool as this will provide a much better experience for the user:`,
    '',
    ...prependBullets(toolPreferenceItems),
    `While the ${BASH_TOOL_NAME} tool can do similar things, it's better to use the built-in tools as they provide a better user experience and make it easier to review tool calls and give permission.`,
    '',
    '# Instructions',
    ...prependBullets(instructionItems),
    getSimpleSandboxSection(),
    ...(getCommitAndPRInstructions() ? ['', getCommitAndPRInstructions()] : []),
  ].join('\n')
}
