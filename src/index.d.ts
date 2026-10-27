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
  /** Stated at the ad set and ad levels; null at the campaign level. */
  adSetId: string | null
  adSetName: string | null
  adId: string | null
  adName: string | null
  impressions: number | null
  reach: number | null
  clicks: number | null
  spend: number | null
  conversions: unknown[]
  conversionValues: unknown[]
}
export type MetaAdSet = {
  id: string | null
  name: string | null
  campaignId: string | null
  status: string | null
  effectiveStatus: string | null
  dailyBudget: number | null
  lifetimeBudget: number | null
  optimizationGoal: string | null
  billingEvent: string | null
  bidStrategy: string | null
  startTime: string | null
  endTime: string | null
}
export type MetaAd = {
  id: string | null
  name: string | null
  status: string | null
  effectiveStatus: string | null
  adSetId: string | null
  campaignId: string | null
  creativeId: string | null
  creativeName: string | null
  creativeTitle: string | null
  creativeBody: string | null
}
export function normalizeMetaAdAccount(account: Record<string, unknown>): MetaAdAccount
export function normalizeMetaCampaign(campaign: Record<string, unknown>): MetaCampaign
export function normalizeMetaInsight(row: Record<string, unknown>): MetaInsight
export function createMetaAdsClient(options: { accessToken: string; graphVersion?: string; fetch?: typeof fetch }): {
  listAdAccounts(): Promise<MetaAdAccount[]>
  listCampaigns(accountId: string): Promise<MetaCampaign[]>
  /** The account's ad sets, or one campaign's when campaignId is given; a non-numeric campaignId is refused. */
  listAdSets(accountId: string, campaignId?: string): Promise<MetaAdSet[]>
  /** The account's ads, or one ad set's when adSetId is given, with the creative each shows. */
  listAds(accountId: string, adSetId?: string): Promise<MetaAd[]>
  reportInsights(accountId: string, dateFrom: string, dateTo: string): Promise<MetaInsight[]>
  /** The daily results at one Insights level: campaign, adset or ad. */
  reportLevelInsights(accountId: string, dateFrom: string, dateTo: string, level: string): Promise<MetaInsight[]>
  /** The range's results per campaign and value of one Insights breakdown (age, gender, country, …). */
  reportBreakdown(accountId: string, dateFrom: string, dateTo: string, breakdown: string): Promise<Array<MetaInsight & { breakdown: string; value: string | null }>>
}
