import { createElement as h, useSyncExternalStore, useState } from "react";
import {
  PLUGIN_CATALOG,
  isCoreModule,
  normalizeOptions,
  type CodingOptions,
  type ReasoningMode,
} from "../config.js";
import {
  WORKFLOW_MODES,
  WORKFLOW_PROJECTION_KEY,
  type WorkflowMode,
} from "../mode.js";
import { REASONING_PROJECTION_KEY } from "../reasoning-projection.js";
import type { ReasoningLevel } from "../config.js";
import type { LanguageMode } from "../language.js";

const NS = "settings.dshCoding";
// Host bundle entry id (the row id in cordis.patch.yml), not the npm package
// name; the settings form and the bundle page are both addressed by it.
const BUNDLE = "dsh-plugin-codex-coding";
const PLUGIN = "DSH Codex Coding";
const PRESET = "Codex Coding";

const en = {
  summary: `${PLUGIN}: Auto / Q&A / Review / Codex modes, delivery contract, apply_patch, adaptive reasoning, skills, and tool controls.`,
  description: `These options apply when a new session selects the ${PRESET} preset. Existing sessions keep the policy they started with.`,
  reasoning: "Reasoning effort",
  reasoningHint:
    "Automatic stays Low by default: questions, advice, simple fixes, and single-file reviews. High is only for multi-file work or one feature-module review/refactor. Max is rare: project setup, project-wide refactors, project-level reviews, and one-shot unfixable bugs.",
  reasoningAuto: "Automatic (recommended)",
  reasoningAutoHint:
    "Low by default; High for multi-file or feature-module review/refactor; Max only for rare project-scale work.",
  reasoningLow: "Low",
  reasoningLowHint:
    "Default level for questions, advice, simple fixes, single-file reviews, and single-file edits.",
  reasoningHigh: "High",
  reasoningHighHint:
    "Multi-file changes or one feature-module review/refactor.",
  reasoningMax: "Max",
  reasoningMaxHint:
    "Rare: creative project setup, project-wide refactor, project-level review, or an unfixable bug.",
  skills: "Local skills",
  skillsHint: `Allow the ${PRESET} preset to discover and load skills installed in the project and the user skill directories.`,
  skillsOn: "Allow local skills",
  skillsOff: "Block local skills",
  language: "Conversation language",
  languageHint:
    "Only Chinese and English ship with this plugin. Automatic follows the DSH interface language, then the host locale; any locale that is not Chinese shows English. Replies and todo items use the same language.",
  languageAuto: "Automatic (follow DSH)",
  languageAutoHint:
    "Chinese when DSH or the host locale is Chinese; English for every other locale.",
  languageZh: "中文 (Chinese)",
  languageZhHint: "Replies, todo items, and delivery notes use Chinese.",
  languageEn: "English",
  languageEnHint: "Replies, todo items, and delivery notes use English.",
  plugins: "Installed DSH plugins",
  pluginsHint:
    "Select which agent-facing DSH plugins may expose tools in new sessions of this preset. Unchecked plugins stay installed; only their tools are hidden. Core plugins are required by the Codex workflow, so they are locked on.",
  core: "Core",
  coreLocked:
    "Required by the Coding workflow; this plugin always stays enabled.",
  tools: "Tools",
  applies: "Applies to new sessions of this preset.",
  saveFailed:
    "The setting was not saved. Check Host authorization and try again.",
  loading: "Loading configuration…",
  unavailable: "This configuration is not available in the current Host.",
  readOnly: "This deployment stores settings read-only.",
  saving: "Saving…",
  workflowTitle: "Workflow mode",
  workflowAutoStatus:
    "Automatic — the model [ picks Q&A, Review, or Codex ] from each request.",
  workflowManualStatus: "manual, fixed for this session",
  workflowSwitchHint:
    "Wrong mode? Click the button above to switch; it applies to your next messages. Auto clears the override, and you can also type /workflow <mode>.",
  workflowModeAuto: "Auto",
  workflowModeConsult: "Q&A",
  workflowModeReview: "Review",
  workflowModeCode: "Codex",
  workflowSwitchFailed: "The mode was not changed. Try again or run /workflow.",
  reasoningTitle: "Reasoning",
  reasoningPending: "pending",
  reasoningSourceAuto: "automatic",
  reasoningSourceOverride: "session override",
  reasoningSourceSettings: "pinned by settings",
};

