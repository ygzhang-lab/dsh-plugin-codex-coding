import { describe, expect, it } from 'vitest'
import { CODING_CONTRACT } from '../src/prompt.js'

describe('CODING_CONTRACT', () => {
  it('puts workflow modes before the coding phases', () => {
    const modes = CODING_CONTRACT.indexOf('## Workflow modes')
    const contract = CODING_CONTRACT.indexOf('## Operating contract')
    expect(modes).toBeGreaterThanOrEqual(0)
    expect(contract).toBeGreaterThan(modes)
  })

  it('covers the five delivery phases in order', () => {
    const headings = [
      '### Establish context',
      '### Define done',
      '### Change surgically',
      '### Verify before claiming success',
      '### Deliver compactly',
    ]
    const positions = headings.map((heading) => CODING_CONTRACT.indexOf(heading))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('names the workflow tools and the non-negotiable evidence rules', () => {
    for (const text of [
      'AGENTS.md',
      'coding_context',
      'coding_mode',
      'apply_patch',
      'git diff',
      'Consult',
      'Review',
      'Do not edit files, run tests, or create a todo list',
      'In Consult mode, deliver exactly',
      'Do not use the Code-mode "files touched / verification" template',
      'Never report a passing check you did not run',
      'Do not commit, push, tag, or open a pull request unless the user asks',
    ]) {
      expect(CODING_CONTRACT).toContain(text)
    }
  })

  it('contains no unresolved prompt variables', () => {
    expect(CODING_CONTRACT).not.toMatch(/\{\{[a-z_]+\}\}/)
  })
})
