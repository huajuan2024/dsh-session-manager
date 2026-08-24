import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'

const pkgRoot = path.resolve(import.meta.dirname, '..')
const libRoot = path.join(pkgRoot, 'lib')

test('compiles host bundle', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(pkgRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p', 'tsconfig.host.json'],
    { cwd: pkgRoot, encoding: 'utf8' },
  )
  if (result.status !== 0) {
    assert.fail(`tsc host failed:\n${result.stdout}\n${result.stderr}`)
  }
})

test('compiles client bundle', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(pkgRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p', 'tsconfig.client.json'],
    { cwd: pkgRoot, encoding: 'utf8' },
  )
  if (result.status !== 0) {
    assert.fail(`tsc client failed:\n${result.stdout}\n${result.stderr}`)
  }
})

test('produces lib/index.js, lib/client.js, lib/types.js', async () => {
  const required = ['index.js', 'client.js', 'types.js', 'index.d.ts', 'types.d.ts']
  for (const name of required) {
    assert.equal(await fileExists(path.join(libRoot, name)), true, `expected ${name} in lib/`)
  }
})

test('client bundle can register again in one classic-script environment', async () => {
  let definition
  const context = vm.createContext({
    window: { __ModuleLoader__: { load(value) { definition = value } } },
  })
  const source = await readFile(path.join(libRoot, 'client.js'))
  new vm.Script(source).runInContext(context)
  assert.equal(definition.id, 'dsh-session-manager')
  definition = undefined
  new vm.Script(source).runInContext(context)
  assert.equal(definition.id, 'dsh-session-manager')
})

test('client treats locale.bind as a translator function', async () => {
  const source = await readFile(path.join(libRoot, 'client.js'))
  assert.match(source, /t\(['"]turnUnit['"]\)/)
  assert.match(source, /t\(['"]title['"]\)/)
  assert.doesNotMatch(source, /\bt\.(?:title|turns|steps|updated|historyTitle|events)\b/)
})

test('exports the SessionManagerService default class', async () => {
  const mod = await import(path.join(libRoot, 'index.js'))
  assert.equal(typeof mod.default, 'function')
  assert.equal(mod.default.name, 'SessionManagerService')
  assert.deepEqual([...mod.default.inject], ['sessionQuery', 'agents'])
})

test('accepts root and subagent session id formats while rejecting unsafe ids', async () => {
  const mod = await import(path.join(libRoot, 'index.js'))
  const service = Object.create(mod.default.prototype)
  service.config = { previewMessageLimit: 200 }
  const accepted = []
  service.readSession = async (sessionId) => {
    accepted.push(sessionId)
    return { session: { id: sessionId }, events: [] }
  }

  const rootId = 'session-f19e9a64-b997-446c-b20c-b35eba307c81'
  const subagentId = 'ca16b22b-d3f8-4e84-8af4-53815fa1a99f'
  await service.readHistory({ sessionId: rootId })
  await service.readHistory({ sessionId: subagentId })
  assert.deepEqual(accepted, [rootId, subagentId])

  for (const sessionId of [
    '../ca16b22b-d3f8-4e84-8af4-53815fa1a99f',
    'session-not-a-uuid',
    'ca16b22b-d3f8-4e84-8af4-53815fa1a99f/child',
  ]) {
    await assert.rejects(
      service.readHistory({ sessionId }),
      /sessionId must be a UUID, optionally prefixed with session-/,
    )
  }
})

test('host uses the rc.7 sessionQuery contract instead of the old sessions RPC envelope', async () => {
  const source = await readFile(path.join(libRoot, 'index.js'))
  assert.match(source, /sessionQuery\(\)\.listSessions\(\)/)
  assert.match(source, /sessionQuery\(\)\.readSession\(sessionId\)/)
  assert.doesNotMatch(source, /result\.error|result\.ok|sessions\(\)\.history/)
})

test('list Remote exposes request as its SRC wire field', async () => {
  const mod = await import(path.join(libRoot, 'index.js'))
  const source = Function.prototype.toString.call(mod.default.prototype.list)
  assert.match(source, /^async list\(request\)/)
})

test('re-exports the public DTO types from the host barrel', async () => {
  const dts = await readFile(path.join(libRoot, 'index.d.ts'))
  for (const key of [
    'SessionExportFormat',
    'SessionManagerConfig',
    'SessionManagerErrorCode',
    'SessionManagerExportResult',
    'SessionManagerHistoryEvent',
    'SessionManagerHistoryPage',
    'SessionManagerSessionSummary',
  ]) {
    assert.match(dts, new RegExp(`\\b${key}\\b`), `expected barrel d.ts to mention ${key}`)
  }
})

test('package.json declares the sessionManager patch id', async () => {
  const pkg = JSON.parse(await readFile(path.join(pkgRoot, 'package.json')))
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-session-query'], '^0.1.0-rc.7')
})

test('cordis.patch.yml inserts the sessionManager service', async () => {
  const raw = await readFile(path.join(pkgRoot, 'cordis.patch.yml'))
  assert.match(raw, /id:\s*sessionManager/)
  assert.match(raw, /sessionsRoot:\s*'~\/\.dsh\/sessions'/)
})

async function fileExists(target) {
  try {
    const fs = await import('node:fs/promises')
    await fs.stat(target)
    return true
  } catch {
    return false
  }
}

async function readFile(target) {
  const fs = await import('node:fs/promises')
  return fs.readFile(target, 'utf8')
}
