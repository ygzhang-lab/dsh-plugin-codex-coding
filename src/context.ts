import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { CodingOptions, ReasoningChoice } from './config.js'
import type { WorkflowMode } from './mode.js'

const execFileAsync = promisify(execFile)
const MAX_PACKAGE_JSON_BYTES = 512 * 1024

export interface DiffStat {
  files: number
  insertions: number
  deletions: number
}

export interface ContextSnapshot {
  root: string
  branch: string | null
  changed: string[]
  instructions: string[]
  diff: DiffStat | null
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | null
  packageDir: string | null
  scripts: Record<string, string>
  checks: string[]
  policy: string
  text: string
}

interface RunOptions {
  cwd: string
  timeout: number
  signal?: AbortSignal
}

async function run(command: string, args: string[], options: RunOptions): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout,
      maxBuffer: 64 * 1024,
      signal: options.signal,
      encoding: 'utf8',
    })
    return stdout.trim()
  } catch {
    return undefined
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Render a repository-relative path with forward slashes in prompt text. */
function posix(path: string): string {
  return path.split(/[\\/]/).join('/')
}

function inside(parent: string, child: string): boolean {
  const value = relative(resolve(parent), resolve(child))
  return value !== '' && !value.startsWith('..') && !value.startsWith('/')
}

async function findPackageRoot(cwd: string, root: string): Promise<string | undefined> {
  let current = resolve(cwd)
  while (inside(root, current) || current === resolve(root)) {
    if (await exists(join(current, 'package.json'))) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
  return undefined
}

async function detectPackageManager(packageRoot: string, root: string): Promise<ContextSnapshot['packageManager']> {
  let current = packageRoot
  while (true) {
    if (await exists(join(current, 'pnpm-lock.yaml'))) return 'pnpm'
    if (await exists(join(current, 'yarn.lock'))) return 'yarn'
    if (await exists(join(current, 'bun.lockb')) || await exists(join(current, 'bun.lock'))) return 'bun'
    if (await exists(join(current, 'package-lock.json'))) return 'npm'
    if (current === resolve(root)) break
    const parent = dirname(current)
    if (parent === current) break
    if (parent !== resolve(root) && !inside(root, parent)) break
    current = parent
  }
  if (await exists(join(packageRoot, 'package.json'))) return 'npm'
  return null
}

async function readScripts(packageRoot: string): Promise<Record<string, string>> {
  try {
    const info = await stat(join(packageRoot, 'package.json'))
    if (!info.isFile() || info.size > MAX_PACKAGE_JSON_BYTES) return {}
    const raw = await readFile(join(packageRoot, 'package.json'), 'utf8')
    return parseScripts(JSON.parse(raw).scripts)
  } catch {
    return {}
  }
}

function runCommand(pm: ContextSnapshot['packageManager'], script: string): string {
  if (pm === 'pnpm') return `pnpm ${script}`
  if (pm === 'yarn') return `yarn ${script}`
  if (pm === 'bun') return `bun run ${script}`
  return `npm run ${script}`
}

function parseScripts(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const scripts: Record<string, string> = {}
  for (const [key, script] of Object.entries(value)) {
    if (typeof script === 'string') scripts[key] = script
  }
  return scripts
}

function recommendedChecks(
  pm: ContextSnapshot['packageManager'],
  scripts: Record<string, string>,
): string[] {
  const checks: string[] = []
  for (const script of ['typecheck', 'lint', 'test']) {
    if (scripts[script]?.trim() !== undefined && scripts[script].trim() !== '') {
      checks.push(runCommand(pm, script))
    }
  }
  if (checks.length === 0 && scripts.build?.trim() !== undefined && scripts.build.trim() !== '') {
    checks.push(runCommand(pm, 'build'))
  }
  return checks
}

function compactPolicy(
  options: CodingOptions,
  reasoning?: ReasoningChoice,
  workflow?: WorkflowMode,
): string {
  const reasoningMode = options.reasoning === 'auto'
    ? `auto${reasoning === undefined ? '' : `→${reasoning.level}`}`
    : `fixed:${options.reasoning}`
  const disabled = Array.isArray(options.disabledPlugins) ? options.disabledPlugins : []
  return [
    `reasoning ${reasoningMode}`,
    `skills ${options.localSkills === false ? 'off' : 'on'}`,
    disabled.length === 0
      ? 'plugins all enabled'
      : `plugins disabled: ${disabled.join(', ')}`,
    ...workflow === undefined || workflow === 'auto' ? [] : [`workflow ${workflow}`],
  ].join(' | ')
}

/**
 * Walk from the repository root to the working directory and list every
 * AGENTS.md that applies. Content stays out of the snapshot; the agent reads
 * the files itself.
 */
async function findInstructionFiles(root: string, cwd: string): Promise<string[]> {
  const files: string[] = []
  const add = async (dir: string): Promise<void> => {
    const path = join(dir, 'AGENTS.md')
    if (!(await exists(path))) return
    const value = relative(root, path) || 'AGENTS.md'
    if (!files.includes(value)) files.push(value)
  }

  const base = resolve(root)
  const current = resolve(cwd)
  if (current === base) {
    await add(base)
    return files
  }
  if (!inside(base, current)) {
    await add(current)
    return files
  }

  await add(base)
  let dir = base
  for (const segment of relative(base, current).split(/[\\/]/).filter(Boolean)) {
    dir = join(dir, segment)
    await add(dir)
  }
  return files
}

async function readDiff(cwd: string, options: RunOptions): Promise<DiffStat | null> {
  let output = await run('git', ['diff', 'HEAD', '--numstat'], options)
  if (output === undefined) {
    // A repository without a first commit has no HEAD; count staged and
    // unstaged changes separately instead of reporting a clean tree.
    const staged = await run('git', ['diff', '--cached', '--numstat'], options) ?? ''
    const unstaged = await run('git', ['diff', '--numstat'], options) ?? ''
    output = [staged, unstaged].filter(Boolean).join('\n')
  }
  if (output === '') return null

  let files = 0
  let insertions = 0
  let deletions = 0
  for (const line of output.split('\n')) {
    const [add, remove] = line.split('\t')
    if (add === undefined || remove === undefined) continue
    files += 1
    if (add !== '-') insertions += Number.parseInt(add, 10) || 0
    if (remove !== '-') deletions += Number.parseInt(remove, 10) || 0
  }
  return files === 0 ? null : { files, insertions, deletions }
}

function diffText(diff: DiffStat | null, changed: readonly string[]): string {
  if (diff !== null) {
    return `${diff.files} files, +${diff.insertions}/-${diff.deletions}`
  }
  if (changed.length === 0) return 'clean'
  const tracked = changed.some((line) => !line.startsWith('??'))
  return tracked ? 'tracked changes; numstat unavailable' : 'no tracked changes (untracked files present)'
}

/**
 * Collect a compact repository snapshot for the code agent. This intentionally
 * replaces a burst of exploratory shell calls; it never prints file contents.
 */
export async function gatherContext(
  cwd: string,
  options: CodingOptions,
  reasoning?: ReasoningChoice,
  signal?: AbortSignal,
  detail: 'brief' | 'full' = 'brief',
  workflow?: WorkflowMode,
): Promise<ContextSnapshot> {
  const runOptions: RunOptions = { cwd, timeout: 4000, signal }
  const discoveredRoot = await run('git', ['rev-parse', '--show-toplevel'], runOptions)
  const root = discoveredRoot === undefined || discoveredRoot === '' ? resolve(cwd) : resolve(discoveredRoot)
  const branch = (await run('git', ['branch', '--show-current'], runOptions)) || null
  const status = await run('git', ['status', '--porcelain=v1'], runOptions)
  const changed = status === undefined || status === ''
    ? []
    : status
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

  const instructions = await findInstructionFiles(root, cwd)
  const diff = await readDiff(cwd, runOptions)
  const packageRoot = await findPackageRoot(cwd, root)
  const scripts = packageRoot === undefined ? {} : await readScripts(packageRoot)
  const packageManager = packageRoot === undefined ? null : await detectPackageManager(packageRoot, root)
  const checks = recommendedChecks(packageManager, scripts)
  const changedSummary = changed.length === 0
    ? 'clean'
    : `${changed.length} changed${changed.length > 0 ? `: ${changed.slice(0, 8).join('; ')}${changed.length > 8 ? `; +${changed.length - 8}` : ''}` : ''}`
  const packageDir = packageRoot === undefined ? null : relative(root, packageRoot) || null
  const lines = [
    `cwd: ${resolve(cwd)}`,
    ...root === resolve(cwd) ? [] : [`repo: ${root}`],
    `git: ${branch ?? 'detached-or-no-repo'} | ${changedSummary}`,
    `instructions: ${instructions.length === 0 ? 'none found; follow the repository conventions' : instructions.map(posix).join(', ')}`,
    `diff: ${diffText(diff, changed)}`,
    `package: ${packageManager ?? 'none'}${packageDir === null ? '' : ` at ${posix(packageDir)}`}`,
    `checks: ${checks.length === 0 ? 'none detected; inspect the repo before claiming verification' : checks.join('; ')}`,
    `policy: ${compactPolicy(options, reasoning, workflow)}`,
  ]
  if (detail === 'full') {
    const visibleScripts = ['build', 'typecheck', 'lint', 'test', 'format']
      .filter((name) => scripts[name] !== undefined)
      .map((name) => `${name}=${scripts[name]}`)
    if (visibleScripts.length > 0) lines.push(`scripts: ${visibleScripts.join(' | ')}`)
  }

  return {
    root,
    branch,
    changed,
    instructions,
    diff,
    packageManager,
    packageDir,
    scripts,
    checks,
    policy: compactPolicy(options, reasoning, workflow),
    text: lines.join('\n'),
  }
}
