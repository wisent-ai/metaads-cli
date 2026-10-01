#!/usr/bin/env node

import { createMetaAdsClient } from './index.js'
import { readCredential } from './skarbiec.js'

// The invocation itself is wrong: exit 2 with the usage; any other failure
// exits 1 with its own message (cli.md rule 10).
class UsageError extends Error {}

function usage() {
  return `metaads-cli

Usage:
  metaads accounts --access-token ITEM#FIELD
  metaads campaigns --account <id> --access-token ITEM#FIELD
  metaads metrics --account <id> --from YYYY-MM-DD --to YYYY-MM-DD --access-token ITEM#FIELD

The credential is a Skarbiec reference: --access-token names ITEM#FIELD, read with
\`skarbiec get ITEM --field FIELD\` (SKARBIEC_BIN names another executable).
No token is accepted in argv or the environment. Optional: --graph-version <version>.`
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
  const known = args[0] === 'accounts' || args[0] === 'campaigns' || args[0] === 'metrics'
  if (!known) throw new UsageError(`Unknown command: ${args[0]}\n\n${usage()}`)
  if (!value(args, '--access-token')) throw new UsageError(`--access-token ITEM#FIELD is required\n\n${usage()}`)
  const client = createMetaAdsClient({
    accessToken: readCredential(value(args, '--access-token'), '--access-token'),
    graphVersion: value(args, '--graph-version'),
  })
  let result
  if (args[0] === 'accounts') result = await client.listAdAccounts()
  else if (args[0] === 'campaigns') result = await client.listCampaigns(value(args, '--account'))
  else if (args[0] === 'metrics') result = await client.reportInsights(value(args, '--account'), value(args, '--from'), value(args, '--to'))
  else throw new UsageError(`Unknown command: ${args[0]}\n\n${usage()}`)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = error instanceof UsageError || error?.usage ? 2 : 1
})
