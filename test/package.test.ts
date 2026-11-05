import { describe, expect, it } from 'vitest'
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { PLUGIN_CATALOG } from '../src/config.js'
import { CODING_PRESET_ID } from '../src/workflow.js'

const root = dirname(fileURLToPath(new URL('.', import.meta.url)))

async function text(path: string): Promise<string> {
  return readFile(join(root, path), 'utf8')
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else files.push(path)
  }
  return files
}

describe('published bundle', () => {
  it('declares the bundle patch and every runtime export', async () => {
    const manifest = JSON.parse(await text('package.json'))
    expect(manifest.name).toBe('dsh-plugin-codex-coding')
    expect(manifest.private).not.toBe(true)
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.exports['./preset']).toBeDefined()
    expect(manifest.exports['./client']).toBeDefined()
    expect(manifest.files).toContain('cordis.patch.yml')
    expect(manifest.files).toContain('lib')
    expect(manifest.files).toContain('locale')
    expect(manifest.files).toContain('icon.svg')
  })

  it('declares host packages as peers and keeps the dsh range explicit', async () => {
    const manifest = JSON.parse(await text('package.json'))
    const host = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-tools']
    for (const name of host) {
      expect(manifest.dependencies?.[name]).toBeUndefined()
      expect(typeof manifest.peerDependencies?.[name]).toBe('string')
    }
    // schemastery (Config schema) and zod (session projection) are the only
    // packages the plugin installs for itself.
    expect(Object.keys(manifest.dependencies)).toEqual(['@deepseek-ai/schemastery', 'zod'])
    expect(manifest.engines.dsh).toBe('>=0.2.1-rc.5 <0.3.0')
    expect(manifest.engines.node).toBe('>=24.9.0')

    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ])
    const imported = new Set<string>()
    for (const file of await sourceFiles(join(root, 'src'))) {
      if (!file.endsWith('.ts')) continue
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(/(?:from\s+|import\()['"](@deepseek-ai\/[^'"]+)['"]/g)) {
        imported.add(match[1])
      }
    }
    expect([...imported].sort()).toEqual([...host, '@deepseek-ai/schemastery'].sort())
    for (const name of imported) expect(declared.has(name)).toBe(true)
  })

  it('composes the Coding preset and its custom plugin', async () => {
    const patch = await text('cordis.patch.yml')
    expect(patch).not.toContain('{{cwd}}')
    const rows = parse(patch, { logLevel: 'silent' })
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].insert).toHaveLength(2)

    const host = rows[0].insert[0]
    expect(host).toMatchObject({
      id: 'dsh-plugin-codex-coding',
      name: 'dsh-plugin-codex-coding',
      config: { reasoning: 'auto', localSkills: true, language: 'auto', disabledPlugins: [] },
    })

    const preset = rows[0].insert[1]
    expect(preset.id).toBe('preset-codex-coding')
    // The conversation card only shows in sessions whose header names this
    // preset id, so the shipped row and the compiled constant must agree.
    expect(preset.config.id).toBe(CODING_PRESET_ID)
    expect(preset.config.name).toBe('Codex Coding')
    expect(preset.config.description).toContain('DSH Codex 风格 Coding 插件')
    expect(preset.config.description).toContain('A Codex-style coding agent for DSH')
    expect(preset.config.plugins.some((row: any) => row.name === 'dsh-plugin-codex-coding/preset')).toBe(true)
    expect(preset.config.plugins.some((row: any) => row.name === '@deepseek-ai/dsh-skill')).toBe(false)
  })

  it('keeps the settings catalog aligned with the mounted plugin rows', async () => {
    const patch = await text('cordis.patch.yml')
    for (const plugin of PLUGIN_CATALOG) {
      // Quote style is formatting, not contract; accept both single and double.
      expect(patch).toMatch(new RegExp(`name: ['"]${plugin.module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`))
    }
  })

  it('ships valid display metadata and an icon', async () => {
    for (const locale of ['en', 'zh']) {
      const value = JSON.parse(await text(`locale/${locale}.json`))
      expect(value.meta.title).toBe('DSH Codex Coding')
      expect(value.meta.description).toContain('Codex')
      expect(value.meta.description).toContain('Coding')
      expect(value.meta.description.length).toBeGreaterThan(10)
    }
    const icon = await text('icon.svg')
    expect(icon).toContain('<svg')
    expect((await stat(join(root, 'icon.svg'))).size).toBeGreaterThan(100)
  })
})
