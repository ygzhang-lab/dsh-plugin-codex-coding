import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerApplyPatch } from './apply-patch.js'
import { gatherContext } from './context.js'
import {
  disabledToolNames,
  type CodingOptions,
} from './config.js'
import { ReasoningController } from './reasoning.js'
import { CODING_CONTRACT } from './prompt.js'
import { ModeController, describeMode, type WorkflowMode } from './mode.js'

interface CodingService {
  options: CodingOptions
}

function serviceOf(ctx: any): CodingService {
  const service = ctx.get('dshCoding')
  if (service === undefined) {
    throw new Error('dsh-plugin-coding: the coding settings service is unavailable; enable the dsh-plugin-coding bundle')
  }
  return service
}

function visibleToolNames(agent: any): Set<string> {
  try {
    const schemas = agent?.ctx?.tools?.schemas?.(agent) ?? []
    return new Set(schemas.map((schema: { name: string }) => schema.name))
  } catch {
    return new Set()
  }
}

/** Remove the tools of plugins the user disabled for new Coding sessions. */
function restrictAgent(agent: any, options: CodingOptions): void {
  const requested = disabledToolNames(options)
  if (requested.length === 0) return
  const visible = visibleToolNames(agent)
  const deny = requested.filter((name) => visible.has(name))
  if (deny.length === 0) return
  try {
    agent.ctx.tools.restrict({ deny })
  } catch (error) {
    // A tool may have been unmounted by another composition layer. Keep the
    // session usable and make an unexpected restriction failure visible.
    agent.ctx.logger?.warn?.(`dsh-plugin-coding: could not restrict tools: ${String(error)}`)
  }
}

function helpText(value: string): string {
  return value.trim()
}

/**
 * Register the Codex operating contract as its own early prompt section. The
 * persona stays an identity, and the workflow has one source of truth.
 */
function registerContract(ctx: any): void {
  const prompt = ctx.get?.('systemPrompt') ?? ctx.systemPrompt
  if (typeof prompt?.section !== 'function') return
  prompt.section({
    name: 'coding:contract',
    order: 10,
    text: CODING_CONTRACT,
  })
}

/** Mount apply_patch when the agent scope exposes a filesystem service. */
function registerPatch(ctx: any, service: CodingService): void {
  const enabled = () => !service.options.disabledPlugins.includes('@deepseek-ai/dsh-tool-fs')
  if (typeof ctx.inject === 'function') {
    ctx.inject(['fs'], (child: any) => registerApplyPatch(child, enabled))
    return
  }
  const fs = ctx.get?.('fs') ?? ctx.fs
  if (fs !== undefined) registerApplyPatch(ctx, enabled)
}

/**
 * The only plugin this package adds to an agent. It is mounted by the Coding
 * preset, never by the Host, so a session that does not select Coding is
 * completely unaffected.
 */
export const name = 'dsh-plugin-coding-preset'
export const inject = ['tools', 'dshCoding', 'systemPrompt', 'sessionController', 'llm', 'sessionProjections']

