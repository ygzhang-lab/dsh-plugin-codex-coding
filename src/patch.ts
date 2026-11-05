/**
 * Parser and line-oriented applicator for the Codex `apply_patch` language.
 *
 * The format is a small, strict contract on purpose: it keeps edits reviewable,
 * lets one call update several files, and gives a precise mismatch report when
 * the model's context is stale.
 */

export type PatchLineKind = 'context' | 'add' | 'delete'

export interface PatchLine {
  kind: PatchLineKind
  text: string
}

export interface PatchHunk {
  /** Optional @@ context label from the patch header. */
  context?: string
  lines: PatchLine[]
  /** Anchor this hunk to the end of the file instead of searching from the cursor. */
  endOfFile: boolean
}

export type PatchFile =
  | { kind: 'add'; path: string; content: string }
  | { kind: 'delete'; path: string }
  | { kind: 'update'; path: string; moveTo?: string; hunks: PatchHunk[] }

export const APPLY_PATCH_DESCRIPTION = [
  'Edit files with the Codex patch format: "*** Begin Patch", one or more',
  '"*** Add File:", "*** Delete File:", or "*** Update File:" sections, then "*** End Patch".',
  'In hunk lines the first character is the operation marker: space (context), + (add), or - (delete);',
  'use @@ to separate hunks and "*** End of File" to anchor a hunk at EOF.',
  'Repeat a source-leading marker after the operation marker when the source line itself starts with one.',
  'Read a file before updating it. Prefer this tool for multi-file or multi-hunk changes.',
  'Example: "*** Begin Patch\\n*** Update File: src/a.ts\\n@@\\n-old\\n+new\\n*** End Patch".',
].join(' ')

function invalid(message: string): never {
  throw new Error(`apply_patch: ${message}`)
}

function isFileHeader(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('*** Add File: ')
    || trimmed.startsWith('*** Delete File: ')
    || trimmed.startsWith('*** Update File: ')
}

function unwrapHeredoc(input: string): string {
  const normalized = input.replaceAll('\r\n', '\n').trim()
  const lines = normalized.split('\n')
  const first = lines[0]?.trim()
  const last = lines.at(-1)?.trim()
  if (
    lines.length >= 4
    && (first === '<<EOF' || first === "<<'EOF'" || first === '<<"EOF"')
    && last === 'EOF'
  ) {
    return lines.slice(1, -1).join('\n').trim()
  }
  return normalized
}

function pathFrom(line: string, prefix: string): string {
  const path = line.slice(prefix.length).trim()
  if (path.length === 0) invalid(`${prefix.trim()} requires a file path`)
  return path
}

function isChangeMarker(line: string): boolean {
  const marker = line.trimEnd()
  return marker === '@@' || marker.startsWith('@@ ')
}

function isPotentialChangeMarker(line: string): boolean {
  return line.trimEnd().startsWith('@@')
}

/** Parse one complete Codex patch after normalizing CRLF input to LF. */
export function parsePatch(input: string): PatchFile[] {
  const lines = unwrapHeredoc(input).split('\n')
  if (lines[0]?.trim() !== '*** Begin Patch') {
    invalid('input must start with "*** Begin Patch"')
  }
  if (lines.at(-1)?.trim() !== '*** End Patch') {
    invalid('input must end with "*** End Patch"')
  }

  const files: PatchFile[] = []
  let index = 1
  const end = lines.length - 1

  if (lines[index]?.trim().startsWith('*** Environment ID:') === true) {
    invalid('environment selection is unavailable in this single-environment DSH plugin')
  }

  while (index < end) {
    const header = lines[index++]?.trim()
    if (header === undefined) invalid('unexpected end of input')

    if (header.startsWith('*** Add File: ')) {
      const path = pathFrom(header, '*** Add File: ')
      const content: string[] = []
      while (index < end && lines[index]?.startsWith('+') === true) {
        content.push(lines[index].slice(1))
        index += 1
      }
      if (content.length === 0) invalid(`add file ${JSON.stringify(path)} needs at least one content line`)
      files.push({ kind: 'add', path, content: `${content.join('\n')}\n` })
      continue
    }

    if (header.startsWith('*** Delete File: ')) {
      files.push({ kind: 'delete', path: pathFrom(header, '*** Delete File: ') })
      continue
    }

    if (!header.startsWith('*** Update File: ')) {
      invalid(`unexpected directive ${JSON.stringify(header)}`)
    }

    const path = pathFrom(header, '*** Update File: ')
    let moveTo: string | undefined
    if (lines[index]?.trim().startsWith('*** Move to: ') === true) {
      moveTo = pathFrom(lines[index].trim(), '*** Move to: ')
      index += 1
    }

    const hunks: PatchHunk[] = []
    while (index < end && !isFileHeader(lines[index])) {
      let context: string | undefined
      if (isPotentialChangeMarker(lines[index])) {
        const marker = lines[index].trimEnd()
        if (!isChangeMarker(marker)) {
          invalid(`invalid update hunk marker ${JSON.stringify(lines[index])}`)
        }
        index += 1
        context = marker.length === 2 ? undefined : marker.slice(3)
      }

      const patchLines: PatchLine[] = []
      while (
        index < end
        && !isFileHeader(lines[index])
        && !isPotentialChangeMarker(lines[index])
        && lines[index].trimEnd() !== '*** End of File'
      ) {
        const line = lines[index]
        index += 1
        if (line.length === 0) {
          invalid('update lines need a leading space, +, or - marker')
        }
        const marker = line[0]
        if (marker !== ' ' && marker !== '+' && marker !== '-') {
          invalid(`unexpected update line ${JSON.stringify(line)}`)
        }
        patchLines.push({
          kind: marker === ' ' ? 'context' : marker === '+' ? 'add' : 'delete',
          text: line.slice(1),
        })
      }

      const endOfFile = lines[index]?.trimEnd() === '*** End of File'
      if (endOfFile) index += 1
      if (patchLines.length === 0) {
        if (context !== undefined || endOfFile) invalid('an update hunk needs context or changed lines')
        break
      }
      hunks.push({
        ...(context === undefined ? {} : { context }),
        lines: patchLines,
        endOfFile,
      })
    }

    if (hunks.length === 0 && moveTo === undefined) {
      invalid(`update file ${JSON.stringify(path)} has no changes`)
    }
    files.push({
      kind: 'update',
      path,
      ...(moveTo === undefined ? {} : { moveTo }),
      hunks,
    })
  }

  if (files.length === 0) invalid('no files were modified')
  return files
}

