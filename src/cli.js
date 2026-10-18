#!/usr/bin/env node

import { createMetaAdsClient } from './index.js'
import { credentialReference, readCredential } from './credentials.js'

// The invocation itself is wrong: exit with the usage status and the usage;
// any other failure exits with the failure status and its own message
// (cli.md rule 10).
class UsageError extends Error {}

function usage() {
  return `metaads-cli

Usage:
  metaads accounts --access-token ROLE#FIELD
  metaads campaigns --account <id> --access-token ROLE#FIELD
  metaads metrics --account <id> --from YYYY-MM-DD --to YYYY-MM-DD --access-token ROLE#FIELD

The credential is a reference ROLE#FIELD: the FIELD of the secret that plays ROLE,
read with \`stado credentials get --role ROLE --field FIELD\`. With
--credentials-file PATH it is read from that file instead, a JSON object
{"ROLE": {"FIELD": "value"}} owned by you and closed to group and others.
No token is accepted in argv or the environment. Optional: --graph-version <version>.
Results print as JSON; --text prints the same result as one path: value line per field.`
}

// The same result for people: one `path: value` line per field (cli.md rule 13).
function render(result, text) {
  if (!text) return JSON.stringify(result, null, '  ')
  const lines = []
  const walk = (node, path) => {
    if (Array.isArray(node) && node.length) node.forEach((item, index) => walk(item, `${path}[${index}]`))
    else if (node && typeof node === 'object' && Object.keys(node).length) for (const [key, item] of Object.entries(node)) walk(item, path ? `${path}.${key}` : key)
    else lines.push(`${path ? `${path}: ` : ''}${node === null || typeof node === 'object' ? '-' : node}`)
  }
  walk(result, '')
  return lines.join('\n')
}

// The flags each command reads and the ones it cannot run without; anything
// else is refused with the usage status before a credential is read (rules 10, 12).
const SHARED = '--access-token --credentials-file --graph-version'.split(' ')
const FLAGS = {
  accounts: SHARED,
  campaigns: SHARED.concat(['--account']),
  metrics: SHARED.concat('--account --from --to'.split(' ')),
}
const REQUIRED = {
  accounts: ['--access-token'],
  campaigns: '--access-token --account'.split(' '),
  metrics: '--access-token --account --from --to'.split(' '),
}

// Each valued flag once, each with a value; the flags read by name.
function readInvocation(command, rest) {
  if (!Object.hasOwn(FLAGS, command)) throw new UsageError(`Unknown command: ${command}\n\n${usage()}`)
  const known = FLAGS[command]
  const options = new Map()
  const tokens = rest[Symbol.iterator]()
  for (const arg of tokens) {
    if (arg === '--text') continue
    if (!known.includes(arg)) throw new UsageError(`metaads ${command} does not take ${arg}; it takes ${known.join(', ')}, --text\n\n${usage()}`)
    if (options.has(arg)) throw new UsageError(`${arg} may be supplied only once\n\n${usage()}`)
    const next = tokens.next()
    if (next.done || next.value.startsWith('--')) throw new UsageError(`${arg} needs a value\n\n${usage()}`)
    options.set(arg, next.value)
  }
  for (const flag of REQUIRED[command]) {
    if (!options.has(flag)) throw new UsageError(`metaads ${command} requires ${flag}\n\n${usage()}`)
  }
  return options
}

async function main() {
  // process.argv holds the Node executable and this script before the
  // arguments (https://nodejs.org/api/process.html#processargv).
  const [, , ...args] = process.argv
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(usage())
    return
  }
  const [command, ...rest] = args
  const options = readInvocation(command, rest)
  const access = credentialReference(options.get('--access-token'), '--access-token')
  const client = createMetaAdsClient({
    accessToken: readCredential(access, options.get('--credentials-file')),
    graphVersion: options.get('--graph-version'),
  })
  let result
  if (command === 'accounts') result = await client.listAdAccounts()
  else if (command === 'campaigns') result = await client.listCampaigns(options.get('--account'))
  else result = await client.reportInsights(options.get('--account'), options.get('--from'), options.get('--to'))
  console.log(render(result, rest.includes('--text')))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  // Misuse and failure, the shell's statuses (https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html).
  process.exitCode = error instanceof UsageError || error?.usage ? 2 : 1
})
