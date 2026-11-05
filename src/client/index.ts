import { createElement as h, useSyncExternalStore, useState } from 'react'
import {
  CORE_MODULES,
  PLUGIN_CATALOG,
  normalizeOptions,
  type CodingOptions,
  type ReasoningMode,
} from '../config.js'

const NS = 'settings.dshCoding'
const BUNDLE = 'dsh-plugin-coding'
const PLUGIN = 'DSH Coding'
const PRESET = 'Coding 模式'

const en = {
  summary: `${PLUGIN}: Consult/Review/Code modes, delivery contract, apply_patch, adaptive reasoning, skills, and tool controls.`,
  description: `These options apply when a new session selects the ${PRESET} preset. Existing sessions keep the policy they started with.`,
  reasoning: 'Reasoning effort',
  reasoningHint:
    'Automatic stays Low by default: questions, advice, simple fixes, and single-file reviews. High is only for multi-file work or one feature-module review/refactor. Max is rare: project setup, project-wide refactors, project-level reviews, and one-shot unfixable bugs.',
  reasoningAuto: 'Automatic (recommended)',
  reasoningAutoHint: 'Low by default; High for multi-file or feature-module review/refactor; Max only for rare project-scale work.',
  reasoningLow: 'Low',
  reasoningLowHint: 'Default level for questions, advice, simple fixes, single-file reviews, and single-file edits.',
  reasoningHigh: 'High',
  reasoningHighHint: 'Multi-file changes or one feature-module review/refactor.',
  reasoningMax: 'Max',
  reasoningMaxHint: 'Rare: creative project setup, project-wide refactor, project-level review, or an unfixable bug.',
  skills: 'Local skills',
  skillsHint: `Allow the ${PRESET} preset to discover and load skills installed in the project and the user skill directories.`,
  skillsOn: 'Allow local skills',
  skillsOff: 'Block local skills',
  plugins: 'Installed DSH plugins',
  pluginsHint:
    'Select which agent-facing DSH plugins may expose tools in new sessions of this preset. Unchecked plugins stay installed; only their tools are hidden. Core plugins are marked because the Codex workflow expects them.',
  core: 'Core',
  tools: 'Tools',
  applies: 'Applies to new sessions of this preset.',
  saveFailed: 'The setting was not saved. Check Host authorization and try again.',
  loading: 'Loading configuration…',
  unavailable: 'This configuration is not available in the current Host.',
  readOnly: 'This deployment stores settings read-only.',
  saving: 'Saving…',
}

const zh: typeof en = {
  summary: `${PLUGIN}：Consult/Review/Code 工作流、交付契约、apply_patch、推理等级自动切换、本地 Skill 与工具开关。`,
  description: `这些选项在新建会话并选择 ${PRESET} 预设时生效；已有会话保留启动时的策略。`,
  reasoning: '推理等级',
  reasoningHint:
    '自动模式默认 Low：问答/建议、简单修复、单文件审查都保持 Low；只有多文件，或单个功能模块的审查/重构，才升到 High；项目搭建、项目级重构、项目级审查、一次性无法修复的 Bug 才到 Max。',
  reasoningAuto: '自动（推荐）',
  reasoningAutoHint: '默认 Low；多文件或功能模块审查/重构 High；Max 极少使用。',
  reasoningLow: 'Low',
  reasoningLowHint: '默认等级；问答、建议、简单修复、单文件审查与单文件修改。',
  reasoningHigh: 'High',
  reasoningHighHint: '多文件修改，或一个功能模块的审查/重构。',
  reasoningMax: 'Max',
  reasoningMaxHint: '仅用于创造性项目搭建、项目级重构、项目级代码审查、一次性无法修复的 Bug。',
  skills: '本地 Skill',
  skillsHint: `允许 ${PRESET} 预设发现并加载项目目录和用户目录中已安装的 Skill。`,
  skillsOn: '允许加载本地 Skill',
  skillsOff: '禁止加载本地 Skill',
  plugins: '已安装 DSH 插件',
  pluginsHint:
    '选择该预设的新会话中允许提供工具的 DSH 插件。取消勾选不会卸载插件，只隐藏其工具；核心插件是 Codex 工作流所依赖的。',
  core: '核心',
  tools: '工具',
  applies: '对该预设的新会话生效。',
  saveFailed: '设置未保存。请检查 Host 授权后重试。',
  loading: '正在加载配置…',
  unavailable: '当前 Host 未提供此配置。',
  readOnly: '当前部署的设置为只读。',
  saving: '保存中…',
}

const styles = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  hint: {
    margin: 0,
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: '12px',
    lineHeight: '18px',
  },
  fieldset: {
    border: 0,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  legend: {
    padding: 0,
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '13px',
    fontWeight: 500,
    lineHeight: '20px',
  },
  option: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '9px',
    cursor: 'pointer',
    padding: '9px 10px',
    border: '0.5px solid var(--dsw-alias-border-l3)',
    borderRadius: '10px',
    background: 'var(--dsw-alias-bg-layer-1)',
  },
  optionText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  optionTitle: {
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '13px',
    lineHeight: '19px',
  },
  optionHint: {
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: '12px',
    lineHeight: '17px',
  },
  inline: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  plugin: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '9px',
    padding: '8px 2px',
    borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
  },
  pluginBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  pluginTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '13px',
    lineHeight: '19px',
  },
  badge: {
    borderRadius: '999px',
    padding: '0 6px',
    background: 'var(--dsw-alias-bg-module-platform)',
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: '10px',
    lineHeight: '17px',
  },
  module: {
    fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: '11px',
    lineHeight: '16px',
    overflowWrap: 'anywhere',
  },
  status: {
    color: 'var(--dsw-alias-label-tertiary)',
    margin: 0,
    fontSize: '12px',
    lineHeight: '18px',
  },
  error: {
    color: 'var(--dsw-alias-state-error-primary)',
    margin: 0,
    fontSize: '12px',
    lineHeight: '18px',
  },
} as const

