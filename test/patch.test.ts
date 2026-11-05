import { describe, expect, it } from 'vitest'
import { applyHunks, parsePatch } from '../src/patch.js'

describe('parsePatch', () => {
  it('parses add, delete, update, and move directives', () => {
    const files = parsePatch(`*** Begin Patch
*** Add File: src/new.ts
+export const value = 1
*** Delete File: src/old.ts
*** Update File: src/app.ts
*** Move to: src/main.ts
@@ function run()
-  return old
+  return next
*** End Patch`)

    expect(files).toHaveLength(3)
    expect(files[0]).toEqual({
      kind: 'add',
      path: 'src/new.ts',
      content: 'export const value = 1\n',
    })
    expect(files[1]).toEqual({ kind: 'delete', path: 'src/old.ts' })
    expect(files[2]).toMatchObject({
      kind: 'update',
      path: 'src/app.ts',
      moveTo: 'src/main.ts',
      hunks: [{
        context: 'function run()',
        endOfFile: false,
        lines: [
          { kind: 'delete', text: '  return old' },
          { kind: 'add', text: '  return next' },
        ],
      }],
    })
  })

  it('accepts a heredoc wrapper, CRLF input, and an EOF anchor', () => {
    const files = parsePatch([
      '<<EOF',
      '*** Begin Patch',
      '*** Update File: a.txt',
      '@@',
      '-old',
      '+new',
      '*** End of File',
      '*** End Patch',
      'EOF',
    ].join('\r\n'))

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      kind: 'update',
      path: 'a.txt',
      hunks: [{ endOfFile: true }],
    })
  })

  it('requires the begin and end markers', () => {
    expect(() => parsePatch('*** Update File: a.txt\n-old\n+new')).toThrow('must start with')
    expect(() => parsePatch('*** Begin Patch\n*** Update File: a.txt\n-old\n+new')).toThrow('must end with')
  })

  it('rejects empty adds, empty updates, and unknown directives', () => {
    expect(() => parsePatch('*** Begin Patch\n*** Add File: a.txt\n*** End Patch'))
      .toThrow('needs at least one content line')
    expect(() => parsePatch('*** Begin Patch\n*** Update File: a.txt\n*** End Patch'))
      .toThrow('has no changes')
    expect(() => parsePatch('*** Begin Patch\n*** Copy File: a.txt\n*** End Patch'))
      .toThrow('unexpected directive')
  })

  it('rejects an environment selector', () => {
    expect(() => parsePatch('*** Begin Patch\n*** Environment ID: x\n*** End Patch'))
      .toThrow('environment selection is unavailable')
  })
})

describe('applyHunks', () => {
  it('applies context, additions, and deletions in order', () => {
    const original = [
      'export function add(a, b) {',
      '  const value = a + b',
      '  return value',
      '}',
      '',
    ].join('\n')
    const files = parsePatch(`*** Begin Patch
*** Update File: math.ts
@@ export function add(a, b) {
   const value = a + b
-  return value
+  const checked = Number.isFinite(value) ? value : 0
+  return checked
 }
*** End Patch`)
    const file = files[0]
    if (file.kind !== 'update') throw new Error('expected an update')
    expect(applyHunks(original, file.hunks, file.path)).toBe([
      'export function add(a, b) {',
      '  const value = a + b',
      '  const checked = Number.isFinite(value) ? value : 0',
      '  return checked',
      '}',
      '',
    ].join('\n'))
  })

  it('falls back to trimEnd and trim when indentation differs', () => {
    const original = '  const value = 1\n'
    const file = parsePatch('*** Begin Patch\n*** Update File: a.ts\n-const value = 1\n+  const value = 2\n*** End Patch')[0]
    if (file.kind !== 'update') throw new Error('expected an update')
    expect(applyHunks(original, file.hunks, file.path)).toBe('  const value = 2\n')
  })

  it('inserts at the cursor when a hunk has only additions', () => {
    const original = 'one\nthree\n'
    const file = parsePatch('*** Begin Patch\n*** Update File: a.txt\n@@\n+two\n*** End Patch')[0]
    if (file.kind !== 'update') throw new Error('expected an update')
    expect(applyHunks(original, file.hunks, file.path)).toBe('two\none\nthree\n')
  })

  it('anchors an end-of-file hunk at the end and drops the trailing newline', () => {
    const original = 'one\ntwo\n'
    const file = parsePatch('*** Begin Patch\n*** Update File: a.txt\n@@\n two\n+three\n*** End of File\n*** End Patch')[0]
    if (file.kind !== 'update') throw new Error('expected an update')
    expect(applyHunks(original, file.hunks, file.path)).toBe('one\ntwo\nthree')
  })

  it('reports expected lines and a file excerpt on a mismatch', () => {
    const original = 'alpha\nbeta\ngamma\n'
    const file = parsePatch('*** Begin Patch\n*** Update File: a.txt\n@@\n delta\n+epsilon\n*** End Patch')[0]
    if (file.kind !== 'update') throw new Error('expected an update')
    expect(() => applyHunks(original, file.hunks, file.path)).toThrow('could not find expected lines')
    expect(() => applyHunks(original, file.hunks, file.path)).toThrow('Expected:')
    expect(() => applyHunks(original, file.hunks, file.path)).toThrow('File excerpt:')
  })

  it('hints when a source line starts with a patch marker', () => {
    const original = '- item\nrest\n'
    const file = parsePatch('*** Begin Patch\n*** Update File: a.md\n@@\n- item\n*** End Patch')[0]
    if (file.kind !== 'update') throw new Error('expected an update')
    expect(() => applyHunks(original, file.hunks, file.path)).toThrow('repeat that marker')
  })
})
