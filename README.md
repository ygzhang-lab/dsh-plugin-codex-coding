# DSH Coding

一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Codex 风格 Coding 插件：用一份**交付契约**约束工作流，用 `apply_patch` 做外科式修改，并支持推理等级自动切换、本地 Skill 开关和 DSH 插件工具开关。

它由 **一个自定义 DSH 预设（Coding 模式）+ 三个自定义 DSH 工具** 组成。插件本身不在 Host 启动时改变任何 Agent 行为；唯一入口是在新建会话时选择 **Coding 模式** 预设。

发布包名是 `dsh-plugin-coding`，在 DSH 中的插件显示名仍是 **DSH Coding**。源码与 issue 在 [ygzhang-lab/dsh-plugin-coding](https://github.com/ygzhang-lab/dsh-plugin-coding)。

## 特性

- **交付契约**：固定为「先建立上下文 → 定义完成标准 → 最小修改 → 最窄验证 → 紧凑交付」五段。契约作为独立的 `coding:contract` 系统提示段落，不塞进人格前缀。
- **工作流三模式**：默认自动选择 **Consult / Review / Code**；问答和方案讨论不会自动改代码，也可用 `coding_mode` 手动切换。
- **Codex 补丁工具**：新增 `apply_patch`，支持一次调用多文件、多 hunk 和移动（删除在底层文件系统提供 `remove` 时可用），严格解析 Codex patch 语法；上下文不匹配时给出 expected 与文件片段，而不是静默改错文件。
- **Codex 工作流**：先检查、再计划（`todo_write`）、小步修改、运行最窄验证、检查自己的 diff，最后简洁汇报。
- **DSH 原生适配**：优先复用 `read` / `write` / `edit` / `glob` / `grep` / `bash` / `job_*` / `todo_write` / `web_*` 等内置工具，不重复造轮子。
- **推理等级自动切换**：`auto` 默认 **Low**；只有多文件，或一个功能模块的审查/重构，才用 **High**；项目级搭建/重构/审查或一次性无法修复的 Bug 才用 **Max**；问答、建议、简单修复、单文件审查始终 Low。
- **本地 Skill 开关**：一键允许或禁止加载项目目录、用户目录中已安装的 Skill。
- **DSH 插件工具开关**：多选控制该预设中已安装的 DSH 工具插件是否向 Agent 暴露工具。
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

| 模式 | 适用场景 | 行为 |
|---|---|---|
| `Consult` | 问答、建议、方案比较、先规划不执行 | 先回答；不编辑、不跑测试、不建 todo；给 1–3 个选项、推荐和短计划；以“需要你决定什么”结尾 |
| `Review` | 代码审查、只读检查 | 只给 findings（文件:行 + 复现路径），按影响排序；不自动修 |
| `Code` | 明确要修复、实现、修改、重构、运行 | 走完整五段式交付契约 |

默认 `auto` 由提示词按请求选择。需要手动切换时，对 Agent 说：

```text
coding_mode()                  # 查看当前模式
coding_mode(mode="consult")    # 本次会话固定为对话/咨询模式
coding_mode(mode="review")     # 只读审查模式
coding_mode(mode="code")       # 进入编码模式
coding_mode(mode="auto")       # 清除手动覆盖
```

手动模式会一直生效，直到你再次切换；它只改变工作流，不改变推理等级。混合请求先完成明确的只读部分，再询问是否修改代码。

## 安装

要求 DSH `0.2.1-rc.5` 或同一 `0.2.x` 兼容版本。

### DSH Desktop

在 **Plugins / 插件** 页面选择 **Add plugin / 添加插件**，输入：

```text
dsh-plugin-coding
```

安装并启用 bundle 后，新建会话，在预设选择器中选择 **Coding 模式**。

### CLI

```bash
dsh plugin --profile <profile> add dsh-plugin-coding
```

然后启动该 profile，新建会话并选择 **Coding 模式** 预设：

```bash
dsh --profile <profile>
```

### 从源码本地安装

```bash
pnpm install
pnpm build
dsh plugin --profile <profile> add /absolute/path/to/dsh-plugin-coding
```

## 唯一运行入口

bundle 只插入两类行：

1. `dsh-plugin-coding`：Host 设置服务与 Web 配置页；不注册 Agent 工具、不注入提示词。
2. `preset-coding`：声明 **Coding 模式** 预设；实际的人格、工具、Skill、推理策略都在这个预设内部挂载。

因此：

- 不选择该预设的会话完全不受影响。
- 禁用或卸载 bundle 后，预设及其工具一起消失。
- Host 侧没有常驻的 Agent 行为，只有一份可读取的配置。

> DSH 只对内置预设按界面语言本地化；自定义预设的 `name` 和 `description` 会原样显示。这里的预设名固定为 **Coding 模式**，介绍保留中英文双语。

## 配置

### DSH Desktop 可视化配置

打开 **Plugins** 页面，点进 **DSH Coding** bundle；配置项直接显示在该 bundle 页面上，位于介绍和插件行之间，不需要再进下一层：

- **Reasoning effort**
  - `Automatic`：自动切换（默认）
  - `Low` / `High` / `Max`：固定等级
- **Local skills**
  - 允许 / 禁止本地 Skill
- **Installed DSH plugins**
  - 多选：勾选表示允许该插件的工具；取消勾选只隐藏工具，不卸载插件

配置写入当前 profile，重启后保留。

### CLI 配置文件

编辑当前 profile 的 `cordis.patch.yml`：

```yaml
- id: dsh-plugin-coding
  name: dsh-plugin-coding
  config:
    reasoning: auto          # auto | low | high | max
    localSkills: true        # true | false
    disabledPlugins:         # 要隐藏工具的工具插件模块名
      - '@deepseek-ai/dsh-tool-web'
```

注意：Loader 的按 id 覆盖会**整体替换** `config`，因此覆盖时把三个字段都写全。

## 推理等级自动切换

`auto` 模式默认 **Low**，不产生额外模型调用。它在每次 prompt 组装前读取：

1. **请求类型**：问答/建议、简单修复、单文件审查、单文件修改 → `Low`；多文件，或一个功能模块的审查/重构 → `High`；项目级或无法一次修复 → `Max`。
2. **执行计划**：6 步以上或 5 个以上未完成项才升到 `High`；3 步计划仍是 `Low`；计划**从不**产生 `Max`。

| 等级 | 使用场景 | 使用频率 |
|---|---|---|
| `Low` | 问答/建议/指导；简单 Bug 修复；单文件审查；单文件修改；小型计划（通常少于 6 步） | 默认，绝大多数任务 |
| `High` | 多文件修改；一个功能模块的审查/重构；6 步以上或 5 项以上未完成的计划 | 较少 |
| `Max` | 创造性项目搭建；项目级重构；项目级代码审查；一次性无法修复的 Bug | 极少 |

关键约束：

- **任何寻求意见或指导的问答式任务只用 `Low`**，即使问题里出现架构、重构、并发等字眼。
- `Max` 只保留四类：创造性项目搭建、项目级重构、项目级代码审查、一次性无法修复的 Bug。
- `High` 只用于多文件，或一个功能模块的审查/重构；普通实现、简单修复、单文件审查都不升 `High`。
- 同一轮内只升不降；新的一轮重新判定。若模型不支持目标等级，会映射到该模型支持的最接近等级。

这是刻意的低偏差：DeepSeek 在 `Low` 下已能处理绝大多数问答、单文件修改和简单修复；`High` 留给真正的多文件或功能模块审查/重构，`Max` 只留给项目级或无法一次修复的任务。

需要临时覆盖时，Agent 可调用自定义工具 `coding_reasoning`：

```text
coding_reasoning()                 # 查看当前模式和生效等级
coding_reasoning(effort="max")     # 本次会话固定为 Max（仅 auto 模式）
coding_reasoning(effort="auto")    # 清除会话覆盖
```

## 本地 Skill

`Local skills` 打开时，**Coding 模式** 预设挂载：

- `@deepseek-ai/dsh-skill-filesystem`
- `@deepseek-ai/dsh-tool-skill`

关闭时不会改动 Host 的 Skill 注册表，而是对该预设的新会话隐藏 `skill` 工具；`dsh-tool-skill` 会在下一次 pre-step 发布空目录，从而停用旧 Skill 名称。

## DSH 插件工具开关

该预设实际挂载的 DSH 工具插件如下。取消勾选即通过 Agent 作用域的 `ctx.tools.restrict({ deny })` 隐藏对应工具：

| 插件模块 | 工具 |
|---|---|
| `@deepseek-ai/dsh-tool-bash` | `bash` |
| `@deepseek-ai/dsh-tool-pwsh` | `pwsh` |
| `@deepseek-ai/dsh-tool-fs` | `read`, `write`, `edit`, `apply_patch`, `read_image` |
| `@deepseek-ai/dsh-tool-fs-search` | `glob`, `grep` |
| `@deepseek-ai/dsh-tool-jobs` | `job_output`, `job_list`, `job_kill` |
| `@deepseek-ai/dsh-tool-todo` | `todo_write` |
| `@deepseek-ai/dsh-tool-web` | `web_search`, `web_fetch` |
| `@deepseek-ai/dsh-tool-skill` | `skill` |

设计边界：

- 开关只作用于 **该预设实际挂载的 Agent 工具插件**，不会动态改变 Cordis 组合，也不会卸载用户安装的第三方插件。
- 取消勾选 **Filesystem** 会同时隐藏 `apply_patch`，并让该工具在执行时拒绝写入，避免绕过文件工具开关。
- 第三方插件的工具没有稳定的“插件 → 工具”所有权元数据；为保证不误伤其他工具，当前不把任意第三方 bundle 暴露为开关。
- 设置对**该预设的新会话**生效；已有会话保留启动时的策略。
- 隐藏核心工具（如 `bash`、`read`、`todo_write`）会削弱 Codex 工作流，但这是用户明确选择。

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
- `consult`：问答/咨询/方案模式；不自动编辑、不跑测试、不建 todo。
- `review`：只读审查模式；只给 findings，不自动修。
- `code`：完整 Codex 编码工作流。

它只改变工作流，不改变推理等级；普通请求不需要调用，只有用户明确要求切换或询问当前模式时才调用。

## 开发

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

`.github/workflows/publish.yml` 只接受**手动触发**（`workflow_dispatch`）：日常 push、合并、打 tag 都不会打包或发布。发布时在 GitHub 的 **Actions → Publish → Run workflow** 里选择分支、dist-tag 和是否 dry run，需要仓库配置 `NPM_TOKEN` secret；`dry_run` 默认为 `true`，只跑检查和 `npm publish --dry-run`。

也可以用 CLI 触发：

```bash
gh workflow run publish.yml -f dist_tag=latest -f dry_run=false
```

### 目录

```text
cordis.patch.yml       bundle 行 + Coding 模式 预设声明
src/index.ts           Host 设置服务（dshCoding）
src/preset.ts          预设内的契约注册、工具、推理策略、插件/Skill 限制
src/prompt.ts          Codex 风格交付契约与工作流模式（coding:contract）
src/mode.ts            工作流模式状态与手动切换说明
src/patch.ts           Codex patch 解析与 hunk 应用
src/apply-patch.ts     apply_patch 工具、fs/sandbox 集成
src/config.ts          配置、插件工具映射、复杂度分类器
src/reasoning.ts       推理等级选择与模型能力适配
src/context.ts         coding_context 的仓库快照
src/client/index.ts    Desktop / Web 配置页
test/                  单元与预设注册测试
```

## 已知限制

- DSH 官方 npm 包当前没有随包发布 `.d.ts`，因此 `src/shims.d.ts` 为本插件用到的少量 API 提供了最小类型声明。
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
