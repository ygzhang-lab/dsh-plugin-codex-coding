import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gatherContext } from '../src/context.js'
import type { CodingOptions } from '../src/config.js'

const execFileAsync = promisify(execFile)
const options: CodingOptions = { reasoning: 'auto', localSkills: true, disabledPlugins: [] }

/** Snapshot text renders repository-relative paths with forward slashes. */
function posix(path: string): string {
  return path.split(/[\\/]/).join('/')
}

async function temporary(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), 'dsh-plugin-coding-')))
}

describe('gatherContext', () => {
  it('reports package scripts and verification commands without file contents', async () => {
    const dir = await temporary()
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({
        scripts: { typecheck: 'tsc --noEmit', test: 'vitest run', lint: 'eslint .' },
      }))
      await writeFile(join(dir, 'pnpm-lock.yaml'), '')
      const snapshot = await gatherContext(dir, options)
      expect(snapshot.packageManager).toBe('pnpm')
      expect(snapshot.packageDir).toBeNull()
      expect(snapshot.checks).toEqual(['pnpm typecheck', 'pnpm lint', 'pnpm test'])
      expect(snapshot.text).toContain('checks: pnpm typecheck; pnpm lint; pnpm test')
      expect(snapshot.text).toContain('policy: reasoning auto')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('includes a manual workflow mode in the policy line', async () => {
    const dir = await temporary()
    try {
      const auto = await gatherContext(dir, options)
      expect(auto.text).not.toContain('workflow ')

      const consult = await gatherContext(dir, options, undefined, undefined, 'brief', 'consult')
      expect(consult.text).toContain('workflow consult')
      expect(consult.policy).toContain('workflow consult')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('falls back to a build command when no narrow check exists', async () => {
    const dir = await temporary()
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { build: 'tsc' } }))
      const snapshot = await gatherContext(dir, options)
      expect(snapshot.checks).toEqual(['npm run build'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('uses the nearest package in a monorepo and the workspace lockfile', async () => {
    const dir = await temporary()
    try {
      const app = join(dir, 'packages', 'app')
      await mkdir(app, { recursive: true })
      await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'root-test' } }))
      await writeFile(join(app, 'package.json'), JSON.stringify({
        scripts: { typecheck: 'tsc -p .', test: 'vitest' },
      }))
      await writeFile(join(dir, 'pnpm-lock.yaml'), '')
      await execFileAsync('git', ['init'], { cwd: dir })
      const snapshot = await gatherContext(app, options)
      expect(snapshot.root).toBe(resolve(dir))
      expect(snapshot.packageDir).toBe(join('packages', 'app'))
      expect(snapshot.packageManager).toBe('pnpm')
      expect(snapshot.checks).toEqual(['pnpm typecheck', 'pnpm test'])
      expect(snapshot.text).toContain(`cwd: ${app}`)
      expect(snapshot.text).toContain(`repo: ${resolve(dir)}`)
      expect(snapshot.text).toContain(`package: pnpm at ${posix(join('packages', 'app'))}`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('ignores empty scripts and malformed package.json', async () => {
    const dir = await temporary()
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { test: '  ', build: '' } }))
      let snapshot = await gatherContext(dir, options)
      expect(snapshot.checks).toEqual([])

      await writeFile(join(dir, 'package.json'), '{ not json')
      snapshot = await gatherContext(dir, options)
      expect(snapshot.scripts).toEqual({})
      expect(snapshot.checks).toEqual([])
      expect(snapshot.text).toContain('none detected')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('skips an oversized package.json', async () => {
    const dir = await temporary()
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({
        scripts: { test: 'vitest' },
        padding: 'x'.repeat(600 * 1024),
      }))
      const snapshot = await gatherContext(dir, options)
      expect(snapshot.scripts).toEqual({})
      expect(snapshot.checks).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('detects each supported package manager and its command spelling', async () => {
    const cases = [
      ['yarn.lock', 'yarn', 'yarn test'],
      ['bun.lockb', 'bun', 'bun run test'],
      ['package-lock.json', 'npm', 'npm run test'],
    ] as const
    for (const [lockfile, manager, command] of cases) {
      const dir = await temporary()
      try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }))
        await writeFile(join(dir, lockfile), '')
        const snapshot = await gatherContext(dir, options)
        expect(snapshot.packageManager).toBe(manager)
        expect(snapshot.checks).toEqual([command])
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('prefers pnpm when several lockfiles exist', async () => {
    const dir = await temporary()
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }))
      await writeFile(join(dir, 'pnpm-lock.yaml'), '')
      await writeFile(join(dir, 'package-lock.json'), '')
      const snapshot = await gatherContext(dir, options)
      expect(snapshot.packageManager).toBe('pnpm')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('lists every applicable AGENTS.md from the repository root to the working directory', async () => {
    const dir = await temporary()
    try {
      const app = join(dir, 'packages', 'app')
      await mkdir(app, { recursive: true })
      await writeFile(join(dir, 'AGENTS.md'), 'root instructions')
      await writeFile(join(app, 'AGENTS.md'), 'app instructions')
      await execFileAsync('git', ['init'], { cwd: dir })
      const snapshot = await gatherContext(app, options)
      expect(snapshot.instructions).toEqual(['AGENTS.md', join('packages', 'app', 'AGENTS.md')])
      expect(snapshot.text).toContain('instructions: AGENTS.md, packages/app/AGENTS.md')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('summarizes tracked insertions and deletions', async () => {
    const dir = await temporary()
    try {
      await writeFile(join(dir, 'file.txt'), 'one\ntwo\n')
      await execFileAsync('git', ['init'], { cwd: dir })
      await execFileAsync('git', ['add', '.'], { cwd: dir })
      await execFileAsync('git', [
        '-c', 'user.email=test@example.com',
        '-c', 'user.name=Test',
        'commit', '-m', 'initial',
      ], { cwd: dir })
      await writeFile(join(dir, 'file.txt'), 'one\nthree\nfour\n')
      const snapshot = await gatherContext(dir, options)
      expect(snapshot.diff).toEqual({ files: 1, insertions: 2, deletions: 1 })
      expect(snapshot.text).toContain('diff: 1 files, +2/-1')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('counts staged changes before the first commit', async () => {
    const dir = await temporary()
    try {
      await writeFile(join(dir, 'file.txt'), 'one\n')
      await execFileAsync('git', ['init'], { cwd: dir })
      await execFileAsync('git', ['add', '.'], { cwd: dir })
      const snapshot = await gatherContext(dir, options)
      expect(snapshot.diff).toEqual({ files: 1, insertions: 1, deletions: 0 })
      expect(snapshot.text).toContain('diff: 1 files, +1/-0')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports no tracked changes when only untracked files exist', async () => {
    const dir = await temporary()
    try {
      await execFileAsync('git', ['init'], { cwd: dir })
      await writeFile(join(dir, 'new.txt'), 'hello')
      const snapshot = await gatherContext(dir, options)
      expect(snapshot.diff).toBeNull()
      expect(snapshot.text).toContain('diff: no tracked changes (untracked files present)')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('handles a directory with no package or Git repository', async () => {
    const dir = await temporary()
    try {
      const snapshot = await gatherContext(dir, options)
      expect(snapshot.root).toBe(resolve(dir))
      expect(snapshot.packageDir).toBeNull()
      expect(snapshot.packageManager).toBeNull()
      expect(snapshot.text).toContain('package: none')
      expect(snapshot.text).toContain('detached-or-no-repo')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
