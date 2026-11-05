import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { ReasoningSummary } from './mode.js'
import {
  classifyTask,
  higher,
  levelForEffort,
  mapEffort,
  type CodingOptions,
  type ReasoningChoice,
  type ReasoningLevel,
} from './config.js'
import { REASONING_PROJECTION_KEY } from './reasoning-projection.js'

interface AgentState {
  turn: number
  level: ReasoningLevel
  choice: ReasoningChoice
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const item = block as { type?: unknown; text?: unknown }
    if (item.type === 'text' && typeof item.text === 'string') parts.push(item.text)
  }
  return parts.join('\n')
}

function directUserText(message: any): string {
  if (message?.role !== 'user') return ''
  if (message.source?.kind !== 'user') return ''
  return textOf(message.content)
}

/** Latest direct user message in a message batch, excluding injected context. */
export function latestUserTextIn(messages: unknown): string {
  if (!Array.isArray(messages)) return ''
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = directUserText(messages[index])
    if (text.trim() !== '') return text
  }
  return ''
}

/** Latest direct user message, excluding injected context and skill catalogs. */
export function latestUserText(session: any): string {
  let messages: unknown
  try {
    messages = session?.deriveMessages?.()
  } catch {
    return ''
  }
  return latestUserTextIn(messages)
}

export function todosOf(ctx: any, session: any): readonly { status: string }[] {
  try {
    const state = ctx.get('sessionProjections')?.stateOf?.(session, 'todos')
    if (!Array.isArray(state)) return []
    return state.filter((item): item is { status: string } => (
      typeof item === 'object'
      && item !== null
      && typeof (item as { status?: unknown }).status === 'string'
    ))
  } catch {
    return []
  }
}

export function turnOf(ctx: any, session: any): number {
  try {
    const boundary = ctx.get('sessionProjections')?.stateOf?.(session, 'turnBoundary')
    return typeof boundary?.lastTurn === 'number' ? boundary.lastTurn : 0
  } catch {
    return 0
  }
}

/**
 * Owns the per-session reasoning decision and applies it through the entry
 * point's model-selection reference. Exported for focused tests.
 */
export class ReasoningController {
  private readonly states = new WeakMap<object, AgentState>()
  private readonly overrides = new WeakMap<object, ReasoningLevel>()
  private readonly userChoices = new WeakMap<object, string>()
  private readonly applied = new WeakMap<object, string>()
  private readonly support = new Map<string, Promise<readonly string[] | null>>()

  constructor(
    private readonly ctx: any,
    private readonly options: () => CodingOptions,
  ) {}

  /**
   * Resolve a Host or Agent service from the Agent scope first. Preset child
   * plugins sit above the Agent scope, so Host-level services such as the
   * session controller and LLM registry are not always visible from `ctx`.
   */
  private service(agent: any, name: string): any {
    try {
      const scoped = agent?.ctx?.get?.(name)
      if (scoped !== undefined) return scoped
    } catch {
      // Fall through to the preset context.
    }
    try {
      return this.ctx.get(name)
    } catch {
      return undefined
    }
  }

  private serviceContext(agent: any): { get: (name: string) => any } {
    return { get: (name: string) => this.service(agent, name) }
  }

