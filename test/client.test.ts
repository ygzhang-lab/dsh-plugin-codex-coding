import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  apply,
  CodingSettingsPage,
  WorkflowModeCard,
  inject,
  NS,
} from '../src/client/index.js'

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

/** Checked checkboxes regardless of where React places the attribute. */
function checkedBoxes(html: string): number {
  return [...html.matchAll(/<input[^>]*>/g)]
    .filter((match) => match[0].includes('type="checkbox"') && match[0].includes('checked=""'))
    .length
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
    expect(checkedBoxes(html)).toBe(7)
    expect(count(html, 'type="checkbox"')).toBe(9)
  })

  it('locks core plugins on even when a stored config disables them', () => {
    const html = renderToStaticMarkup(createElement(CodingSettingsPage, {
      view: 'page',
      t,
      form: form({
        reasoning: 'auto',
        localSkills: true,
        // A hand-edited profile may still contain a core module.
        disabledPlugins: ['@deepseek-ai/dsh-tool-fs'],
      }),
    }))
    expect(checkedBoxes(html)).toBe(9)
    expect(count(html, 'disabled=""')).toBe(4)
    expect(count(html, 'title="coreLocked"')).toBe(4)
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
    const registrations: any[] = []
    let dictionaries: any
    const ctx = {
      locale: {
        bind: () => t,
        register: (_name: string, value: any) => { dictionaries = value; return () => {} },
      },
      configForms: { get: () => form({ reasoning: 'auto', localSkills: true, disabledPlugins: [] }) },
      slots: {
        inject: (_name: string, callback: () => unknown) => callback(),
        register: (options: any) => { registrations.push(options); return () => {} },
      },
      effect: (callback: () => unknown) => callback(),
    }
    apply(ctx)
    expect(inject).toContain('configForms')
    expect(NS).toBe('settings.dshCoding')
    expect(registrations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'plugins.bundle.config', key: 'dsh-plugin-coding' }),
      expect.objectContaining({ name: 'conversation.chat.turnTail', id: 'dsh-plugin-coding/workflow-mode' }),
    ]))
    expect(dictionaries.en.description).toContain('Coding 模式')
    expect(dictionaries.zh.description).toContain('Coding 模式')
    expect(dictionaries.en.summary).toContain('DSH Coding')
    expect(dictionaries.zh.summary).toContain('DSH Coding')
  })
})

describe('workflow mode card', () => {
  it('shows the projected mode and one button per mode', () => {
    const html = renderToStaticMarkup(createElement(WorkflowModeCard, {
      t,
      execute: async () => ({ ok: true }),
      useProjection: () => ({ mode: 'review' }),
    }))
    expect(html).toContain('workflowTitle')
    expect(html).toContain('workflowModeReview')
    expect(count(html, '<button')).toBe(4)
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('workflowManualStatus')
  })

  it('renders the automatic status for the default mode', () => {
    const html = renderToStaticMarkup(createElement(WorkflowModeCard, {
      t,
      execute: async () => ({ ok: true }),
      useProjection: () => ({ mode: 'auto' }),
    }))
    expect(html).toContain('workflowAutoStatus')
    expect(html).toContain('workflowSwitchHint')
  })

  it('renders nothing for a session without the Coding projection', () => {
    const html = renderToStaticMarkup(createElement(WorkflowModeCard, {
      t,
      execute: async () => ({ ok: true }),
      useProjection: () => undefined,
    }))
    expect(html).toBe('')
  })
})
