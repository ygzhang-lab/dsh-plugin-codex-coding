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
}

const levelSchema = z.enum(['low', 'high', 'max'])
const stateSchema = z.object({
  override: levelSchema.nullable(),
  userEffort: z.string().nullable(),
  effort: z.string().nullable(),
  active: z.boolean(),
}).strict()

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
  // `userEffort` joined the state, so cached checkpoints from the previous
  // shape must be discarded.
  stateVersion: 2,
  stateSchema,
  init: (header?: PresetHeader): ReasoningProjectionState => ({
    override: null,
    userEffort: null,
    effort: null,
    active: isActiveSession(header),
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