const zh: typeof en = {
  summary: `${PLUGIN}：自动 / 问答 / 审查 / Codex 工作流、交付契约、apply_patch、推理等级自动切换、本地 Skill 与工具开关。`,
  description: `这些选项在新建会话并选择 ${PRESET} 预设时生效；已有会话保留启动时的策略。`,
  reasoning: "推理等级",
  reasoningHint:
    "自动模式默认 Low：问答/建议、简单修复、单文件审查都保持 Low；只有多文件，或单个功能模块的审查/重构，才升到 High；项目搭建、项目级重构、项目级审查、一次性无法修复的 Bug 才到 Max。",
  reasoningAuto: "自动（推荐）",
  reasoningAutoHint: "默认 Low；多文件或功能模块审查/重构 High；Max 极少使用。",
  reasoningLow: "Low",
  reasoningLowHint: "默认等级；问答、建议、简单修复、单文件审查与单文件修改。",
  reasoningHigh: "High",
  reasoningHighHint: "多文件修改，或一个功能模块的审查/重构。",
  reasoningMax: "Max",
  reasoningMaxHint:
    "仅用于创造性项目搭建、项目级重构、项目级代码审查、一次性无法修复的 Bug。",
  skills: "本地 Skill",
  skillsHint: `允许 ${PRESET} 预设发现并加载项目目录和用户目录中已安装的 Skill。`,
  skillsOn: "允许加载本地 Skill",
  skillsOff: "禁止加载本地 Skill",
  language: "会话语言",
  languageHint:
    "插件只带中文和英文两种语言包。自动模式先跟随 DSH 界面语言，再跟随宿主环境语言；不是中文时一律显示英文。会话回复和 todo 条目使用同一种语言。",
  languageAuto: "自动（跟随 DSH）",
  languageAutoHint: "DSH 界面或宿主环境为中文时用中文，其余情况用英文。",
  languageZh: "中文",
  languageZhHint: "回复、todo 条目和交付说明都用中文。",
  languageEn: "English",
  languageEnHint: "回复、todo 条目和交付说明都用英文。",
  plugins: "已安装 DSH 插件",
  pluginsHint:
    "选择该预设的新会话中允许提供工具的 DSH 插件。取消勾选不会卸载插件，只隐藏其工具；核心插件是 Coding 工作流所依赖的，固定启用、不能取消。",
  core: "核心",
  coreLocked: "Codex Coding 工作流必需的核心插件，保持启用，不能取消勾选。",
  tools: "工具",
  applies: "对该预设的新会话生效。",
  saveFailed: "设置未保存。请检查 Host 授权后重试。",
  loading: "正在加载配置…",
  unavailable: "当前 Host 未提供此配置。",
  readOnly: "当前部署的设置为只读。",
  saving: "保存中…",
  workflowTitle: "工作流模式",
  workflowAutoStatus:
    "自动 — 由模型按本轮请求在 [ 问答模式 / 审查模式 / Codex模式 ] 中选择。",
  workflowManualStatus: "手动，本会话固定",
  workflowSwitchHint:
    "模式不符合预期？点击上方按钮切换，对后续消息生效；选自动清除覆盖，也可以直接输入 /workflow <模式>。",
  workflowModeAuto: "自动",
  workflowModeConsult: "问答模式",
  workflowModeReview: "审查模式",
  workflowModeCode: "Codex模式",
  workflowSwitchFailed: "模式未切换成功。请重试，或直接执行 /workflow。",
  reasoningTitle: "推理等级",
  reasoningPending: "待确定",
  reasoningSourceAuto: "自动",
  reasoningSourceOverride: "会话覆盖",
  reasoningSourceSettings: "设置固定",
};

