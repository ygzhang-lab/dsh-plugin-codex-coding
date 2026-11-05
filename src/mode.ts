import type { ReasoningLevel } from './config.js'

/**
 * Per-session workflow mode. This is intentionally separate from the
 * reasoning level: a Low-effort request can be a consultation, and a High
 * request can be a code change.
 */
export type WorkflowMode = 'auto' | 'consult' | 'code' | 'review'
export type WorkflowOverride = Exclude<WorkflowMode, 'auto'>

const MODE_GUIDANCE: Record<WorkflowOverride, readonly string[]> = {
  consult: [
    'Follow Q&A mode now: answer the question first; do not edit files, run tests, or create a todo list unless the user asks for implementation.',
    'Use read-only inspection only when repository facts change the answer.',
    'Present 1-3 viable options with tradeoffs, one recommendation, and a short plan; end with the decision you need from the user.',
    'Do not switch to Codex Coding until the user explicitly approves implementation.',
  ],
  code: [
    'Follow Codex Coding now: establish context, define done, change surgically, verify the result, and deliver compactly.',
    'Do not reopen Q&A unless the user asks a question instead of requesting a change.',
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
    return 'workflow mode: auto (choose Q&A, Review, or Codex Coding from the request)'
  }
  return `workflow mode: ${mode} (manual override; call coding_mode with "auto" to clear)`
}

/** Modes accepted by the manual switch surfaces. */
export const WORKFLOW_MODES: readonly WorkflowMode[] = ['auto', 'consult', 'review', 'code']

/**
 * Where this session's reasoning level comes from. The workflow prompt box
 * shows it so a level the user pinned is never read as an automatic decision.
 */
export type ReasoningSummary =
  | { source: 'auto'; level?: ReasoningLevel; reason?: string }
  | { source: 'manual'; level: ReasoningLevel; reason: string }

/**
 * Prompt line for the reasoning state; empty when nothing is known yet.
 *
 * It names the source only. The level and the classifier's basis change almost
 * every turn, and DSH re-sends the whole runtime-context snapshot whenever any
 * contribution changes, so echoing them here would append a full copy of the
 * snapshot for a few tokens of information. The UI card and the
 * `coding_reasoning` tool still report the level and its basis.
 */
export function describeReasoning(summary?: ReasoningSummary): string {
  if (summary === undefined) return ''
  if (summary.source === 'manual') {
    return `Reasoning: manual (${summary.reason})`
  }
  return 'Reasoning: auto (level chosen by the preset at each step)'
}

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
 * The reasoning line rides along because the level is chosen outside this
 * switch: silently auto, pinned by settings, or overridden for the session.
 */
export function workflowPrompt(mode: WorkflowMode, reasoning?: ReasoningSummary): string {
  const reasoningLine = describeReasoning(reasoning)
  if (mode === 'auto') {
    return [
      'Workflow mode: auto. Choose Q&A, Review, or Codex Coding from the current request; the user may switch it from the conversation card.',
      reasoningLine,
    ].filter((line) => line !== '').join('\n')
  }
  return [
    `Workflow mode: ${mode} (manual, chosen by the user for this session).`,
    reasoningLine,
    ...MODE_GUIDANCE[mode],
  ].filter((line) => line !== '').join('\n')
}
