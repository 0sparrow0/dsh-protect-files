/**
 * Deterministic regression probe for dsh-protect-files, runnable without a
 * Harness process:
 *
 *   ELECTRON_RUN_AS_NODE=1 <dsh node> test/guard.probe.mjs
 *
 * It builds the plugin's real Config, applies it to a stub context, then drives
 * the registered guard and the post-execute filters with realistic tool calls.
 * Exit code 0 means every expectation held.
 */
import { Config, apply } from '../index.js'

const registered = { guards: [], postExecute: [], sections: [] }

const stub = {
  logger: { info() {}, warn() {}, debug() {}, error() {} },
  get(name) {
    if (name === 'workingDirectory') {
      return {
        defaultDirectory: 'C:/proj',
        get: (session) => session?.cwd ?? 'C:/proj',
      }
    }
    return undefined
  },
  tools: { guard(guard) { registered.guards.push(guard); return () => {} } },
  on(name, listener) {
    if (name === 'tools/post-execute') registered.postExecute.push(listener)
    return () => {}
  },
  inject(names, callback) {
    if (names.includes('systemPrompt')) {
      callback({
        effect(fn) { fn(); return () => {} },
        systemPrompt: { section(section) { registered.sections.push(section); return () => {} } },
      })
    }
    return { dispose() {} }
  },
  effect(fn) { fn(); return () => {} },
}

const config = new Config({
  enabled: true,
  guardShell: true,
  guardProfile: false,
  announce: true,
  groups: [
    {
      name: 'shop-prod',
      entries: [
        { path: 'C:/proj/config/prod/', kind: 'dir' },
        { path: 'C:/proj/secrets/keys.env', kind: 'file' },
        { path: 'C:/proj/secrets/.env', kind: 'file' },
      ],
    },
  ],
})

apply(stub, config)

const guard = registered.guards[0]
const agent = { id: 'session-1', session: { id: 'session-1', cwd: 'C:/proj/config/dev' } }
const projectAgent = { id: 'session-2', session: { id: 'session-2', cwd: 'C:/proj' } }
const inside = { id: 'session-3', session: { id: 'session-3', cwd: 'C:/proj/config/prod' } }
const exec = (name, args) => ({ name, arguments: args, agent, callId: 'c1' })
const execAt = (name, args, who) => ({ name, arguments: args, agent: who, callId: 'c2' })

// The reported failure: listing/reading a PARENT of a protected dir must work.
const cases = [
  ['read protected file inside dir', exec('read', { file_path: 'C:/proj/config/prod/.env' }), true],
  ['read relative spelling', exec('read', { file_path: '../prod/.env' }), true],
  ['read protected single file', exec('read', { file_path: 'C:\\proj\\secrets\\keys.env' }), true],
  ['read the protected .env itself', exec('read', { file_path: 'C:/proj/secrets/.env' }), true],
  ['read unrelated dev file', exec('read', { file_path: './.env' }), false],
  ['read lookalike sibling', exec('read', { file_path: 'C:/proj/secrets/keys.env.bak' }), false],
  ['read env example beside protected .env', exec('read', { file_path: 'C:/proj/secrets/.env.example' }), false],
  ['read lookalike sibling of protected dir', exec('read', { file_path: 'C:/proj/config/production/app.yaml' }), false],
  ['list the parent of a protected dir with pwsh', execAt('pwsh', { command: 'Get-ChildItem', cwd: 'C:/proj' }, projectAgent), false],
  ['pwsh with a cwd that contains the protected dir', execAt('pwsh', { command: 'Get-ChildItem .', cwd: 'C:/proj' }, projectAgent), false],
  ['grep across the parent of a protected dir', execAt('grep', { pattern: 'DB_', path: 'C:/proj' }, projectAgent), false],
  ['glob the parent of a protected dir', execAt('glob', { pattern: '*.ts', path: 'C:/proj/config' }, projectAgent), false],
  ['grep targeting the protected dir itself', execAt('grep', { pattern: 'DB_', path: 'C:/proj/config/prod' }, projectAgent), true],
  ['glob targeting the protected dir itself', execAt('glob', { pattern: '*', path: 'C:/proj/config/prod' }, projectAgent), true],
  ['pwsh mentions protected path', exec('pwsh', { command: 'Get-Content C:\\proj\\config\\prod\\.env' }), true],
  ['pwsh reads dev config', exec('pwsh', { command: 'Get-Content .\\.env' }), false],
  ['write into protected dir', exec('write', { file_path: 'C:/proj/config/prod/new.yaml', content: 'x' }), true],
  ['mcp tool with path arg', exec('mcp__fs__read_file', { arguments: { path: 'C:/proj/config/prod' } }), true],
  ['tool naming the group only', exec('pwsh', { command: 'echo shop-prod' }), false],
  ['read bare name from inside the protected dir', execAt('read', { file_path: '.env' }, inside), true],
]