function reasoningOptions(t: (key: keyof typeof en) => string): readonly { value: ReasoningMode; label: string; hint: string }[] {
  return [
    { value: 'auto', label: t('reasoningAuto'), hint: t('reasoningAutoHint') },
    { value: 'low', label: t('reasoningLow'), hint: t('reasoningLowHint') },
    { value: 'high', label: t('reasoningHigh'), hint: t('reasoningHighHint') },
    { value: 'max', label: t('reasoningMax'), hint: t('reasoningMaxHint') },
  ]
}

function currentOptions(value: Partial<CodingOptions> | undefined): CodingOptions {
  return normalizeOptions(value)
}

export function CodingSettingsPage(props: any): any {
  const form = props.form
  const t = props.t as (key: keyof typeof en) => string
  const snapshot = useSyncExternalStore(
    (listener: () => void) => form.subscribe(listener),
    () => form.getSnapshot(),
    () => form.getSnapshot(),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const options = currentOptions(snapshot.value)
  const writable = snapshot.writable !== false && snapshot.revision !== undefined

  if (props.view === 'summary') return t('summary')
  if (snapshot.status === 'loading') return h('p', { style: styles.status }, t('loading'))
  if (snapshot.status === 'unavailable' || snapshot.value === undefined) {
    return h('p', { style: styles.status }, t('unavailable'))
  }

  async function save(field: keyof CodingOptions, value: unknown): Promise<void> {
    if (!writable || saving) return
    setSaving(true)
    setError(null)
    try {
      const accepted = await form.mutate([{ op: 'set', path: [field], value }], snapshot.revision)
      if (!accepted) setError(t('saveFailed'))
    } catch {
      setError(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function togglePlugin(module: string, enabled: boolean): void {
    const next = enabled
      ? options.disabledPlugins.filter((item) => item !== module)
      : [...options.disabledPlugins, module]
    void save('disabledPlugins', next)
  }

  return h('div', { style: styles.section },
    // The bundle page draws the package title and description above this
    // section, so the settings start with their own scope note.
    h('p', { style: styles.hint }, t('description')),

    h('fieldset', { style: styles.fieldset },
      h('legend', { style: styles.legend }, t('reasoning')),
      h('p', { style: styles.hint }, t('reasoningHint')),
      ...reasoningOptions(t).map((option) => h('label', {
        key: option.value,
        style: styles.option,
      },
      h('input', {
        type: 'radio',
        name: 'dsh-plugin-coding-reasoning',
        value: option.value,
        checked: options.reasoning === option.value,
        disabled: !writable || saving,
        onChange: () => { void save('reasoning', option.value) },
      }),
      h('span', { style: styles.optionText },
        h('span', { style: styles.optionTitle }, option.label),
        h('span', { style: styles.optionHint }, option.hint),
      ))),
    ),

    h('fieldset', { style: styles.fieldset },
      h('legend', { style: styles.legend }, t('skills')),
      h('p', { style: styles.hint }, t('skillsHint')),
      h('label', { style: styles.option },
        h('input', {
          type: 'checkbox',
          checked: options.localSkills,
          disabled: !writable || saving,
          onChange: (event: { target: { checked: boolean } }) => {
            void save('localSkills', event.target.checked)
          },
        }),
        h('span', { style: styles.optionText },
          h('span', { style: styles.optionTitle }, options.localSkills ? t('skillsOn') : t('skillsOff')),
        ),
      ),
    ),

    h('fieldset', { style: styles.fieldset },
      h('legend', { style: styles.legend }, t('plugins')),
      h('p', { style: styles.hint }, t('pluginsHint')),
      ...PLUGIN_CATALOG.map((plugin) => {
        const checked = !options.disabledPlugins.includes(plugin.module)
        return h('label', { key: plugin.module, style: styles.plugin },
          h('input', {
            type: 'checkbox',
            checked,
            disabled: !writable || saving,
            onChange: (event: { target: { checked: boolean } }) => {
              togglePlugin(plugin.module, event.target.checked)
            },
          }),
          h('span', { style: styles.pluginBody },
            h('span', { style: styles.pluginTitle },
              plugin.label,
              CORE_MODULES.includes(plugin.module)
                ? h('span', { style: styles.badge }, t('core'))
                : null,
            ),
            h('span', { style: styles.optionHint }, plugin.description),
            h('span', { style: styles.module }, plugin.module),
            h('span', { style: styles.module }, `${t('tools')}: ${plugin.tools.join(', ')}`),
          ),
        )
      }),
    ),

    error === null ? null : h('p', { style: styles.error }, error),
    !writable ? h('p', { style: styles.status }, t('readOnly')) : null,
    h('p', { style: styles.status, 'aria-live': 'polite' }, saving ? t('saving') : t('applies')),
  )
}

export const inject = ['slots', 'locale', 'configForms']
export { NS }

export function apply(ctx: any): void {
  const translate = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-coding: locale')
  const form = ctx.configForms.get('dsh-plugin-coding')
  const Page = (props: any) => h(CodingSettingsPage, {
    ...props,
    form,
    t: props.t ?? translate,
  })
  // The bundle page is the first level a user reaches, so the settings render
  // there directly instead of behind the row's Configure control.
  ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: BUNDLE,
    id: 'dsh-plugin-coding',
    locale: NS,
  }, Page)), 'dsh-plugin-coding: settings page')
}
