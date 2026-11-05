import { build } from 'esbuild'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, rename, rm, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const lib = join(root, 'lib')
// Build into a sibling staging directory and swap it in only after every step
// succeeds. A destructive rm(lib) up front used to leave a locally linked
// plugin with no entry files whenever esbuild/tsc failed (for example when the
// build runs inside DSH's sandbox and esbuild cannot spawn its child process),
// which makes DSH's live patch reload fail and new sessions impossible.
const staging = join(root, '.lib-build')
const backup = join(root, '.lib-backup')

// The browser loader addresses client bundles by package name, so the wrapper
// id must follow a rename instead of drifting from package.json.
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const packageName = manifest.name

// Keep the build honest about the runtime the package declares. A Node older
// than engines.node would otherwise emit an install nobody can run.
const engine = String(manifest.engines?.node ?? '')
const minimum = /^>=\s*(\d+)\.(\d+)\.(\d+)/.exec(engine)
if (minimum !== null) {
  const need = minimum.slice(1).map(Number)
  const actual = process.versions.node.split('.').map(Number)
  for (let index = 0; index < need.length; index += 1) {
    if (actual[index] > need[index]) break
    if (actual[index] < need[index]) {
      throw new Error(
        `dsh-plugin-codex-coding: build requires Node ${engine}, running ${process.versions.node}`,
      )
    }
  }
}

async function main() {
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })

  await build({
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    external: ['@deepseek-ai/*', 'zod'],
    sourcemap: false,
    logLevel: 'info',
    entryPoints: {
      index: join(root, 'src', 'index.ts'),
      preset: join(root, 'src', 'preset.ts'),
    },
    outdir: staging,
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
  id: ${JSON.stringify(packageName)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${clientCode}
    return module.exports;
  },
});
`
  await writeFile(join(staging, 'client.js'), wrapped)

  const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  await execFileAsync(
    process.execPath,
    [tsc, '-p', join(root, 'tsconfig.build.json'), '--outDir', join(staging, 'types')],
    { cwd: root },
  )

  // Swap only after both esbuild and tsc succeeded, so a failed build keeps the
  // previously installed plugin usable.
  await rm(backup, { recursive: true, force: true })
  const hadLib = existsSync(lib)
  if (hadLib) await rename(lib, backup)
  try {
    await rename(staging, lib)
  } catch (error) {
    if (hadLib) await rename(backup, lib)
    throw error
  }
  await rm(backup, { recursive: true, force: true })
}

try {
  await main()
} finally {
  await rm(staging, { recursive: true, force: true })
}
