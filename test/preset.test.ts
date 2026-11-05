import { describe, expect, it } from 'vitest'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apply, inject as presetInject } from '../src/preset.js'
import type { CodingOptions } from '../src/config.js'

interface HarnessOptions {
  workingDirectory?: string
  efforts?: string[]
}

function user(text: string) {
  return {
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text }],
  }
}

function harness(options: CodingOptions, input: HarnessOptions = {}) {
  const tools: any[] = []
  const listeners = new Map<string, Function>()
  const restrictions: any[] = []
  const warnings: string[] = []
  const commands: any[] = []
  const contexts: any[] = []
  const projections: any[] = []
  const sections: any[] = []
  const selection = { current: { provider: 'p', model: 'm' } as any, assembled: undefined as any }
  const ctx = {
    get(name: string) {
      if (name === 'dshCoding') return { options }
      if (name === 'workingDirectory') {
        return { ensure: async () => input.workingDirectory ?? process.cwd() }
      }
      if (name === 'sessionController') return { selectionFor: () => selection }
      if (name === 'systemPrompt') {
        return {
          section: (section: any) => sections.push(section),
          context: (context: any) => contexts.push(context),
        }
      }
      if (name === 'llm') {
        return {
          resolveModelInfo: async () => ({
            reasoning: { efforts: (input.efforts ?? ['low', 'high', 'max']).map((id) => ({ id })) },
          }),
        }
      }
      if (name === 'sessionProjections') {
        return {
          stateOf: (_session: unknown, key: string) => key === 'turnBoundary' ? { lastTurn: 1 } : null,
          register: (definition: any) => { projections.push(definition); return () => {} },
        }
      }
      return undefined
    },
    on(name: string, listener: Function) {
      listeners.set(name, listener)
    },
    tools: {
      register(tool: any) {
        tools.push(tool)
      },
    },
    commands: {
      register(definition: any) {
        commands.push(definition)
        return () => {}
      },
    },
    logger: { warn: (message: string) => warnings.push(message) },
  }
  apply(ctx)
  return { tools, listeners, restrictions, warnings, selection, commands, contexts, projections, sections }
}

