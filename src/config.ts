/**
 * Shared configuration, stable identifiers, and the deterministic reasoning
 * classifier used by both the Host service and the Coding preset.
 *
 * The classifier is intentionally heuristic: it runs before every model call
 * and must not spend an extra model request or expose a reasoning transcript.
 */

import { normalizeLanguageMode, type LanguageMode } from './language.js'

export type ReasoningMode = 'auto' | 'low' | 'high' | 'max'
export type ReasoningLevel = 'low' | 'high' | 'max'
export interface ReasoningChoice {
  level: ReasoningLevel
  score: number
  reason: string
  /** Provider effort id the user picked in the chat box; overrides `level`. */
  effort?: string
}

export interface CodingOptions {
  reasoning: ReasoningMode
  localSkills: boolean
  disabledPlugins: readonly string[]
  /** Conversation language; auto follows the DSH interface, then the host. */
  language?: LanguageMode
}

export interface PluginOption {
  module: string
  label: string
  description: string
  tools: readonly string[]
  safety?: 'core'
}

/**
 * Agent-facing DSH plugins mounted by the Coding preset. Only these rows are
 * advertised in the settings page, because only their tools can be masked
 * without changing the composition itself.
 */
export const PLUGIN_CATALOG: readonly PluginOption[] = [
  {
    module: '@deepseek-ai/dsh-tool-bash',
    label: 'Shell (Bash)',
    description: 'Run commands and long-running processes.',
    tools: ['bash'],
    safety: 'core',
  },
  {
    module: '@deepseek-ai/dsh-tool-pwsh',
    label: 'Shell (PowerShell)',
    description: 'Run commands and long-running processes on Windows.',
    tools: ['pwsh'],
    safety: 'core',
  },
  {
    module: '@deepseek-ai/dsh-tool-fs',
    label: 'Filesystem',
    description: 'Read, write, edit, patch, and inspect image files.',
    tools: ['read', 'write', 'edit', 'apply_patch', 'read_image'],
    safety: 'core',
  },
  {
    module: '@deepseek-ai/dsh-tool-fs-search',
    label: 'File search',
    description: 'Find files and search file contents.',
    tools: ['glob', 'grep'],
  },
  {
    module: '@deepseek-ai/dsh-tool-jobs',
    label: 'Background jobs',
    description: 'Inspect, collect, and stop background commands.',
    tools: ['job_output', 'job_list', 'job_kill'],
  },
  {
    module: '@deepseek-ai/dsh-tool-todo',
    label: 'Task plan',
    description: 'Maintain the Codex-style todo list; a large plan also feeds the low-biased reasoning policy.',
    tools: ['todo_write'],
    safety: 'core',
  },
  {
    module: '@deepseek-ai/dsh-tool-web',
    label: 'Web',
    description: 'Search the web and fetch a specific page.',
    tools: ['web_search', 'web_fetch'],
  },
  {
    module: '@deepseek-ai/dsh-tool-skill',
    label: 'Skills',
    description: 'Discover and load locally installed skills.',
    tools: ['skill'],
  },
]

export const CORE_MODULES: readonly string[] = PLUGIN_CATALOG
  .filter((plugin) => plugin.safety === 'core')
  .map((plugin) => plugin.module)

const CORE_MODULE_SET = new Set(CORE_MODULES)

/** A core plugin is required by the Coding workflow and cannot be disabled. */
export function isCoreModule(module: string): boolean {
  return CORE_MODULE_SET.has(module)
}

export const DEFAULT_OPTIONS: CodingOptions = {
  reasoning: 'auto',
  localSkills: true,
  disabledPlugins: [],
  language: 'auto',
}

/**
 * Normalize a partially decoded or user-authored value into a safe policy.
 * Core plugins are always dropped from the disable list: neither the settings
 * page nor a hand-edited profile may switch off the workflow's required tools.
 */
export function normalizeOptions(value: Partial<CodingOptions> | undefined): CodingOptions {
  const reasoning = value?.reasoning
  const disabled = value?.disabledPlugins
  return {
    reasoning: reasoning === 'low' || reasoning === 'high' || reasoning === 'max' ? reasoning : 'auto',
    localSkills: value?.localSkills !== false,
    language: normalizeLanguageMode(value?.language),
    disabledPlugins: Array.isArray(disabled)
      ? [...new Set(disabled.filter((item): item is string => (
        typeof item === 'string' && !CORE_MODULE_SET.has(item)
      )))]
      : [],
  }
}

