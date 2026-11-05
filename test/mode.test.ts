import { describe, expect, it } from 'vitest'
import {
  ModeController,
  describeMode,
  describeReasoning,
  parseWorkflowMode,
  workflowPrompt,
} from '../src/mode.js'

describe('ModeController', () => {
  it('defaults to auto and stores an override per agent', () => {
    const controller = new ModeController()
    const first = {}
    const second = {}

    expect(controller.get(first)).toBe('auto')
    expect(controller.get(second)).toBe('auto')

    expect(controller.set(first, 'consult')).toBe('consult')
    expect(controller.get(first)).toBe('consult')
    expect(controller.get(second)).toBe('auto')

    expect(controller.set(first, 'auto')).toBe('auto')
    expect(controller.get(first)).toBe('auto')
  })

  it('describes each override with its operating rules', () => {
    const controller = new ModeController()
    expect(controller.describe('consult')).toContain('Q&A mode')
    expect(controller.describe('consult')).toContain('Do not switch to Codex Coding')
    expect(controller.describe('review')).toContain('Review mode')
    expect(controller.describe('review')).toContain('Do not edit files')
    expect(controller.describe('code')).toContain('Codex Coding')
  })

  it('summarizes the effective mode for inspection', () => {
    expect(describeMode('auto')).toContain('workflow mode: auto')
    expect(describeMode('consult')).toContain('workflow mode: consult')
    expect(describeMode('review')).toContain('manual override')
  })
})

describe('workflow mode tokens', () => {
  it('parses the four modes, trimming and ignoring case', () => {
    expect(parseWorkflowMode(' AUTO ')).toBe('auto')
    expect(parseWorkflowMode('Consult')).toBe('consult')
    expect(parseWorkflowMode('review')).toBe('review')
    expect(parseWorkflowMode('code')).toBe('code')
  })

  it('rejects unknown or missing values', () => {
    expect(parseWorkflowMode('plan')).toBeUndefined()
    expect(parseWorkflowMode('')).toBeUndefined()
    expect(parseWorkflowMode(undefined)).toBeUndefined()
  })

  it('puts manual guidance into the prompt and keeps auto explicit', () => {
    expect(workflowPrompt('auto')).toContain('Workflow mode: auto')
    expect(workflowPrompt('review')).toContain('Workflow mode: review (manual')
    expect(workflowPrompt('review')).toContain('Do not edit files')
    expect(workflowPrompt('code')).toContain('Codex Coding')
  })
})

describe('reasoning state in the workflow prompt', () => {
  it('names a settings pin as manual', () => {
    expect(describeReasoning({
      source: 'manual',
      level: 'max',
      reason: 'pinned by Coding settings',
    })).toBe('Reasoning: manual (pinned by Coding settings)')
  })

  it('names a session override as manual', () => {
    expect(describeReasoning({
      source: 'manual',
      level: 'high',
      reason: 'session override',
    })).toBe('Reasoning: manual (session override)')
  })

  // The snapshot is re-sent whenever any contribution changes, so the
  // automatic line must not carry the level or the classifier's basis: both
  // move almost every turn and would append a fresh snapshot each time.
  it('keeps the automatic line identical whatever the level or basis', () => {
    const low = describeReasoning({ source: 'auto', level: 'low', reason: 'question, advice, or guidance request' })
    const high = describeReasoning({ source: 'auto', level: 'high', reason: 'multi-file or feature-module work' })
    expect(low).toBe('Reasoning: auto (level chosen by the preset at each step)')
    expect(high).toBe(low)
    expect(describeReasoning({ source: 'auto' })).toBe(low)
  })

  it('leaves the automatic level and basis out of the snapshot', () => {
    const text = describeReasoning({ source: 'auto', level: 'high', reason: '3 repository files referenced' })
    expect(text).not.toContain('repository files')
    expect(text).not.toContain('high')
  })

  it('renders nothing when the source is unknown', () => {
    expect(describeReasoning()).toBe('')
    expect(workflowPrompt('auto')).not.toContain('Reasoning:')
  })

  it('appends the reasoning line after the mode line', () => {
    const text = workflowPrompt('code', {
      source: 'manual',
      level: 'high',
      reason: 'session override',
    })
    const [first, second] = text.split('\n')
    expect(first).toContain('Workflow mode: code')
    expect(second).toBe('Reasoning: manual (session override)')
    expect(text).toContain('Codex Coding now')
  })

  it('keeps the auto snapshot byte-identical across classified turns', () => {
    const first = workflowPrompt('auto', {
      source: 'auto',
      level: 'low',
      reason: 'default low; no multi-file or project-level signal',
    })
    const second = workflowPrompt('auto', {
      source: 'auto',
      level: 'max',
      reason: 'project-wide refactor',
    })
    expect(second).toBe(first)
  })
})
