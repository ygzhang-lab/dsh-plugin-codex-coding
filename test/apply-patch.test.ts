import { describe, expect, it } from 'vitest'
import { apply } from '../src/preset.js'
import { applyPatchInput, renderPatchResult, type PatchResult } from '../src/apply-patch.js'

class MemoryFs {
  readonly files = new Map<string, string>()
  readonly versions = new Map<string, number>()
  sandboxMode?: string
  lastPolicy: unknown

  async resolve(path: string) {
    return { targetKey: path, displayPath: path }
  }

  private info(path: string) {
    const content = this.files.get(path)
    if (content === undefined) return undefined
    return { version: String(this.versions.get(path) ?? 1), type: 'file' as const }
  }

  async stat(target: { targetKey: string }) {
    return this.info(target.targetKey)
  }

  async readText(target: { targetKey: string }) {
    const content = this.files.get(target.targetKey)
    if (content === undefined) throw new Error('missing file')
    return content
  }

  async writeText(
    target: { targetKey: string },
    content: string,
    intent?: { kind: 'createIfAbsent' } | { kind: 'replaceIfVersion'; version: string },
    _signal?: AbortSignal,
    policy?: unknown,
  ) {
    this.lastPolicy = policy
    const current = this.info(target.targetKey)
    if (intent?.kind === 'createIfAbsent' && current !== undefined) throw new Error('already exists')
    if (intent?.kind === 'replaceIfVersion' && (current === undefined || current.version !== intent.version)) {
      throw new Error('stale version')
    }
    this.files.set(target.targetKey, content)
    const next = (this.versions.get(target.targetKey) ?? 0) + 1
    this.versions.set(target.targetKey, next)
    return { operation: current === undefined ? 'create' as const : 'update' as const, version: String(next) }
  }

  async remove(target: { targetKey: string }, expected?: { version: string }) {
    const current = this.info(target.targetKey)
    if (current === undefined) throw new Error('missing file')
    if (expected !== undefined && current.version !== expected.version) throw new Error('stale version')
    this.files.delete(target.targetKey)
  }
}

function harness(fs: MemoryFs = new MemoryFs(), options: { disabledPlugins?: string[] } = {}) {
  const tools: any[] = []
  const sections: any[] = []
  const events: any[] = []
  const ctx: any = {
    get(name: string) {
      if (name === 'dshCoding') {
        return {
          options: {
            reasoning: 'auto',
            localSkills: true,
            disabledPlugins: options.disabledPlugins ?? [],
          },
        }
      }
      if (name === 'fs') return fs
      if (name === 'systemPrompt') return { section: (section: any) => sections.push(section) }
      if (name === 'workingDirectory') return { ensure: async () => '/repo' }
      if (name === 'sandboxPolicy') {
        return { resolve: () => ({ mode: 'workspace-write', workspaceRoot: '/repo' }) }
      }
      return undefined
    },
    inject: (_names: string[], callback: Function) => callback(ctx),
    tools: { register: (tool: any) => tools.push(tool) },
    emit: (...args: any[]) => events.push(args),
    waterfall: async (_event: string, _target: any, _exec: any, fallback: Function) => fallback(),
    on: () => {},
    logger: { warn: () => {} },
  }
  apply(ctx)
  const patch = tools.find((tool) => tool.name === 'apply_patch')
  if (patch === undefined) throw new Error('apply_patch was not registered')
  return { tools, sections, events, fs, patch }
}

function exec() {
  return {
    signal: new AbortController().signal,
    agent: { session: { header: { cwd: '/repo' } } },
  }
}

describe('Coding preset integration', () => {
  it('registers the operating contract and apply_patch', () => {
    const { sections, tools } = harness()
    const contract = sections.find((section) => section.name === 'coding:contract')
    expect(contract?.text).toContain('Verify before claiming success')
    expect(contract?.text).toContain('apply_patch')
    expect(tools.map((tool) => tool.name)).toEqual([
      'coding_context',
      'coding_reasoning',
      'coding_mode',
      'apply_patch',
    ])
  })
})

