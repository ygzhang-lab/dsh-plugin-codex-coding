/**
 * The Codex-compatible `apply_patch` tool for DSH.
 *
 * It resolves every file first, computes every hunk, then writes. That keeps a
 * stale or ambiguous patch from leaving a half-edited tree behind and gives the
 * model one clear A/M/D summary.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  APPLY_PATCH_DESCRIPTION,
  applyHunks,
  parsePatch,
  type PatchFile,
} from './patch.js'

interface FsTarget {
  targetKey: string
  displayPath: string
}

interface FsInfo {
  version: string
  type: 'file' | 'directory' | 'other'
}

interface FsWriteOutcome {
  operation: 'create' | 'update'
  version: string
}

type WriteIntent =
  | { kind: 'createIfAbsent' }
  | { kind: 'replaceIfVersion'; version: string }

interface FileSystemLike {
  sandboxMode?: string
  resolve(path: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>
  stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>
  readText(target: FsTarget, signal?: AbortSignal): Promise<string>
  writeText(
    target: FsTarget,
    content: string,
    intent?: WriteIntent,
    signal?: AbortSignal,
    policy?: unknown,
  ): Promise<FsWriteOutcome>
  processPath?(target: FsTarget): string
  remove?(
    target: FsTarget,
    expected?: { version: string },
    signal?: AbortSignal,
    policy?: unknown,
  ): Promise<void>
}

export interface PatchAppliedFile {
  path: string
  operation: 'created' | 'updated' | 'deleted' | 'moved'
  moveTo?: string
}

export interface PatchResult {
  files: PatchAppliedFile[]
}

interface BasePlan {
  path: string
  target: FsTarget
  policy: unknown
}

type PendingPlan =
  | (BasePlan & { kind: 'add'; content: string })
  | (BasePlan & { kind: 'delete'; version: string })
  | (BasePlan & { kind: 'update'; version: string; content: string; moveTo?: string })
  | (BasePlan & { kind: 'move'; version: string; content: string; destination: FsTarget; moveTo: string })

function fail(message: string): never {
  throw new Error(`apply_patch: ${message}`)
}

/** Preset children can sit above Host services; the agent scope sees more. */
function scopesOf(ctx: any, exec: any): any[] {
  return [exec?.agent?.ctx, ctx].filter((scope) => scope !== undefined)
}

function serviceOf(ctx: any, exec: any, name: string): any {
  for (const scope of scopesOf(ctx, exec)) {
    try {
      const service = scope.get?.(name) ?? scope[name]
      if (service !== undefined) return service
    } catch {
      // Try the next scope.
    }
  }
  return undefined
}

function fsOf(ctx: any, exec: any): FileSystemLike | undefined {
  return serviceOf(ctx, exec, 'fs') as FileSystemLike | undefined
}

