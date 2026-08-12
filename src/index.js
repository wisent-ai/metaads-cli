export const META_ADS_PLATFORM = 'meta'
export const META_ADS_DEFAULT_GRAPH_VERSION = 'v26.0'

function requireText(value, label) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${label} is required`)
  return text
}

export function metaAdAccountId(value) {
  const id = String(value ?? '').trim().replace(/^act_/u, '')
  if (!/^\d+$/u.test(id)) throw new Error('Meta ad account id must be numeric')
  return id
}

export function normalizeMetaAdAccount(account = {}) {
  const id = metaAdAccountId(account.account_id ?? account.id)
  return {
    id,
    accountId: id,
    platformId: String(account.id ?? `act_${id}`),
    name: String(account.name ?? account.account_name ?? 'Meta Ads').trim() || 'Meta Ads',
    currency: String(account.currency ?? 'USD').trim().toUpperCase() || 'USD',
    status: String(account.account_status ?? account.status ?? ''),
    timezoneName: String(account.timezone_name ?? ''),
  }
}

export function normalizeMetaCampaign(campaign = {}) {
  return {
    id: String(campaign.id ?? ''),
    name: String(campaign.name ?? ''),
    status: String(campaign.status ?? '').toLowerCase(),
    effectiveStatus: String(campaign.effective_status ?? '').toLowerCase(),
    objective: String(campaign.objective ?? '').toLowerCase(),
    buyingType: String(campaign.buying_type ?? '').toLowerCase(),
    dailyBudget: campaign.daily_budget == null ? null : Number(campaign.daily_budget),
    lifetimeBudget: campaign.lifetime_budget == null ? null : Number(campaign.lifetime_budget),
  }
}

export function normalizeMetaInsight(row = {}) {
  return {
    dateStart: String(row.date_start ?? ''),
    dateStop: String(row.date_stop ?? ''),
    campaignId: String(row.campaign_id ?? ''),
    campaignName: String(row.campaign_name ?? ''),
    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    spend: Number(row.spend ?? 0),
    conversions: Array.isArray(row.actions) ? row.actions : [],
    conversionValues: Array.isArray(row.action_values) ? row.action_values : [],
  }
}

export function createMetaAdsClient(options = {}) {
  const accessToken = requireText(options.accessToken, 'accessToken')
  const graphVersion = String(options.graphVersion || META_ADS_DEFAULT_GRAPH_VERSION)
  const fetchImpl = options.fetch || globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required')
  const origin = `https://graph.facebook.com/${graphVersion}`

  async function request(path, query = {}) {
    const url = new URL(`${origin}${path}`)
    for (const [key, value] of Object.entries(query)) {
      if (value != null && String(value).trim()) url.searchParams.set(key, String(value))
    }
    const response = await fetchImpl(url, { headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` } })
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.error) throw new Error(body?.error?.message || `Meta Graph API returned HTTP ${response.status}`)
    return body
  }

  async function collect(path, query = {}) {
    const rows = []
    let body = await request(path, query)
    while (body) {
      if (Array.isArray(body.data)) rows.push(...body.data)
      const next = body.paging?.next
      if (!next) break
      const response = await fetchImpl(next, { headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` } })
      body = await response.json().catch(() => null)
      if (!response.ok || body?.error) throw new Error(body?.error?.message || `Meta Graph API returned HTTP ${response.status}`)
    }
    return rows
  }

  return {
    async listAdAccounts() {
      const rows = await collect('/me/adaccounts', { fields: 'id,account_id,name,currency,account_status,timezone_name', limit: 100 })
      return rows.map(normalizeMetaAdAccount)
    },
    async listCampaigns(accountId) {
      const id = metaAdAccountId(accountId)
      const rows = await collect(`/act_${id}/campaigns`, { fields: 'id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget', limit: 100 })
      return rows.map(normalizeMetaCampaign)
    },
    async reportInsights(accountId, dateFrom, dateTo) {
      const id = metaAdAccountId(accountId)
      const timeRange = JSON.stringify({ since: requireText(dateFrom, 'dateFrom'), until: requireText(dateTo, 'dateTo') })
      const rows = await collect(`/act_${id}/insights`, {
        level: 'campaign',
        time_increment: 1,
        time_range: timeRange,
        fields: 'date_start,date_stop,campaign_id,campaign_name,impressions,reach,clicks,spend,actions,action_values',
        limit: 100,
      })
      return rows.map(normalizeMetaInsight)
    },
  }
}
