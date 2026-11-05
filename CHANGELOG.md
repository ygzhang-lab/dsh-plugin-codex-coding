# 更新日志

本文件记录 `dsh-plugin-codex-coding` 的发布变化，格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。版本号规则见 README 的[版本策略](README.md#版本策略)：`0.2.<内部流水号>[-rc.N]`，前两位对齐 DSH 的 `0.2.x`。

## [0.2.1-rc.3] - 2026-11-05

### 修复

- **macOS 桌面出现「中文界面、英文回答」**：DSH 桌面用用户的**登录 shell 环境**启动 Host，macOS 的登录 shell 通常导出 `LANG=C.UTF-8`，而窗口界面跟随的是系统语言（`AppleLanguages`）。现在自动模式的判定顺序为：设置项 → DSH 界面语言偏好 → **操作系统界面语言** → POSIX 环境变量 → `Intl` 默认区域。
  - `C`、`C.UTF-8`、`POSIX` 属于「没有语言信息」，不再被当成英文，而是跳过继续往下找。
  - 操作系统列表按顺序取第一个本插件支持的语言（`zh` / `en`），跳过 `ja`、`de` 等未支持项。
  - 新增 `src/system-language.ts`：仅 Host 使用，macOS 读 `defaults read -g AppleLanguages`，进程内只探测一次（1s 超时），失败静默回落，不影响 prompt 组装。
- **会话内模式卡片的历史项会跟着当前状态一起变**：之前每张卡片读的是会话级实时投影，任意一次模式切换或等级调整都会重渲染整段会话的所有卡片。现在卡片按轮冻结：
  - `codingWorkflow` 与 `codingReasoning` 投影新增 `latest` 与 `turns`（逐轮快照），折叠日志里已有的 `turn/start` / `turn/end`，不新增事件类型；`stateVersion` 2 → 3，旧检查点作废并按日志重新折叠。
  - 新一轮一开始（`turn/start`）上一轮卡片即锁定：按钮置灰禁用，`aria-pressed` 只标记当时生效的模式，切换提示与错误文案隐藏。
  - 历史卡片的推理行用该轮快照，不再读当前设置固定值或最近一次请求；历史最多保留 100 轮。

### 变更

- 人设新增身份回答约束：被问「你是谁」时只回答角色与优化目标，不复述 runtime context，不输出 GUI URL。
- **点模式卡片不再往对话里灌一整段命令输出**：卡片通过宿主的 `workflow` 命令切换模式，DSH 会为每次命令追加 `command/run` / `command/done` 并渲染成通用命令卡片（`workflow` + 整段 `workflow mode set to ...`）。现在客户端向 keyed 插槽 `conversation.chat.commandview` 注册 key `workflow` 的渲染器，替换成一行确认（`workflow · 工作流模式 → 问答模式`）：
  - 命令生命周期仍写入会话日志，模式投影照常从 `command/run` 折叠，刷新/恢复会话后卡片状态一致；
  - 切换失败时该行显示 handler 给出的原因（红色），运行中不渲染；
  - 不带参数的 `/workflow` 是查看状态，保留完整说明。
- **npm 发布改为 OIDC 可信发布**：`.github/workflows/publish.yml` 不再读 `NPM_TOKEN` / `NODE_AUTH_TOKEN`，改为用工作流的 `id-token: write` 在 `npm publish` 时换取短期凭证。
  - 去掉 `actions/setup-node` 的 `registry-url`：它写入的 `_authToken` 行会让 npm 跳过 OIDC 交换。
  - 新增 npm ≥ 11.5.1 的显式校验（major/minor/patch 三段都比较），版本不够直接失败，而不是无提示地回退到空 token。
  - 拆成 `check` / `publish` 两个 job：`id-token: write` 只挂在 `publish` 上，该 job 只下载 `check` 上传的 `lib/` artifact 并执行 `npm publish --ignore-scripts`，安装与构建不再持有 OIDC 权限，也不会把 `prepublishOnly` 再跑一遍。
  - 「版本已存在就跳过」的守卫改为 fail-closed：只有 registry 明确返回 404 才算未发布，查询超时、限流、5xx 一律失败退出。
  - Node 版本改用 `.node-version`（`node-version-file`），两个 job 都加 `timeout-minutes: 15`。
  - provenance 由可信发布自动生成，工作流仍保留显式 `--provenance`。

### 文档

- README「语言」补上操作系统语言这一步，并说明 macOS 桌面为什么会走到它。
- README「会话内模式卡片」补充历史卡片只读的规则：何时锁定、按钮状态、刷新后仍显示旧值。
- README「会话内模式卡片」说明命令回显被压缩成一行确认的范围与例外。
- README「发布工作流」补上 npm 可信发布的一次性配置步骤（Trusted Publisher 字段、环境留空、首次发布仍需 token 的限制）。

## [0.2.1-rc.2] - 2026-11-05

### 新增

- 新增 `coding:language` 动态提示与 `language` 设置：`auto` 先读 DSH 界面语言偏好，再回退宿主 locale，只发 `zh` / `en`。
- 新增语言解析、推理投影、快照稳定性的测试。
- 补齐客户端会话卡片、icon、locale 与构建脚本。

### 变更

- 插件与 bundle 行由 `dsh-plugin-coding` 更名为 `dsh-plugin-codex-coding`，预设改称 **Codex Coding**。
- 精简 `coding:contract`（5853 → 4489 字符）：五类任务打法并入五个阶段，Working principles 压到两行，并加体积护栏测试。
- `coding:workflow` 只写推理等级来源，不再写每轮都变的 level 与分类依据，避免 runtime-context 快照整条重复追加。

## [0.2.1-rc.1] - 2026-11-05

### 新增

- 首个发布：Codex Coding 预设、`apply_patch` 补丁工具、问答 / 审查 / Codex 三模式工作流、推理等级自动切换、本地 Skill 与 DSH 插件工具开关。

[0.2.1-rc.3]: https://github.com/ygzhang-lab/dsh-plugin-codex-coding/compare/v0.2.1-rc.2...v0.2.1-rc.3
[0.2.1-rc.2]: https://github.com/ygzhang-lab/dsh-plugin-codex-coding/compare/v0.2.1-rc.1...v0.2.1-rc.2
[0.2.1-rc.1]: https://github.com/ygzhang-lab/dsh-plugin-codex-coding/releases/tag/v0.2.1-rc.1