async function sessionCwd(ctx: any, exec: any): Promise<string | undefined> {
  const workingDirectory = serviceOf(ctx, exec, 'workingDirectory')
  if (exec.agent !== undefined && typeof workingDirectory?.ensure === 'function') {
    try {
      const value = await workingDirectory.ensure(exec.agent, exec.signal)
      if (typeof value === 'string' && value !== '') return value
    } catch {
      // The session header remains the fallback.
    }
  }
  const cwd = exec.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

function sandboxPolicyOf(ctx: any, exec: any): unknown {
  const service = serviceOf(ctx, exec, 'sandboxPolicy')
  if (typeof service?.resolve !== 'function') return undefined
  try {
    return service.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
  } catch {
    return undefined
  }
}

async function resolveTarget(
  fs: FileSystemLike,
  path: string,
  cwd: string | undefined,
  signal: AbortSignal | undefined,
): Promise<FsTarget> {
  return fs.resolve(path, {
    ...(cwd === undefined ? {} : { cwd }),
    signal,
  })
}

async function statFile(fs: FileSystemLike, target: FsTarget, signal?: AbortSignal): Promise<FsInfo> {
  const info = await fs.stat(target, signal)
  if (info === undefined) fail(`file not found: ${target.displayPath}`)
  if (info.type !== 'file') fail(`not a regular file: ${target.displayPath}`)
  return info
}

function observe(
  ctx: any,
  target: FsTarget,
  observation: { kind: 'present'; version: string } | { kind: 'absent' },
  exec: any,
): void {
  if (typeof ctx.emit === 'function') ctx.emit('fs/observed', target, observation, exec)
}

async function intentFor(
  ctx: any,
  target: FsTarget,
  fallback: WriteIntent,
  exec: any,
): Promise<WriteIntent> {
  if (typeof ctx.waterfall !== 'function') return fallback
  const intent = await ctx.waterfall('fs/write-intent', target, exec, () => fallback)
  return intent ?? fallback
}

async function planPatches(
  ctx: any,
  fs: FileSystemLike,
  files: readonly PatchFile[],
  exec: any,
  cwd: string | undefined,
  policy: unknown,
): Promise<PendingPlan[]> {
  const plans: PendingPlan[] = []

  for (const file of files) {
    const target = await resolveTarget(fs, file.path, cwd, exec.signal)

    if (file.kind === 'add') {
      if (await fs.stat(target, exec.signal) !== undefined) {
        fail(`file already exists: ${target.displayPath}`)
      }
      observe(ctx, target, { kind: 'absent' }, exec)
      plans.push({ kind: 'add', path: file.path, target, content: file.content, policy })
      continue
    }

    const info = await statFile(fs, target, exec.signal)
    observe(ctx, target, { kind: 'present', version: info.version }, exec)

    if (file.kind === 'delete') {
      if (typeof fs.remove !== 'function') {
        fail(`deleting files is not supported by the configured filesystem; remove ${target.displayPath} another way`)
      }
      plans.push({ kind: 'delete', path: file.path, target, version: info.version, policy })
      continue
    }

    const original = await fs.readText(target, exec.signal)
    const content = file.hunks.length === 0 ? original : applyHunks(original, file.hunks, file.path)

    if (file.moveTo === undefined) {
      plans.push({ kind: 'update', path: file.path, target, version: info.version, content, policy })
      continue
    }

    const destination = await resolveTarget(fs, file.moveTo, cwd, exec.signal)
    if (destination.targetKey === target.targetKey) {
      plans.push({
        kind: 'update',
        path: file.path,
        target,
        version: info.version,
        content,
        moveTo: file.moveTo,
        policy,
      })
      continue
    }
    if (await fs.stat(destination, exec.signal) !== undefined) {
      fail(`move destination already exists: ${destination.displayPath}`)
    }
    observe(ctx, destination, { kind: 'absent' }, exec)
    plans.push({
      kind: 'move',
      path: file.path,
      target,
      version: info.version,
      content,
      destination,
      moveTo: file.moveTo,
      policy,
    })
  }

  return plans
}

async function writePlans(
  ctx: any,
  fs: FileSystemLike,
  plans: readonly PendingPlan[],
  exec: any,
): Promise<PatchResult> {
  const applied: PatchAppliedFile[] = []

  try {
    for (const plan of plans) {
      if (plan.kind === 'add') {
        const intent = await intentFor(ctx, plan.target, { kind: 'createIfAbsent' }, exec)
        const outcome = await fs.writeText(plan.target, plan.content, intent, exec.signal, plan.policy)
        observe(ctx, plan.target, { kind: 'present', version: outcome.version }, exec)
        applied.push({ path: plan.path, operation: 'created' })
        continue
      }

      if (plan.kind === 'update') {
        const intent = await intentFor(
          ctx,
          plan.target,
          { kind: 'replaceIfVersion', version: plan.version },
          exec,
        )
        const outcome = await fs.writeText(plan.target, plan.content, intent, exec.signal, plan.policy)
        observe(ctx, plan.target, { kind: 'present', version: outcome.version }, exec)
        applied.push({
          path: plan.path,
          operation: 'updated',
          ...(plan.moveTo === undefined ? {} : { moveTo: plan.moveTo }),
        })
        continue
      }

      if (plan.kind === 'delete') {
        if (typeof fs.remove !== 'function') fail('the filesystem no longer supports deletion')
        await fs.remove(plan.target, { version: plan.version }, exec.signal, plan.policy)
        observe(ctx, plan.target, { kind: 'absent' }, exec)
        applied.push({ path: plan.path, operation: 'deleted' })
        continue
      }

      if (typeof fs.remove !== 'function') fail('the filesystem no longer supports deletion')
      const intent = await intentFor(ctx, plan.destination, { kind: 'createIfAbsent' }, exec)
      const outcome = await fs.writeText(
        plan.destination,
        plan.content,
        intent,
        exec.signal,
        plan.policy,
      )
      observe(ctx, plan.destination, { kind: 'present', version: outcome.version }, exec)
      await fs.remove(plan.target, { version: plan.version }, exec.signal, plan.policy)
      observe(ctx, plan.target, { kind: 'absent' }, exec)
      applied.push({ path: plan.path, operation: 'moved', moveTo: plan.moveTo })
    }
  } catch (error) {
    const done = applied.map((file) => `${file.operation} ${file.path}`).join(', ')
    const message = error instanceof Error ? error.message : String(error)
    const text = message.startsWith('apply_patch:') ? message : `apply_patch: ${message}`
    throw new Error(done === '' ? text : `${text}; already applied: ${done}`)
  }

  return { files: applied }
}

/** Parse and apply one Codex-format patch. Exported for focused tests. */
export async function applyPatchInput(ctx: any, input: string, exec: any): Promise<PatchResult> {
  const fs = fsOf(ctx, exec)
  if (fs === undefined) fail('the filesystem capability is unavailable')

  const files = parsePatch(input)
  const cwd = await sessionCwd(ctx, exec)
  const policy = sandboxPolicyOf(ctx, exec)
  if (fs.sandboxMode !== undefined && policy === undefined) {
    fail('the sandbox policy service is required for a confined filesystem')
  }

  const plans = await planPatches(ctx, fs, files, exec, cwd, policy)
  return writePlans(ctx, fs, plans, exec)
}

export function renderPatchResult(value: PatchResult): string {
  const lines = value.files.map((file) => {
    const letter = file.operation === 'created'
      ? 'A'
      : file.operation === 'deleted'
        ? 'D'
        : 'M'
    const path = file.operation === 'moved'
      ? `${file.path} -> ${file.moveTo ?? file.path}`
      : file.path
    return `${letter} ${path}`
  })
  return `Success. Updated the following files:\n${lines.join('\n')}\n`
}

/** Register `apply_patch` in an agent scope that has the filesystem service. */
export function registerApplyPatch(ctx: any, enabled: () => boolean = () => true): void {
  if (typeof ctx?.tools?.register !== 'function') return

  ctx.tools.register(defineTool({
    name: 'apply_patch',
    description: APPLY_PATCH_DESCRIPTION,
    parameters: {
      input: {
        type: 'string',
        required: true,
        description: 'The complete patch text, from "*** Begin Patch" through "*** End Patch".',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          files: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                operation: {
                  type: 'string',
                  required: true,
                  enum: ['created', 'updated', 'deleted', 'moved'],
                },
                moveTo: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args: unknown, value: PatchResult) => [{
        type: 'text',
        text: renderPatchResult(value),
      }],
    },
    async execute(args: { input: string }, exec: any): Promise<PatchResult> {
      if (!enabled()) throw new Error('apply_patch: disabled by Coding settings')
      if (typeof args?.input !== 'string' || args.input.trim() === '') {
        throw new Error('apply_patch: input must be a non-empty patch string')
      }
      return applyPatchInput(ctx, args.input, exec)
    },
  }))
}
