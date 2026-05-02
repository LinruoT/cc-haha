# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

本项目是基于 Claude Code 泄露源码修复的本地可运行版本，支持接入任意 Anthropic 兼容 API。技术栈：Bun 运行时 + TypeScript + React/Ink TUI，附带 Tauri 2 + React 桌面端。

AGENTS.md 包含英文版开发指南，本文档补充 AGENTS.md 未涉及的深层架构细节和中文专用内容。

## 常用命令

```bash
# CLI 运行
./bin/claude-haha                  # 交互 TUI 模式
bun run start                      # 同 ./bin/claude-haha

# 服务端（桌面端联调需要）
SERVER_PORT=3456 bun run src/server/index.ts

# 文档
bun run docs:dev                   # VitePress 文档预览
bun run docs:build                 # 文档构建（CI 用 npm ci，非 bun）

# 桌面端
cd desktop && bun run dev          # Vite 开发模式
cd desktop && bun run lint         # TypeScript 类型检查
cd desktop && bun run test         # Vitest 测试

# PR 质量检查（完整套件）
bun run check:server               # 服务端 e2e 测试
bun run check:desktop              # 桌面端 lint + test + build
bun run check:adapters             # IM 适配器测试
bun run check:native               # Tauri 原生 Rust 检查
bun run check:docs                 # 文档构建验证
bun run check:impact               # PR 影响范围报告
bun run check:policy               # 变更策略测试

# 发布
bun run scripts/release.ts <patch|minor|major|x.y.z>  # 桌面端发版
```
## package.json 已经有 bin 配置了，用 bun link 就行：
在项目目录执行，把 claude-haha 注册到全局

`bun link`

然后在任意目录就可以直接用

`claude-haha`

### 如果想用 npm 全局安装方式（不需要保持 link）：
在项目目录打包

`bun pm pack`

全局安装生成的 tgz 文件

`bun add -g ./claude-code-local-999.0.0-local.tgz`

之后在任何目录运行 claude-haha 就行了。

## 顶层架构

项目有三个主要运行时入口：

| 入口 | 路径 | 用途 |
|------|------|------|
| CLI | `src/entrypoints/cli.tsx` | 终端交互 / `--print` 无头模式 / SDK 模式 |
| 服务端 | `src/server/index.ts` | HTTP REST + WebSocket，供桌面端和 IM 适配器使用 |
| 桌面端 | `desktop/` | Tauri 2 + React 图形化客户端，多标签多会话 |

`bin/claude-haha` 是 Shell 入口脚本，负责：设置 `CALLER_DIR` 环境变量 → 选择性加载 `.env` → 通过 `exec bun` 启动 `src/entrypoints/cli.tsx`。当 `CC_HAHA_SKIP_DOTENV=1`（桌面端 spawn 子进程时设置）时跳过 `.env` 加载，避免覆盖 settings.json 中的活跃提供商配置。

## Bun Preload 机制

`bunfig.toml` 中配置 `preload = ["./preload.ts"]`，该脚本在**任何** `bun run` / `bun` 命令之前执行。它：

1. 设置 `globalThis.MACRO`（版本号、包名、构建时间），供 CLI 入口的版本快速路径使用
2. 当 `CALLER_DIR` 存在时 `chdir` 到调用方目录（使得 `./bin/claude-haha` 可在任意目录调用）

## 服务端架构

`src/server/index.ts` 使用 `Bun.serve` 启动，同一端口同时处理 HTTP 和 WebSocket：

- **`/health`** — 健康检查
- **`/api/*`** — REST API（会话管理、模型列表、设置、适配器等），由 `src/server/router.ts` 路由
- **`/ws/:sessionId`** — 桌面端 WebSocket（`channel: 'client'`），双向实时通信
- **`/sdk/:sessionId`** — CLI 子进程 WebSocket（`channel: 'sdk'`），桌面端 spawn 的 CLI 进程通过此通道与桌面端通信
- **`/proxy/*`** — OpenAI 兼容 API 协议翻译代理，由 `src/server/proxy/handler.ts` 处理
- **`/callback`** — OAuth 回调

认证策略：默认 localhost 无需认证；绑定非 localhost 地址或显式设置 `SERVER_AUTH_REQUIRED=1` 时强制认证。

