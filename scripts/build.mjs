import { build } from 'esbuild'
import { execFile } from 'node:child_process'
import { rm, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const lib = join(root, 'lib')

await rm(lib, { recursive: true, force: true })
await mkdir(lib, { recursive: true })

await build({
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['@deepseek-ai/*'],
  sourcemap: false,
  logLevel: 'info',
  entryPoints: {
    index: join(root, 'src', 'index.ts'),
    preset: join(root, 'src', 'preset.ts'),
  },
  outdir: lib,
})

const clientResult = await build({
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'cjs',
  entryPoints: [join(root, 'src', 'client', 'index.ts')],
  write: false,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
  sourcemap: false,
  logLevel: 'info',
})
const clientCode = clientResult.outputFiles[0].text
const wrapped = `window.__ModuleLoader__.load({
  id: "dsh-plugin-coding",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${clientCode}
    return module.exports;
  },
});
`
await writeFile(join(lib, 'client.js'), wrapped)

const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
await execFileAsync(process.execPath, [tsc, '-p', join(root, 'tsconfig.build.json')], { cwd: root })