describe('Coding preset plugin', () => {
  it('registers the custom tools and the Codex workflow helpers', () => {
    const { tools } = harness({ reasoning: 'auto', localSkills: true, disabledPlugins: [] })
    expect(tools.map((tool) => tool.name)).toEqual(['coding_context', 'coding_reasoning', 'coding_mode'])
    expect(presetInject).toEqual(expect.arrayContaining([
      'sessionController', 'llm', 'sessionProjections', 'commands',
    ]))
  })

  it('registers the conversation card projection, command, and prompt context', () => {
    const { commands, contexts, projections, sections } = harness({
      reasoning: 'auto',
      localSkills: true,
      disabledPlugins: [],
    })
    expect(sections.map((section) => section.name)).toContain('coding:contract')
    expect(contexts.map((context) => context.name)).toContain('coding:workflow')
    expect(projections.map((projection) => projection.key)).toContain('codingWorkflow')

    const context = contexts.find((candidate) => candidate.name === 'coding:workflow')
    expect(context.text()).toContain('Workflow mode: auto')

    const command = commands.find((candidate) => candidate.name === 'workflow')
    expect(command).toBeDefined()
    const agent = {}
    expect(command.handler({ agent, rawInput: 'review' })).toMatchObject({ kind: 'success' })
    expect(context.text()).toContain('Workflow mode: review')
    expect(command.handler({ agent }).text).toContain('workflow mode: review')
    expect(command.handler({ agent, rawInput: 'AUTO' })).toMatchObject({ kind: 'success' })
    expect(context.text()).toContain('Workflow mode: auto')
    expect(command.handler({ agent, rawInput: 'plan' })).toMatchObject({ kind: 'error' })
  })

  it('reaches the prompt after a tool-driven mode switch', async () => {
    const { tools, contexts } = harness({ reasoning: 'auto', localSkills: true, disabledPlugins: [] })
    const tool = tools.find((candidate) => candidate.name === 'coding_mode')
    const agent = { session: { deriveMessages: () => [] } }
    await tool.execute({ mode: 'consult' }, { agent })
    const context = contexts.find((candidate) => candidate.name === 'coding:workflow')
    expect(context.text()).toContain('Workflow mode: consult')
  })

  it('classifies the admitted step messages before the request is built', async () => {
    const { listeners, selection } = harness({ reasoning: 'auto', localSkills: true, disabledPlugins: [] })
    const agent = { session: { deriveMessages: () => [] } }
    const decision = { kind: 'enter', messages: [user('这个项目支持语言包吗？介绍说明')] }
    const result = await (listeners.get('agent/pre-step') as Function)(
      { agent },
      () => Promise.resolve(decision),
    )
    expect(result).toBe(decision)
    expect(selection.current.reasoningEffort).toBe('low')
  })

  it('reports the reasoning state through the custom tool', async () => {
    const { tools } = harness({ reasoning: 'auto', localSkills: true, disabledPlugins: [] })
    const tool = tools.find((candidate) => candidate.name === 'coding_reasoning')
    const text = await tool.execute({}, {
      agent: {
        session: {
          deriveMessages: () => [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Fix the test' }] }],
        },
      },
    })
    expect(text).toContain('reasoning mode: auto')
    expect(text).toContain('effective:')
  })

  it('reports the applied effort after a step is classified', async () => {
    const { listeners, tools } = harness({ reasoning: 'auto', localSkills: true, disabledPlugins: [] })
    const agent = { session: { deriveMessages: () => [] } }
    const decision = { kind: 'enter', messages: [user('这个项目支持语言包吗？介绍说明')] }
    await (listeners.get('agent/pre-step') as Function)({ agent }, () => Promise.resolve(decision))
    const tool = tools.find((candidate) => candidate.name === 'coding_reasoning')
    const text = await tool.execute({}, { agent })
    expect(text).toContain('effective: low (low)')
  })

  it('applies the classified level to the request config', async () => {
    const { listeners } = harness({ reasoning: 'auto', localSkills: true, disabledPlugins: [] })
    const agent = { session: { deriveMessages: () => [] } }
    const decision = { kind: 'enter', messages: [user('这个项目支持语言包吗？介绍说明')] }
    await (listeners.get('agent/pre-step') as Function)({ agent }, () => Promise.resolve(decision))
    const config = { provider: 'p', model: 'm', reasoningEffort: 'high' }
    const result = await (listeners.get('agent/request') as Function)(
      { agent },
      () => Promise.resolve(config),
    )
    expect(result.reasoningEffort).toBe('low')
  })

  it('explains why an effort could not be applied', async () => {
    const { listeners, tools } = harness(
      { reasoning: 'auto', localSkills: true, disabledPlugins: [] },
      { efforts: [] },
    )
    const agent = { session: { deriveMessages: () => [] } }
    const decision = { kind: 'enter', messages: [user('Fix the failing test')] }
    await (listeners.get('agent/pre-step') as Function)({ agent }, () => Promise.resolve(decision))
    const tool = tools.find((candidate) => candidate.name === 'coding_reasoning')
    const text = await tool.execute({}, { agent })
    expect(text).toContain('effective: low (effort not applied)')
    expect(text).toContain('diagnosis:')
    expect(text).toContain('efforts: []')
  })

  it('executes coding_context against the session working directory', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-plugin-coding-tool-')))
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }))
      await writeFile(join(dir, 'pnpm-lock.yaml'), '')
      const { tools } = harness(
        { reasoning: 'auto', localSkills: true, disabledPlugins: [] },
        { workingDirectory: dir },
      )
      const tool = tools.find((candidate) => candidate.name === 'coding_context')
      const text = await tool.execute({}, {
        agent: { session: { deriveMessages: () => [] } },
        signal: new AbortController().signal,
      })
      expect(text).toContain(`cwd: ${dir}`)
      expect(text).toContain('checks: pnpm test')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('inspects and switches the workflow mode manually', async () => {
    const { tools } = harness({ reasoning: 'auto', localSkills: true, disabledPlugins: [] })
    const tool = tools.find((candidate) => candidate.name === 'coding_mode')
    const agent = { session: { deriveMessages: () => [] } }

    expect(await tool.execute({}, { agent })).toContain('workflow mode: auto')
    expect(await tool.execute({ mode: 'consult' }, { agent })).toContain('workflow mode set to consult')
    expect(await tool.execute({ mode: 'consult' }, { agent })).toContain('Consultation mode')
    expect(await tool.execute({}, { agent })).toContain('workflow mode: consult')
    expect(await tool.execute({ mode: 'auto' }, { agent })).toContain('override cleared')
    expect(await tool.execute({}, { agent })).toContain('workflow mode: auto')
  })

  it('rejects custom tools outside an agent session', async () => {
    const { tools } = harness({ reasoning: 'auto', localSkills: true, disabledPlugins: [] })
    await expect(tools[0].execute({}, {})).rejects.toThrow('owning agent session')
    await expect(tools[1].execute({}, {})).rejects.toThrow('owning agent session')
    await expect(tools[2].execute({}, {})).rejects.toThrow('owning agent session')
  })

  it('sets an in-session override through the tool and reports it', async () => {
    const { tools } = harness({ reasoning: 'auto', localSkills: true, disabledPlugins: [] })
    const tool = tools.find((candidate) => candidate.name === 'coding_reasoning')
    const agent = {
      session: {
        deriveMessages: () => [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Fix the test' }] }],
      },
    }
    expect(await tool.execute({ effort: 'max' }, { agent })).toContain('set to max')
    expect(await tool.execute({}, { agent })).toContain('effective: max')
    expect(await tool.execute({ effort: 'auto' }, { agent })).toContain('override cleared')
  })

  it('refuses an override when reasoning is pinned by settings', async () => {
    const { tools } = harness({ reasoning: 'high', localSkills: true, disabledPlugins: [] })
    const tool = tools.find((candidate) => candidate.name === 'coding_reasoning')
    const agent = { session: { deriveMessages: () => [] } }
    expect(await tool.execute({ effort: 'max' }, { agent })).toContain('pinned to high')
  })

  it('restricts only visible tools of a disabled plugin', () => {
    const { listeners } = harness(
      { reasoning: 'auto', localSkills: false, disabledPlugins: ['@deepseek-ai/dsh-tool-web'] },
    )
    const restrictions: any[] = []
    const agent = {
      ctx: {
        tools: {
          schemas: () => [{ name: 'web_search' }, { name: 'web_fetch' }],
          restrict: (filter: any) => restrictions.push(filter),
        },
      },
    }
    ;(listeners.get('agent/created') as Function)({ agent })
    expect(restrictions).toEqual([{ deny: ['web_fetch', 'web_search'] }])
  })

  it('does not restrict when no selected tool is visible', () => {
    const { listeners } = harness(
      { reasoning: 'auto', localSkills: true, disabledPlugins: ['@deepseek-ai/dsh-tool-web'] },
    )
    const restrictions: any[] = []
    const agent = {
      ctx: {
        tools: {
          schemas: () => [{ name: 'read' }],
          restrict: (filter: any) => restrictions.push(filter),
        },
      },
    }
    ;(listeners.get('agent/created') as Function)({ agent })
    expect(restrictions).toEqual([])
  })

  it('keeps the session usable when the registry rejects a restriction', () => {
    const { listeners } = harness(
      { reasoning: 'auto', localSkills: false, disabledPlugins: [] },
    )
    let warning = ''
    const agent = {
      ctx: {
        tools: {
          schemas: () => [{ name: 'skill' }],
          restrict: () => { throw new Error('registry unavailable') },
        },
        logger: { warn: (message: string) => { warning = message } },
      },
    }
    expect(() => (listeners.get('agent/created') as Function)({ agent })).not.toThrow()
    expect(warning).toContain('could not restrict tools')
  })
})
