import { describe, expect, it } from 'vitest'
import {
  classifyTask,
  disabledToolNames,
  mapEffort,
  normalizeOptions,
  type CodingOptions,
} from '../src/config.js'

describe('classifyTask', () => {
  it('keeps questions and advice at low', () => {
    expect(classifyTask('Hi, what does the edit tool do?').level).toBe('low')
    expect(classifyTask('How do I rename a file in this project?').level).toBe('low')
    expect(classifyTask('Should I refactor the whole project?').level).toBe('low')
    expect(classifyTask('Would the project benefit from a refactor?').level).toBe('low')
    expect(classifyTask('Can the project be refactored safely?').level).toBe('low')
    expect(classifyTask('Can I refactor the whole project?').level).toBe('low')
    expect(classifyTask('这个项目支持语言包吗？介绍说明').level).toBe('low')
    expect(classifyTask('有什么建议可以提升性能？').level).toBe('low')
    expect(classifyTask('I want to know why we should refactor the whole project').level).toBe('low')
  })

  it('keeps a simple bug fix and a single-file review at low', () => {
    expect(classifyTask('Fix the failing login test').level).toBe('low')
    expect(classifyTask('Fix the failing test in src/login.test.ts').level).toBe('low')
    expect(classifyTask('Review this pull request for correctness issues').level).toBe('low')
    expect(classifyTask('Review src/login.ts').level).toBe('low')
    expect(classifyTask('Review the whole file').level).toBe('low')
    expect(classifyTask('Review the whole file?').level).toBe('low')
    expect(classifyTask('Single-file review of the project').level).toBe('low')
    expect(classifyTask('单文件审查').level).toBe('low')
    expect(classifyTask('Rewrite the entire file').level).toBe('low')
    expect(classifyTask('修复登录测试失败').level).toBe('low')
  })

  it('keeps small edits at low', () => {
    expect(classifyTask('此插件包含一个预设，给这个预设重新取名和介绍（中英文）').level).toBe('low')
    expect(classifyTask('Rename the preset and update its description').level).toBe('low')
    expect(classifyTask('Update the README to document the new flag').level).toBe('low')
    expect(classifyTask('Add a new project setting').level).toBe('low')
  })

  it('uses high for multi-file work', () => {
    expect(classifyTask('Fix the bug in src/a.ts and src/b.ts').level).toBe('high')
    expect(classifyTask('Review 3 files for correctness').level).toBe('high')
    expect(classifyTask('Review two files for correctness').level).toBe('high')
    expect(classifyTask('审查两个文件').level).toBe('high')
    expect(classifyTask('Fix the bug across multiple files').level).toBe('high')
  })

  it('uses high for one feature module review or refactor', () => {
    expect(classifyTask('Review this feature module').level).toBe('high')
    expect(classifyTask('Refactor this module').level).toBe('high')
    expect(classifyTask('审查这个功能模块').level).toBe('high')
    expect(classifyTask('一个功能模块的审查任务').level).toBe('high')
    expect(classifyTask('实现这个功能模块').level).toBe('low')
  })

  it('uses max for creative project setup', () => {
    expect(classifyTask('Create a new project from scratch').level).toBe('max')
    expect(classifyTask('Build an app from scratch').level).toBe('max')
    expect(classifyTask('从零搭建一个后台管理系统').level).toBe('max')
    expect(classifyTask('Bootstrap the project').level).toBe('max')
    expect(classifyTask('Update Bootstrap to version 5').level).toBe('low')
    expect(classifyTask('Create a new project setting').level).toBe('low')
    expect(classifyTask('创建项目配置').level).toBe('low')
    expect(classifyTask('Rewrite this file from scratch').level).toBe('low')
    expect(classifyTask('从零重写这个文件').level).toBe('low')
  })

  it('uses max for a project-wide refactor', () => {
    expect(classifyTask('Can you refactor the whole project?').level).toBe('max')
    expect(classifyTask('能帮我重构整个项目吗？').level).toBe('max')
    expect(classifyTask('Refactor the entire codebase').level).toBe('max')
    expect(classifyTask('Refactor the authentication architecture across the repo').level).toBe('max')
    expect(classifyTask('重构认证架构并迁移数据库').level).toBe('max')
    expect(classifyTask('帮我重构整个项目').level).toBe('max')
    expect(classifyTask('整个项目的重构').level).toBe('max')
  })

  it('uses max for a project-level review', () => {
    expect(classifyTask('Review the whole project').level).toBe('max')
    expect(classifyTask('Review the whole project?').level).toBe('max')
    expect(classifyTask('审查整个项目？').level).toBe('max')
    expect(classifyTask('整个项目的代码审查').level).toBe('max')
    expect(classifyTask('Review all files in the repository').level).toBe('max')
    expect(classifyTask('Do a project-level review').level).toBe('max')
    expect(classifyTask('项目级代码审查').level).toBe('max')
    expect(classifyTask('Review the project settings').level).toBe('low')
    expect(classifyTask('Review the project file').level).toBe('low')
    expect(classifyTask('Review the project files').level).toBe('max')
    expect(classifyTask('项目配置文件审查').level).toBe('low')
  })

  it('does not let an imperative "do" downgrade a project-level task', () => {
    expect(classifyTask('Do a project-level review').level).toBe('max')
    expect(classifyTask('Do you recommend refactoring the whole project?').level).toBe('low')
  })

  it('uses max for a one-shot unfixable bug', () => {
    expect(classifyTask('Fix this unfixable bug').level).toBe('max')
    expect(classifyTask('Investigate this unfixable bug?').level).toBe('max')
    expect(classifyTask('This bug is hard; I cannot reproduce it').level).toBe('max')
    expect(classifyTask('这个 bug 反复修复还是找不到原因').level).toBe('max')
    expect(classifyTask('How can I reproduce this bug?').level).toBe('low')
  })

  it('escalates from a six-step plan to high, never max', () => {
    const plan = [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'in_progress' },
      { status: 'pending' },
      { status: 'pending' },
      { status: 'pending' },
    ]
    expect(classifyTask('Continue the task', plan).level).toBe('high')
  })

  it('keeps a three-step plan at low', () => {
    const plan = [
      { status: 'in_progress' },
      { status: 'pending' },
      { status: 'pending' },
    ]
    expect(classifyTask('Continue the task', plan).level).toBe('low')
  })

  it('treats empty or non-string input as low', () => {
    expect(classifyTask('   ').level).toBe('low')
    expect(classifyTask(undefined).level).toBe('low')
    expect(classifyTask(42).level).toBe('low')
  })

  it('ignores malformed todo entries', () => {
    expect(classifyTask('Continue', [
      null,
      'not a todo',
      { status: 123 },
      { status: 'pending' },
      { status: 'pending' },
      { status: 'pending' },
    ]).level).toBe('low')
  })

  it('counts two Windows paths as multi-file work', () => {
    expect(classifyTask('Fix the bug in C:\\repo\\src\\app.ts and C:\\repo\\src\\util.ts').level).toBe('high')
  })
})