function splitText(text: string): { lines: string[]; trailingNewline: boolean } {
  if (text.length === 0) return { lines: [], trailingNewline: false }
  const trailingNewline = text.endsWith('\n')
  const lines = text.split('\n')
  if (trailingNewline) lines.pop()
  return { lines, trailingNewline }
}

function joinText(value: { lines: string[]; trailingNewline: boolean }): string {
  const body = value.lines.join('\n')
  return value.trailingNewline ? `${body}\n` : body
}

function findSequence(
  lines: readonly string[],
  expected: readonly string[],
  from: number,
  endOfFile: boolean,
): number {
  if (expected.length === 0) return Math.min(from, lines.length)
  if (expected.length > lines.length) return -1
  const first = endOfFile ? Math.max(from, lines.length - expected.length) : from
  const last = lines.length - expected.length
  const matchers = [
    (actual: string, wanted: string) => actual === wanted,
    (actual: string, wanted: string) => actual.trimEnd() === wanted.trimEnd(),
    (actual: string, wanted: string) => actual.trim() === wanted.trim(),
  ]
  for (const matchesLine of matchers) {
    for (let index = first; index <= last; index += 1) {
      let matches = true
      for (let offset = 0; offset < expected.length; offset += 1) {
        if (!matchesLine(lines[index + offset], expected[offset])) {
          matches = false
          break
        }
      }
      if (matches) return index
    }
  }
  return -1
}

function displayPatchLine(line: string): string {
  if (line.length === 0) return '<empty>'
  return line.replaceAll(' ', '[space]').replaceAll('\t', '[tab]')
}

function formatPatchExcerpt(lines: readonly string[], start: number, count: number): string {
  if (lines.length === 0) return '  <empty file>'
  const first = Math.max(0, Math.min(start, lines.length - 1))
  return lines
    .slice(first, first + count)
    .map((line, offset) => `  ${first + offset + 1}: ${displayPatchLine(line)}`)
    .join('\n')
}

function mismatchMessage(
  label: string,
  hunkIndex: number,
  expected: readonly string[],
  actual: readonly string[],
  from: number,
  endOfFile: boolean,
): string {
  const expectedPreview = expected
    .slice(0, 12)
    .map((line, index) => `  ${index + 1}: ${displayPatchLine(line)}`)
    .join('\n')
  const expectedSuffix = expected.length > 12 ? '\n  ...' : ''
  const excerptStart = endOfFile ? Math.max(0, actual.length - 6) : Math.max(0, from - 2)
  const markerHint = expected.some((wanted) => wanted.length > 0 && actual.includes(`-${wanted}`))
    ? '\nHint: if a source line starts with a patch marker, repeat that marker after the operation marker; for example, `-- item` deletes the source line `- item`.'
    : ''
  return `could not find expected lines in ${label} hunk ${hunkIndex + 1} (search starts at line ${from + 1})\nExpected:\n${expectedPreview}${expectedSuffix}\nFile excerpt:\n${formatPatchExcerpt(actual, excerptStart, 10)}${markerHint}`
}

/** Apply parsed update hunks and return LF-normalized text. */
export function applyHunks(
  original: string,
  hunks: readonly PatchHunk[],
  label = 'file',
): string {
  const value = splitText(original.replaceAll('\r\n', '\n'))
  let cursor = 0

  for (const [hunkIndex, hunk] of hunks.entries()) {
    const expected = hunk.lines.filter((line) => line.kind !== 'add').map((line) => line.text)
    const start = findSequence(value.lines, expected, cursor, hunk.endOfFile)
    if (start < 0) {
      invalid(mismatchMessage(label, hunkIndex, expected, value.lines, cursor, hunk.endOfFile))
    }
    const replacement = hunk.lines.filter((line) => line.kind !== 'delete').map((line) => line.text)
    value.lines.splice(start, expected.length, ...replacement)
    cursor = start + replacement.length
    value.trailingNewline = !hunk.endOfFile
  }

  return joinText(value)
}