/** Tool names masked by the selected plugin disables plus the skills switch. */
export function disabledToolNames(options: CodingOptions): string[] {
  const names = new Set<string>()
  if (options.localSkills === false) names.add('skill')
  const disabled = Array.isArray(options.disabledPlugins) ? options.disabledPlugins : []
  for (const module of disabled) {
    // Core tools stay callable even when an unnormalized value reaches here.
    if (typeof module !== 'string' || CORE_MODULE_SET.has(module)) continue
    for (const tool of PLUGIN_CATALOG.find((plugin) => plugin.module === module)?.tools ?? []) {
      names.add(tool)
    }
  }
  return [...names].sort()
}

/** Rank a reasoning level so plan growth can only escalate inside one turn. */
export function rank(level: ReasoningLevel): number {
  return level === 'low' ? 1 : level === 'high' ? 2 : 3
}

export function higher(a: ReasoningLevel, b: ReasoningLevel): ReasoningLevel {
  return rank(a) >= rank(b) ? a : b
}

const QUESTION_PATTERN = /[?？]\s*$|[吗呢]\s*$|\bdo\s+(?:you|we|i|they|it|this|that|these|those)\b|^(?:how|what|why|should|which|where|when|who|is|are|does|can|could|would|will)\b|^(?:怎么|如何|为什么|是否|哪|什么|要不要|该不该|能不能|可不可以)/i

/** A question that starts with an action verb asks for work, not advice. */
const ACTION_REQUEST_PATTERN = /^(?:can you|could you|would you|will you|can we|could we|would we|please|help me|review|audit|refactor|rewrite|implement|fix|add|update|modify|create|build|make|remove|delete|rename|move|migrate|redesign|scaffold|bootstrap|initialize|init|set up|handle|resolve|investigate|debug|analyze|optimize|optimise|improve|verify|check|test|document|simplify|clean|帮我|请|能|能否|可以|能不能|可不可以|给我|替我|麻烦|我要|我想|需要|是否(?:可以|能|要|需要)?帮我|审查|评审|重构|实现|开发|修复|修改|更新|新增|添加|删除|移除|替换|重写|翻译|调整|创建|搭建|初始化|迁移|检查|调查|排查|定位|优化|改进|验证|测试|处理|解决|分析)/i

const EXPLANATION_PATTERN = /\b(?:explain|describe|summari[sz]e|tell me|walk me through|want to know|wondering|curious|what is|what does|why is|why does|how does|how do|should i|should we|is it worth|does it make sense|what should|which (?:is|should|approach))\b|(?:解释|说明|总结|介绍一下|讲讲|说说|为什么|怎么回事|什么是|如何理解|怎么理解|该怎么|应该怎么|分析一下|有什么建议|想知道)/i

const ADVICE_PATTERN = /\b(?:advice|opinion|recommend|recommendation|suggest|suggestion|best way|which approach|trade-?offs?|thoughts|worth|benefit|better|make sense|advisable)\b|(?:建议|意见|推荐|值得|看法|选型|怎么选|如何选择|该不该|要不要|你觉得|你认为)/i