服务端生命周期管理：`conversationService` 跟踪所有活跃 CLI 子进程，SIGTERM/SIGINT 时自动 kill 全部子进程。

## CLI 入口设计

`src/entrypoints/cli.tsx` 采用动态导入策略，通过快速路径避免加载不必要的模块：

- `--version` / `-v`：零模块加载，直接输出 `MACRO.VERSION`
- `--dump-system-prompt`：仅加载必要的 prompt 渲染模块
- `--claude-in-chrome-mcp`：Chrome MCP 服务模式
- 默认：加载完整 CLI（Commander.js + React/Ink TUI）

`CC_HAHA_SKIP_DOTENV=1` 时通过 `--env-file=/dev/null` 禁用 Bun 自动加载 `.env`。

## 工具系统

`src/tools/` 下每个工具一个子目录，包含工具的 schema 定义和实现逻辑。关键工具：

- **BashTool** / **PowerShellTool** — shell 命令执行，在模块加载时捕获 `DISABLE_BACKGROUND_TASKS` 环境变量
- **AgentTool** — 子 Agent 调度，同样在模块加载时捕获环境变量
- **SkillTool** — 调用 Skill 系统
- **TaskCreateTool** / **TaskUpdateTool** 等 — 任务管理系统
- **FileEditTool** / **FileReadTool** / **FileWriteTool** — 文件操作（FileEdit 使用精确字符串替换，非 sed）

工具权限由 `src/hooks/toolPermission/` 控制，包括 YOLO 分类器（`src/utils/permissions/yolo-classifier-prompts/`）。

## 环境变量引导

`.env.example` 注释中列出了主流提供商的配置模板。核心变量：

- `ANTHROPIC_AUTH_TOKEN` — API 密钥
- `ANTHROPIC_BASE_URL` — API 端点（支持 MiniMax、OpenRouter、LiteLLM 代理等）
- `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL` / `ANTHROPIC_DEFAULT_HAIKU_MODEL` / `ANTHROPIC_DEFAULT_OPUS_MODEL` — 模型映射
- `DISABLE_TELEMETRY=1` 和 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` — 建议始终开启

## IM 适配器系统

`adapters/` 目录包含 Telegram 和飞书的 IM 适配器，架构链路：

```
Desktop Webapp Settings → /api/adapters → ~/.claude/adapters.json
→ adapters/<platform>/index.ts → /api/sessions + /ws/:sessionId → Claude Code session
```

- `adapters/common/` — 跨平台附件工具、WebSocket 桥接（`ws-bridge.ts`）
- `adapters/telegram/` — grammy Bot API 封装
- `adapters/feishu/` — @larksuiteoapi/node-sdk 封装，含流式卡片渲染（`streaming-card.ts`）

附件收发支持图片和文件，入站下载到 `~/.claude/im-downloads/`，24 小时后自动清理。

## 发布流程

桌面端发布由 `.github/workflows/release-desktop.yml` 在推送 `v*.*.*` 标签时自动触发：

1. `bun run scripts/release.ts <version>` 自动更新 `desktop/package.json`、`desktop/src-tauri/tauri.conf.json`、`desktop/src-tauri/Cargo.toml`，刷新 Cargo.lock，并创建 git commit + 带注释的 tag
2. 要求 `release-notes/vX.Y.Z.md` 与版本号精确匹配，否则 CI 快速失败
3. 提交命令：`git push origin main --tags`

## PR 质量门禁

`.github/workflows/pr-quality.yml` 对 PR 进行质量检查。`scripts/pr/` 下的脚本支持本地运行：

- `check-pr.ts` — PR 质量主检查
- `impact-report.ts` — 变更影响范围报告
- `change-policy.test.ts` — 变更策略验证
- `run-server-tests.ts` — 服务端 e2e 测试

## 编码约定补充

- 2 空格缩进，ESM import，无分号
- React 组件 PascalCase，函数/变量 camelCase
- Git 提交遵循 Conventional Commits（`feat:`、`fix:`、`docs:` 等）
- 分支命名：`fix/xxx`、`feat/xxx`、`docs/xxx`（不要使用 `codex/` 前缀）
- 桌面端测试使用 Vitest + Testing Library，环境为 jsdom
- Stub 模块位于 `stubs/` 目录，用于替代原生模块（如 `color-diff-napi`）
