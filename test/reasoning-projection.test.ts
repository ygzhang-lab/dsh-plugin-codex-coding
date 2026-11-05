import { describe, expect, it } from 'vitest'
import {
  REASONING_PROJECTION_KEY,
  overrideFromToolArguments,
  reasoningProjection,
} from '../src/reasoning-projection.js'
import type { ReasoningProjectionState } from '../src/reasoning-projection.js'
import { CODING_PRESET_ID } from '../src/workflow.js'

const initial: ReasoningProjectionState = reasoningProjection.init({
  agentPreset: CODING_PRESET_ID,
})

function run(
  state: ReasoningProjectionState,
  event: unknown,
): ReasoningProjectionState {
  return reasoningProjection.apply(state, event)
}

function toolCall(argumentsJson: string) {
  return {
    type: 'tool/call',
    data: { name: 'coding_reasoning', arguments: argumentsJson },
  }
}

function chatBox(reasoningEffort?: string) {
  return {
    type: 'model/selection',
    data: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      ...reasoningEffort === undefined ? {} : { reasoningEffort },
    },
  }
}

describe('reasoning projection', () => {
  it('starts pending and keeps the wire view the same shape', () => {
    expect(REASONING_PROJECTION_KEY).toBe('codingReasoning')
    expect(initial).toEqual({
      override: null,
      userEffort: null,
      effort: null,
      active: true,
    })
    expect(reasoningProjection.wire.view(initial)).toEqual(initial)
    expect(reasoningProjection.stateSchema.parse(initial)).toEqual(initial)
    expect(reasoningProjection.stateVersion).toBe(2)
  })

  it('stays inactive for another preset and for delegated sessions', () => {
    expect(reasoningProjection.init({ agentPreset: 'ptc' }).active).toBe(false)
    expect(reasoningProjection.init().active).toBe(false)
    expect(
      reasoningProjection.init({
        agentPreset: CODING_PRESET_ID,
        delegationDepth: 1,
      }).active,
    ).toBe(false)
  })

  it('records a session override from the coding_reasoning tool call', () => {
    expect(run(initial, toolCall('{"effort":"max"}')).override).toBe('max')
  })

  it('records the effort picked in the chat box', () => {
    const state = run(initial, chatBox('medium'))
    expect(state.userEffort).toBe('medium')
    expect(state.override).toBeNull()
  })

  it('lets a later chat-box pick replace a tool override', () => {
    const pinned = run(initial, toolCall('{"effort":"max"}'))
    const picked = run(pinned, chatBox('low'))
    expect(picked).toEqual({
      override: null,
      userEffort: 'low',
      effort: null,
      active: true,
    })
  })

  it('lets a tool call replace a chat-box pick', () => {
    const picked = run(initial, chatBox('low'))
    const pinned = run(picked, toolCall('{"effort":"high"}'))
    expect(pinned).toEqual({
      override: 'high',
      userEffort: null,
      effort: null,
      active: true,
    })
  })

  it('clears the chat-box pick when the selection omits an effort', () => {
    const picked = run(initial, chatBox('low'))
    expect(run(picked, chatBox()).userEffort).toBeNull()
  })

  it('parses the override argument defensively', () => {
    expect(overrideFromToolArguments('{"effort":"high"}')).toBe('high')
    expect(overrideFromToolArguments('{"effort":"auto"}')).toBe('auto')
    expect(overrideFromToolArguments('{"effort":"nope"}')).toBeUndefined()
    expect(overrideFromToolArguments('{}')).toBeUndefined()
    expect(overrideFromToolArguments('not json')).toBeUndefined()
    expect(overrideFromToolArguments(undefined)).toBeUndefined()
  })

  it('clears the override when the tool call asks for auto', () => {
    const pinned = run(initial, toolCall('{"effort":"high"}'))
    expect(run(pinned, toolCall('{"effort":"auto"}')).override).toBeNull()
  })

  it('keeps the state of an inspect-only tool call', () => {
    const pinned = run(initial, toolCall('{"effort":"high"}'))
    expect(run(pinned, toolCall('{}'))).toBe(pinned)
    expect(run(initial, toolCall('{}'))).toBe(initial)
  })

  it('records the effort the request header actually carried', () => {
    const state = run(initial, {
      type: 'request/header',
      data: { header: { config: { provider: 'p', model: 'm', reasoningEffort: 'low' } } },
    })
    expect(state.effort).toBe('low')
    expect(run(state, {
      type: 'request/header',
      data: { header: { config: { provider: 'p', model: 'm' } } },
    }).effort).toBeNull()
  })

  it('follows the Host preset-selection event in both directions', () => {
    const cold = reasoningProjection.init({ agentPreset: 'ptc' })
    const selected = run(cold, {
      type: 'agent-preset/selected',
      data: { agentPreset: CODING_PRESET_ID },
    })
    expect(selected.active).toBe(true)
    expect(run(selected, {
      type: 'agent-preset/selected',
      data: { agentPreset: 'ptc' },
    }).active).toBe(false)
  })

  it('publishes lossless JSON for every state', () => {
    const states = [
      initial,
      run(initial, toolCall('{"effort":"max"}')),
      run(initial, chatBox('medium')),
      run(initial, {
        type: 'request/header',
        data: { header: { config: { reasoningEffort: 'medium' } } },
      }),
      reasoningProjection.init({ agentPreset: 'ptc' }),
    ]
    for (const state of states) {
      const view = reasoningProjection.wire.view(state)
      expect(view).toEqual(JSON.parse(JSON.stringify(view)))
    }
  })
})
