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

/** The mode one completed turn ran under, so an old card never moves. */
export interface WorkflowTurn {
  turn: number
  mode: WorkflowMode
}

export interface WorkflowProjectionState {
  mode: WorkflowMode
  /** True only for sessions created by this bundle's Coding preset. */
  active: boolean
  /** Highest turn the log has reached; its card stays interactive. */
  latest: number
  /** Mode as of each completed turn, oldest first. */
  turns: WorkflowTurn[]
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
const turnSchema = z.object({ turn: z.number(), mode: modeSchema }).strict()
const stateSchema = z.object({
  mode: modeSchema,
  active: z.boolean(),
  latest: z.number(),
  turns: z.array(turnSchema),
}).strict()

/**
 * Cap the per-turn history. The state rides in every session checkpoint, so it
 * stays bounded; a card older than the window falls back to the live mode.
 */
const MAX_TURNS = 100

/** Numeric `turn/start` and `turn/end` payloads; anything else is ignored. */
function eventTurn(event: unknown): number | undefined {
  const value = (event as { data?: { turn?: unknown } })?.data?.turn
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

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
  // `latest` changed meaning (newest closed turn, not newest started turn), so
  // cached checkpoints from an earlier fold must be discarded and rebuilt.
  stateVersion: 5,
  stateSchema,
  init: (header?: PresetHeader): WorkflowProjectionState => ({
    mode: 'auto',
    // Delegated subagent sessions inherit the preset but are not user
    // conversations, so the card stays off there too.
    active: isActiveSession(header),
    latest: 0,
    turns: [],
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
    // A card belongs to one turn: the turn it closed keeps the mode that was
    // in force then, and only the newest closed turn's card may switch it.
    // `latest` advances on `turn/end` only: the chat tail is published on
    // `turn/end`, so a turn that merely started has no card yet — advancing on
    // `turn/start` would leave every rendered card frozen while that turn
    // runs. A turn killed mid-flight never publishes a card either, so it needs
    // no snapshot here.
    const turn = eventTurn(event)
    if (turn !== undefined && value.type === 'turn/end') {
      const latest = Math.max(state.latest, turn)
      const turns = state.turns.filter((item) => item.turn !== turn)
      turns.push({ turn, mode: state.mode })
      return { ...state, latest, turns: turns.slice(-MAX_TURNS) }
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
