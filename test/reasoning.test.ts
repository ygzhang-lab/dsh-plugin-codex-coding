import { afterEach, describe, expect, it, vi } from 'vitest'
import { latestUserText, latestUserTextIn, ReasoningController, todosOf, turnOf } from '../src/reasoning.js'
import type { CodingOptions } from '../src/config.js'

function user(text: string) {
  return {
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text }],
  }
}

function makeContext(efforts: string[], reasoningState?: unknown) {
  const selection: { current: any; assembled?: any } = {
    current: { provider: 'deepseek', model: 'deepseek-chat' },
  }
  const ctx = {
    get(name: string) {
      if (name === 'sessionController') return { selectionFor: () => selection }
      if (name === 'llm') {
        return {
          resolveModelInfo: async () => ({
            reasoning: { efforts: efforts.map((id) => ({ id })) },
          }),
        }
      }
      if (name === 'sessionProjections') {
        return {
          stateOf: (_session: unknown, key: string) => {
            if (key === 'turnBoundary') return { lastTurn: 1 }
            if (key === 'codingReasoning') return reasoningState ?? null
            return null
          },
        }
      }
      return undefined
    },
  }
  return { ctx, selection }
}

describe('latestUserText', () => {
  it('ignores injected context and returns the latest direct user message', () => {
    const session = {
      deriveMessages: () => [
        user('first'),
        { role: 'user', source: { kind: 'skill-catalog' }, content: [{ type: 'text', text: 'skill' }] },
        user('second'),
      ],
    }
    expect(latestUserText(session)).toBe('second')
  })

  it('returns an empty string when history is unavailable or malformed', () => {
    expect(latestUserText({ deriveMessages: () => { throw new Error('cold') } })).toBe('')
    expect(latestUserText({ deriveMessages: () => null })).toBe('')
    expect(latestUserText({})).toBe('')
    expect(latestUserText({
      deriveMessages: () => [
        { role: 'user', source: { kind: 'user' }, content: [{ type: 'image' }] },
      ],
    })).toBe('')
  })

  it('reads the latest direct user message from an admitted batch', () => {
    expect(latestUserTextIn([
      user('first'),
      { role: 'user', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'context' }] },
      user('second'),
    ])).toBe('second')
    expect(latestUserTextIn(null)).toBe('')
  })
})

describe('projection helpers', () => {
  it('drops malformed todo entries and falls back on projection errors', () => {
    const ctx = {
      get: () => ({
        stateOf: () => [null, 'x', { status: 1 }, { status: 'pending' }],
      }),
    }
    expect(todosOf(ctx, {})).toEqual([{ status: 'pending' }])
    expect(todosOf({ get: () => ({ stateOf: () => { throw new Error('cold') } }) }, {})).toEqual([])
    expect(turnOf(ctx, {})).toBe(0)
    expect(turnOf({ get: () => ({ stateOf: () => ({ lastTurn: 3 }) }) }, {})).toBe(3)
  })
})