const PATH_PATTERN_GLOBAL = /(?:^|[\s`"'(])(?:[\w.@-]+[\\/])+[\w.@-]+\b|[A-Za-z]:\\[^\s]+/g

/** Explicit single-file scope beats a project word elsewhere in the sentence. */
const SINGLE_FILE_PATTERN = /\b(?:single[- ]file|one file|this file)\b|(?:单文件|一个文件|这个文件)/i

/** Max is deliberately narrow: project-scale or genuinely unfixable work only. */
const PROJECT_SETUP_PATTERNS = [
  /\b(?:scaffold|greenfield)\b/i,
  /\bbootstrap\b.{0,30}\b(?:project|app|application|service|system)\b/i,
  /\b(?:create|start|build|make|set up|initialize|init|bootstrap|scaffold)\b.{0,30}\b(?:new )?project\b(?!\s+(?:file|setting|settings|config|configuration|field|option|property|section|entry|row)\b)/i,
  /\b(?:new )?project\b.{0,30}\b(?:from scratch|setup|template)\b/i,
  /\bfrom scratch\b.{0,40}\b(?:project|app|application|service|system|cli|website|backend|frontend)\b/i,
  /\b(?:project|app|application|service|system|cli|website|backend|frontend)\b.{0,40}\bfrom scratch\b/i,
  /(?:项目脚手架|项目模板|初始化项目|项目初始化|新建项目|项目搭建|搭建.{0,6}项目|起一个新项目|做一个新项目|搭一个项目|创建.{0,6}新?项目(?!配置|文件|设置|字段|选项|属性)|建.{0,4}新?项目(?!配置|文件|设置|字段|选项|属性)|(?:从零|从0|从 0).{0,20}(?:项目|应用|系统|服务|网站|后台|前端|后端|脚手架|框架|平台)|(?:项目|应用|系统).{0,6}(?:搭建|脚手架|初始化))/i,
]

const PROJECT_REFACTOR_PATTERNS = [
  /\b(?:refactor|restructure|rewrite|migrate|redesign)\b.{0,60}\b(?:project|codebase|repository|repo|architecture)\b/i,
  /\b(?:project|codebase|repository|repo|architecture)\b.{0,60}\b(?:refactor|restructure|rewrite|migrate|redesign)\b/i,
  /(?:项目重构|重构整个|重构项目|整体重构|全项目重构|架构重构|代码库重构|重写整个|迁移整个|项目级重构|重构.{0,12}(?:项目|架构|代码库)|(?:项目|代码库).{0,8}(?:架构)?重构)/i,
]

const PROJECT_REVIEW_PATTERNS = [
  /\b(?:review|audit)\b.{0,60}\b(?:project|codebase|repository|repo)\b(?!\s+(?:file|setting|settings|config|configuration|field|option|property|section|entry|row)\b)|\b(?:review|audit)\b.{0,60}\b(?:all files|every file)\b/i,
  /\b(?:project|codebase|repository|repo)\b(?!\s+(?:file|setting|settings|config|configuration|field|option|property|section|entry|row)\b).{0,60}\b(?:review|audit)\b/i,
  /(?:项目级审查|项目审查|全项目审查|整个项目审查|全局审查|代码库审查|审查整个|审查全部|全量审查|项目级代码审查|审查.{0,12}(?:项目|代码库|全部)|(?:项目|代码库)(?!配置|文件|设置|字段|选项|属性).{0,8}(?:代码)?审查)/i,
]

const UNFIXABLE_PATTERNS = [
  /\b(?:unfixable|cannot (?:be )?fix(?:ed)?|can'?t fix|unable to fix|persistent bug|intermittent bug|heisenbug|root cause unknown|cannot reproduce|can'?t reproduce|unable to reproduce)\b/i,
  /(?:无法修复|修不好|找不到原因|反复失败|反复出现|顽固|一次性无法|无法复现|始终无法|一直修不好|反复修复)/i,
]

/** High is for multi-file work and a feature-module review/refactor, not ordinary edits. */
const MULTI_FILE_PATTERNS = [
  /\b(?:multi[- ]?file|multiple files|several files|across files|across (?:the )?(?:repo|codebase|project|app|application|modules?|packages?)|whole feature|module[- ]wide|codebase[- ]wide|end[- ]to[- ]end|e2e)\b/i,
  /\b(?:[2-9]|\d{2,}|two|three|four|five|six|seven|eight|nine|ten)\s*(?:files|file changes|source files)\b/i,
  /\b(?:review|audit|refactor)\b.{0,40}\b(?:feature|module)\b/i,
  /\b(?:feature|module)\b.{0,40}\b(?:review|audit|refactor)\b/i,
  /(?:多文件|多个文件|跨文件|跨多个文件|模块级|整个模块|多个模块|跨模块|跨包|端到端)/i,
  /(?:审查|评审|重构).{0,8}(?:功能模块|模块)/i,
  /(?:功能模块|模块).{0,8}(?:审查|评审|重构)/i,
  /(?:[2-9]|\d{2,}|两|二|三|四|五|六|七|八|九|十)\s*个文件/,
]

function matches(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function pathCount(text: string): number {
  const seen = new Set<string>()
  for (const match of text.matchAll(PATH_PATTERN_GLOBAL)) {
    seen.add(match[0].replace(/^[\s`"'(]+/, '').trim())
  }
  return seen.size
}