export function apply(ctx: any): void {
  const service = serviceOf(ctx)
  const reasoning = new ReasoningController(ctx, () => service.options)
  const modes = new ModeController()
  registerContract(ctx)

  ctx.on('agent/created', ({ agent }: { agent: any }) => {
    restrictAgent(agent, service.options)
  })

  // Prompt assembly happens before the claimed user messages enter history, so
  // classify at the pre-step boundary where the admitted batch is available.
  // This also runs after prompt assembly snapshotted the next model selection.
  ctx.on('agent/pre-step', async (context: any, next: () => Promise<any>) => {
    const decision = await next()
    if (decision?.kind === 'reject' || context.signal?.aborted === true) return decision
    try {
      await reasoning.apply(context.agent, context.signal, decision?.messages)
    } catch {
      // A failed classifier must never block the step.
    }
    return decision
  }, { prepend: true })

  // Apply the classified level to the actual request as well. This is the
  // final gate before the provider call and does not depend on the session
  // controller's mutable selection object.
  ctx.on('agent/request', async (context: any, next: () => Promise<any>) => {
    const config = await next()
    try {
      const effort = await reasoning.requestEffort(context.agent, config, context.signal)
      if (effort === undefined) return config
      return { ...config, reasoningEffort: effort }
    } catch {
      return config
    }
  }, { prepend: true })

  ctx.tools.register(defineTool({
    name: 'coding_context',
    description: [
      'Collect a compact repository snapshot before multi-step coding work:',
      'working tree, branch, changed files, applicable AGENTS.md paths, tracked diff stats, package manager, and detected verification commands.',
      'Call it once per task; skip it for pure questions and trivia.',
      'Use full only when the package scripts themselves matter.',
    ].join(' '),
    parameters: {
      detail: {
        type: 'string',
        enum: ['brief', 'full'],
        description: 'brief (default) or full script listing.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: string) => [{ type: 'text', text: helpText(value) }],
    },
    async execute(args: { detail?: 'brief' | 'full' }, exec: any): Promise<string> {
      if (exec.agent === undefined) throw new Error('coding_context requires an owning agent session')
      let cwd = process.cwd()
      try {
        const workingDirectory = exec.agent.ctx?.get?.('workingDirectory') ?? ctx.get('workingDirectory')
        if (workingDirectory?.ensure !== undefined) {
          const resolved = await workingDirectory.ensure(exec.agent, exec.signal)
          if (typeof resolved === 'string' && resolved !== '') cwd = resolved
        }
      } catch {
        // Keep the launch directory as the fallback.
      }
      const snapshot = await gatherContext(
        cwd,
        service.options,
        reasoning.describe(exec.agent).choice,
        exec.signal,
        args?.detail ?? 'brief',
        modes.get(exec.agent),
      )
      return snapshot.text
    },
  }))

  ctx.tools.register(defineTool({
    name: 'coding_reasoning',
    description: [
      'Inspect the active Coding reasoning mode, or set a session override.',
      'Call with no effort to report the current level.',
      'Set low, high, or max only when the user asks to change reasoning or the task has become clearly harder;',
      'ordinary work is classified automatically and needs no call.',
    ].join(' '),
    parameters: {
      effort: {
        type: 'string',
        enum: ['auto', 'low', 'high', 'max'],
        description: 'Omit to inspect; auto clears an override; low/high/max pins this session.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: string) => [{ type: 'text', text: helpText(value) }],
    },
    async execute(args: { effort?: 'auto' | 'low' | 'high' | 'max' }, exec: any): Promise<string> {
      if (exec.agent === undefined) throw new Error('coding_reasoning requires an owning agent session')
      const options = service.options
      if (args?.effort === undefined) {
        const state = reasoning.describe(exec.agent)
        const choice = state.choice
        const applied = state.effort === undefined
          ? choice === undefined ? '' : ' (effort not applied)'
          : ` (${state.effort})`
        const lines = [
          `reasoning mode: ${options.reasoning}`,
          `effective: ${choice?.level ?? 'pending'}${applied}`,
          `basis: ${choice?.reason ?? 'computed at the next assembly'}`,
        ]
        if (choice !== undefined && state.effort === undefined) {
          lines.push(`diagnosis:\n${await reasoning.diagnose(exec.agent)}`)
        }
        return lines.join('\n')
      }
      if (options.reasoning !== 'auto') {
        return `reasoning is pinned to ${options.reasoning} by Coding settings; change the preset setting to auto before using an in-session override`
      }
      const choice = reasoning.override(exec.agent, args.effort)
      await reasoning.apply(exec.agent, exec.signal)
      return args.effort === 'auto'
        ? `reasoning override cleared; next classification: ${choice.level}`
        : `reasoning override set to ${choice.level} for this session`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'coding_mode',
    description: [
      'Inspect or set the workflow mode for this session.',
      'Use consult for questions, advice, plans, and decisions; review for read-only findings; code for implementation.',
      'Call with no mode to inspect, or pass auto to clear a manual override.',
      'This changes workflow only; use coding_reasoning for effort.',
      'Call only when the user asks to switch modes or asks which mode is active; never force a mode on your own.',
    ].join(' '),
    parameters: {
      mode: {
        type: 'string',
        enum: ['auto', 'consult', 'code', 'review'],
        description: 'Omit to inspect; auto clears the override; consult/review/code pins this session.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: string) => [{ type: 'text', text: helpText(value) }],
    },
    async execute(args: { mode?: WorkflowMode }, exec: any): Promise<string> {
      if (exec.agent === undefined) throw new Error('coding_mode requires an owning agent session')
      if (args?.mode === undefined) {
        return [
          describeMode(modes.get(exec.agent)),
          'auto selects the lightest mode from each request; a manual mode stays until cleared.',
        ].join('\n')
      }
      if (!['auto', 'consult', 'code', 'review'].includes(args.mode)) {
        throw new Error('coding_mode: mode must be auto, consult, code, or review')
      }
      const next = modes.set(exec.agent, args.mode)
      return next === 'auto'
        ? 'workflow mode override cleared; auto-select Consult, Review, or Code from the request.'
        : modes.describe(next)
    },
  }))

  // Register after the context/reasoning/mode tools so the visible tool order
  // stays stable and the patch editor reads as the optional surgical-edit path.
  registerPatch(ctx, service)
}