describe('ReasoningController', () => {
  it('writes the classified level into the model selection', async () => {
    const { ctx, selection } = makeContext(['low', 'high', 'max'])
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('Fix the failing test')] } }
    const choice = await controller.apply(agent)
    expect(choice?.level).toBe('low')
    expect(selection.current.reasoningEffort).toBe('low')
  })

  it('classifies the admitted message batch before history contains it', async () => {
    const { ctx, selection } = makeContext(['low', 'high', 'max'])
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [] } }
    const choice = await controller.apply(agent, undefined, [user('这个项目支持语言包吗？介绍说明')])
    expect(choice?.level).toBe('low')
    expect(selection.current.reasoningEffort).toBe('low')
  })

  it('resolves the request effort without a session selection', async () => {
    const ctx = {
      get(name: string) {
        if (name === 'llm') {
          return {
            resolveModelInfo: async () => ({
              reasoning: { efforts: [{ id: 'low' }, { id: 'high' }, { id: 'max' }] },
            }),
          }
        }
        return undefined
      },
    }
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('Hi')] } }
    await controller.apply(agent)
    expect(await controller.requestEffort(agent, { provider: 'p', model: 'm' })).toBe('low')
    expect(controller.describe(agent).effort).toBe('low')
  })

  it('falls back to session history when a later step claims no user text', async () => {
    const { ctx, selection } = makeContext(['low', 'high', 'max'])
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('Hi')] } }
    const choice = await controller.apply(agent, undefined, [])
    expect(choice?.level).toBe('low')
    expect(selection.current.reasoningEffort).toBe('low')
  })

  it('resolves model selection and capabilities from the agent context', async () => {
    const selection: { current: any; assembled?: any } = {
      current: { provider: 'p', model: 'm' },
    }
    const agentCtx = {
      get(name: string) {
        if (name === 'sessionController') return { selectionFor: () => selection }
        if (name === 'llm') {
          return {
            resolveModelInfo: async () => ({
              reasoning: { efforts: [{ id: 'low' }, { id: 'high' }, { id: 'max' }] },
            }),
          }
        }
        if (name === 'sessionProjections') {
          return {
            stateOf: (_session: unknown, key: string) => key === 'turnBoundary' ? { lastTurn: 1 } : null,
          }
        }
        return undefined
      },
    }
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController({ get: () => undefined }, () => options)
    const agent = { ctx: agentCtx, session: { deriveMessages: () => [user('Fix the failing test')] } }
    const choice = await controller.apply(agent)
    expect(choice?.level).toBe('low')
    expect(selection.current.reasoningEffort).toBe('low')
  })

  it('keeps the assembled snapshot in sync for the current request', async () => {
    const { ctx, selection } = makeContext(['low', 'high', 'max'])
    selection.assembled = { provider: 'p', model: 'm', reasoningEffort: 'high' }
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('Hi')] } }
    await controller.apply(agent)
    expect(selection.assembled?.reasoningEffort).toBe('low')
    expect(selection.assembled?.provider).toBe('p')
  })

  it('uses the closest supported effort for a fixed mode', async () => {
    const { ctx, selection } = makeContext(['high'])
    const options: CodingOptions = { reasoning: 'low', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('anything')] } }
    await controller.apply(agent)
    expect(selection.current.reasoningEffort).toBe('high')
  })

  it('clears an inherited effort when the route does not reason', async () => {
    const { ctx, selection } = makeContext([])
    selection.current.reasoningEffort = 'high'
    const options: CodingOptions = { reasoning: 'high', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('anything')] } }
    await controller.apply(agent)
    expect(selection.current.reasoningEffort).toBeUndefined()
  })

  it('accepts an in-session override and clears it', async () => {
    const { ctx } = makeContext(['low', 'high', 'max'])
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('Fix the failing test')] } }
    expect(controller.override(agent, 'max').level).toBe('max')
    await controller.apply(agent)
    expect(controller.describe(agent).choice?.level).toBe('max')
    controller.override(agent, 'auto')
    expect(controller.describe(agent).choice?.level).toBe('low')
  })

  it('escalates with the plan inside one turn and resets on the next', async () => {
    const selection: { current: any } = { current: { provider: 'p', model: 'm' } }
    let turn = 1
    let plan: any[] | null = null
    const ctx = {
      get(name: string) {
        if (name === 'sessionController') return { selectionFor: () => selection }
        if (name === 'llm') {
          return { resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'low' }, { id: 'high' }, { id: 'max' }] } }) }
        }
        if (name === 'sessionProjections') {
          return {
            stateOf: (_session: unknown, key: string) => key === 'turnBoundary' ? { lastTurn: turn } : plan,
          }
        }
        return undefined
      },
    }
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('Hi')] } }
    expect((await controller.apply(agent))?.level).toBe('low')
    plan = Array.from({ length: 6 }, () => ({ status: 'pending' }))
    expect((await controller.apply(agent))?.level).toBe('high')
    turn = 2
    plan = null
    expect((await controller.apply(agent))?.level).toBe('low')
  })

  it('falls back to auto for an invalid runtime mode or override', async () => {
    const { ctx } = makeContext(['high'])
    const options = { reasoning: 'ultra', localSkills: true, disabledPlugins: [] } as unknown as CodingOptions
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('Fix the failing test')] } }
    expect((await controller.apply(agent))?.level).toBe('low')
    expect(controller.override(agent, 'ultra' as never).level).toBe('low')
  })

  it('does not require a session controller', async () => {
    const ctx = { get: () => undefined }
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('Fix the failing test')] } }
    expect((await controller.apply(agent))?.level).toBe('low')
    expect(controller.describe(agent).effort).toBeUndefined()
  })

  it('retries a failed capability lookup after the backoff window', async () => {
    vi.useFakeTimers()
    let calls = 0
    const selection: { current: any; assembled?: any } = {
      current: { provider: 'p', model: 'm' },
    }
    const ctx = {
      get(name: string) {
        if (name === 'sessionController') return { selectionFor: () => selection }
        if (name === 'llm') {
          return {
            resolveModelInfo: async () => {
              calls += 1
              if (calls === 1) throw new Error('transient')
              return { reasoning: { efforts: [{ id: 'high' }] } }
            },
          }
        }
        return undefined
      },
    }
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [user('Fix the failing test')] } }
    await controller.apply(agent)
    await controller.apply(agent)
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(30_000)
    await controller.apply(agent)
    expect(calls).toBe(2)
    expect(selection.current.reasoningEffort).toBe('high')
  })
})

