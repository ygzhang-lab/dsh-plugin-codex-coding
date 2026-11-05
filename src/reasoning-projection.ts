/**
 * Session projection for the Coding reasoning level.
 *
 * The Host already projects the request's `reasoningEffort`, but the card also
 * needs the session override that `coding_reasoning` sets and the activation
 * gate that keeps other presets' sessions from rendering it. Folding both event
 * sources into one projection keeps the card to a single read.
 *
 * `request/header` carries the effort the Provider actually received, so the
 * card reports the real value rather than re-running the classifier.
 */
import { z } from 'zod'
import type { ReasoningLevel } from './config.js'
import {
  activationFromEvent,
  isActiveSession,
  type PresetHeader,
} from './workflow.js'

export const REASONING_PROJECTION_KEY = 'codingReasoning'

/** The reasoning state one completed turn ran under, for its own card. */
export interface ReasoningTurn {
  turn: number
  override: ReasoningLevel | null
  userEffort: string | null
  effort: string | null
}

export interface ReasoningProjectionState {
  /** Level pinned for this session by `coding_reasoning`; null when automatic. */
  override: ReasoningLevel | null
  /**
   * Effort the user picked in the chat box (`model/selection`), verbatim. It
   * wins over the automatic classifier until the user changes it again or a
   * `coding_reasoning` call replaces it.
   */
  userEffort: string | null
  /** Provider effort id from the most recent request header, verbatim. */
  effort: string | null
  /** True only for sessions created by this bundle's Coding preset. */
  active: boolean
  /** Highest turn the log has reached; its card reads the live state. */
  latest: number
  /** Reasoning state as of each completed turn, oldest first. */
  turns: ReasoningTurn[]
}

const levelSchema = z.enum(['low', 'high', 'max'])
const turnSchema = z.object({
  turn: z.number(),
  override: levelSchema.nullable(),
  userEffort: z.string().nullable(),
  effort: z.string().nullable(),
}).strict()
const stateSchema = z.object({
  override: levelSchema.nullable(),
  userEffort: z.string().nullable(),
  effort: z.string().nullable(),
  active: z.boolean(),
  latest: z.number(),
  turns: z.array(turnSchema),
}).strict()

/** Bound the history the state carries; older cards fall back to the live row. */
const MAX_TURNS = 100

/** Numeric `turn/start` and `turn/end` payloads; anything else is ignored. */
function eventTurn(event: unknown): number | undefined {
  const value = (event as { data?: { turn?: unknown } })?.data?.turn
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Read a session override from a `coding_reasoning` tool call's JSON arguments. */
export function overrideFromToolArguments(
  raw: unknown,
): ReasoningLevel | 'auto' | undefined {
  if (typeof raw !== 'string') return undefined
  try {
    const parsed = JSON.parse(raw) as { effort?: unknown } | null
    const value = parsed?.effort
    if (value === 'auto') return 'auto'
    return value === 'low' || value === 'high' || value === 'max' ? value : undefined
  } catch {
    return undefined
  }
}

/** Effort id written into the request header; absent or blank means none. */
function effortFromHeader(event: unknown): string | null | undefined {
  const value = event as {
    type?: string
    data?: { header?: { config?: { reasoningEffort?: unknown } } }
  }
  if (value.type !== 'request/header') return undefined
  const effort = value.data?.header?.config?.reasoningEffort
  if (typeof effort !== 'string') return null
  const trimmed = effort.trim()
  return trimmed === '' ? null : trimmed
}

/** Effort id the user picked in the chat box; `model/selection` owns it. */
function effortFromSelection(event: unknown): string | null | undefined {
  const value = event as {
    type?: string
    data?: { reasoningEffort?: unknown }
  }
  if (value.type !== 'model/selection') return undefined
  const effort = value.data?.reasoningEffort
  if (typeof effort !== 'string') return null
  const trimmed = effort.trim()
  return trimmed === '' ? null : trimmed
}

export const reasoningProjection = {
  key: REASONING_PROJECTION_KEY,
  // `turns` and `latest` joined the state, so cached checkpoints from the
  // previous shape must be discarded.
  stateVersion: 3,
  stateSchema,
  init: (header?: PresetHeader): ReasoningProjectionState => ({
    override: null,
    userEffort: null,
    effort: null,
    active: isActiveSession(header),
    latest: 0,
    turns: [],
  }),
  apply: (state: ReasoningProjectionState, event: unknown): ReasoningProjectionState => {
    const value = event as {
      type?: string
      data?: { name?: string; arguments?: unknown; args?: unknown }
    }
    if (value.type === 'tool/call' && value.data?.name === 'coding_reasoning') {
      const override = overrideFromToolArguments(value.data.arguments ?? value.data.args)
      if (override === undefined) return state
      const next = override === 'auto' ? null : override
      // An explicit tool decision replaces whatever the chat box picked.
      return next === state.override && state.userEffort === null
        ? state
        : { ...state, override: next, userEffort: null }
    }
    const picked = effortFromSelection(event)
    if (picked !== undefined) {
      return picked === state.userEffort && state.override === null
        ? state
        : { ...state, userEffort: picked, override: null }
    }
    const effort = effortFromHeader(event)
    if (effort !== undefined) {
      return effort === state.effort ? state : { ...state, effort }
    }
    // Snapshot the reasoning state when a turn closes: its card must keep the
    // level that turn actually used, while later turns move on.
    const turn = eventTurn(event)
    if (turn !== undefined && (value.type === 'turn/start' || value.type === 'turn/end')) {
      const latest = Math.max(state.latest, turn)
      if (value.type === 'turn/start') {
        return latest === state.latest ? state : { ...state, latest }
      }
      const turns = state.turns.filter((item) => item.turn !== turn)
      turns.push({ turn, override: state.override, userEffort: state.userEffort, effort: state.effort })
      return { ...state, latest, turns: turns.slice(-MAX_TURNS) }
    }
    const active = activationFromEvent(event)
    if (active === undefined || active === state.active) return state
    return { ...state, active }
  },
  wire: {
    // Same rule as the workflow projection: every value must be lossless JSON
    // because the Host forwards this block inside `api-session/added`.
    viewSchema: stateSchema,
    view: (state: ReasoningProjectionState): ReasoningProjectionState => state,
  },
}
