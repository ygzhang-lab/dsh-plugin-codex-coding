import { describe, expect, it } from 'vitest'
import {
  LANGUAGE_MODES,
  hostLocaleOf,
  languageOf,
  languagePrompt,
  localePreferenceOf,
  normalizeLanguageMode,
  resolveHostLanguage,
} from '../src/language.js'

describe('language tags', () => {
  it('selects Chinese only for Chinese tags', () => {
    expect(languageOf('zh')).toBe('zh')
    expect(languageOf('zh-CN')).toBe('zh')
    expect(languageOf('ZH_hans')).toBe('zh')
    expect(languageOf('zh_CN.UTF-8')).toBe('zh')
  })

  it('falls back to English for every other locale', () => {
    expect(languageOf('en-US')).toBe('en')
    expect(languageOf('ja-JP')).toBe('en')
    expect(languageOf('fr')).toBe('en')
    expect(languageOf('C')).toBe('en')
    expect(languageOf('')).toBe('en')
    expect(languageOf(undefined)).toBe('en')
    expect(languageOf(42)).toBe('en')
  })

  it('accepts the three settings values and nothing else', () => {
    expect(LANGUAGE_MODES).toEqual(['auto', 'zh', 'en'])
    expect(normalizeLanguageMode('zh')).toBe('zh')
    expect(normalizeLanguageMode('en')).toBe('en')
    expect(normalizeLanguageMode('auto')).toBe('auto')
    expect(normalizeLanguageMode('ZH')).toBe('auto')
    expect(normalizeLanguageMode('ja')).toBe('auto')
    expect(normalizeLanguageMode(undefined)).toBe('auto')
  })
})

describe('host locale', () => {
  it('prefers the POSIX locale variables in order', () => {
    expect(hostLocaleOf({ LC_ALL: 'zh_CN.UTF-8', LANG: 'en_US.UTF-8' })).toBe('zh_CN.UTF-8')
    expect(hostLocaleOf({ LC_MESSAGES: 'zh_CN.UTF-8', LANG: 'en_US.UTF-8' })).toBe('zh_CN.UTF-8')
    expect(hostLocaleOf({ LANG: 'zh_CN.UTF-8' })).toBe('zh_CN.UTF-8')
  })

  it('ignores the C/POSIX placeholders instead of treating them as a choice', () => {
    const value = hostLocaleOf({ LC_ALL: 'C', LANG: 'POSIX' })
    expect(value).not.toBe('C')
    expect(value).not.toBe('POSIX')
    expect(value.length).toBeGreaterThan(0)
  })
})

describe('DSH interface preference', () => {
  function loaderOf(...entries: unknown[]) {
    return { entries: () => entries }
  }

  it('reads the locale plugin entry out of the composition', () => {
    const loader = loaderOf(
      { options: { id: 'group', name: 'cordis:group' } },
      { options: { id: 'ui-locale', name: '@deepseek-ai/dsh-client-locale', config: { preference: 'en' } } },
    )
    expect(localePreferenceOf(loader)).toBe('en')
  })

  it('ignores an entry without a stored preference', () => {
    expect(localePreferenceOf(loaderOf({
      options: { name: '@deepseek-ai/dsh-client-locale', config: {} },
    }))).toBeUndefined()
    expect(localePreferenceOf(loaderOf())).toBeUndefined()
    expect(localePreferenceOf(undefined)).toBeUndefined()
  })

  it('survives a loader that throws or exposes no entries', () => {
    expect(localePreferenceOf({ entries: () => { throw new Error('cold') } })).toBeUndefined()
    expect(localePreferenceOf({ entries: 'nope' })).toBeUndefined()
  })
})

describe('resolving the conversation language', () => {
  const loader = (preference: string) => ({
    entries: () => [{
      options: { name: '@deepseek-ai/dsh-client-locale', config: { preference } },
    }],
  })

  it('honors an explicit setting over the composition', () => {
    expect(resolveHostLanguage({ mode: 'zh', loader: loader('en'), locale: 'en-US' })).toBe('zh')
    expect(resolveHostLanguage({ mode: 'en', loader: loader('zh'), locale: 'zh-CN' })).toBe('en')
  })

  it('follows the DSH preference in automatic mode', () => {
    expect(resolveHostLanguage({ mode: 'auto', loader: loader('zh'), locale: 'en-US' })).toBe('zh')
    expect(resolveHostLanguage({ mode: 'auto', loader: loader('en'), locale: 'zh-CN' })).toBe('en')
  })

  it('falls back to the host locale when DSH stored no preference', () => {
    expect(resolveHostLanguage({ mode: 'auto', locale: 'zh-CN' })).toBe('zh')
    expect(resolveHostLanguage({ mode: 'auto', locale: 'de-DE' })).toBe('en')
  })

  it('treats a malformed setting as automatic', () => {
    expect(resolveHostLanguage({ mode: 'ja', loader: loader('zh'), locale: 'en-US' })).toBe('zh')
  })
})

describe('language prompt', () => {
  it('asks for Chinese, including todo items, and keeps source text intact', () => {
    const text = languagePrompt('zh')
    expect(text).toContain('中文')
    expect(text).toContain('todo')
    expect(text).toContain('文件路径')
  })

  it('asks for English with the same scope', () => {
    const text = languagePrompt('en')
    expect(text).toContain('English')
    expect(text).toContain('todo items')
    expect(text).toContain('file paths')
  })
})