const styles = {
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  hint: {
    margin: 0,
    color: "var(--dsw-alias-label-tertiary)",
    fontSize: "12px",
    lineHeight: "18px",
  },
  fieldset: {
    border: 0,
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  legend: {
    padding: 0,
    color: "var(--dsw-alias-label-primary)",
    fontSize: "13px",
    fontWeight: 500,
    lineHeight: "20px",
  },
  option: {
    display: "flex",
    alignItems: "flex-start",
    gap: "9px",
    cursor: "pointer",
    padding: "9px 10px",
    border: "0.5px solid var(--dsw-alias-border-l3)",
    borderRadius: "10px",
    background: "var(--dsw-alias-bg-layer-1)",
  },
  optionText: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  optionTitle: {
    color: "var(--dsw-alias-label-primary)",
    fontSize: "13px",
    lineHeight: "19px",
  },
  optionHint: {
    color: "var(--dsw-alias-label-tertiary)",
    fontSize: "12px",
    lineHeight: "17px",
  },
  inline: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  plugin: {
    display: "flex",
    alignItems: "flex-start",
    gap: "9px",
    padding: "8px 2px",
    borderBottom: "0.5px solid var(--dsw-alias-border-l2)",
  },
  pluginLocked: {
    opacity: 0.72,
  },
  lockedHint: {
    color: "var(--dsw-alias-label-tertiary)",
    fontSize: "11px",
    lineHeight: "16px",
    fontStyle: "italic",
  },
  pluginBody: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  pluginTitle: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "var(--dsw-alias-label-primary)",
    fontSize: "13px",
    lineHeight: "19px",
  },
  badge: {
    borderRadius: "999px",
    padding: "0 6px",
    background: "var(--dsw-alias-bg-module-platform)",
    color: "var(--dsw-alias-label-secondary)",
    fontSize: "10px",
    lineHeight: "17px",
  },
  module: {
    fontFamily:
      "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    color: "var(--dsw-alias-label-tertiary)",
    fontSize: "11px",
    lineHeight: "16px",
    overflowWrap: "anywhere",
  },
  status: {
    color: "var(--dsw-alias-label-tertiary)",
    margin: 0,
    fontSize: "12px",
    lineHeight: "18px",
  },
  error: {
    color: "var(--dsw-alias-state-error-primary)",
    margin: 0,
    fontSize: "12px",
    lineHeight: "18px",
  },
} as const;

/**
 * The conversation card reuses the Desktop design tokens instead of inventing
 * colors: same border, radius, hover and focus ring as the Host's own
 * `conversation.chat.turnTail` cards, plus the dark-theme background switch.
 */
const CARD_CSS_ID = "dsh-plugin-codex-coding/WorkflowCard.css";
const CARD_CSS = [
  ".dsh-coding-card{box-sizing:border-box;display:flex;flex-direction:column;gap:6px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-static-neutral-50)}",
  "body[data-ds-dark-theme] .dsh-coding-card{background:var(--dsw-static-neutral-850)}",
  ".dsh-coding-card-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin:0}",
  ".dsh-coding-card-title{font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-primary)}",
  ".dsh-coding-card-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
  ".dsh-coding-card-hint{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}",
  ".dsh-coding-card-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}",
  ".dsh-coding-card-actions{display:flex;flex-wrap:wrap;gap:6px}",
  ".dsh-coding-card-button{box-sizing:border-box;height:28px;padding:4px 8px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;transition:background-color .12s,color .12s}",
  ".dsh-coding-card-button:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
  '.dsh-coding-card-button[aria-pressed="true"]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-state-business-primary)}',
  ".dsh-coding-card-button:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}",
  ".dsh-coding-card-button:disabled{opacity:.6;cursor:default}",
].join("");

/**
 * Inject the card stylesheet once. Mirrors the Host's own CSS Modules loader:
 * one `<style>` per plugin, deduplicated by the `data-plugin-css` marker.
 */
export function installCardStyles(doc?: Document): void {
  const target =
    doc ?? (typeof document === "undefined" ? undefined : document);
  if (target === undefined) return;
  if (
    target.querySelector(
      `style[data-plugin-css=${JSON.stringify(CARD_CSS_ID)}]`,
    ) !== null
  )
    return;
  const tag = target.createElement("style");
  tag.dataset.plugin = "dsh-plugin-codex-coding";
  tag.dataset.pluginCss = CARD_CSS_ID;
  tag.textContent = CARD_CSS;
  target.head.appendChild(tag);
}

if (typeof document !== "undefined") installCardStyles(document);

function modeLabelKey(mode: WorkflowMode): keyof typeof en {
  if (mode === "consult") return "workflowModeConsult";
  if (mode === "review") return "workflowModeReview";
  if (mode === "code") return "workflowModeCode";
  return "workflowModeAuto";
}

function effortLabel(value: string): string {
  return value === "" ? value : value[0].toUpperCase() + value.slice(1);
}

/**
 * Where the current reasoning level came from, matching the model-visible
 * `Reasoning:` line: a settings pin wins over a session override, and an
 * override wins over the effort the last request actually carried.
 */
