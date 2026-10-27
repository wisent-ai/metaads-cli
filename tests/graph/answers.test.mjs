// How the Meta Ads client reads Graph API answers. createMetaAdsClient takes
// the fetch it sends requests through as an input; the journey hands it one
// that answers each URL with a real Response of the shape the Graph API, or a
// proxy in front of it, sends, and checks that:
//   - every page that paging.next names is read, so every row is returned;
//   - a later page that is not JSON ends the read with its status, the parse
//     cause and the text, never with the rows read so far as if it were last;
//   - a first answer that is not JSON is refused the same way;
//   - a refusal carrying error.message is reported as that message, and one
//     without it with its status and whole body;
//   - a breakdown asks Meta for it and names its value on every row;
//   - ad sets are read across pages, a campaign's from the campaign's edge;
//   - ads are read with their creative, one ad set's from its own edge.
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

journey('a breakdown names its value on every row and asks Meta for that breakdown', async () => {
  const row = (age) => ({ campaign_id: ACCOUNT, campaign_name: 'brand', age, spend: ACCOUNT })
  const { asked, meta } = client({ first: page([row('18-24'), row('25-34')]) })
  const [today] = new Date().toISOString().split('T')
  const rows = await meta.reportBreakdown(ACCOUNT, today, today, 'age')
  assert.deepEqual(rows.map(({ value }) => value), ['18-24', '25-34'])
  assert.ok(rows.every((entry) => entry.breakdown === 'age' && entry.campaignName === 'brand'), JSON.stringify(rows))
  const [request] = asked
  assert.equal(new URL(request).searchParams.get('breakdowns'), 'age', request)
  const [first] = rows
  assert.equal(first.reach, null, 'a metric the answer omits is null')
  observed.push({ case: 'breakdown', asked, rows: rows.length })
})

journey('ad sets are read across pages, one campaign\'s from its own edge, a non-numeric campaign refused', async () => {
  const adSet = (id) => ({ id, name: `ad set ${id}`, campaign_id: ACCOUNT, status: 'ACTIVE', daily_budget: ACCOUNT })
  const { asked, meta } = client({ first: page([adSet('a')], `${PAGES}/b`), [`${PAGES}/b`]: page([adSet('b')]) })
  const sets = await meta.listAdSets(ACCOUNT, ACCOUNT)
  assert.deepEqual(sets.map(({ id }) => id), ['a', 'b'])
  const [first] = sets
  assert.equal(first.status, 'active')
  assert.equal(first.dailyBudget, Number(ACCOUNT))
  assert.equal(first.lifetimeBudget, null, 'a budget the answer omits is null')
  const [request] = asked
  assert.ok(new URL(request).pathname.endsWith(`/${ACCOUNT}/adsets`), request)
  const sent = asked.length
  await assert.rejects(meta.listAdSets(ACCOUNT, 'brand'), /campaignId must be the campaign's numeric id/u)
  assert.equal(asked.length, sent, 'the refused campaign id sent no request')
  observed.push({ case: 'ad sets', asked, rows: sets.length })
})

journey('ads are read with the creative they show, one ad set\'s from its own edge, a non-numeric ad set refused', async () => {
  const ad = { id: ACCOUNT, name: 'spring', status: 'ACTIVE', adset_id: ACCOUNT, creative: { id: ACCOUNT, title: 'Try it free' } }
  const { asked, meta } = client({ first: page([ad]) })
  const [read] = await meta.listAds(ACCOUNT, ACCOUNT)
  assert.equal(read.creativeTitle, 'Try it free')
  assert.equal(read.creativeBody, null, 'a creative field the answer omits is null')
  assert.equal(read.status, 'active')
  const [request] = asked
  assert.ok(new URL(request).pathname.endsWith(`/${ACCOUNT}/ads`), request)
  const sent = asked.length
  await assert.rejects(meta.listAds(ACCOUNT, 'spring'), /adSetId must be the ad set's numeric id/u)
  assert.equal(asked.length, sent, 'the refused ad set id sent no request')
  observed.push({ case: 'ads', asked, ad: read })
})

journey('metrics at the ad level ask Meta for that level and name the ad on every row', async () => {
  const row = { campaign_id: ACCOUNT, adset_id: ACCOUNT, ad_id: ACCOUNT, ad_name: 'spring', spend: ACCOUNT }
  const { asked, meta } = client({ first: page([row]) })
  const [today] = new Date().toISOString().split('T')
  const [read] = await meta.reportLevelInsights(ACCOUNT, today, today, 'ad')
  assert.equal(read.adName, 'spring')
  assert.equal(read.adSetId, ACCOUNT)
  const [request] = asked
  assert.equal(new URL(request).searchParams.get('level'), 'ad', request)
  const campaign = client({ first: page([{ campaign_id: ACCOUNT, spend: ACCOUNT }]) })
  const [whole] = await campaign.meta.reportInsights(ACCOUNT, today, today)
  assert.equal(whole.adId, null, 'the campaign level names no ad')
  observed.push({ case: 'level insights', asked, row: read })
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