let failures = 0
for (const [label, call, expectDeny] of cases) {
  const denial = guard(call)
  const verdict = denial === undefined ? 'allow' : 'deny'
  const ok = expectDeny ? denial !== undefined : denial === undefined
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} -> ${verdict}`)
}

const accept = async () => ({ kind: 'accept' })
const filter = registered.postExecute[0]

// Structured filtering: grep matches under a protected path disappear while the
// rest of the parent directory stays searchable.
{
  const result = {
    isError: false,
    value: {
      matches: [
        { path: 'config/dev/.env', lineNumber: 1, line: 'DB_HOST=localhost' },
        { path: 'config/prod/.env', lineNumber: 1, line: 'DB_HOST=10.0.0.5' },
        { path: 'secrets/keys.env', lineNumber: 2, line: 'SECRET=abc' },
        { path: 'src/main.ts', lineNumber: 3, line: 'const x = 1' },
      ],
    },
    content: [{ type: 'text', text: 'unused in this path' }],
  }
  const decision = await filter(execAt('grep', { pattern: 'DB_', path: 'C:/proj' }, projectAgent), result, accept)
  const kept = decision.value?.matches?.map(match => match.path) ?? []
  const ok = decision.kind === 'accept'
    && kept.includes('config/dev/.env')
    && kept.includes('src/main.ts')
    && !kept.includes('config/prod/.env')
    && !kept.includes('secrets/keys.env')
    && !Object.hasOwn(decision, 'content')
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${'grep value keeps the parent, drops protected matches'} -> ${JSON.stringify(kept)}`)
}

// Structured filtering for glob.
{
  const result = {
    isError: false,
    value: { root: '.', paths: ['config/dev/.env', 'config/prod/.env', 'src/main.ts'] },
    content: [{ type: 'text', text: 'unused' }],
  }
  const decision = await filter(execAt('glob', { pattern: '*.env', path: 'C:/proj' }, projectAgent), result, accept)
  const kept = decision.value?.paths ?? []
  const ok = kept.length === 2 && !kept.includes('config/prod/.env') && decision.value?.root === '.'
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${'glob value drops protected paths, keeps its root'} -> ${JSON.stringify(kept)}`)
}

// Text fallback for tools without a known structure (shell output).
{
  const result = {
    isError: false,
    value: { output: 'x', exitCode: 0 },
    content: [{
      type: 'text',
      text: [
        'C:/proj/config/dev/.env:1: DB_HOST=localhost',
        'C:/proj/config/prod/.env:1: DB_HOST=10.0.0.5',
        'C:/proj/src/main.ts:3: const x = 1',
      ].join('\n'),
    }],
  }
  const decision = await filter(execAt('pwsh', { command: 'Select-String DB_' }, projectAgent), result, accept)
  const text = decision.content?.[0]?.text ?? ''
  const ok = text.includes('config/dev/.env') && !text.includes('config/prod/.env') && text.includes('src/main.ts')
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${'shell text hides protected lines'}`)
}

// A guard denial is an error result; the filter must not rewrite its message.
{
  const denialResult = { isError: true, content: [{ type: 'text', text: 'Blocked by dsh-protect-files: C:/proj/config/prod' }] }
  const guarded = await filter(exec('read', { file_path: 'C:/proj/config/prod/.env' }), denialResult, accept)
  const keptText = guarded.content?.[0]?.text ?? denialResult.content[0].text
  const ok = keptText.startsWith('Blocked by dsh-protect-files')
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${'denial message survives the result filter'}`)
}

// A session working inside a protected path keeps usable output: only the
// protected path segments disappear, the surrounding text stays on its line.
{
  const result = {
    isError: false,
    value: { output: 'a', exitCode: 0 },
    content: [{
      type: 'text',
      text: [
        'Directory: C:/proj/config/prod',
        'hgxt.txt',
        'Directory: C:/proj/src',
        'main.ts',
      ].join('\n'),
    }],
  }
  const decision = await filter(execAt('pwsh', { command: 'Get-ChildItem -Recurse' }, inside), result, accept)
  const text = decision.content?.[0]?.text ?? ''
  const ok = !text.includes('/config/prod')
    && text.includes('hgxt.txt')
    && text.includes('main.ts')
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${'session inside a protected path keeps its non-path output'}`)
}