export function reasoningDisplay(
  state:
    | {
        override?: ReasoningLevel | null;
        userEffort?: string | null;
        effort?: string | null;
        active?: boolean;
      }
    | undefined,
  settingsMode?: unknown,
): {
  level: string;
  source: "settings" | "override" | "auto" | "pending";
} | null {
  if (state === undefined || state.active === false) return null;
  const pinned =
    settingsMode === "low" || settingsMode === "high" || settingsMode === "max"
      ? settingsMode
      : undefined;
  if (pinned !== undefined)
    return { level: effortLabel(pinned), source: "settings" };
  if (state.override !== null && state.override !== undefined) {
    return { level: effortLabel(state.override), source: "override" };
  }
  if (typeof state.userEffort === "string" && state.userEffort !== "") {
    return { level: effortLabel(state.userEffort), source: "override" };
  }
  if (typeof state.effort === "string" && state.effort !== "") {
    return { level: effortLabel(state.effort), source: "auto" };
  }
  return { level: "", source: "pending" };
}

/**
 * Per-turn card in the conversation. It reads the `codingWorkflow` projection
 * (registered only by the Coding preset, so other presets render nothing) and
 * switches the mode through the Host `workflow` command.
 */
export function WorkflowModeCard(props: any): any {
  const state = props.useProjection?.(WORKFLOW_PROJECTION_KEY) as
    | { mode?: WorkflowMode; active?: boolean }
    | undefined;
  const reasoningState = props.useProjection?.(REASONING_PROJECTION_KEY) as
    | {
        override?: ReasoningLevel | null;
        userEffort?: string | null;
        effort?: string | null;
        active?: boolean;
      }
    | undefined;
  const [busy, setBusy] = useState<WorkflowMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = props.t as (key: keyof typeof en) => string;
  // The projection key is registered process-wide, so every session publishes
  // a value; `active` is what limits the card to this preset's sessions. A
  // value without `active` comes from an older Host and still renders.
  const mode = state?.mode;
  if (mode === undefined || state?.active === false) return null;

  const status =
    mode === "auto"
      ? t("workflowAutoStatus")
      : `${t(modeLabelKey(mode))} — ${t("workflowManualStatus")}`;
  const reasoning = reasoningDisplay(reasoningState, props.settings?.());
  const reasoningLevel =
    reasoning === null
      ? ""
      : reasoning.level === ""
        ? t("reasoningPending")
        : reasoning.level;
  const reasoningSource =
    reasoning === null
      ? ""
      : t(
          reasoning.source === "settings"
            ? "reasoningSourceSettings"
            : reasoning.source === "override"
              ? "reasoningSourceOverride"
              : "reasoningSourceAuto",
        );

  async function choose(next: WorkflowMode): Promise<void> {
    if (busy !== null) return;
    setBusy(next);
    setError(null);
    try {
      const result = await props.execute?.(`/workflow ${next}`);
      if (result === undefined || result?.ok === false)
        setError(t("workflowSwitchFailed"));
    } catch {
      setError(t("workflowSwitchFailed"));
    } finally {
      setBusy(null);
    }
  }

  return h(
    "div",
    { className: "dsh-coding-card" },
    h(
      "div",
      { className: "dsh-coding-card-row" },
      h("span", { className: "dsh-coding-card-title" }, t("workflowTitle")),
      h("span", { className: "dsh-coding-card-status" }, status),
    ),
    reasoning === null
      ? null
      : h(
          "p",
          { className: "dsh-coding-card-row" },
          h(
            "span",
            { className: "dsh-coding-card-title" },
            t("reasoningTitle"),
          ),
          h(
            "span",
            { className: "dsh-coding-card-status" },
            `${reasoningLevel} · ${reasoningSource}`,
          ),
        ),
    h(
      "div",
      { className: "dsh-coding-card-actions" },
      ...WORKFLOW_MODES.map((option) =>
        h(
          "button",
          {
            key: option,
            type: "button",
            className: "dsh-coding-card-button",
            disabled: busy !== null,
            "aria-pressed": mode === option ? "true" : "false",
            onClick: () => {
              void choose(option);
            },
          },
          busy === option ? t("saving") : t(modeLabelKey(option)),
        ),
      ),
    ),
    h("p", { className: "dsh-coding-card-hint" }, t("workflowSwitchHint")),
    error === null
      ? null
      : h("p", { className: "dsh-coding-card-error" }, error),
  );
}

