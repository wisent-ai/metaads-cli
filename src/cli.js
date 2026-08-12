#!/usr/bin/env node

import { createMetaAdsClient } from './index.js'

function usage() {
  return `metaads-cli

Usage:
  metaads accounts
  metaads campaigns --account <id>
  metaads metrics --account <id> --from YYYY-MM-DD --to YYYY-MM-DD

Credentials are read from META_ADS_ACCESS_TOKEN. Optional: META_GRAPH_API_VERSION.`
}

function value(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

async function main() {
  const args = process.argv.slice(2)
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(usage())
    return
  }
  const client = createMetaAdsClient({
    accessToken: process.env.META_ADS_ACCESS_TOKEN,
    graphVersion: process.env.META_GRAPH_API_VERSION,
  })
  let result
  if (args[0] === 'accounts') result = await client.listAdAccounts()
  else if (args[0] === 'campaigns') result = await client.listCampaigns(value(args, '--account'))
  else if (args[0] === 'metrics') result = await client.reportInsights(value(args, '--account'), value(args, '--from'), value(args, '--to'))
  else throw new Error(`Unknown command: ${args[0]}\n\n${usage()}`)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