describe('mapEffort', () => {
  it('uses the closest supported effort', () => {
    expect(mapEffort('low', ['high', 'max'])).toBe('high')
    expect(mapEffort('max', ['low', 'high', 'max'])).toBe('max')
    expect(mapEffort('high', ['minimal', 'low'])).toBe('low')
  })

  it('returns undefined when the route does not reason', () => {
    expect(mapEffort('max', [])).toBeUndefined()
    expect(mapEffort('max', ['off'])).toBeUndefined()
    expect(mapEffort('max', undefined as unknown as string[])).toBeUndefined()
  })

  it('ignores duplicate and non-string capability entries', () => {
    expect(mapEffort('high', ['high', 'high', 42 as unknown as string])).toBe('high')
  })
})

describe('normalizeOptions', () => {
  it('fills safe defaults and deduplicates plugin ids', () => {
    expect(normalizeOptions(undefined)).toEqual({
      reasoning: 'auto',
      localSkills: true,
      disabledPlugins: [],
    })
    expect(normalizeOptions({
      reasoning: 'max',
      localSkills: false,
      disabledPlugins: ['a', 'a', 1 as unknown as string],
    })).toEqual({ reasoning: 'max', localSkills: false, disabledPlugins: ['a'] })
  })

  it('falls back to auto for an invalid reasoning value', () => {
    expect(normalizeOptions({ reasoning: 'ultra' as never }).reasoning).toBe('auto')
  })

  it('never lets a stored config disable a core plugin', () => {
    expect(normalizeOptions({
      disabledPlugins: [
        '@deepseek-ai/dsh-tool-fs',
        '@deepseek-ai/dsh-tool-bash',
        '@deepseek-ai/dsh-tool-web',
        '@deepseek-ai/dsh-tool-fs',
      ],
    }).disabledPlugins).toEqual(['@deepseek-ai/dsh-tool-web'])
  })
})

describe('disabledToolNames', () => {
  const base: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }

  it('removes no tools by default', () => {
    expect(disabledToolNames(base)).toEqual([])
  })

  it('hides the skill tool when local skills are off', () => {
    expect(disabledToolNames({ ...base, localSkills: false })).toContain('skill')
  })

  it('maps a disabled plugin to its tools', () => {
    expect(disabledToolNames({ ...base, disabledPlugins: ['@deepseek-ai/dsh-tool-web'] }))
      .toEqual(['web_fetch', 'web_search'])
  })

  it('ignores a disabled core plugin even when the value was not normalized', () => {
    expect(disabledToolNames({ ...base, disabledPlugins: ['@deepseek-ai/dsh-tool-fs'] }))
      .toEqual([])
  })

  it('deduplicates tools and ignores unknown modules', () => {
    expect(disabledToolNames({
      ...base,
      localSkills: false,
      disabledPlugins: [
        '@deepseek-ai/dsh-tool-skill',
        '@deepseek-ai/dsh-tool-web',
        '@deepseek-ai/dsh-tool-web',
        'not-installed',
        12 as unknown as string,
      ],
    })).toEqual(['skill', 'web_fetch', 'web_search'])
  })
})