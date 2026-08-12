export const META_ADS_PLATFORM: 'meta'
export const META_ADS_DEFAULT_GRAPH_VERSION: string
export function metaAdAccountId(value: unknown): string
export type MetaAdAccount = {
  id: string
  accountId: string
  platformId: string
  name: string
  currency: string
  status: string
  timezoneName: string
}
export type MetaCampaign = {
  id: string
  name: string
  status: string
  effectiveStatus: string
  objective: string
  buyingType: string
  dailyBudget: number | null
  lifetimeBudget: number | null
}
export function normalizeMetaAdAccount(account?: Record<string, unknown>): MetaAdAccount
export function normalizeMetaCampaign(campaign?: Record<string, unknown>): MetaCampaign
export function normalizeMetaInsight(row?: Record<string, unknown>): Record<string, unknown>
export function createMetaAdsClient(options: { accessToken: string; graphVersion?: string; fetch?: typeof fetch }): {
  listAdAccounts(): Promise<MetaAdAccount[]>
  listCampaigns(accountId: string): Promise<MetaCampaign[]>
  reportInsights(accountId: string, dateFrom: string, dateTo: string): Promise<Array<Record<string, unknown>>>
}
