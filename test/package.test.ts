import { describe, expect, it } from 'vitest'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { PLUGIN_CATALOG } from '../src/config.js'

const root = dirname(fileURLToPath(new URL('.', import.meta.url)))

async function text(path: string): Promise<string> {
  return readFile(join(root, path), 'utf8')
}

describe('published bundle', () => {
  it('declares the bundle patch and every runtime export', async () => {
    const manifest = JSON.parse(await text('package.json'))
    expect(manifest.name).toBe('dsh-plugin-coding')
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

  it('composes the Coding preset and its custom plugin', async () => {
    const patch = await text('cordis.patch.yml')
    expect(patch).not.toContain('{{cwd}}')
    const rows = parse(patch, { logLevel: 'silent' })
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].insert).toHaveLength(2)

    const host = rows[0].insert[0]
    expect(host).toMatchObject({
      id: 'dsh-plugin-coding',
      name: 'dsh-plugin-coding',
      config: { reasoning: 'auto', localSkills: true, disabledPlugins: [] },
    })

    const preset = rows[0].insert[1]
    expect(preset.id).toBe('preset-coding')
    expect(preset.config.id).toBe('coding')
    expect(preset.config.name).toBe('Coding 模式')
    expect(preset.config.description).toContain('DSH Codex 风格 Coding 插件')
    expect(preset.config.description).toContain('A Codex-style coding agent for DSH')
    expect(preset.config.plugins.some((row: any) => row.name === 'dsh-plugin-coding/preset')).toBe(true)
    expect(preset.config.plugins.some((row: any) => row.name === '@deepseek-ai/dsh-skill')).toBe(false)
  })

  it('keeps the settings catalog aligned with the mounted plugin rows', async () => {
    const patch = await text('cordis.patch.yml')
    for (const plugin of PLUGIN_CATALOG) {
      expect(patch).toContain(`name: '${plugin.module}'`)
    }
  })

  it('ships valid display metadata and an icon', async () => {
    for (const locale of ['en', 'zh']) {
      const value = JSON.parse(await text(`locale/${locale}.json`))
      expect(value.meta.title).toBe('DSH Coding')
      expect(value.meta.description).toContain('Codex')
      expect(value.meta.description).toContain('Coding')
      expect(value.meta.description.length).toBeGreaterThan(10)
    }
    const icon = await text('icon.svg')
    expect(icon).toContain('<svg')
    expect((await stat(join(root, 'icon.svg'))).size).toBeGreaterThan(100)
  })
})
