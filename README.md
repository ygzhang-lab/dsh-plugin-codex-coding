# DSH Codex Coding

一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Codex 风格 Coding 插件：用一份**交付契约**约束工作流，用 `apply_patch` 做外科式修改，并支持推理等级自动切换、本地 Skill 开关和 DSH 插件工具开关。

它由 **一个自定义 DSH 预设（Codex Coding）+ 三个自定义 DSH 工具** 组成。插件本身不在 Host 启动时改变任何 Agent 行为；唯一入口是在新建会话时选择 **Codex Coding** 预设。

发布包名是 `dsh-plugin-codex-coding`，在 DSH 中的插件显示名是 **DSH Codex Coding**。源码与 issue 在 [ygzhang-lab/dsh-plugin-codex-coding](https://github.com/ygzhang-lab/dsh-plugin-codex-coding)。

**版本号**：插件采用 `0.2.<内部流水号>`，只把前两位对齐到 DSH 的 `0.2.x`；第三位是内部构建序号，与 DSH 的补丁号或 rc 号没有对应关系，实际兼容范围以 `engines.dsh` 为准。当前版本 `0.2.1-rc.3`，详见[版本策略](#版本策略)与[更新日志](CHANGELOG.md)。

## 特性

- **交付契约**：固定为「先建立上下文 → 定义完成标准 → 最小修改 → 最窄验证 → 紧凑交付」五段。契约作为独立的 `coding:contract` 系统提示段落，不塞进人格前缀。
- **工作流三模式**：默认自动选择 **问答模式 / 审查模式 / Codex 模式**；问答和方案讨论不会自动改代码，也可用 `coding_mode` 手动切换。
- **逐轮模式卡片**：每轮结束的卡片记录该轮自己的工作流模式与推理等级；切换只影响后续轮次，历史卡片只读、按钮置灰。
- **Codex 补丁工具**：新增 `apply_patch`，支持一次调用多文件、多 hunk 和移动（删除在底层文件系统提供 `remove` 时可用），严格解析 Codex patch 语法；上下文不匹配时给出 expected 与文件片段，而不是静默改错文件。
- **Codex 工作流**：先检查、再计划（`todo_write`）、小步修改、运行最窄验证、检查自己的 diff，最后简洁汇报。
- **DSH 原生适配**：优先复用 `read` / `write` / `edit` / `glob` / `grep` / `bash` / `job_*` / `todo_write` / `web_*` 等内置工具，不重复造轮子。
- **推理等级自动切换**：`auto` 默认 **Low**；只有多文件，或一个功能模块的审查/重构，才用 **High**；项目级搭建/重构/审查或一次性无法修复的 Bug 才用 **Max**；问答、建议、简单修复、单文件审查始终 Low。
- **本地 Skill 开关**：一键允许或禁止加载项目目录、用户目录中已安装的 Skill。
- **DSH 插件工具开关**：多选控制该预设中已安装的 DSH 工具插件是否向 Agent 暴露工具。
- **中英双语**：只带中文/英文两种语言包；界面跟随 DSH 界面语言，会话回复与工作流 Todo 用同一种语言，非中文环境一律英文。自动模式还会读操作系统界面语言，所以 macOS 登录 shell 的 `LANG=C.UTF-8` 不会再把中文界面变成英文回答。
- **可视化配置 + 配置文件**：DSH Desktop 中通过插件配置页修改；CLI 中通过 profile 的 `cordis.patch.yml` 修改。
- **低 Token 开销**：不额外调用模型做复杂度判断；`coding_context` 一次收集仓库状态、`AGENTS.md`、diff 统计和验证命令，替代多次探索性 shell。

## 交付契约

`coding:contract` 是独立的系统提示段落（order 10，不塞进人格前缀），固定五段：

1. **Establish context**：先读 `AGENTS.md` 和任务涉及的文件，用 `coding_context` 获取仓库事实，不靠记忆猜代码。
2. **Define done**：先用一句话说清目标与可观察的验收标准；多步任务用 `todo_write` 写 3–6 个可验证步骤。
3. **Change surgically**：读后改，优先 `apply_patch`，最小 diff，不碰无关改动，不擅自提交。
4. **Verify before claiming success**：先复现失败，再修根因；跑最窄检查；用 `git diff` / `git status` 检查自己的改动；没跑过的检查不允许说通过。
5. **Deliver compactly**：只报告结果、改动文件、验证证据和剩余风险，不倾倒 diff 或步骤日志。

另附 Bug / Feature / Refactor / Review / Docs 五类任务的具体打法，避免“所有任务都套同一套流程”。

## 工作流模式

推理等级和工作流是两件事：`Low` 只表示推理预算低，不代表必须改代码。

| 模式                | 适用场景                           | 行为                                                                                     |
| ------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| 问答模式（Q&A）     | 问答、建议、方案比较、先规划不执行 | 先回答；不编辑、不跑测试、不建 todo；给 1–3 个选项、推荐和短计划；以“需要你决定什么”结尾 |
| 审查模式（Review）  | 代码审查、只读检查                 | 只给 findings（文件:行 + 复现路径），按影响排序；不自动修                                |
| Codex 模式（Codex） | 明确要修复、实现、修改、重构、运行 | 走完整五段式交付契约                                                                     |

默认 `auto` 由提示词按请求选择。需要手动切换时，对 Agent 说：

```text
coding_mode()                  # 查看当前模式
coding_mode(mode="consult")    # 本次会话固定为问答模式
coding_mode(mode="review")     # 只读审查模式
coding_mode(mode="code")       # 进入 Codex 模式
coding_mode(mode="auto")       # 清除手动覆盖
```

手动模式会一直生效，直到你再次切换；它只改变工作流，不改变推理等级。混合请求先完成明确的只读部分，再询问是否修改代码。

### 会话内模式卡片

Coding 会话每完成一轮，对话流末尾会出现一张 **工作流模式** 卡片（非 Coding 预设的会话不显示）：

- **自动**：由模型按本轮请求在 问答模式 / 审查模式 / Codex Coding 中选择；
- **手动 审查模式**（或 问答模式 / Codex Coding）：本会话固定，模式说明会作为动态系统提示进入下一次请求；
- 卡片上有 **自动 / 问答模式 / 审查模式 / Codex Coding** 四个按钮，点击即切换，对后续消息生效；切换结果写入会话日志，刷新或恢复会话后卡片仍显示同一模式。即使模型之后调用了 `coding_mode`，卡片也会同步。
- **历史卡片只读**：每张卡片记录的是**它自己那一轮**的工作流模式和推理等级。切换模式或调整等级只影响之后开启的轮次；新一轮一开始（`turn/start`），上一轮的卡片就锁定——按钮置灰禁用、只保留 `aria-pressed` 标记当时生效的模式，提示文案也随之隐藏。刷新或恢复会话后，历史卡片仍显示各自的旧值，不会被当前状态覆盖。历史卡片的推理来源只区分 `会话覆盖` 与 `自动`：设置页的固定等级不写进会话日志，历史卡片不去猜一个当前值。
- 卡片上另有一行 **推理等级**，显示本会话真正生效的等级和来源：`自动`（最近一次请求实际发送的 effort）、`会话覆盖`（输入框选择器里手选过，或 `coding_reasoning` 设过）、`设置固定`（插件设置页固定）；本轮还没发出请求时显示 `待确定`。
- 卡片视觉直接复用 Desktop 的设计 token：`--dsw-alias-border-l1` 边框、`--dsw-radius-lg` 圆角、`--dsw-alias-label-*` 文字色、`--dsw-static-neutral-50/850` 明暗背景、`--dsw-focus-ring-*` 焦点环；样式按宿主自身的 `<style data-plugin-css>` 方式注入一次，和会话里其它官方卡片保持同一套观感。

等价的手动方式是在输入框直接执行命令：

```text
/workflow              # 查看当前模式
/workflow review       # 本会话固定为审查模式
/workflow auto         # 清除覆盖，回到自动选择
```

卡片按钮通过宿主的 `workflow` 命令切换模式，命令生命周期仍写入会话日志（投影据此得出当前模式），但聊天流里原本的通用命令卡片被替换成一行确认（如 `workflow · 工作流模式 → 问答模式`）：模式本身由上方卡片展示，不再重复整段提示。切换失败时这一行显示失败原因；直接输入不带参数的 `/workflow` 是查看状态，仍保留完整说明。

卡片上的按钮只用于切换工作流模式；推理等级那一行只读，调整仍用插件设置页或 `coding_reasoning`。

### 工作流提示框中的推理等级

`coding:workflow` 动态提示（order 15）只写**等级来源**，不写等级本身和分类依据：

```text
Workflow mode: auto. Choose Q&A, Review, or Codex Coding from the current request; ...
Reasoning: auto (level chosen by the preset at each step)
```

| 提示内容                                                     | 含义                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `Reasoning: auto (level chosen by the preset at each step)`   | 自动：等级由分类器在 pre-step 决定，这行对所有自动请求逐字节相同 |
| `Reasoning: manual (pinned by Coding settings)`               | 手动：插件设置页把等级固定为 `low`/`high`/`max`          |
| `Reasoning: manual (session override)`                       | 手动：本会话用 `coding_reasoning(effort=...)` 覆盖过      |
| `Reasoning: manual (picked medium in the chat box)`           | 手动：用户在输入框的选择器里手选了 `medium`              |

不把等级和分类依据写进提示，是因为 DSH 会把 `systemPrompt.context()` 的贡献合成为**一条** runtime-context 快照消息，任一贡献变化就整条重新追加。等级和依据几乎每轮都变，那样会把整份快照（含语言、工作目录、沙箱策略）反复写进历史；实测长会话曾积累 9 份、约 10k 字符的作废快照。等级仍有两处可见：会话卡片的 **推理等级** 行，以及 `coding_reasoning` 工具输出。

设置页的固定等级优先于会话覆盖；覆盖只在设置为 `auto` 时生效。`coding_reasoning()` 报告的等级始终是实际请求使用的值。

同一份等级信息还有第二个出口：会话卡片上的 **推理等级** 行。它读 `codingReasoning` 会话投影——`request/header` 事件给出最近一次请求实际携带的 `reasoningEffort`，`model/selection` 给出输入框里手选的等级，`coding_reasoning` 的 `tool/call` 事件给出工具覆盖——所以用户不用问模型也能看到当前等级和来源。

### 与 DSH 输入框的模型/推理选择器

DSH 桌面端的聊天输入框可以选模型和推理等级，它会写一条 `model/selection` 事件，Host 用它在下一轮请求里生效。Coding 插件在自己的投影里折叠这条事件，规则是**用户在输入框里选了算数**：

- 推理等级设置为 `auto` 时，一旦用户在输入框里手选了推理等级，该选择成为本会话覆盖，插件不再用分类结果覆盖它；`coding_reasoning(effort="auto")` 或再次手选会更新/清除它。
- 换模型本身始终生效，插件只读新 route 去查它支持哪些 effort；手选的 effort id 若不被新 route 接受，回退到该等级最接近的 effort（`mapEffort`）。
- 设置页把等级固定为 `low`/`high`/`max` 时优先级最高，输入框的手选不生效。
- 手选的 effort id 可能是 `minimal`/`medium`/`xhigh` 这类 provider 取值，卡片按该值原样显示（首字母大写）。
- 只换模型时，Host 也会把该模型的默认 effort 写进同一条 `model/selection` 事件，因此可能顺带固定一个等级；用 `coding_reasoning(effort="auto")` 可解除。

注意：Host 在用户改模型/等级时还会把它保存为全局默认模型（`saveSelection`），这会影响新会话的初始默认值，与插件无关。

## 安装

### 兼容性与依赖

| 项目             | 声明                                                                                                       | 说明                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| DSH              | `engines.dsh`: `>=0.2.1-rc.5 <0.3.0`                                                                       | 在 0.2.1-rc.5 完整验证；0.2.2-rc.1 已验证 Host 启动、配置组合与 Client 模块加载，预设行为仍建议在会话中确认 |
| Node.js          | `engines.node`: `>=24.9.0`                                                                                 | 与 DSH 0.2.2+ 的 Node 要求一致；DSH Desktop 内置 Node 24.x，`.node-version` 与发布 CI 同步为 24.9.0         |
| 宿主提供（peer） | `@deepseek-ai/cordis` `>=4.0.5 <5`、`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-tools` `>=0.2.1-rc.5 <0.3.0` | 不随插件安装；由 DSH 安装目录按包名解析，插件只消费宿主的实例                                               |
| 插件自带依赖     | `@deepseek-ai/schemastery` `^3.18.5`、`zod` `4.4.3`                                                        | 分别用于 Host 配置 schema 与会话投影（工作流模式卡片）                                                      |

peer 包必须由宿主提供。DSH 初始化的 profile 固定 `autoInstallPeers: false`，因此 `dsh plugin add` 可能打印 `missing peer` 警告，这是预期行为；不要为了消除警告把 `@deepseek-ai/cordis` 装进 profile——宿主与插件各加载一份 cordis 会让 `Service` 实例与依赖注入分裂。`dsh plugin add` 结束时出现该警告不影响安装，安装后 `dsh --profile <profile> --dump-config` 能看到 bundle 的两行即说明组合成功。

### 版本策略

插件版本号只把**前两位**对齐到 DSH 的 `0.2.x`：`0.2.<内部流水号>`（当前 `0.2.1`）。第三位是内部构建序号，与 DSH 的补丁号、rc 号没有对应关系；DSH 的兼容范围以 `engines.dsh` 和上表为准。

### DSH Desktop

在 **Plugins / 插件** 页面选择 **Add plugin / 添加插件**，输入：

```text
dsh-plugin-codex-coding
```

安装并启用 bundle 后，新建会话，在预设选择器中选择 **Codex Coding**。

### CLI

```bash
dsh plugin --profile <profile> add dsh-plugin-codex-coding
```

然后启动该 profile，新建会话并选择 **Codex Coding** 预设：

```bash
dsh --profile <profile>
```

### 从源码本地安装

用于开发调试：先在仓库里构建，再把**本地目录**作为插件挂载。

```bash
pnpm install          # 需要 Node >=24.9.0
pnpm build
dsh plugin --profile <profile> add /absolute/path/to/dsh-plugin-codex-coding
```

DSH Desktop 也可以在 **Plugins → Add plugin** 里直接填本地绝对路径。本地挂载记录的是目录引用，改完源码后重新 `pnpm build`；profile 的 `patchReload` 为 `live` 时会重新加载，未生效则重启 DSH 再试。

本地挂载只用于开发验证；分发给他人请使用 npm 包名（见上一节）。

## 唯一运行入口

bundle 只插入两类行：

1. `dsh-plugin-codex-coding`：Host 设置服务与 Web 配置页；不注册 Agent 工具、不注入提示词。
2. `preset-coding`：声明 **Codex Coding** 预设；实际的人格、工具、Skill、推理策略都在这个预设内部挂载。

因此：

- 不选择该预设的会话完全不受影响。
- 禁用或卸载 bundle 后，预设及其工具一起消失。
- Host 侧没有常驻的 Agent 行为，只有一份可读取的配置。

> DSH 只对内置预设按界面语言本地化；自定义预设的 `name` 和 `description` 会原样显示。这里的预设名固定为 **Codex Coding**，介绍保留中英文双语。

## 配置

### DSH Desktop 可视化配置

打开 **Plugins** 页面，点进 **DSH Coding** bundle；配置项直接显示在该 bundle 页面上，位于介绍和插件行之间，不需要再进下一层：

- **Reasoning effort**
  - `Automatic`：自动切换（默认）
  - `Low` / `High` / `Max`：固定等级
- **Local skills**
  - 允许 / 禁止本地 Skill
- **Conversation language / 会话语言**
  - `Automatic`：跟随 DSH 界面语言，未设置时跟随宿主环境语言；不是中文即英文
  - `中文` / `English`：固定会话语言
- **Installed DSH plugins**
  - 多选：勾选表示允许该插件的工具；取消勾选只隐藏工具，不卸载插件

配置写入当前 profile，重启后保留。

### CLI 配置文件

编辑当前 profile 的 `cordis.patch.yml`：

```yaml
- id: dsh-plugin-codex-coding
  name: dsh-plugin-codex-coding
  config:
    reasoning: auto # auto | low | high | max
    localSkills: true # true | false
    language: auto # auto | zh | en
    disabledPlugins: # 要隐藏工具的工具插件模块名
      - "@deepseek-ai/dsh-tool-web"
```

注意：Loader 的按 id 覆盖会**整体替换** `config`，因此覆盖时把四个字段都写全。

## 语言

插件包内只有**中文**和**英文**两种语言包，没有第三种语言的翻译，也不做机器翻译：

| 位置                                   | 语言来源                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| 插件管理器标题/描述（`locale/*.json`） | DSH 界面语言，由界面语言服务挑选，缺 `zh` 时用 `en`                          |
| 设置页与会话模式卡片                   | 同上，`ctx.locale.register(ns, { zh, en })`，界面语言切换即时生效             |
| 会话交互（回复、追问、交付说明）         | `coding:language` 系统提示：自动 = DSH 界面语言 → 操作系统界面语言 → 宿主环境语言 → 英文 |
| 工作流 Todo（条目与状态说明）           | 同上，与回复同一种语言；代码、路径、命令、报错原文保持原样                   |

自动模式的判定顺序：

1. 设置页/`language` 字段为 `zh` 或 `en` 时直接使用；
2. 否则读取 DSH 已保存的界面语言（`locale.preference`，没有保存过就没有值）；
3. 否则读取**操作系统界面语言列表**（macOS 读 `defaults read -g AppleLanguages`，每个 Host 进程只探测一次；Windows/Linux 的 `Intl` 本身就反映系统区域，无需探测），取第一个本插件支持的语言（`zh`/`en`），跳过 `ja`、`de` 等未支持项；
4. 否则用宿主环境语言：`LC_ALL` / `LC_MESSAGES` / `LANG`；`C`、`C.UTF-8`、`POSIX` 属于"没有语言信息"，会跳过而不是当成英文；
5. 最后退回 `Intl` 默认区域：以 `zh` 开头的标签用中文，其余一律英文。

第 3 步是 macOS 桌面场景的关键：DSH 桌面把**登录 shell 环境**传给 Host，macOS 的登录 shell 通常导出 `LANG=C.UTF-8`，而窗口界面跟随的是系统语言（`AppleLanguages`）。只看环境变量就会得到"中文界面、英文回答"。

宿主侧没有可用的界面语言服务时（例如 headless 运行），第 2 步自动跳过，不会报错。

## 推理等级自动切换

`auto` 模式默认 **Low**，不产生额外模型调用。它在每次 prompt 组装前读取：

1. **请求类型**：问答/建议、简单修复、单文件审查、单文件修改 → `Low`；多文件，或一个功能模块的审查/重构 → `High`；项目级或无法一次修复 → `Max`。
2. **执行计划**：6 步以上或 5 个以上未完成项才升到 `High`；3 步计划仍是 `Low`；计划**从不**产生 `Max`。

| 等级   | 使用场景                                                                         | 使用频率           |
| ------ | -------------------------------------------------------------------------------- | ------------------ |
| `Low`  | 问答/建议/指导；简单 Bug 修复；单文件审查；单文件修改；小型计划（通常少于 6 步） | 默认，绝大多数任务 |
| `High` | 多文件修改；一个功能模块的审查/重构；6 步以上或 5 项以上未完成的计划             | 较少               |
| `Max`  | 创造性项目搭建；项目级重构；项目级代码审查；一次性无法修复的 Bug                 | 极少               |

关键约束：

- **任何寻求意见或指导的问答式任务只用 `Low`**，即使问题里出现架构、重构、并发等字眼。
- `Max` 只保留四类：创造性项目搭建、项目级重构、项目级代码审查、一次性无法修复的 Bug。
- `High` 只用于多文件，或一个功能模块的审查/重构；普通实现、简单修复、单文件审查都不升 `High`。
- 同一轮内只升不降；新的一轮重新判定。若模型不支持目标等级，会映射到该模型支持的最接近等级。用户在输入框里手选推理等级、或用 `coding_reasoning` 覆盖时，跳过上述判定，直到覆盖被清除。

这是刻意的低偏差：DeepSeek 在 `Low` 下已能处理绝大多数问答、单文件修改和简单修复；`High` 留给真正的多文件或功能模块审查/重构，`Max` 只留给项目级或无法一次修复的任务。

需要临时覆盖时，Agent 可调用自定义工具 `coding_reasoning`：

```text
coding_reasoning()                 # 查看当前模式和生效等级
coding_reasoning(effort="max")     # 本次会话固定为 Max（仅 auto 模式）
coding_reasoning(effort="auto")    # 清除会话覆盖
```

## 本地 Skill

`Local skills` 打开时，**Codex Coding** 预设挂载：

- `@deepseek-ai/dsh-skill-filesystem`
- `@deepseek-ai/dsh-tool-skill`

关闭时不会改动 Host 的 Skill 注册表，而是对该预设的新会话隐藏 `skill` 工具；`dsh-tool-skill` 会在下一次 pre-step 发布空目录，从而停用旧 Skill 名称。

## DSH 插件工具开关

该预设实际挂载的 DSH 工具插件如下。取消勾选即通过 Agent 作用域的 `ctx.tools.restrict({ deny })` 隐藏对应工具；标为 **核心** 的行由 Coding 工作流强制依赖，复选框只读且始终勾选：

| 插件模块                          | 工具                                                 | 核心 |
| --------------------------------- | ---------------------------------------------------- | ---- |
| `@deepseek-ai/dsh-tool-bash`      | `bash`                                               | ✅   |
| `@deepseek-ai/dsh-tool-pwsh`      | `pwsh`                                               | ✅   |
| `@deepseek-ai/dsh-tool-fs`        | `read`, `write`, `edit`, `apply_patch`, `read_image` | ✅   |
| `@deepseek-ai/dsh-tool-fs-search` | `glob`, `grep`                                       |      |
| `@deepseek-ai/dsh-tool-jobs`      | `job_output`, `job_list`, `job_kill`                 |      |
| `@deepseek-ai/dsh-tool-todo`      | `todo_write`                                         | ✅   |
| `@deepseek-ai/dsh-tool-web`       | `web_search`, `web_fetch`                            |      |
| `@deepseek-ai/dsh-tool-skill`     | `skill`                                              |      |

设计边界：

- 开关只作用于 **该预设实际挂载的 Agent 工具插件**，不会动态改变 Cordis 组合，也不会卸载用户安装的第三方插件。
- **核心插件不可关闭**：配置页把核心行显示为灰色只读；即使手改 profile 的 `cordis.patch.yml` 把核心模块写进 `disabledPlugins`，`normalizeOptions` 也会在 Host 侧剔除它们，`disabledToolNames` 也会忽略核心模块——`bash`/`pwsh`/`read`/`edit`/`apply_patch`/`todo_write` 不会因此被隐藏。
- 第三方插件的工具没有稳定的“插件 → 工具”所有权元数据；为保证不误伤其他工具，当前不把任意第三方 bundle 暴露为开关。
- 设置对**该预设的新会话**生效；已有会话保留启动时的策略。
- 取消勾选非核心插件（如 Filesystem 之外的 `Web`、`File search`）只会隐藏其工具，不影响核心工作流。

## 自定义工具

### `apply_patch`

Codex 兼容的补丁编辑器，用于多文件、多 hunk 或文件移动：

```text
*** Begin Patch
*** Update File: src/app.ts
@@ function run()
-  return old
+  return next
*** End Patch
```

- 支持 `*** Add File:` / `*** Delete File:` / `*** Update File:`、`*** Move to:`、`@@` 分段和 `*** End of File`。
- 先解析并计算所有文件，再统一写入；某个文件上下文不匹配时，不会留下改了一半的树。
- 失败时报告 expected 行、文件片段和常见 marker 提示，方便模型一次修正。
- 写入走 DSH 的 `ctx.fs`、`fs/write-intent`、`fs/observed` 和 sandbox policy，保留 read-before-write 与版本保护。
- 删除依赖底层文件系统提供 `remove`；没有时明确报错，不会假装删除。

### `coding_context`

在多步编码任务开始时调用一次，返回紧凑的仓库快照：

- 当前工作目录、Git 分支和变更文件
- 从仓库根到当前目录的 `AGENTS.md` 列表（只列路径，不读内容）
- 已跟踪改动的 diff 统计（文件数、`+insertions` / `-deletions`）
- 包管理器（pnpm / npm / yarn / bun），monorepo 中取最近的 `package.json` 并显示相对目录
- 检测到的验证命令（`typecheck` → `lint` → `test`，否则 `build`）
- 当前预设策略（推理模式、工作流模式、Skill、被禁用的插件）

它不读取文件内容，不替代 `read` / `grep`，也不在每一步重复调用。

### `coding_reasoning`

查看或覆盖当前会话的推理等级。普通任务不需要调用；提示词要求只在用户明确要求或任务明显升级时使用。

### `coding_mode`

查看或手动切换当前会话的工作流模式：

- `auto`：清除手动覆盖，由提示词按请求选择。
- `consult`：问答模式（Q&A）；不自动编辑、不跑测试、不建 todo。
- `review`：审查模式（Review）；只给 findings，不自动修。
- `code`：Codex模式；完整编码工作流。

它只改变工作流，不改变推理等级；普通请求不需要调用，只有用户明确要求切换或询问当前模式时才调用。

## 开发

需要 Node `>=24.9.0`（见 `engines.node` 与 `.node-version`；发布 CI 同样使用 24.9.0）。

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
```

发布到 NPM：

```bash
npm publish
```

`prepublishOnly` 会自动执行 `typecheck`、`test`、`build`。

### 发布工作流

`.github/workflows/publish.yml` 只接受**手动触发**（`workflow_dispatch`）：日常 push、合并、打 tag 都不会打包或发布。发布时在 GitHub 的 **Actions → Publish → Run workflow** 里选择分支、dist-tag 和是否 dry run；`dry_run` 默认为 `true`，只跑检查和 `npm publish --dry-run`。

发布走 **npm 可信发布（Trusted Publishing / OIDC）**，仓库里不保存任何 npm token：

- 工作流拆成两个 job：`check`（安装、typecheck、test、build，只读权限）把构建好的 `lib/` 上传为 artifact；`publish` 只下载这个 artifact 并执行 `npm publish`，`id-token: write` 只挂在 `publish` job 上；
- `npm publish` 时用这次运行的 OIDC 身份直接向 registry 换取短期发布凭证；
- 需要 npm CLI ≥ 11.5.1（Node 24 自带；工作流里有一步显式校验，不满足直接失败）；
- 不要给 `actions/setup-node` 配 `registry-url`，也不要在发布步骤里设 `NODE_AUTH_TOKEN`：前者会往 `.npmrc` 写一行 `_authToken`，npm 就不再尝试 OIDC 交换；
- Node 版本取自 `.node-version`（`setup-node` 的 `node-version-file`），本地与 CI 用同一个版本；
- 发布步骤带 `--ignore-scripts`：`prepublishOnly` 的检查和构建只在 `check` job 跑一次，持有 OIDC 权限的步骤不执行包脚本；
- provenance 由可信发布自动生成；工作流仍显式带 `--provenance`，两处一致。

`dry_run=true` 只验证构建、打包和「版本是否已存在」，**不验证发布授权**：`npm publish --dry-run` 不会触发 OIDC 交换，trusted publisher 配错、environment 不匹配这类问题只会在真实发布时暴露。

一次性配置（在 npmjs.com 上做，不在仓库里）：打开包 **Settings → Trusted Publisher → GitHub Actions**，填写

| 字段 | 值 |
| --- | --- |
| Organization or user | `ygzhang-lab` |
| Repository | `dsh-plugin-codex-coding` |
| Workflow filename | `publish.yml` |
| Environment | 留空（工作流没有声明 `environment`；填了就必须在 job 上声明同名 environment） |

注意可信发布只能给**已经存在**的包配置：包还没发布过时，首次发布仍然要用一次 token（或本机 `npm publish` 登录会话），发布成功后再补上 trusted publisher，之后就能删掉 `NPM_TOKEN` secret。

一次发版的完整步骤：

1. 提升 `package.json` 的 `version`，并在 [`CHANGELOG.md`](CHANGELOG.md) 追加对应条目；
2. 提交并推送；
3. 打 tag 并推送，例如 `git tag v0.2.1-rc.3 && git push origin v0.2.1-rc.3`（tag 只用于标记该版本对应的提交，**不会**触发发布）；
4. 手动 Run workflow，先 `dry_run=true` 跑一次，确认无误再 `dry_run=false`。

工作流带「版本已存在就跳过」的守卫，重复触发不会重复发布同一个版本；忘改版本号时同样会被跳过，不会报错。守卫是 fail-closed 的：只有 registry 明确返回 404 才认为「未发布」，查询超时、限流或 5xx 会让工作流失败而不是继续发布。

也可以用 CLI 触发：

```bash
gh workflow run publish.yml -f dist_tag=latest -f dry_run=false
```

### 目录

```text
cordis.patch.yml       bundle 行 + Codex Coding 预设声明
src/index.ts           Host 设置服务（dshCoding）
src/preset.ts          预设内的契约注册、工具、推理策略、插件/Skill 限制
src/prompt.ts          Codex 风格交付契约与工作流模式（coding:contract）
src/mode.ts            工作流模式状态与手动切换说明
src/workflow.ts        工作流模式的会话投影与逐轮模式快照（卡片读取）
src/language.ts        会话语言判定（DSH 界面语言 → 操作系统语言 → 宿主语言 → 英文）
src/system-language.ts 操作系统界面语言探测（macOS AppleLanguages，仅 Host）
src/patch.ts           Codex patch 解析与 hunk 应用
src/apply-patch.ts     apply_patch 工具、fs/sandbox 集成
src/config.ts          配置、插件工具映射、复杂度分类器
src/reasoning.ts       推理等级选择与模型能力适配
src/reasoning-projection.ts 推理等级的会话投影（卡片读取）
src/context.ts         coding_context 的仓库快照
src/client/index.ts    Desktop / Web 配置页
test/                  单元与预设注册测试
```

## 更新日志

按版本记录修复与变更，见 [`CHANGELOG.md`](CHANGELOG.md)。

## 已知限制

- 类型声明直接来自 DSH npm 包自带的 `lib/types`，插件不再维护本地 shim；DSH 升级导致 API 类型变化时，`pnpm typecheck` 会直接暴露。
- 自动等级是确定性启发式，不调用额外模型；默认 `Low`，只有明确的多文件、或功能模块审查/重构信号才升 `High`，`Max` 只由项目级或无法修复信号触发。若分类器低估，可在会话内用 `coding_reasoning(effort="max")` 覆盖。
- 若入口点没有 `sessionController` 或 `llm` 服务（例如某些一次性 runner），推理等级切换会安全跳过；`coding_reasoning` 会显示 `(effort not applied)`。Skill、插件工具限制和自定义工具仍可用。
- `apply_patch` 需要 Agent 作用域内有 `ctx.fs`；没有文件系统服务时该工具不会注册，原生 `read` / `edit` / `write` 仍可用。
- `apply_patch` 的删除/移动依赖底层文件系统的 `remove`；某些远程或只读后端不提供，此时会明确报错，可改用原生工具或 `bash`。
- 工作流模式目前是**提示词级约束**，不会硬性禁用编辑工具；`consult` 下模型仍可调用只读工具，是否编辑由契约和用户指令约束。需要硬门禁时再升级到动态模式提示词或工具限制。
- `coding_mode` 的手动覆盖保存在当前 Agent 会话内；重启或新建会话后恢复 `auto`。
- 配置页只展示该预设已知的 DSH 工具插件，不展示任意第三方 bundle。

## 设计参考

交付契约、`apply_patch` 单工具多文件编辑、严格 patch 诊断和「工作原则」组织方式参考了
[`@shuind/dsh-codex-harness`](https://github.com/shuind/dsh-codex-harness)。
本插件保留 DSH 原生工具与推理策略，不引入 Codex 的 `exec_command` / `write_stdin` / `update_plan` 重复层。

## License

MIT
