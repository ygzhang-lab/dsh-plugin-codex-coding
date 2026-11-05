import { describe, expect, it } from 'vitest'
import { workflowProjection } from '../src/workflow.js'
import type { WorkflowProjectionState } from '../src/workflow.js'

const initial: WorkflowProjectionState = workflowProjection.init()

function run(state: WorkflowProjectionState, event: unknown): WorkflowProjectionState {
  return workflowProjection.apply(state, event)
}

describe('workflow projection', () => {
  it('starts in auto and keeps the wire view the same shape', () => {
    expect(initial).toEqual({ mode: 'auto' })
    expect(workflowProjection.wire.view(initial)).toEqual({ mode: 'auto' })
    expect(workflowProjection.stateSchema.parse(initial)).toEqual({ mode: 'auto' })
  })

  it('follows a /workflow command', () => {
    const state = run(initial, {
      type: 'command/run',
      data: { name: 'workflow', args: 'review' },
    })
    expect(state).toEqual({ mode: 'review' })
  })

  it('ignores malformed or foreign commands', () => {
    expect(run(initial, {
      type: 'command/run',
      data: { name: 'workflow', args: 'plan' },
    })).toBe(initial)
    expect(run(initial, {
      type: 'command/run',
      data: { name: 'plan', args: 'review' },
    })).toBe(initial)
  })

  it('follows a coding_mode tool call', () => {
    const state = run(initial, {
      type: 'tool/call',
      data: { name: 'coding_mode', arguments: '{"mode":"consult"}' },
    })
    expect(state).toEqual({ mode: 'consult' })
    expect(run(state, {
      type: 'tool/call',
      data: { name: 'coding_mode', arguments: '{"mode":"auto"}' },
    })).toEqual({ mode: 'auto' })
  })

  it('ignores malformed tool arguments and unrelated events', () => {
    expect(run(initial, {
      type: 'tool/call',
      data: { name: 'coding_mode', arguments: '{' },
    })).toBe(initial)
    expect(run(initial, { type: 'user/message', data: {} })).toBe(initial)
    expect(run(initial, { type: 'turn/start', data: { turn: 1 } })).toBe(initial)
  })
})
