/**
 * Skills shipped inside this package.
 *
 * DSH's profile patch is static YAML, so a bundle cannot point
 * `dsh-skill-filesystem.bundledSkillDir` at its own install directory. The
 * Coding preset therefore registers its own small provider, the same shape
 * DSH's office and badge bundles use. Candidates carry the registry's bundled
 * rank, so a project or user copy of the same skill still wins the name.
 */
import { readdir, readFile } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

/** Registry rank DSH assigns to a configured bundled skill root. */
const BUNDLED_SKILL_RANK = 600

/** Provider name registered in `ctx.skills`; per-scope, so sessions do not clash. */
const PROVIDER = 'codex-bundled'

/** Directory holding `<skill>/SKILL.md`; resolves to the package root in `lib/`. */
export const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url))

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export interface BundledSkillInvocation {
  modelInvocable: boolean
  userInvocable: boolean
}

export interface BundledSkillCandidate {
  name: string
  description: string
  invocation: BundledSkillInvocation
  provider: string
  source: 'bundled'
  rank: number
  path: string
  resourceBase: { kind: 'directory'; path: string }
  /** Absolute `SKILL.md` path handed back to `get()`. */
  locator: string
}

export interface BundledSkillDefinition {
  name: string
  description: string
  invocation: BundledSkillInvocation
  provider: string
  source: 'bundled'
  path: string
  resourceBase: { kind: 'directory'; path: string }
  content: string
  metadata?: Record<string, unknown>
}

interface ParsedBundledSkill {
  name: string
  description: string
  invocation: BundledSkillInvocation
  content: string
  metadata?: Record<string, unknown>
}

export interface BundledSkillFailure {
  directory: string
  error: Error
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function missingPath(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** Strict YAML boolean, matching the local filesystem provider's parser. */
function booleanFlag(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1') return true
    if (normalized === 'false' || normalized === 'no' || normalized === 'off' || normalized === '0') return false
  }
  throw new Error(`${field} must be a boolean`)
}

/**
 * Parse one bundled `SKILL.md`: YAML frontmatter plus the Markdown body.
 * Invalid frontmatter throws, so discovery can omit that skill with a warning
 * instead of publishing a broken catalog entry.
 */
export function parseBundledSkill(raw: string, source: string): ParsedBundledSkill {
  const match = FRONTMATTER.exec(raw)
  if (match?.[1] === undefined) {
    throw new Error(`${source} has no YAML frontmatter`)
  }
  let frontmatter: unknown
  try {
    frontmatter = parseYaml(match[1])
  } catch (error) {
    throw new Error(`${source} has invalid YAML frontmatter: ${messageOf(error)}`)
  }
  if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
    throw new Error(`${source} frontmatter must be a mapping`)
  }
  const record = frontmatter as Record<string, unknown>
  const name = record.name
  if (typeof name !== 'string' || !SKILL_NAME.test(name)) {
    throw new Error(`${source} declares an invalid kebab-case name`)
  }
  const description = record.description
  if (typeof description !== 'string' || description.trim() === '') {
    throw new Error(`${source} has no description`)
  }
  const metadata = record.metadata
  return {
    name,
    description: description.trim(),
    invocation: {
      modelInvocable: !booleanFlag(record['disable-model-invocation'], false, 'disable-model-invocation'),
      userInvocable: booleanFlag(record['user-invocable'], true, 'user-invocable'),
    },
    content: raw.slice(match[0].length).trim(),
    ...(typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
      ? { metadata: { ...(metadata as Record<string, unknown>) } }
      : {}),
  }
}

/**
 * Discover every directory skill under `root`. A missing root is an empty
 * catalog; malformed or unreadable entries are returned as failures so the
 * provider can report them once and keep the rest of the catalog usable.
 */
export async function discoverBundledSkills(
  root: string = SKILLS_DIR,
  signal?: AbortSignal,
): Promise<{ candidates: BundledSkillCandidate[]; failures: BundledSkillFailure[] }> {
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (missingPath(error)) return { candidates: [], failures: [] }
    throw error
  }
  const candidates: BundledSkillCandidate[] = []
  const failures: BundledSkillFailure[] = []
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue
    const directory = join(root, entry.name)
    const path = join(directory, 'SKILL.md')
    let raw: string
    try {
      raw = await readFile(path, { encoding: 'utf8', signal })
    } catch (error) {
      if (missingPath(error)) continue
      throw error
    }
    try {
      const skill = parseBundledSkill(raw, path)
      candidates.push({
        name: skill.name,
        description: skill.description,
        invocation: skill.invocation,
        provider: PROVIDER,
        source: 'bundled',
        rank: BUNDLED_SKILL_RANK,
        path,
        resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
        locator: path,
      })
    } catch (error) {
      failures.push({ directory: entry.name, error: error instanceof Error ? error : new Error(messageOf(error)) })
    }
  }
  return { candidates, failures }
}

/** Load one previously discovered candidate from its current `SKILL.md`. */
export async function loadBundledSkill(
  candidate: BundledSkillCandidate,
  signal?: AbortSignal,
): Promise<BundledSkillDefinition | undefined> {
  const path = typeof candidate?.locator === 'string' ? candidate.locator : undefined
  if (path === undefined) return undefined
  let raw: string
  try {
    raw = await readFile(path, { encoding: 'utf8', signal })
  } catch (error) {
    if (missingPath(error)) return undefined
    throw error
  }
  const skill = parseBundledSkill(raw, path)
  return {
    name: skill.name,
    description: skill.description,
    invocation: skill.invocation,
    provider: PROVIDER,
    source: 'bundled',
    path,
    resourceBase: candidate.resourceBase,
    content: skill.content,
    ...(skill.metadata === undefined ? {} : { metadata: skill.metadata }),
  }
}

/**
 * Register the shipped skill directory on the calling scope's `ctx.skills`.
 * Returns the registration disposer, or `undefined` when the scope has no
 * skill registry (for example a lightweight test harness).
 */
export function registerBundledSkills(ctx: any, root: string = SKILLS_DIR): (() => void) | undefined {
  // Cordis throws on a property read of an un-injected service, so probe the
  // injected service through `get()` instead of a bare property access.
  let registry: any
  try {
    registry = typeof ctx?.get === 'function' ? ctx.get('skills') : undefined
  } catch {
    registry = undefined
  }
  try {
    if (registry === undefined && ctx?.skills !== undefined) registry = ctx.skills
  } catch {
    // An un-injected service stays unavailable for this scope.
  }
  if (typeof registry?.registerProvider !== 'function') return undefined
  const reported = new Set<string>()
  const report = (failure: BundledSkillFailure): void => {
    const message = `${PROVIDER}: skill "${failure.directory}" is unavailable: ${messageOf(failure.error)}`
    if (reported.has(message)) return
    reported.add(message)
    try {
      ctx.logger?.warn?.(message)
    } catch {
      // A provider must publish the rest of the catalog even if logging fails.
    }
  }
  return registry.registerProvider(() => ({
    name: PROVIDER,
    async list(options: { signal?: AbortSignal } = {}) {
      const { candidates, failures } = await discoverBundledSkills(root, options.signal)
      for (const failure of failures) report(failure)
      return candidates
    },
    get: (candidate: BundledSkillCandidate, options: { signal?: AbortSignal } = {}) => (
      loadBundledSkill(candidate, options.signal)
    ),
  }))
}
