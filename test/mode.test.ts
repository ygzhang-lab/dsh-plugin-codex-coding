import { describe, expect, it } from 'vitest'
import { ModeController, describeMode } from '../src/mode.js'

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
    expect(controller.describe('consult')).toContain('Consultation mode')
    expect(controller.describe('consult')).toContain('Do not switch to Code')
    expect(controller.describe('review')).toContain('Review mode')
    expect(controller.describe('review')).toContain('Do not edit files')
    expect(controller.describe('code')).toContain('Coding mode')
  })

  it('summarizes the effective mode for inspection', () => {
    expect(describeMode('auto')).toContain('workflow mode: auto')
    expect(describeMode('consult')).toContain('workflow mode: consult')
    expect(describeMode('review')).toContain('manual override')
  })
})
