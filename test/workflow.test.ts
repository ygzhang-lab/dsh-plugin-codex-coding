import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { workflowProjection, CODING_PRESET_ID } from '../src/workflow.js'
import type { WorkflowProjectionState } from '../src/workflow.js'

const initial: WorkflowProjectionState = workflowProjection.init({ agentPreset: CODING_PRESET_ID })
const noTurns = { latest: 0, turns: [] }

function run(state: WorkflowProjectionState, event: unknown): WorkflowProjectionState {
  return workflowProjection.apply(state, event)
}

describe('workflow projection', () => {
  it('starts in auto and keeps the wire view the same shape', () => {
    expect(initial).toEqual({ mode: 'auto', active: true, ...noTurns })
    expect(workflowProjection.wire.view(initial)).toEqual({ mode: 'auto', active: true, ...noTurns })
    expect(workflowProjection.stateSchema.parse(initial)).toEqual({ mode: 'auto', active: true, ...noTurns })
    expect(workflowProjection.stateVersion).toBe(5)
  })

  it('stays inactive for sessions created by another preset', () => {
    const other = workflowProjection.init({ agentPreset: 'ptc' })
    expect(other).toEqual({ mode: 'auto', active: false, ...noTurns })
    expect(workflowProjection.init()).toEqual({ mode: 'auto', active: false, ...noTurns })
    expect(workflowProjection.init({})).toEqual({ mode: 'auto', active: false, ...noTurns })
    // Inactive sessions still publish a value: the Host forwards this block
    // inside `api-session/added`, which rejects an `undefined` value and would
    // otherwise make creating a session of another preset fail.
    expect(workflowProjection.wire.view(other)).toEqual({ mode: 'auto', active: false, ...noTurns })
    expect(workflowProjection.wire.viewSchema.parse(other)).toEqual(other)
  })

  it('publishes lossless JSON for every preset', () => {
    const states = [
      workflowProjection.init({ agentPreset: CODING_PRESET_ID }),
      workflowProjection.init({ agentPreset: 'ptc' }),
      workflowProjection.init({ agentPreset: CODING_PRESET_ID, delegationDepth: 1 }),
    ]
    for (const state of states) {
      const view = workflowProjection.wire.view(state)
      expect(view).toEqual(JSON.parse(JSON.stringify(view)))
    }
  })

  it('stays inactive for delegated subagent sessions', () => {
    expect(workflowProjection.init({ agentPreset: CODING_PRESET_ID, delegationDepth: 1 }))
      .toEqual({ mode: 'auto', active: false, ...noTurns })
  })

  it('follows a /workflow command', () => {
    const state = run(initial, {
      type: 'command/run',
      data: { name: 'workflow', args: 'review' },
    })
    expect(state).toEqual({ mode: 'review', active: true, ...noTurns })
  })

  it('activates a session from the Host preset-selection event', () => {
    // The Host records the preset it composes; the header it was created with
    // may name a different one, so the event has the final word.
    const cold = workflowProjection.init({ agentPreset: 'ptc' })
    const select = { type: 'agent-preset/selected', data: { agentPreset: CODING_PRESET_ID } }
    const active = run(cold, select)
    expect(active).toEqual({ mode: 'auto', active: true, ...noTurns })
    expect(workflowProjection.wire.view(active)).toEqual({ mode: 'auto', active: true, ...noTurns })
    expect(run(active, select)).toBe(active)
  })

  it('deactivates a session the Host switched to another preset', () => {
    const switched = run(initial, {
      type: 'agent-preset/selected',
      data: { agentPreset: 'ptc' },
    })
    expect(switched).toEqual({ mode: 'auto', active: false, ...noTurns })
  })

  it('never writes a plugin-specific event type', () => {
    // `Session.append()` cannot mark an event ignorable, so a custom type
    // makes the Session refuse to reopen; activation must fold existing events.
    const source = readFileSync(new URL('../src/workflow.ts', import.meta.url), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('workflow-active')
    expect(code).not.toMatch(/\.append\s*\(/)
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
    expect(state).toEqual({ mode: 'consult', active: true, ...noTurns })
    expect(run(state, {
      type: 'tool/call',
      data: { name: 'coding_mode', arguments: '{"mode":"auto"}' },
    })).toEqual({ mode: 'auto', active: true, ...noTurns })
  })

  it('ignores malformed tool arguments and unrelated events', () => {
    expect(run(initial, {
      type: 'tool/call',
      data: { name: 'coding_mode', arguments: '{' },
    })).toBe(initial)
    expect(run(initial, { type: 'user/message', data: {} })).toBe(initial)
    expect(run(initial, { type: 'turn/start', data: { turn: 'one' } })).toBe(initial)
  })
})

describe('per-turn mode history', () => {
  function turnStart(turn: number) {
    return { type: 'turn/start', data: { turn } }
  }

  function turnEnd(turn: number) {
    return { type: 'turn/end', data: { turn } }
  }

  /** Fold a list of events the way the Host folds the session log. */
  function fold(events: readonly unknown[]): WorkflowProjectionState {
    return events.reduce<WorkflowProjectionState>(run, initial)
  }

  it('freezes the mode each completed turn ran under', () => {
    const state = fold([
      turnStart(1),
      turnEnd(1),
      { type: 'command/run', data: { name: 'workflow', args: 'review' } },
      turnStart(2),
      turnEnd(2),
      { type: 'command/run', data: { name: 'workflow', args: 'code' } },
    ])
    expect(state.mode).toBe('code')
    expect(state.turns).toEqual([
      { turn: 1, mode: 'auto' },
      { turn: 2, mode: 'review' },
    ])
  })

  it('keeps `latest` on the newest closed turn while the next one runs', () => {
    const afterTurn = fold([turnStart(1), turnEnd(1)])
    expect(afterTurn.latest).toBe(1)
    // Turn 2 has begun but has not finished, and the chat tail is published on
    // `turn/end`: turn 1's card is still the newest one on screen and stays the
    // control instead of leaving the transcript with no switch at all.
    const duringTurn = run(afterTurn, turnStart(2))
    expect(duringTurn.latest).toBe(1)
    expect(duringTurn.turns).toEqual([{ turn: 1, mode: 'auto' }])
    expect(run(duringTurn, turnEnd(2)).latest).toBe(2)
  })

  it('ignores a turn that never closed', () => {
    // A Host killed mid-turn never appended `turn/end`, so that turn published
    // no card; the newest closed turn must stay the control.
    const state = fold([
      turnStart(1),
      { type: 'command/run', data: { name: 'workflow', args: 'review' } },
      turnStart(2),
    ])
    expect(state.latest).toBe(0)
    expect(state.turns).toEqual([])
  })

  it('rewrites a turn entry instead of duplicating it', () => {
    const state = fold([turnStart(1), turnEnd(1), turnEnd(1)])
    expect(state.turns).toEqual([{ turn: 1, mode: 'auto' }])
  })

  it('bounds the history', () => {
    const events = []
    for (let turn = 1; turn <= 120; turn += 1) {
      events.push(turnStart(turn), turnEnd(turn))
    }
    const state = fold(events)
    expect(state.turns).toHaveLength(100)
    expect(state.turns[0]?.turn).toBe(21)
    expect(state.turns.at(-1)?.turn).toBe(120)
  })
})
