// The metaads CLI reads its token by the role a secret plays: through the
// real `stado` on PATH, or through an owner-only credentials file. Every case
// runs src/cli.js as a user would and reads its exit status and stderr; the
// last sends a file's token to the real Meta Graph API.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, constants, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = join(root, '.build', 'tests', randomUUID())
mkdirSync(scratch, { recursive: true })
after(() => rmSync(scratch, { recursive: true, force: true }))

// The shell's statuses for misuse and for failure (https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html).
const MISUSE = 2
const FAILURE = 1 // https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html

function metaads(...args) {
  return spawnSync(process.execPath, [join(root, 'src', 'cli.js'), ...args], { encoding: 'utf8' })
}

function credentialsFile(document, mode) {
  const path = join(scratch, `${randomUUID()}.json`)
  writeFileSync(path, typeof document === 'string' ? document : JSON.stringify(document))
  chmodSync(path, mode)
  return path
}

const OWNER_ONLY = constants.S_IRUSR | constants.S_IWUSR
const WORLD_READABLE = OWNER_ONLY | constants.S_IRGRP | constants.S_IROTH

test('a reference that is not ROLE#FIELD is misuse, refused before any read', () => {
  for (const reference of ['meta-ads', 'meta-ads#', '#access_token', 'a#b#c']) {
    const run = metaads('accounts', '--access-token', reference)
    assert.equal(run.status, MISUSE, run.stderr)
    assert.match(run.stderr, /must be a credential reference ROLE#FIELD/)
    assert.ok(run.stderr.includes(JSON.stringify(reference)), run.stderr)
  }
})

test('a role no secret plays is refused with Stado naming the role', () => {
  const role = `metaads-cli-absent-${randomUUID()}`
  const run = metaads('accounts', '--access-token', `${role}#access_token`)
  assert.equal(run.status, FAILURE, run.stderr)
  assert.ok(run.stderr.includes(`stado credentials get --role ${role} --field access_token failed`), run.stderr)
  assert.ok(run.stderr.includes(`stado:role:${role}`), run.stderr)
})

test('a credentials file open to group or others is refused before it is read', () => {
  const path = credentialsFile({ 'meta-ads': { access_token: 'unused' } }, WORLD_READABLE)
  const run = metaads('accounts', '--access-token', 'meta-ads#access_token', '--credentials-file', path)
  assert.equal(run.status, FAILURE, run.stderr)
  assert.ok(run.stderr.includes(`--credentials-file ${path} is open to group or others`), run.stderr)
})

test('a credentials file without the role, the field or a string value is refused by name', () => {
  const cases = [
    ['not json', /is not JSON/],
    [['meta-ads'], /must hold a JSON object of roles/],
    [{ other: { access_token: 'unused' } }, /has no role meta-ads/],
    [{ 'meta-ads': { token: 'unused' } }, /role meta-ads has no field access_token/],
    [{ 'meta-ads': { access_token: '' } }, /field access_token is not a non-empty string/],
  ]
  for (const [document, refusal] of cases) {
    const path = credentialsFile(document, OWNER_ONLY)
    const run = metaads('accounts', '--access-token', 'meta-ads#access_token', '--credentials-file', path)
    assert.equal(run.status, FAILURE, run.stderr)
    assert.match(run.stderr, refusal)
  }
})

test("an owner-only file's token is sent to Meta, and Meta's refusal of it is reported", () => {
  const token = `metaads-cli-invalid-${randomUUID()}`
  const path = credentialsFile({ 'meta-ads': { access_token: token } }, OWNER_ONLY)
  const run = metaads('accounts', '--access-token', 'meta-ads#access_token', '--credentials-file', path)
  assert.equal(run.status, FAILURE, run.stderr)
  assert.match(run.stderr, /access token/i)
  assert.ok(!run.stderr.includes(token) && !run.stdout.includes(token), 'the token never reaches output')
})
