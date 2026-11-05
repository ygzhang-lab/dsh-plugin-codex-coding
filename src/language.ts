/**
 * Conversation language for this Host. The package ships Chinese and English
 * only: a Chinese desktop or host locale selects Chinese, everything else
 * falls back to English — the same rule the Client dictionaries follow.
 *
 * DSH keeps the interface preference inside the locale plugin's entry config,
 * so the Host reads it from the running composition instead of guessing from
 * the browser. When that entry is absent the host locale decides.
 */
export type PromptLanguage = 'zh' | 'en'
export type LanguageMode = 'auto' | PromptLanguage

/** Values accepted by the settings surface. */
export const LANGUAGE_MODES: readonly LanguageMode[] = ['auto', 'zh', 'en']

/** Malformed or unknown values fall back to automatic resolution. */
export function normalizeLanguageMode(value: unknown): LanguageMode {
  return value === 'zh' || value === 'en' || value === 'auto' ? value : 'auto'
}

/**
 * Map one BCP 47-style tag (or a POSIX `LANG` value) onto a shipped language.
 * Chinese is the only match that selects Chinese; every other tag is English.
 */
export function languageOf(tag: unknown): PromptLanguage {
  if (typeof tag !== 'string') return 'en'
  const normalized = tag.trim().toLowerCase().replace(/_/g, '-').split('.')[0] ?? ''
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh'
  return 'en'
}

/**
 * The DSH interface preference, read from the locale plugin's loader entry.
 * `loader.entries()` covers the whole composition, so a nested row is found
 * too; an unavailable loader simply means "no explicit preference".
 */
export function localePreferenceOf(loader: any): string | undefined {
  let entries: unknown
  try {
    entries = typeof loader?.entries === 'function' ? [...loader.entries()] : []
  } catch {
    return undefined
  }
  if (!Array.isArray(entries)) return undefined
  for (const entry of entries) {
    const options = (entry as { options?: any })?.options ?? entry
    const name = (options as { name?: unknown })?.name
    if (typeof name !== 'string' || !name.includes('client-locale')) continue
    const preference = (options as { config?: any })?.config?.preference
    if (typeof preference === 'string' && preference.trim() !== '') return preference
  }
  return undefined
}

/** The host locale: POSIX locale variables first, then the OS default. */
export function hostLocaleOf(env: Record<string, string | undefined> = process.env): string {
  for (const name of ['LC_ALL', 'LC_MESSAGES', 'LANG']) {
    const value = env[name]
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed === '' || trimmed === 'C' || trimmed === 'POSIX') continue
    return trimmed
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return 'en'
  }
}

export interface LanguageInputs {
  /** The plugin setting: auto follows DSH, zh/en pin the language. */
  mode?: unknown
  /** The running composition, used for the stored DSH preference. */
  loader?: any
  /** Test seam for the host locale; defaults to POSIX variables and the OS. */
  locale?: string
}

/** Resolve the language used by prompts, tool text, and todo items. */
export function resolveHostLanguage(inputs: LanguageInputs = {}): PromptLanguage {
  const mode = normalizeLanguageMode(inputs.mode)
  if (mode !== 'auto') return mode
  const preference = localePreferenceOf(inputs.loader)
  if (preference !== undefined) return languageOf(preference)
  return languageOf(inputs.locale ?? hostLocaleOf())
}

/** Prompt section that fixes the conversation language for the session. */
export function languagePrompt(language: PromptLanguage): string {
  if (language === 'zh') {
    return [
      'Language: 本会话使用中文。',
      '用中文回复用户，编写 todo 条目及其状态说明、计划摘要、澄清提问和交付说明。',
      '代码、标识符、文件路径、命令与引用的报错原文保持原样，不做翻译。',
      '只有用户切换 DSH 界面语言后，才改用对应语言。',
    ].join('\n')
  }
  return [
    'Language: use English for this session.',
    'Write chat replies, todo items and their status notes, plan summaries, clarifying questions, and delivery notes in English.',
    'Keep code, identifiers, file paths, command lines, and quoted errors in their original form.',
    'Switch language only when the user changes the DSH interface language.',
  ].join('\n')
}
