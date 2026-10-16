// How the Meta Ads client reads Graph API answers. createMetaAdsClient takes
// the fetch it sends requests through as an input; the journey hands it one
// that answers each URL with a real Response of the shape the Graph API, or a
// proxy in front of it, sends, and checks that:
//   - every page that paging.next names is read, so every row is returned;
//   - a later page that is not JSON ends the read with its status, the parse
//     cause and the text, never with the rows read so far as if it were last;
//   - a first answer that is not JSON is refused the same way;
//   - a refusal carrying error.message is reported as that message, and one
//     without it with its status and whole body.
//
//   node --test tests/graph/answers.test.mjs
//
// With METAADS_TEST_DEFECT and METAADS_TEST_CRITERION named together, a run
// on committed source that passes every case writes criterion.json under
// .build/real-tests/graph-answers/<stamp>/.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { constants as http } from 'node:http2'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createMetaAdsClient } from '../../src/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defectId = process.env.METAADS_TEST_DEFECT?.trim()
const criterion = process.env.METAADS_TEST_CRITERION?.trim()
assert.equal(Boolean(defectId), Boolean(criterion),
  'METAADS_TEST_DEFECT and METAADS_TEST_CRITERION are named together or not at all')

// The shell's status for success (https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html).
const SUCCEEDED = 0

const commands = []
function git(...args) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(run.status, SUCCEEDED, run.stderr)
  commands.push({ executable: 'git', args, exit: run.status })
  return run.stdout
}
const revision = git('rev-parse', 'HEAD').trim()
const uncommitted = git('status', '--porcelain', '--', 'src', 'tests/graph')
assert.ok(!defectId || uncommitted === '', 'commit the client and this test before qualification')

// An ad account id is numeric; this run's process id is one nobody owns here.
const ACCOUNT = String(process.pid)
const PAGES = 'https://graph.example/pages'
const proxyPage = '<html><body>502 Bad Gateway</body></html>'

// A client whose requests are answered by `answers`: the first request by
// answers.first, a paging.next URL by answers[url]. Every URL asked is kept.
function client(answers) {
  const asked = []
  const fetch = async (url) => {
    asked.push(String(url))
    const answer = String(url).startsWith(PAGES) ? answers[String(url)] : answers.first
    assert.ok(answer, `nothing answers ${url}`)
    return answer()
  }
  return { asked, meta: createMetaAdsClient({ accessToken: 'journey-token', fetch }) }
}
const page = (data, next) => () => Response.json(next ? { data, paging: { next } } : { data })
const campaign = (id) => ({ id, name: `campaign ${id}`, status: 'ACTIVE' })

const observed = []
const registered = []
const completed = []
function journey(name, body) {
  registered.push(name)
  test(name, async () => {
    await body()
    completed.push(name)
  })
}

journey('every page paging.next names is read', async () => {
  const { asked, meta } = client({
    first: page([campaign('a')], `${PAGES}/b`),
    [`${PAGES}/b`]: page([campaign('b')], `${PAGES}/c`),
    [`${PAGES}/c`]: page([campaign('c')]),
  })
  const campaigns = await meta.listCampaigns(ACCOUNT)
  assert.deepEqual(campaigns.map(({ id }) => id), ['a', 'b', 'c'])
  observed.push({ case: 'pages', asked, rows: campaigns.length })
})

journey('a later page that is not JSON ends the read with its status, cause and text', async () => {
  const { meta } = client({
    first: page([campaign('a')], `${PAGES}/b`),
    [`${PAGES}/b`]: () => new Response(proxyPage, { status: http.HTTP_STATUS_BAD_GATEWAY }),
  })
  const error = await meta.listCampaigns(ACCOUNT).then(
    (rows) => assert.fail(`the read returned ${rows.length} rows`),
    (refusal) => refusal,
  )
  assert.ok(error.message.startsWith(
    `Meta Graph API returned HTTP ${http.HTTP_STATUS_BAD_GATEWAY} with a body that is not JSON (`), error.message)
  assert.ok(error.message.endsWith(`: ${proxyPage}`), error.message)
  observed.push({ case: 'later page', error: error.message })
})

journey('a first answer that is not JSON is refused with its status and text', async () => {
  const { meta } = client({ first: () => new Response(proxyPage, { status: http.HTTP_STATUS_OK }) })
  await assert.rejects(meta.listAdAccounts(), (error) => {
    assert.ok(error.message.includes(`HTTP ${http.HTTP_STATUS_OK} with a body that is not JSON`), error.message)
    assert.ok(error.message.endsWith(proxyPage), error.message)
    observed.push({ case: 'first answer', error: error.message })
    return true
  })
})

journey('a refusal is its error.message, or its status and whole body', async () => {
  const stated = 'Invalid OAuth access token.'
  const withMessage = client({
    first: () => Response.json({ error: { message: stated } }, { status: http.HTTP_STATUS_BAD_REQUEST }),
  })
  await assert.rejects(withMessage.meta.listAdAccounts(), { message: stated })
  const body = JSON.stringify({ error: { code: 'unexplained' } })
  const without = client({ first: () => new Response(body, { status: http.HTTP_STATUS_FORBIDDEN }) })
  await assert.rejects(without.meta.listAdAccounts(), {
    message: `Meta Graph API returned HTTP ${http.HTTP_STATUS_FORBIDDEN}: ${body}`,
  })
  observed.push({ case: 'refusals', stated, body })
})

after(() => {
  if (!defectId || completed.length !== registered.length) return
  const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
  const out = join(root, '.build', 'real-tests', 'graph-answers', new Date().toISOString().replace(/[:.]/g, ''))
  mkdirSync(out, { recursive: true })
  const path = join(out, 'criterion.json')
  writeFileSync(path, `${JSON.stringify({
    defectId,
    criterion,
    sourceRevision: revision,
    result: 'passed',
    binarySha256: digest(process.execPath),
    testSha256: digest(fileURLToPath(import.meta.url)),
    observedFinalState: { cases: completed, observed },
    commands,
  }, null, '  ')}\n`, { mode: constants.S_IRUSR | constants.S_IWUSR })
  console.log(`criterion report: ${path}`)
})
