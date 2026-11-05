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

/**
 * Preset id declared by this bundle's `cordis.patch.yml` (`preset-codex-coding`
 * row, `id: coding`). The projection registry is process-wide: once one Coding
 * agent registers the key, every session in the process gets a projected cell,
 * so the key itself cannot tell Coding sessions apart. The session header and
 * the Host's preset-selection event are the only durable values that do.
 */
export const CODING_PRESET_ID = 'coding'

export interface WorkflowProjectionState {
  mode: WorkflowMode
  /** True only for sessions created by this bundle's Coding preset. */
  active: boolean
}

/** Session header fields that identify a user conversation of this preset. */
export interface PresetHeader {
  agentPreset?: string
  delegationDepth?: number
}

/**
 * Activation rule shared by every projection this bundle registers. Delegated
 * subagent sessions inherit the preset but are not user conversations.
 */
export function isActiveSession(header?: PresetHeader): boolean {
  return header?.agentPreset === CODING_PRESET_ID && (header?.delegationDepth ?? 0) === 0
}

const modeSchema = z.enum(['auto', 'consult', 'review', 'code'])
const stateSchema = z.object({ mode: modeSchema, active: z.boolean() }).strict()

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
 * Activation proof carried by an existing session event. `Session.append()`
 * cannot set `ignorable: true`, so a plugin-specific type makes the Session
 * refuse to reopen on the next launch; the Host's guidance is to derive state
 * from events it already owns. `agent-preset/selected` is that event: the Host
 * appends it when a Session is created with, or switched to, a preset, both
 * later than the header it overrides.
 *
 * It resolves activation in both directions, so a session this preset does not
 * compose loses the card at its next step. Delegated subagent sessions inherit
 * the preset but are not user conversations, so they stay inactive.
 */
export function activationFromEvent(event: unknown): boolean | undefined {
  const value = event as { type?: string; data?: { agentPreset?: unknown } }
  if (value.type !== 'agent-preset/selected') return undefined
  const preset = value.data?.agentPreset
  return typeof preset === 'string' ? preset === CODING_PRESET_ID : undefined
}

/**
 * Projection definition registered by the preset. `command/run` is the UI
 * switch path; `tool/call` keeps the card honest when the model calls the tool.
 */
export const workflowProjection = {
  key: WORKFLOW_PROJECTION_KEY,
  // `active` joined the state and its fold reads session events, so cached
  // checkpoints from the previous shape must be discarded.
  stateVersion: 2,
  stateSchema,
  init: (header?: PresetHeader): WorkflowProjectionState => ({
    mode: 'auto',
    // Delegated subagent sessions inherit the preset but are not user
    // conversations, so the card stays off there too.
    active: isActiveSession(header),
  }),
  apply: (state: WorkflowProjectionState, event: unknown): WorkflowProjectionState => {
    const value = event as {
      type?: string
      data?: { name?: string; args?: unknown; arguments?: unknown }
    }
    const name = value.data?.name
    if (value.type === 'command/run' && name === 'workflow') {
      const mode = parseWorkflowMode(value.data?.args)
      return mode === undefined ? state : { ...state, mode }
    }
    if (value.type === 'tool/call' && name === 'coding_mode') {
      const mode = modeFromToolArguments(value.data?.arguments)
      return mode === undefined ? state : { ...state, mode }
    }
    const active = activationFromEvent(event)
    if (active === undefined || active === state.active) return state
    return { ...state, active }
  },
  wire: {
    // The key is registered process-wide, so a session from another preset
    // still has a cell. Every wire value must be lossless JSON: the Host
    // forwards this block inside `api-session/added`, and a value that
    // serializes to `undefined` makes that forwarded event throw, which in
    // turn makes creating any session of another preset fail. The `active`
    // flag, not the value's presence, is what hides the card elsewhere.
    viewSchema: stateSchema,
    view: (state: WorkflowProjectionState): WorkflowProjectionState => state,
  },
}
