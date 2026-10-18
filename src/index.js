export const META_ADS_PLATFORM = 'meta'
export const META_ADS_DEFAULT_GRAPH_VERSION = 'v26.0'

function requireText(value, label) {
  if (value === undefined || value === null) throw new Error(`${label} is required`)
  const text = String(value).trim()
  if (!text) throw new Error(`${label} is required`)
  return text
}

// A field the Graph answer omits is reported as null, never as a value it
// did not state.
function field(value) {
  return value === undefined || value === null ? null : String(value)
}

function lowered(value) {
  const text = field(value)
  return text === null ? null : text.toLowerCase()
}

function metric(value) {
  return value === undefined || value === null ? null : Number(value)
}

export function metaAdAccountId(value) {
  const id = requireText(value, 'Meta ad account id').replace(/^act_/u, '')
  if (!/^\d+$/u.test(id)) throw new Error(`Meta ad account id must be numeric, got ${JSON.stringify(value)}`)
  return id
}

export function normalizeMetaAdAccount(account) {
  const id = metaAdAccountId(account.account_id === undefined ? account.id : account.account_id)
  return {
    id,
    accountId: id,
    // The Graph object id of an ad account is act_<account id>.
    platformId: account.id === undefined ? `act_${id}` : String(account.id),
    name: field(account.name === undefined ? account.account_name : account.name),
    currency: field(account.currency),
    status: field(account.account_status === undefined ? account.status : account.account_status),
    timezoneName: field(account.timezone_name),
  }
}

export function normalizeMetaCampaign(campaign) {
  return {
    id: field(campaign.id),
    name: field(campaign.name),
    status: lowered(campaign.status),
    effectiveStatus: lowered(campaign.effective_status),
    objective: lowered(campaign.objective),
    buyingType: lowered(campaign.buying_type),
    dailyBudget: metric(campaign.daily_budget),
    lifetimeBudget: metric(campaign.lifetime_budget),
  }
}

export function normalizeMetaInsight(row) {
  return {
    dateStart: field(row.date_start),
    dateStop: field(row.date_stop),
    campaignId: field(row.campaign_id),
    campaignName: field(row.campaign_name),
    impressions: metric(row.impressions),
    reach: metric(row.reach),
    clicks: metric(row.clicks),
    spend: metric(row.spend),
    conversions: Array.isArray(row.actions) ? row.actions : [],
    conversionValues: Array.isArray(row.action_values) ? row.action_values : [],
  }
}

export function createMetaAdsClient(options) {
  const accessToken = requireText(options.accessToken, 'accessToken')
  const graphVersion = options.graphVersion === undefined ? META_ADS_DEFAULT_GRAPH_VERSION : requireText(options.graphVersion, 'graphVersion')
  const fetchImpl = options.fetch === undefined ? globalThis.fetch : options.fetch
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required')
  const origin = `https://graph.facebook.com/${graphVersion}`
  const headers = { accept: 'application/json', authorization: `Bearer ${accessToken}` }

  async function request(path, query) {
    const url = new URL(`${origin}${path}`)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
    return answerBody(await fetchImpl(url, { headers }))
  }

  // Every Graph answer, first page or next, is read strictly: a body that is
  // not JSON is refused with its status, the parse cause and the text, so a
  // page that cannot be read never ends pagination as if it were the last.
  async function answerBody(response) {
    const text = await response.text()
    let body
    try {
      body = JSON.parse(text)
    } catch (error) {
      throw new Error(`Meta Graph API returned HTTP ${response.status} with a body that is not JSON (${error.message}): ${text}`)
    }
    if (!response.ok || body?.error) {
      const stated = body?.error?.message
      throw new Error(typeof stated === 'string' ? stated : `Meta Graph API returned HTTP ${response.status}: ${text}`)
    }
    return body
  }

  // Follows paging.next to the end, so every row is returned whatever page
  // size the Graph API answers with.
  async function collect(path, query) {
    const rows = []
    let body = await request(path, query)
    while (true) {
      if (body === null || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.data)) {
        throw new Error(`Meta Graph collection page must be an object with a data array: ${JSON.stringify(body)}`)
      }
      rows.push(...body.data)
      if (body.paging === undefined) break
      if (body.paging === null || typeof body.paging !== 'object' || Array.isArray(body.paging)) {
        throw new Error(`Meta Graph collection page has invalid paging: ${JSON.stringify(body)}`)
      }
      const next = body.paging.next
      if (next === undefined) break
      if (typeof next !== 'string' || !next.trim()) {
        throw new Error(`Meta Graph collection page has invalid paging.next: ${JSON.stringify(body)}`)
      }
      body = await answerBody(await fetchImpl(next, { headers }))
    }
    return rows
  }

  return {
    async listAdAccounts() {
      const rows = await collect('/me/adaccounts', { fields: 'id,account_id,name,currency,account_status,timezone_name' })
      return rows.map(normalizeMetaAdAccount)
    },
    async listCampaigns(accountId) {
      const id = metaAdAccountId(accountId)
      const rows = await collect(`/act_${id}/campaigns`, { fields: 'id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget' })
      return rows.map(normalizeMetaCampaign)
    },
    async reportInsights(accountId, dateFrom, dateTo) {
      const id = metaAdAccountId(accountId)
      const timeRange = JSON.stringify({ since: requireText(dateFrom, 'dateFrom'), until: requireText(dateTo, 'dateTo') })
      const rows = await collect(`/act_${id}/insights`, {
        level: 'campaign',
        // One row per day: the time_increment value the Insights API defines
        // for daily rows, https://developers.facebook.com/docs/marketing-api/insights/parameters/
        time_increment: 1,
        time_range: timeRange,
        fields: 'date_start,date_stop,campaign_id,campaign_name,impressions,reach,clicks,spend,actions,action_values',
      })
      return rows.map(normalizeMetaInsight)
    },
  }
}