  /** Durable reasoning state, folded from the Session log by this preset. */
  private projectionState(agent: any): { override?: unknown; userEffort?: unknown } | undefined {
    const session = agent?.session
    if (session === undefined) return undefined
    try {
      const state = this.service(agent, 'sessionProjections')?.stateOf?.(session, REASONING_PROJECTION_KEY)
      return typeof state === 'object' && state !== null ? state : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Fold the projection back into this controller. A chat-box pick lands as a
   * `model/selection` event, a `coding_reasoning` call as a tool event, and the
   * projection is what survives a Host restart.
   */
  syncProjection(agent: any): void {
    const session = agent?.session
    if (session === undefined) return
    const state = this.projectionState(agent)
    if (state === undefined) return
    const override = state.override
    if (override === 'low' || override === 'high' || override === 'max') {
      this.overrides.set(agent, override)
    } else {
      this.overrides.delete(agent)
    }
    const userEffort = typeof state.userEffort === 'string' && state.userEffort.trim() !== ''
      ? state.userEffort.trim()
      : undefined
    if (userEffort === undefined) this.userChoices.delete(agent)
    else this.userChoices.set(agent, userEffort)
  }

  private selectionFor(agent: any): any {
    const controller = this.service(agent, 'sessionController')
    if (controller?.selectionFor === undefined) return undefined
    try {
      return controller.selectionFor(agent)
    } catch {
      return undefined
    }
  }

  private async effortsFor(
    agent: any,
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<readonly string[] | null> {
    const llm = this.service(agent, 'llm')
    if (llm?.resolveModelInfo === undefined) return null
    const key = `${provider}/${model}`
    const cached = this.support.get(key)
    if (cached !== undefined) return cached
    const pending = (async () => {
      try {
        const info = await llm.resolveModelInfo(provider, model, signal)
        const efforts = Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : []
        return efforts
          .map((effort: { id?: unknown }) => effort?.id)
          .filter((id: unknown): id is string => typeof id === 'string')
      } catch {
        // A transient capability lookup must not pin this route to "no
        // reasoning" for the rest of the process. Retry after a short pause.
        if (signal?.aborted === true) this.support.delete(key)
        else setTimeout(() => this.support.delete(key), 30_000).unref?.()
        return null
      }
    })()
    this.support.set(key, pending)
    return pending
  }

  private async supported(agent: any, signal?: AbortSignal): Promise<readonly string[] | null> {
    const current = this.selectionFor(agent)?.current
    if (current === undefined) return null
    return this.effortsFor(agent, current.provider, current.model, signal)
  }

  /**
   * Resolve the model's supported efforts from the actual request route and
   * return the effort to send. This path does not require the session
   * controller's selection object, so a missing selection cannot suppress the
   * automatic level.
   */
  async requestEffort(agent: any, config: any, signal?: AbortSignal): Promise<string | undefined> {
    const choice = this.states.get(agent)?.choice
    if (choice === undefined) return undefined
    const provider = config?.provider
    const model = config?.model
    if (typeof provider !== 'string' || typeof model !== 'string') return undefined
    const efforts = await this.effortsFor(agent, provider, model, signal)
    if (efforts === null) return undefined
    const effort = this.resolveEffort(choice, efforts)
    if (effort !== undefined) this.applied.set(agent, effort)
    return effort
  }

  /**
   * Prefer the effort the user picked in the chat box, but only while the route
   * still accepts it; otherwise fall back to the level's closest effort.
   */
  private resolveEffort(choice: ReasoningChoice, supported: readonly string[]): string | undefined {
    const picked = choice.effort
    if (picked !== undefined && supported.includes(picked)) return picked
    return mapEffort(choice.level, supported)
  }

  private setEffort(agent: any, effort: string | undefined): void {
    const selection = this.selectionFor(agent)
    const current = selection?.current
    if (current === undefined) return
    const next: any = { ...current }
    if (effort === undefined) delete next.reasoningEffort
    else next.reasoningEffort = ReasoningEffortId(effort)
    selection.current = next
    // Prompt assembly may have snapshotted `current` before this listener ran.
    // Keep the snapshot that `agent/request` reads in sync for this step.
    if (selection.assembled !== undefined) {
      const assembled: any = { ...selection.assembled }
      if (effort === undefined) delete assembled.reasoningEffort
      else assembled.reasoningEffort = ReasoningEffortId(effort)
      selection.assembled = assembled
    }
  }

  /** Treat a malformed runtime value as the safe automatic mode. */
  private mode(value: unknown): CodingOptions['reasoning'] {
    return value === 'low' || value === 'high' || value === 'max' ? value : 'auto'
  }

  /**
   * Recompute the decision for the current step. When the caller supplies the
   * admitted message batch, classify the request itself; otherwise fall back
   * to the session's latest direct user message.
   */
  async apply(agent: any, signal?: AbortSignal, messages?: unknown): Promise<ReasoningChoice | undefined> {
    if (agent?.session === undefined) return undefined
    const options = this.options()
    const mode = this.mode(options.reasoning)
    const sessionCtx = this.serviceContext(agent)
    const turn = turnOf(sessionCtx, agent.session)
    const plan = todosOf(sessionCtx, agent.session)
    const admitted = messages === undefined ? '' : latestUserTextIn(messages)
    const text = admitted.trim() !== '' ? admitted : latestUserText(agent.session)
    const classified = mode === 'auto'
      ? classifyTask(text, plan)
      : {
          level: mode,
          score: 0,
          reason: `fixed by Coding settings (${mode})`,
        } satisfies ReasoningChoice

    let level = classified.level
    let effort: string | undefined
    if (mode === 'auto') {
      const previous = this.states.get(agent)
      if (previous !== undefined && previous.turn === turn) level = higher(previous.level, level)
      const userEffort = this.userChoices.get(agent)
      const override = this.overrides.get(agent)
      if (userEffort !== undefined) {
        // A pick in the chat box is the user's explicit decision for this
        // session: skip the classifier instead of overwriting it each step.
        level = levelForEffort(userEffort)
        effort = userEffort
        classified.reason = `picked ${userEffort} in the chat box`
      } else if (override !== undefined) {
        level = override
        classified.reason = `session override (${override})`
      }
    }

    const choice: ReasoningChoice = {
      ...classified,
      level,
      ...(effort === undefined ? {} : { effort }),
    }
    const supported = await this.supported(agent, signal)
    if (supported !== null) this.setEffort(agent, this.resolveEffort(choice, supported))
    this.states.set(agent, { turn, level, choice })
    return choice
  }

  /** Current selector value without resolving provider capabilities. */
  currentEffort(agent: any): string | undefined {
    const value = this.selectionFor(agent)?.current?.reasoningEffort
    return value === undefined ? undefined : String(value)
  }

  /** Explicit in-session override; `auto` clears it. */
  override(agent: any, value: ReasoningLevel | 'auto'): ReasoningChoice {
    const requested = value === 'low' || value === 'high' || value === 'max' ? value : 'auto'
    // An explicit tool decision replaces a chat-box pick.
    this.userChoices.delete(agent)
    const sessionCtx = this.serviceContext(agent)
    const turn = turnOf(sessionCtx, agent.session)
    if (requested === 'auto') {
      this.overrides.delete(agent)
      const choice = classifyTask(latestUserText(agent.session), todosOf(sessionCtx, agent.session))
      this.states.set(agent, {
        turn,
        level: choice.level,
        choice,
      })
      return choice
    }
    this.overrides.set(agent, requested)
    const choice: ReasoningChoice = {
      level: requested,
      score: 0,
      reason: `session override (${requested})`,
    }
    this.states.set(agent, {
      turn,
      level: requested,
      choice,
    })
    return choice
  }

  describe(agent: any): { options: CodingOptions; choice: ReasoningChoice | undefined; effort: string | undefined } {
    return {
      options: this.options(),
      choice: this.states.get(agent)?.choice,
      effort: this.applied.get(agent) ?? this.currentEffort(agent),
    }
  }

  /**
   * Where the level comes from, for the workflow prompt box. The settings pin
   * wins over an in-session override because it already suppresses the
   * classifier and the override tool refuses to run. Without an agent the
   * answer falls back to the settings alone, so the first assembly of a new
   * session still states whether the level is automatic or pinned.
   */
  summary(agent?: any): ReasoningSummary {
    const mode = this.mode(this.options().reasoning)
    if (mode !== 'auto') {
      return { source: 'manual', level: mode, reason: 'pinned by Coding settings' }
    }
    if (agent === undefined) return { source: 'auto' }
    const override = this.overrides.get(agent)
    if (override !== undefined) {
      return { source: 'manual', level: override, reason: 'session override' }
    }
    const userEffort = this.userChoices.get(agent)
    if (userEffort !== undefined) {
      return {
        source: 'manual',
        level: levelForEffort(userEffort),
        reason: `picked ${userEffort} in the chat box`,
      }
    }
    const choice = this.states.get(agent)?.choice
    if (choice === undefined) return { source: 'auto' }
    return { source: 'auto', level: choice.level, reason: choice.reason }
  }

  /** Explain why an automatic decision could not reach the request selector. */
  async diagnose(agent: any): Promise<string> {
    const lines: string[] = []
    for (const [label, scoped] of [['agent', agent?.ctx], ['preset', this.ctx]] as const) {
      for (const name of ['sessionController', 'llm', 'sessionProjections']) {
        let state: string
        try {
          state = scoped?.get?.(name) === undefined ? 'missing' : 'present'
        } catch (error) {
          state = `error: ${String(error)}`
        }
        lines.push(`${label}.${name}: ${state}`)
      }
    }
    const controller = this.service(agent, 'sessionController')
    lines.push(`selectionFor: ${typeof controller?.selectionFor}`)
    let current: any
    try {
      const selection = controller?.selectionFor?.(agent)
      current = selection?.current
      lines.push(`selection: ${selection === undefined ? 'missing' : `current=${JSON.stringify(current)}`}`)
    } catch (error) {
      lines.push(`selectionFor error: ${String(error)}`)
    }
    const header = agent?.session?.requestHeader?.()
    const provider = current?.provider ?? header?.config?.provider
    const model = current?.model ?? header?.config?.model
    const llm = this.service(agent, 'llm')
    if (typeof provider === 'string' && typeof model === 'string' && llm?.resolveModelInfo !== undefined) {
      try {
        const info = await llm.resolveModelInfo(provider, model)
        lines.push(`efforts: ${JSON.stringify(info?.reasoning?.efforts ?? null)}`)
      } catch (error) {
        lines.push(`resolveModelInfo: ${String(error)}`)
      }
    }
    return lines.join('\n')
  }
}