function reasoningOptions(
  t: (key: keyof typeof en) => string,
): readonly { value: ReasoningMode; label: string; hint: string }[] {
  return [
    { value: "auto", label: t("reasoningAuto"), hint: t("reasoningAutoHint") },
    { value: "low", label: t("reasoningLow"), hint: t("reasoningLowHint") },
    { value: "high", label: t("reasoningHigh"), hint: t("reasoningHighHint") },
    { value: "max", label: t("reasoningMax"), hint: t("reasoningMaxHint") },
  ];
}

function languageOptions(
  t: (key: keyof typeof en) => string,
): readonly { value: LanguageMode; label: string; hint: string }[] {
  return [
    { value: "auto", label: t("languageAuto"), hint: t("languageAutoHint") },
    { value: "zh", label: t("languageZh"), hint: t("languageZhHint") },
    { value: "en", label: t("languageEn"), hint: t("languageEnHint") },
  ];
}

function currentOptions(
  value: Partial<CodingOptions> | undefined,
): CodingOptions {
  return normalizeOptions(value);
}

export function CodingSettingsPage(props: any): any {
  const form = props.form;
  const t = props.t as (key: keyof typeof en) => string;
  const snapshot = useSyncExternalStore(
    (listener: () => void) => form.subscribe(listener),
    () => form.getSnapshot(),
    () => form.getSnapshot(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = currentOptions(snapshot.value);
  const writable =
    snapshot.writable !== false && snapshot.revision !== undefined;

  if (props.view === "summary") return t("summary");
  if (snapshot.status === "loading")
    return h("p", { style: styles.status }, t("loading"));
  if (snapshot.status === "unavailable" || snapshot.value === undefined) {
    return h("p", { style: styles.status }, t("unavailable"));
  }

  async function save(
    field: keyof CodingOptions,
    value: unknown,
  ): Promise<void> {
    if (!writable || saving) return;
    setSaving(true);
    setError(null);
    try {
      const accepted = await form.mutate(
        [{ op: "set", path: [field], value }],
        snapshot.revision,
      );
      if (!accepted) setError(t("saveFailed"));
    } catch {
      setError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function togglePlugin(module: string, enabled: boolean): void {
    // Core plugins are required by the workflow; a stale or crafted value must
    // not reach the Host through this page.
    if (isCoreModule(module)) return;
    const next = enabled
      ? options.disabledPlugins.filter((item) => item !== module)
      : [...options.disabledPlugins, module];
    void save("disabledPlugins", next);
  }

  return h(
    "div",
    { style: styles.section },
    // The bundle page draws the package title and description above this
    // section, so the settings start with their own scope note.
    h("p", { style: styles.hint }, t("description")),

    h(
      "fieldset",
      { style: styles.fieldset },
      h("legend", { style: styles.legend }, t("reasoning")),
      h("p", { style: styles.hint }, t("reasoningHint")),
      ...reasoningOptions(t).map((option) =>
        h(
          "label",
          {
            key: option.value,
            style: styles.option,
          },
          h("input", {
            type: "radio",
            name: "dsh-plugin-coding-reasoning",
            value: option.value,
            checked: options.reasoning === option.value,
            disabled: !writable || saving,
            onChange: () => {
              void save("reasoning", option.value);
            },
          }),
          h(
            "span",
            { style: styles.optionText },
            h("span", { style: styles.optionTitle }, option.label),
            h("span", { style: styles.optionHint }, option.hint),
          ),
        ),
      ),
    ),

    h(
      "fieldset",
      { style: styles.fieldset },
      h("legend", { style: styles.legend }, t("language")),
      h("p", { style: styles.hint }, t("languageHint")),
      ...languageOptions(t).map((option) =>
        h(
          "label",
          {
            key: option.value,
            style: styles.option,
          },
          h("input", {
            type: "radio",
            name: "dsh-plugin-coding-language",
            value: option.value,
            checked: options.language === option.value,
            disabled: !writable || saving,
            onChange: () => {
              void save("language", option.value);
            },
          }),
          h(
            "span",
            { style: styles.optionText },
            h("span", { style: styles.optionTitle }, option.label),
            h("span", { style: styles.optionHint }, option.hint),
          ),
        ),
      ),
    ),

    h(
      "fieldset",
      { style: styles.fieldset },
      h("legend", { style: styles.legend }, t("skills")),
      h("p", { style: styles.hint }, t("skillsHint")),
      h(
        "label",
        { style: styles.option },
        h("input", {
          type: "checkbox",
          checked: options.localSkills,
          disabled: !writable || saving,
          onChange: (event: { target: { checked: boolean } }) => {
            void save("localSkills", event.target.checked);
          },
        }),
        h(
          "span",
          { style: styles.optionText },
          h(
            "span",
            { style: styles.optionTitle },
            options.localSkills ? t("skillsOn") : t("skillsOff"),
          ),
        ),
      ),
    ),

    h(
      "fieldset",
      { style: styles.fieldset },
      h("legend", { style: styles.legend }, t("plugins")),
      h("p", { style: styles.hint }, t("pluginsHint")),
      ...PLUGIN_CATALOG.map((plugin) => {
        const core = isCoreModule(plugin.module);
        const checked =
          core || !options.disabledPlugins.includes(plugin.module);
        return h(
          "label",
          {
            key: plugin.module,
            style: core
              ? { ...styles.plugin, ...styles.pluginLocked }
              : styles.plugin,
          },
          h("input", {
            type: "checkbox",
            checked,
            disabled: core || !writable || saving,
            title: core ? t("coreLocked") : undefined,
            onChange: (event: { target: { checked: boolean } }) => {
              togglePlugin(plugin.module, event.target.checked);
            },
          }),
          h(
            "span",
            { style: styles.pluginBody },
            h(
              "span",
              { style: styles.pluginTitle },
              plugin.label,
              core ? h("span", { style: styles.badge }, t("core")) : null,
            ),
            h("span", { style: styles.optionHint }, plugin.description),
            core
              ? h("span", { style: styles.lockedHint }, t("coreLocked"))
              : null,
            h("span", { style: styles.module }, plugin.module),
            h(
              "span",
              { style: styles.module },
              `${t("tools")}: ${plugin.tools.join(", ")}`,
            ),
          ),
        );
      }),
    ),

    error === null ? null : h("p", { style: styles.error }, error),
    !writable ? h("p", { style: styles.status }, t("readOnly")) : null,
    h(
      "p",
      { style: styles.status, "aria-live": "polite" },
      saving ? t("saving") : t("applies"),
    ),
  );
}

// `remote` is what the workflow card executes `/workflow <mode>` through.
// Cordis throws on a property read of an un-injected service, so a card that
// skips this declaration fails every switch with "cannot get property without
// inject" instead of reaching the Host command.
export const inject = [
  "slots",
  "locale",
  "configForms",
  "remote",
  "remote.commands",
];
export { NS };

export function apply(ctx: any): void {
  const translate = ctx.locale.bind(NS);
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    "dsh-plugin-codex-coding: locale",
  );
  const form = ctx.configForms.get(BUNDLE);
  const Page = (props: any) =>
    h(CodingSettingsPage, {
      ...props,
      form,
      t: props.t ?? translate,
    });
  // The bundle page is the first level a user reaches, so the settings render
  // there directly instead of behind the row's Configure control.
  ctx.effect(
    () =>
      ctx.slots.inject("plugins.bundle.config", () =>
        ctx.slots.register(
          {
            name: "plugins.bundle.config",
            key: BUNDLE,
            id: "dsh-plugin-codex-coding",
            locale: NS,
          },
          Page,
        ),
      ),
    "dsh-plugin-codex-coding: settings page",
  );

  const ModeCard = (props: any) =>
    h(WorkflowModeCard, {
      ...props,
      t: props.t ?? translate,
      // The reasoning pin lives in the settings form, not in the session log,
      // so the card reads it on each render and degrades to automatic when the
      // form is not available in this Host.
      settings: () => {
        try {
          return form?.getSnapshot?.()?.value?.reasoning;
        } catch {
          return undefined;
        }
      },
      execute: (line: string) => {
        const remote = ctx.remote?.commands;
        if (typeof remote?.execute !== "function") return undefined;
        return remote.execute(props.sessionId, line, []);
      },
    });
  // Per-turn card in the conversation. The preset registers the projection, so
  // sessions running another preset render nothing.
  ctx.effect(
    () =>
      ctx.slots.inject("conversation.chat.turnTail", () =>
        ctx.slots.register(
          {
            name: "conversation.chat.turnTail",
            id: "dsh-plugin-codex-coding/workflow-mode",
            order: 50,
          },
          ModeCard,
        ),
      ),
    "dsh-plugin-codex-coding: workflow mode card",
  );
}