function cleanUserText(text: unknown): string {
  if (typeof text !== 'string') return ''
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, ' ')
    .replace(/<skill_content[\s\S]*?<\/skill_content>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function planItems(value: unknown): readonly { status: string }[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is { status: string } => (
    typeof item === 'object'
    && item !== null
    && typeof (item as { status?: unknown }).status === 'string'
  ))
}

/**
 * Classify one user turn with a deliberately low-biased policy.
 *
 * Low is the default. Max is reserved for four rare cases: creative project
 * setup, project-wide refactor, project-level review, and a bug that cannot be
 * fixed in one pass. High exists for multi-file work and a feature-module
 * review/refactor.
 * Questions, advice, simple fixes, and single-file reviews stay Low.
 */
export function classifyTask(
  rawText: unknown,
  todos: unknown = [],
): ReasoningChoice {
  const text = cleanUserText(rawText)
  if (text.length === 0) {
    return { level: 'low', score: 1, reason: 'no direct user text; no complexity signal' }
  }

  const question = QUESTION_PATTERN.test(text)
  const actionRequest = ACTION_REQUEST_PATTERN.test(text)
  const guidance = EXPLANATION_PATTERN.test(text)
    || ADVICE_PATTERN.test(text)
    || (question && !actionRequest)
  if (guidance) {
    return { level: 'low', score: 1, reason: 'question, advice, or guidance request' }
  }

  const paths = pathCount(text)
  if (SINGLE_FILE_PATTERN.test(text) && paths < 2 && !matches(MULTI_FILE_PATTERNS, text)) {
    return { level: 'low', score: 1, reason: 'explicit single-file scope' }
  }

  if (matches(PROJECT_SETUP_PATTERNS, text)) {
    return { level: 'max', score: 5, reason: 'creative project setup' }
  }
  if (matches(PROJECT_REFACTOR_PATTERNS, text)) {
    return { level: 'max', score: 5, reason: 'project-wide refactor' }
  }
  if (matches(PROJECT_REVIEW_PATTERNS, text)) {
    return { level: 'max', score: 5, reason: 'project-level review' }
  }
  if (matches(UNFIXABLE_PATTERNS, text)) {
    return { level: 'max', score: 5, reason: 'one-shot unfixable bug' }
  }

  if (paths >= 2) {
    return { level: 'high', score: 3, reason: `${paths} repository files referenced` }
  }
  if (matches(MULTI_FILE_PATTERNS, text)) {
    return { level: 'high', score: 3, reason: 'multi-file or feature-module work' }
  }

  const plan = planItems(todos)
  const open = plan.filter((item) => item.status !== 'completed').length
  if (plan.length >= 6 || open >= 5) {
    return { level: 'high', score: 3, reason: `${plan.length}-step execution plan` }
  }

  return { level: 'low', score: 1, reason: 'default low; no multi-file or project-level signal' }
}

/**
 * Pick the closest supported provider effort. Providers differ in which effort
 * ids they accept, and a rejected id aborts the turn before any I/O.
 */
export function mapEffort(desired: ReasoningLevel, supported: readonly string[]): string | undefined {
  if (!Array.isArray(supported) || supported.length === 0) return undefined
  const available = new Set(supported.filter((id): id is string => typeof id === 'string'))
  const preferences: Record<ReasoningLevel, readonly string[]> = {
    low: ['low', 'minimal', 'medium', 'high', 'max'],
    high: ['high', 'medium', 'xhigh', 'max', 'low', 'minimal'],
    max: ['max', 'xhigh', 'high', 'medium', 'low'],
  }
  for (const id of preferences[desired]) {
    if (available.has(id)) return id
  }
  return undefined
}

/**
 * Map a provider effort id back to the Coding level it stands for. The chat
 * box reports provider ids (`minimal`, `medium`, `xhigh`), while this preset
 * reasons in `low`/`high`/`max`; unknown ids stay at the conservative default.
 */
export function levelForEffort(effort: string): ReasoningLevel {
  if (effort === 'max' || effort === 'xhigh') return 'max'
  if (effort === 'high' || effort === 'medium') return 'high'
  return 'low'
}
