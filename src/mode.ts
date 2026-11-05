/**
 * Per-session workflow mode. This is intentionally separate from the
 * reasoning level: a Low-effort request can be a consultation, and a High
 * request can be a code change.
 */
export type WorkflowMode = 'auto' | 'consult' | 'code' | 'review'
export type WorkflowOverride = Exclude<WorkflowMode, 'auto'>

const MODE_GUIDANCE: Record<WorkflowOverride, readonly string[]> = {
  consult: [
    'Follow Consultation mode now: answer the question first; do not edit files, run tests, or create a todo list unless the user asks for implementation.',
    'Use read-only inspection only when repository facts change the answer.',
    'Present 1-3 viable options with tradeoffs, one recommendation, and a short plan; end with the decision you need from the user.',
    'Do not switch to Code until the user explicitly approves implementation.',
  ],
  code: [
    'Follow Coding mode now: establish context, define done, change surgically, verify the result, and deliver compactly.',
    'Do not reopen consultation unless the user asks a question instead of requesting a change.',
  ],
  review: [
    'Follow Review mode now: report concrete findings with file:line and a reproducible scenario, ordered by impact.',
    'Do not edit files unless the user explicitly asks for a fix.',
  ],
}

/** Owns the optional per-agent mode override; auto means no override. */
export class ModeController {
  private readonly modes = new WeakMap<object, WorkflowOverride>()

  /** Current effective mode for one agent. */
  get(agent: object): WorkflowMode {
    return this.modes.get(agent) ?? 'auto'
  }

  /** Set, change, or clear (auto) the mode override. */
  set(agent: object, mode: WorkflowMode): WorkflowMode {
    if (mode === 'auto') this.modes.delete(agent)
    else this.modes.set(agent, mode)
    return mode
  }

  /** Model-facing confirmation for a mode change. */
  describe(mode: WorkflowOverride): string {
    return `workflow mode set to ${mode}.\n${MODE_GUIDANCE[mode].join('\n')}`
  }
}

/** One-line summary for the inspect branch. */
export function describeMode(mode: WorkflowMode): string {
  if (mode === 'auto') {
    return 'workflow mode: auto (choose Consult, Review, or Code from the request)'
  }
  return `workflow mode: ${mode} (manual override; call coding_mode with "auto" to clear)`
}

/** Modes accepted by the manual switch surfaces. */
export const WORKFLOW_MODES: readonly WorkflowMode[] = ['auto', 'consult', 'review', 'code']

/** The session projection the UI card reads; kept here so the Client half does not import zod. */
export const WORKFLOW_PROJECTION_KEY = 'codingWorkflow'

/** Parse a user-provided mode token; unknown values stay undefined. */
export function parseWorkflowMode(value: unknown): WorkflowMode | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return (WORKFLOW_MODES as readonly string[]).includes(normalized)
    ? normalized as WorkflowMode
    : undefined
}

/**
 * Model-visible workflow directive. Manual modes carry the same guidance the
 * `coding_mode` tool returns, so a UI switch reaches the next prompt too.
 */
export function workflowPrompt(mode: WorkflowMode): string {
  if (mode === 'auto') {
    return 'Workflow mode: auto. Choose Consult, Review, or Code from the current request; the user may switch it from the conversation card.'
  }
  return `Workflow mode: ${mode} (manual, chosen by the user for this session).\n${MODE_GUIDANCE[mode].join('\n')}`
}