// The PTC executor returns stdout as ONE long line. One protected match must not
// swallow the whole output: the path is replaced in place, siblings survive and
// the JSON line-end escape is not eaten.
{
  const oneLine = '{"stdout":"C:\\\\proj\\\\config\\\\prod\\\\a.java\\nC:\\\\proj\\\\src\\\\b.java","exitCode":0}'
  const result = { isError: false, value: { output: oneLine }, content: [{ type: 'text', text: oneLine }] }
  const decision = await filter(execAt('run_code', { code: 'console.log(1)' }, projectAgent), result, accept)
  const text = decision.content?.[0]?.text ?? ''
  const ok = text.includes('src\\\\b.java')
    && !text.includes('a.java')
    && text.includes('exitCode')
    && text.includes('受保护路径')
    && !text.includes('受保护路径在')
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${'one-line run_code output keeps non-protected entries'}`)
  console.log(`   | ${text.slice(0, 160)}`)
}

// A tabular listing keeps the columns after a redacted path: the drive-letter
// colon stays, a clock colon ends the path.
{
  const row = 'C:\\proj\\config\\prod\\hgxt     0  2025-10-21  12:42:27'
  const result = { isError: false, value: {}, content: [{ type: 'text', text: row }] }
  const decision = await filter(execAt('pwsh', { command: 'Get-ChildItem' }, projectAgent), result, accept)
  const text = decision.content?.[0]?.text ?? ''
  const ok = text.includes('受保护路径') && text.includes('2025-10-21') && !text.includes('hgxt')
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${'listing row keeps its columns'}`)
  console.log(`   | ${text}`)
}

// A session whose cwd is the protected entry's PARENT sees only relative names.
// Both the argument side and the result side must still refuse the entry.
{
  const parentAgent = { id: 'session-4', session: { id: 'session-4', cwd: 'C:/proj/config' } }
  const at = (name, args) => ({ name, arguments: args, agent: parentAgent, callId: 'c4' })

  const relativeRead = guard(at('read', { file_path: 'prod/.env' }))
  const okArg = relativeRead !== undefined
  if (!okArg) failures += 1
  console.log(`${okArg ? 'PASS' : 'FAIL'}  ${'relative read of the protected entry is denied'}`)

  const relativeGlob = guard(at('glob', { pattern: '*.env', path: 'prod' }))
  const okGlob = relativeGlob !== undefined
  if (!okGlob) failures += 1
  console.log(`${okGlob ? 'PASS' : 'FAIL'}  ${'relative glob of the protected entry is denied'}`)

  const codeRead = guard(at('run_code', { code: "const fs=require('fs');fs.readFileSync('prod/.env','utf8')" }))
  const okCode = codeRead !== undefined
  if (!okCode) failures += 1
  console.log(`${okCode ? 'PASS' : 'FAIL'}  ${'run_code naming the entry relatively is denied'}`)

  // The reported leak: a listing rendered from the parent directory, relative.
  const listing = ['prod/', '  a.env   12 2025-01-01', '  b.env   34 2025-01-01', 'other/', '  keep.txt 5 2025-01-01'].join('\n')
  const result = { isError: false, value: {}, content: [{ type: 'text', text: listing }] }
  const decision = await filter(at('pwsh', { command: 'Get-ChildItem -Recurse' }), result, accept)
  const text = decision.content?.[0]?.text ?? ''
  const okListing = !text.includes('a.env')
    && !text.includes('b.env')
    && text.includes('keep.txt')
    && text.includes('受保护路径')
  if (!okListing) failures += 1
  console.log(`${okListing ? 'PASS' : 'FAIL'}  ${'relative listing hides the entry and its files'}`)
  console.log(`   | ${text.replace(/\n/g, ' / ')}`)
}

// The prompt notice exists and names no path.
const notice = registered.sections[0]?.text?.() ?? ''
const noticeOk = notice.includes('dsh-protect-files') && !notice.includes('C:/proj')
if (!noticeOk) failures += 1
console.log(`${noticeOk ? 'PASS' : 'FAIL'}  ${'prompt notice exists and lists no paths'}`)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exitCode = failures === 0 ? 0 : 1
