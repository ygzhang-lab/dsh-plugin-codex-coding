/**
 * The operating system's preferred languages, read once per Host process.
 *
 * DSH desktop launches the Host with the user's login-shell environment, so on
 * macOS `LANG` is frequently `C.UTF-8` or unset while the window itself runs in
 * the system language. Node's `Intl` default follows those variables instead of
 * the OS, so the system list (`AppleLanguages`) is the only host-reachable
 * signal for what the interface language actually is. Windows and Linux report
 * the system language through `Intl` already, so they need no probe.
 *
 * This module is Host-only: `src/language.ts` stays free of Node builtins
 * because the browser bundle imports it through `config.ts`.
 */
import { execFileSync } from 'node:child_process'

/** Probe timeout: a hung `defaults` must not stall prompt assembly. */
const PROBE_TIMEOUT_MS = 1000

let cached: readonly string[] | undefined

/**
 * Parse `defaults read -g AppleLanguages`, a NeXTSTEP property-list array of
 * quoted BCP 47 tags such as `("zh-Hans-CN", "en-US")`.
 */
export function parseAppleLanguages(output: string): readonly string[] {
  const languages: string[] = []
  for (const match of output.matchAll(/"([^"]+)"|^\s*([A-Za-z][A-Za-z0-9-]*)\s*,?\s*$/gmu)) {
    const value = (match[1] ?? match[2] ?? '').trim()
    if (value !== '') languages.push(value)
  }
  return languages
}

function readAppleLanguages(): readonly string[] {
  try {
    const output = execFileSync('/usr/bin/defaults', ['read', '-g', 'AppleLanguages'], {
      encoding: 'utf8',
      timeout: PROBE_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    return parseAppleLanguages(output)
  } catch {
    // A denied or missing `defaults` only means "no OS signal"; the caller
    // falls back to the POSIX variables and `Intl`.
    return []
  }
}

/**
 * OS interface languages in preference order. Empty on platforms whose Node
 * runtime already follows the system locale.
 */
export function systemLanguages(): readonly string[] {
  if (cached === undefined) {
    cached = process.platform === 'darwin' ? readAppleLanguages() : []
  }
  return cached
}
