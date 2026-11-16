import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import {
  SKILLS_DIR,
  discoverBundledSkills,
  loadBundledSkill,
  parseBundledSkill,
  registerBundledSkills,
  type BundledSkillCandidate,
} from '../src/bundled-skills.js'

async function shippedSkillNames(): Promise<Set<string>> {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true })
  return new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
}

async function fakeRoot(skills: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-bundled-skills-'))
  for (const [name, raw] of Object.entries(skills)) {
    await mkdir(join(root, name), { recursive: true })
    await writeFile(join(root, name, 'SKILL.md'), raw, 'utf8')
  }
  return root
}

describe('bundled skills', () => {
  it('parses every shipped skill and keeps the catalog complete', async () => {
    const directories = await shippedSkillNames()
    const { candidates, failures } = await discoverBundledSkills()
    expect(failures).toEqual([])
    expect(candidates).toHaveLength(directories.size)
    expect(new Set(candidates.map((candidate) => candidate.name)).size).toBe(candidates.length)
    for (const candidate of candidates) {
      expect(candidate.description.length).toBeGreaterThan(10)
      expect(candidate.provider).toBe('codex-bundled')
      expect(candidate.source).toBe('bundled')
      expect(candidate.rank).toBe(600)
      expect(candidate.path.startsWith(SKILLS_DIR)).toBe(true)
      expect(basename(candidate.path)).toBe('SKILL.md')
      expect(candidate.locator).toBe(candidate.path)
      expect(candidate.resourceBase.kind).toBe('directory')
      expect(candidate.resourceBase.path).not.toContain('\\')
      expect(dirname(candidate.path).split(sep).join('/')).toBe(candidate.resourceBase.path)
      expect(candidate.invocation).toEqual({ modelInvocable: true, userInvocable: true })
    }
  })

  it('loads the Markdown body without the frontmatter', async () => {
    const { candidates } = await discoverBundledSkills()
    const vue = candidates.find((candidate) => candidate.name === 'vue')
    expect(vue).toBeDefined()
    const skill = await loadBundledSkill(vue as BundledSkillCandidate)
    expect(skill?.content.startsWith('---')).toBe(false)
    expect(skill?.content).toContain('# Vue')
    expect(skill?.path).toBe(vue?.path)
    expect(skill?.invocation).toEqual({ modelInvocable: true, userInvocable: true })
  })

  it('keeps the declared skill name for a directory with a different name', async () => {
    const { candidates } = await discoverBundledSkills()
    const golang = candidates.find((candidate) => candidate.name === 'golang-fullstack-best-practices')
    expect(golang?.path).toContain(`${join('golang-best-practices', 'SKILL.md')}`)
  })

  it('parses invocation flags and metadata', () => {
    const parsed = parseBundledSkill([
      '---',
      'name: sample-skill',
      'description: A sample skill.',
      'disable-model-invocation: true',
      'user-invocable: no',
      'metadata:',
      '  author: someone',
      '---',
      '',
      '# Sample',
    ].join('\n'), 'sample/SKILL.md')
    expect(parsed.name).toBe('sample-skill')
    expect(parsed.description).toBe('A sample skill.')
    expect(parsed.invocation).toEqual({ modelInvocable: false, userInvocable: false })
    expect(parsed.metadata).toEqual({ author: 'someone' })
    expect(parsed.content).toBe('# Sample')
  })

  it('rejects frontmatter that cannot form a catalog entry', () => {
    expect(() => parseBundledSkill('# no frontmatter', 'a/SKILL.md')).toThrow(/no YAML frontmatter/)
    expect(() => parseBundledSkill('---\nname: BadName\ndescription: x\n---\n', 'a/SKILL.md'))
      .toThrow(/invalid kebab-case name/)
    expect(() => parseBundledSkill('---\nname: ok\n---\n', 'a/SKILL.md')).toThrow(/no description/)
    expect(() => parseBundledSkill('---\nname: ok\ndescription: x\nuser-invocable: maybe\n---\n', 'a/SKILL.md'))
      .toThrow(/must be a boolean/)
  })

  it('omits a malformed skill and reports it without failing the catalog', async () => {
    const root = await fakeRoot({
      valid: '---\nname: valid\ndescription: A valid skill.\n---\n\n# Valid\n',
      broken: '---\nname: broken\n---\n',
    })
    try {
      const { candidates, failures } = await discoverBundledSkills(root)
      expect(candidates.map((candidate) => candidate.name)).toEqual(['valid'])
      expect(failures).toHaveLength(1)
      expect(failures[0].directory).toBe('broken')
      expect(failures[0].error.message).toMatch(/no description/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('treats a missing bundled directory as an empty catalog', async () => {
    const { candidates, failures } = await discoverBundledSkills(join(tmpdir(), 'dsh-no-such-skills-dir'))
    expect(candidates).toEqual([])
    expect(failures).toEqual([])
  })

  it('registers a provider on ctx.skills and degrades without a registry', async () => {
    let factory: any
    const registrations: any[] = []
    const ctx = {
      skills: {
        registerProvider(create: any) {
          factory = create
          return () => registrations.push('disposed')
        },
      },
    }
    const dispose = registerBundledSkills(ctx as any)
    expect(typeof dispose).toBe('function')
    const provider = factory({ signal: new AbortController().signal, invalidate: () => {} })
    expect(provider.name).toBe('codex-bundled')
    const candidates = await provider.list({})
    expect(candidates.length).toBeGreaterThan(10)
    const loaded = await provider.get(candidates[0])
    expect(loaded.content.length).toBeGreaterThan(0)
    dispose?.()
    expect(registrations).toEqual(['disposed'])

    expect(registerBundledSkills({ get: () => undefined })).toBeUndefined()
    expect(registerBundledSkills({})).toBeUndefined()
  })
})