describe('apply_patch tool', () => {
  it('creates a file and renders the A/M/D summary', async () => {
    const { patch, fs, events } = harness()
    const result = await patch.execute({
      input: '*** Begin Patch\n*** Add File: src/a.ts\n+export const value = 1\n*** End Patch',
    }, exec())

    expect(result).toEqual({ files: [{ path: 'src/a.ts', operation: 'created' }] })
    expect(fs.files.get('src/a.ts')).toBe('export const value = 1\n')
    expect(patch.output.render({}, result)).toEqual([{
      type: 'text',
      text: 'Success. Updated the following files:\nA src/a.ts\n',
    }])
    expect(events.some((event: any[]) => event[0] === 'fs/observed')).toBe(true)
  })

  it('updates multiple files with version-guarded writes', async () => {
    const { patch, fs } = harness()
    fs.files.set('a.txt', 'one\ntwo\n')
    fs.files.set('b.txt', 'alpha\n')
    fs.versions.set('a.txt', 1)
    fs.versions.set('b.txt', 1)

    const result = await patch.execute({
      input: [
        '*** Begin Patch',
        '*** Update File: a.txt',
        '@@',
        '-two',
        '+three',
        '*** Update File: b.txt',
        '@@',
        '-alpha',
        '+beta',
        '*** End Patch',
      ].join('\n'),
    }, exec())

    expect(result).toEqual({
      files: [
        { path: 'a.txt', operation: 'updated' },
        { path: 'b.txt', operation: 'updated' },
      ],
    })
    expect(fs.files.get('a.txt')).toBe('one\nthree\n')
    expect(fs.files.get('b.txt')).toBe('beta\n')
  })

  it('moves a file and removes the source', async () => {
    const { patch, fs } = harness()
    fs.files.set('old.ts', 'const value = 1\n')
    fs.versions.set('old.ts', 1)

    const result = await patch.execute({
      input: [
        '*** Begin Patch',
        '*** Update File: old.ts',
        '*** Move to: new.ts',
        '@@',
        '-const value = 1',
        '+const value = 2',
        '*** End Patch',
      ].join('\n'),
    }, exec())

    expect(result).toEqual({ files: [{ path: 'old.ts', operation: 'moved', moveTo: 'new.ts' }] })
    expect(fs.files.has('old.ts')).toBe(false)
    expect(fs.files.get('new.ts')).toBe('const value = 2\n')
  })

  it('deletes a file when the backend supports removal', async () => {
    const { patch, fs } = harness()
    fs.files.set('gone.txt', 'bye\n')
    fs.versions.set('gone.txt', 1)

    const result = await patch.execute({
      input: '*** Begin Patch\n*** Delete File: gone.txt\n*** End Patch',
    }, exec())

    expect(result).toEqual({ files: [{ path: 'gone.txt', operation: 'deleted' }] })
    expect(fs.files.has('gone.txt')).toBe(false)
  })

  it('rejects deletion when the backend cannot remove files', async () => {
    const fs = new MemoryFs()
    ;(fs as any).remove = undefined
    fs.files.set('gone.txt', 'bye\n')
    fs.versions.set('gone.txt', 1)
    const { patch } = harness(fs)

    await expect(patch.execute({
      input: '*** Begin Patch\n*** Delete File: gone.txt\n*** End Patch',
    }, exec())).rejects.toThrow('deleting files is not supported')
    expect(fs.files.has('gone.txt')).toBe(true)
  })

  it('computes every hunk before writing so a bad patch changes nothing', async () => {
    const { patch, fs } = harness()
    fs.files.set('good.txt', 'alpha\n')
    fs.files.set('bad.txt', 'beta\n')
    fs.versions.set('good.txt', 1)
    fs.versions.set('bad.txt', 1)

    await expect(patch.execute({
      input: [
        '*** Begin Patch',
        '*** Update File: good.txt',
        '@@',
        '-alpha',
        '+gamma',
        '*** Update File: bad.txt',
        '@@',
        '-missing',
        '+delta',
        '*** End Patch',
      ].join('\n'),
    }, exec())).rejects.toThrow('could not find expected lines')

    expect(fs.files.get('good.txt')).toBe('alpha\n')
    expect(fs.files.get('bad.txt')).toBe('beta\n')
  })

  it('refuses to overwrite an existing file on add', async () => {
    const { patch, fs } = harness()
    fs.files.set('a.txt', 'old\n')
    fs.versions.set('a.txt', 1)

    await expect(patch.execute({
      input: '*** Begin Patch\n*** Add File: a.txt\n+new\n*** End Patch',
    }, exec())).rejects.toThrow('file already exists')
    expect(fs.files.get('a.txt')).toBe('old\n')
  })

  it('honors the filesystem plugin switch inside the tool', async () => {
    const { patch, fs } = harness(new MemoryFs(), {
      disabledPlugins: ['@deepseek-ai/dsh-tool-fs'],
    })
    await expect(patch.execute({
      input: '*** Begin Patch\n*** Add File: blocked.txt\n+no\n*** End Patch',
    }, exec())).rejects.toThrow('disabled by Coding settings')
    expect(fs.files.size).toBe(0)
  })

  it('passes the resolved sandbox policy to every write', async () => {
    const { patch, fs } = harness()
    await patch.execute({
      input: '*** Begin Patch\n*** Add File: a.txt\n+new\n*** End Patch',
    }, exec())
    expect(fs.lastPolicy).toEqual({ mode: 'workspace-write', workspaceRoot: '/repo' })
  })
})

describe('applyPatchInput scope fallback', () => {
  it('uses the agent-scope filesystem when the preset scope cannot see it', async () => {
    const fs = new MemoryFs()
    const ctx = {
      get: () => undefined,
      emit: () => {},
      waterfall: async (_event: string, _target: any, _exec: any, fallback: Function) => fallback(),
    }
    const exec = {
      signal: new AbortController().signal,
      agent: {
        ctx: {
          get: (name: string) => name === 'fs' ? fs : undefined,
        },
        session: { header: { cwd: '/repo' } },
      },
    }

    const result = await applyPatchInput(
      ctx,
      '*** Begin Patch\n*** Add File: scoped.txt\n+ok\n*** End Patch',
      exec,
    )

    expect(result).toEqual({ files: [{ path: 'scoped.txt', operation: 'created' }] })
    expect(fs.files.get('scoped.txt')).toBe('ok\n')
  })
})

describe('renderPatchResult', () => {
  it('renders created, updated, moved, and deleted files', () => {
    const value: PatchResult = {
      files: [
        { path: 'a.ts', operation: 'created' },
        { path: 'b.ts', operation: 'updated' },
        { path: 'c.ts', operation: 'moved', moveTo: 'd.ts' },
        { path: 'e.ts', operation: 'deleted' },
      ],
    }
    expect(renderPatchResult(value)).toBe([
      'Success. Updated the following files:',
      'A a.ts',
      'M b.ts',
      'M c.ts -> d.ts',
      'D e.ts',
      '',
    ].join('\n'))
  })
})
