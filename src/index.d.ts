export const META_ADS_PLATFORM: 'meta'
export const META_ADS_DEFAULT_GRAPH_VERSION: string
export function metaAdAccountId(value: unknown): string
/** A field the Graph answer omits is null. */
export type MetaAdAccount = {
  id: string
  accountId: string
  platformId: string
  name: string | null
  currency: string | null
  status: string | null
  timezoneName: string | null
}
export type MetaCampaign = {
  id: string | null
  name: string | null
  status: string | null
  effectiveStatus: string | null
  objective: string | null
  buyingType: string | null
  dailyBudget: number | null
  lifetimeBudget: number | null
}
export type MetaInsight = {
  dateStart: string | null
  dateStop: string | null
  campaignId: string | null
  campaignName: string | null
  impressions: number | null
  reach: number | null
  clicks: number | null
  spend: number | null
  conversions: unknown[]
  conversionValues: unknown[]
}
export function normalizeMetaAdAccount(account: Record<string, unknown>): MetaAdAccount
export function normalizeMetaCampaign(campaign: Record<string, unknown>): MetaCampaign
export function normalizeMetaInsight(row: Record<string, unknown>): MetaInsight
export function createMetaAdsClient(options: { accessToken: string; graphVersion?: string; fetch?: typeof fetch }): {
  listAdAccounts(): Promise<MetaAdAccount[]>
  listCampaigns(accountId: string): Promise<MetaCampaign[]>
  reportInsights(accountId: string, dateFrom: string, dateTo: string): Promise<MetaInsight[]>
}
