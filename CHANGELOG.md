# 更新日志

本文件记录 `dsh-plugin-codex-coding` 的发布变化，格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。版本号规则与 DSH 的对应关系见 README 的[版本策略](README.md#版本策略)。

## [0.2.2-rc.1] - 2026-11-06

### 新增

- **卡片推理行的「自动」链接**：推理来源显示为 `会话覆盖`（在输入框里手选过等级，或 `coding_reasoning` 设过）且卡片可交互时，行尾出现 `自动` 链接文本。点击后客户端通过 `modelDirectories` 服务对当前 provider/model 重新选择一次、但不带 `reasoningEffort`，Host 追加一条不含 effort 的 `model/selection`；`codingReasoning` 投影据此把 `userEffort` 与工具覆盖一起清空，下一轮重新交给分类器定档；不带 effort 的选择即使在轮次运行中也按“交还自动”折叠，其余选择保持原规则。该投影 `stateVersion` 递增（5 → 6），旧检查点按日志重新折叠。设置页固定的等级和历史卡片不显示该链接。

### 修复

- **自动推理等级把整轮打成失败（DSH 0.2.2）**：0.2.2 在 `agent/pre-step` 之前就定格本步的 selection，并禁止 `agent/request` 再改 `provider` / `model` / `reasoningEffort`，否则抛出 `agent/request proposed reasoning effort "high" after step preparation fixed "low"; use agent.model.select() before step preparation`。插件的旧写入路径 `sessionController.selectionFor()` 在该版本已被移除，`setEffort()` 实际上什么也没做，于是分类结果总在请求阶段才出现，与已定格的默认 `low` 冲突，整轮中止。
  - 删除 `agent/request` 监听；等级改为 `agent.model.select()` 写入会话的模型选择。
  - 在 `agent/inbox/claimed`（Host 定格 selection 之前同步派发）用预缓存的能力表同步定档，本轮第一步即生效；能力表未就绪时退回 `agent/pre-step`，从下一步生效，不再抛错。
  - `codingReasoning` 投影新增 `running`：只有空闲时出现的 `model/selection` 才算用户手选，插件自己的自动写入不会被回读成"用户选档"而把 `auto` 永久钉死。
  - 该投影 `stateVersion` 递增（3 → 5），旧检查点按日志重新折叠。
- **历史模式卡片仍会跟着当前状态变（rc.3 修复的遗漏边界）**：
  - **根因**：`conversation.chat.turnTail` 交给卡片的 `turn` 是槽位契约里的 `TurnLocation`（`{ kind, turn }`），不是数字。插件原来按数字读，`turn` 永远取不到值，于是每张卡都被当成"没有轮次"：`record` 找不到快照 → 推理等级行整行消失；按钮全部禁用。rc.3 之前则因为回退到实时模式，变成所有卡片跟着当前状态变。现在改为读 `turn.turn`（同时兼容直接传数字）。
  - 客户端只在 `turn === latest` 时把卡片当控件；缺少 `turn` 或 `latest` 的投影值一律按历史卡只读，不再回退到实时模式。
  - `latest` 改为只随 `turn/end` 前进：宿主的回合尾部卡片在 `turn/end` 才发布，若按 `turn/start` 前进，新一轮运行期间屏幕上最后一张卡片会被判成历史卡，整个对话没有任何可点的切换控件。
  - 在轮次中被强杀（只有 `turn/start`、没有 `turn/end`）的轮次不发布卡片，也不再补写快照。
  - 卡片冻结时若对应的推理快照还没落地（尾部与投影更新同刻到达），推理等级行回退到当前值，不再整行消失。
  - `codingWorkflow` 投影 `stateVersion` 递增（3 → 5），旧检查点按日志重新折叠。
  - 新增回归测试：同一张历史卡在投影多次更新后必须渲染出逐字节相同的 HTML。

### 兼容性

- `engines.dsh` 收窄为 `>=0.2.2-rc.1 <0.3.0`（原 `>=0.2.1-rc.5 <0.3.0`）。这条线只在 DSH 0.2.2 上工作：推理定档依赖 `agent.model.select()`，旧 Host 没有该服务，`agent/pre-step` 同样写不进去；而 DSH 只用 `engines.dsh` 判断能否安装，原来的范围会让 0.2.1.x 装上一个"自动等级静默失效"的版本。0.2.1.x 继续用 0.2.1 线。
- README 的兼容表与版本策略同步：删掉“更早版本走 pre-step 兜底”的说法，改为说明 0.2.1.x 会被 `engines.dsh` 直接拦下；`test/package.test.ts` 的断言随包清单一起更新。

### 文档

- README「推理等级自动切换」补充新的定档时机与 `agent/request` 契约；「与 DSH 输入框的模型/推理选择器」说明"运行中的选择视为插件自动写入"的取舍；「会话内模式卡片」补充 `latest` / `turn` 缺失时一律只读、缺 `turn/end` 的补写规则；「已知限制」把 `sessionController` 改为 `agent.model`。
- README 在插件介绍之后新增「快速使用方法」；「安装」新增 DSH 0.2.1.x / 0.2.2.x 与插件版本线的对应说明（`sessionController.selectionFor` 已弃用，两条线不通用）。

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