describe('prompt-visible summary', () => {
  it('reports a settings pin as manual before any turn runs', () => {
    const { ctx } = makeContext(['low', 'high', 'max'])
    const options: CodingOptions = { reasoning: 'max', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [] } }
    expect(controller.summary(agent)).toEqual({
      source: 'manual',
      level: 'max',
      reason: 'pinned by Coding settings',
    })
  })

  it('reports auto with no level before the first classification', () => {
    const { ctx } = makeContext(['low', 'high', 'max'])
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [] } }
    expect(controller.summary(agent)).toEqual({ source: 'auto' })
  })

  it('answers from the settings alone before an agent is bound', () => {
    const { ctx } = makeContext(['low', 'high', 'max'])
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    expect(controller.summary()).toEqual({ source: 'auto' })
    options.reasoning = 'high'
    expect(controller.summary()).toEqual({
      source: 'manual',
      level: 'high',
      reason: 'pinned by Coding settings',
    })
  })

  it('reports the classified level and its basis after a step', async () => {
    const { ctx } = makeContext(['low', 'high', 'max'])
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = {
      session: { deriveMessages: () => [user('Update src/a.ts and src/b.ts to share the mapper')] },
    }
    await controller.apply(agent)
    expect(controller.summary(agent)).toEqual({
      source: 'auto',
      level: 'high',
      reason: '2 repository files referenced',
    })
  })

  it('reports a session override as manual', () => {
    const { ctx } = makeContext(['low', 'high', 'max'])
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [] } }
    controller.override(agent, 'high')
    expect(controller.summary(agent)).toEqual({
      source: 'manual',
      level: 'high',
      reason: 'session override',
    })
    controller.override(agent, 'auto')
    expect(controller.summary(agent).source).toBe('auto')
  })

  it('prefers the settings pin over a stale session override', () => {
    const { ctx } = makeContext(['low', 'high', 'max'])
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const agent = { session: { deriveMessages: () => [] } }
    const controller = new ReasoningController(ctx, () => options)
    controller.override(agent, 'high')
    options.reasoning = 'low'
    expect(controller.summary(agent)).toEqual({
      source: 'manual',
      level: 'low',
      reason: 'pinned by Coding settings',
    })
  })

  it('honours the effort picked in the chat box instead of classifying', async () => {
    const { ctx, selection } = makeContext(
      ['low', 'medium', 'high'],
      { override: null, userEffort: 'medium', effort: null, active: true },
    )
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = {
      session: { deriveMessages: () => [user('Update src/a.ts and src/b.ts to share the mapper')] },
    }
    controller.syncProjection(agent)
    const choice = await controller.apply(agent)
    // The classifier would have said high for a multi-file request.
    expect(choice?.level).toBe('high')
    expect(choice?.effort).toBe('medium')
    expect(choice?.reason).toBe('picked medium in the chat box')
    expect(selection.current.reasoningEffort).toBe('medium')
    expect(controller.summary(agent)).toEqual({
      source: 'manual',
      level: 'high',
      reason: 'picked medium in the chat box',
    })
  })

  it('keeps a low chat-box pick even when the request looks multi-file', async () => {
    const { ctx, selection } = makeContext(
      ['low', 'high', 'max'],
      { override: null, userEffort: 'low', effort: null, active: true },
    )
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = {
      session: { deriveMessages: () => [user('Update src/a.ts and src/b.ts to share the mapper')] },
    }
    controller.syncProjection(agent)
    const choice = await controller.apply(agent)
    expect(choice?.level).toBe('low')
    expect(selection.current.reasoningEffort).toBe('low')
  })

  it('falls back to the level when the route rejects the picked effort', async () => {
    const { ctx, selection } = makeContext(
      ['low', 'high'],
      { override: null, userEffort: 'xhigh', effort: null, active: true },
    )
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [] } }
    controller.syncProjection(agent)
    const choice = await controller.apply(agent)
    expect(choice?.level).toBe('max')
    expect(selection.current.reasoningEffort).toBe('high')
  })

  it('reads an explicit tool override from the projection', async () => {
    const { ctx, selection } = makeContext(
      ['low', 'high', 'max'],
      { override: 'max', userEffort: null, effort: null, active: true },
    )
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [] } }
    controller.syncProjection(agent)
    const choice = await controller.apply(agent)
    expect(choice?.level).toBe('max')
    expect(selection.current.reasoningEffort).toBe('max')
    expect(controller.summary(agent).reason).toBe('session override')
  })

  it('drops a chat-box pick when the user pins the level through the tool', async () => {
    const { ctx } = makeContext(
      ['low', 'high', 'max'],
      { override: null, userEffort: 'low', effort: null, active: true },
    )
    const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }
    const controller = new ReasoningController(ctx, () => options)
    const agent = { session: { deriveMessages: () => [] } }
    controller.syncProjection(agent)
    controller.override(agent, 'high')
    expect(controller.summary(agent)).toEqual({
      source: 'manual',
      level: 'high',
      reason: 'session override',
    })
  })
})

afterEach(() => {
  vi.useRealTimers()
})
