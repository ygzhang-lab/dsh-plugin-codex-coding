import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { apply, CodingSettingsPage, inject, NS } from '../src/client/index.js'

function form(
  value: Record<string, unknown> | undefined,
  options: { status?: string; writable?: boolean; revision?: number } = {},
) {
  return {
    getSnapshot: () => ({
      status: options.status ?? 'ready',
      value,
      base: value,
      user: value,
      revision: options.revision ?? 1,
      writable: options.writable ?? true,
    }),
    subscribe: () => () => {},
    mutate: async () => true,
  }
}

function count(html: string, value: string): number {
  return html.split(value).length - 1
}

const t = (key: string) => key

describe('Coding settings page', () => {
  it('renders the reasoning, skills, and plugin controls', () => {
    const html = renderToStaticMarkup(createElement(CodingSettingsPage, {
      view: 'page',
      t,
      form: form({ reasoning: 'auto', localSkills: true, disabledPlugins: [] }),
    }))
    expect(html).toContain('dsh-plugin-coding-reasoning')
    expect(html).toContain('type="radio"')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('@deepseek-ai/dsh-tool-web')
    expect(html).toContain('web_search, web_fetch')
  })

  it('reflects a fixed level and disabled plugins', () => {
    const html = renderToStaticMarkup(createElement(CodingSettingsPage, {
      view: 'page',
      t,
      form: form({
        reasoning: 'max',
        localSkills: false,
        disabledPlugins: ['@deepseek-ai/dsh-tool-web'],
      }),
    }))
    expect(html).toMatch(/(?:value="max" checked=""|checked="" value="max")/)
    expect(count(html, 'type="checkbox" checked=""')).toBe(7)
    expect(count(html, 'type="checkbox"')).toBe(9)
  })

  it('renders a compact summary for the plugin row', () => {
    const html = renderToStaticMarkup(createElement(CodingSettingsPage, {
      view: 'summary',
      t,
      form: form({ reasoning: 'auto', localSkills: true, disabledPlugins: [] }),
    }))
    expect(html).toBe('summary')
  })

  it('shows an unavailable configuration instead of stale controls', () => {
    const html = renderToStaticMarkup(createElement(CodingSettingsPage, {
      view: 'page',
      t,
      form: form(undefined, { status: 'unavailable', writable: false, revision: undefined }),
    }))
    expect(html).toContain('unavailable')
    expect(html).not.toContain('type="radio"')
  })

  it('disables every control for a read-only deployment', () => {
    const html = renderToStaticMarkup(createElement(CodingSettingsPage, {
      view: 'page',
      t,
      form: form({ reasoning: 'auto', localSkills: true, disabledPlugins: [] }, { writable: false }),
    }))
    expect(html).toContain('readOnly')
    expect(count(html, 'disabled=""')).toBe(13)
  })

  it('registers the configuration direct on the bundle page', () => {
    let registration: any
    let dictionaries: any
    const ctx = {
      locale: {
        bind: () => t,
        register: (_name: string, value: any) => { dictionaries = value; return () => {} },
      },
      configForms: { get: () => form({ reasoning: 'auto', localSkills: true, disabledPlugins: [] }) },
      slots: {
        inject: (_name: string, callback: () => unknown) => callback(),
        register: (options: any) => { registration = options; return () => {} },
      },
      effect: (callback: () => unknown) => callback(),
    }
    apply(ctx)
    expect(inject).toContain('configForms')
    expect(NS).toBe('settings.dshCoding')
    expect(registration).toMatchObject({
      name: 'plugins.bundle.config',
      key: 'dsh-plugin-coding',
    })
    expect(dictionaries.en.description).toContain('Coding 模式')
    expect(dictionaries.zh.description).toContain('Coding 模式')
    expect(dictionaries.en.summary).toContain('DSH Coding')
    expect(dictionaries.zh.summary).toContain('DSH Coding')
  })
})
