/**
 * Session projection for the Coding workflow mode. The projection is derived
 * from the session log, so the conversation card and a reloaded session read
 * the same value the preset uses: `/workflow <mode>` switches it, while a model
 * call to `coding_mode` also updates it.
 */
import { z } from 'zod'
import {
  WORKFLOW_PROJECTION_KEY,
  parseWorkflowMode,
  type WorkflowMode,
} from './mode.js'

export interface WorkflowProjectionState {
  mode: WorkflowMode
}

const modeSchema = z.enum(['auto', 'consult', 'review', 'code'])
const stateSchema = z.object({ mode: modeSchema }).strict()

/** Read a mode from a `coding_mode` tool call's JSON arguments. */
function modeFromToolArguments(raw: unknown): WorkflowMode | undefined {
  if (typeof raw !== 'string') return undefined
  try {
    const parsed = JSON.parse(raw) as { mode?: unknown } | null
    return parseWorkflowMode(parsed?.mode)
  } catch {
    return undefined
  }
}

/**
 * Projection definition registered by the preset. `command/run` is the UI
 * switch path; `tool/call` keeps the card honest when the model calls the tool.
 */
export const workflowProjection = {
  key: WORKFLOW_PROJECTION_KEY,
  stateVersion: 1,
  stateSchema,
  init: (): WorkflowProjectionState => ({ mode: 'auto' }),
  apply: (state: WorkflowProjectionState, event: unknown): WorkflowProjectionState => {
    const value = event as {
      type?: string
      data?: { name?: string; args?: unknown; arguments?: unknown }
    }
    const name = value.data?.name
    if (value.type === 'command/run' && name === 'workflow') {
      const mode = parseWorkflowMode(value.data?.args)
      return mode === undefined ? state : { mode }
    }
    if (value.type === 'tool/call' && name === 'coding_mode') {
      const mode = modeFromToolArguments(value.data?.arguments)
      return mode === undefined ? state : { mode }
    }
    return state
  },
  wire: {
    viewSchema: stateSchema,
    view: (state: WorkflowProjectionState): WorkflowProjectionState => state,
  },
}
