<!-- wisent-banner:start -->
<p align="center">
  <img src="assets/readme-banner.webp" alt="metaads-cli by Wisent" width="100%">
</p>
<!-- wisent-banner:end -->

<!-- wisent-readme-signals:start -->
[![Source](https://img.shields.io/badge/GitHub-Source-181717?logo=github)](https://github.com/wisent-ai/metaads-cli) [![Issues](https://img.shields.io/badge/GitHub-Issues-181717?logo=github)](https://github.com/wisent-ai/metaads-cli/issues) [![Wisent](https://img.shields.io/badge/Wisent-Website-0B0B0B)](https://wisent.com) [![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/qRjpkthq54) [![LinkedIn](https://img.shields.io/badge/LinkedIn-Follow-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/company/wisent-ai/) [![X](https://img.shields.io/badge/X-Follow-000000?logo=x&logoColor=white)](https://x.com/wisentai) [![Enterprise](https://img.shields.io/badge/Enterprise-Book%20a%20call-0B0B0B?logo=calendly)](https://calendly.com/lbartoszcze)
<!-- wisent-readme-signals:end -->

# Meta Ads CLI

[![Release](https://img.shields.io/github/v/release/wisent-ai/metaads-cli?display_name=tag&sort=semver)](https://github.com/wisent-ai/metaads-cli/releases)
[![Downloads](https://img.shields.io/github/downloads/wisent-ai/metaads-cli/total)](https://github.com/wisent-ai/metaads-cli/releases)
[![License](https://img.shields.io/github/license/wisent-ai/metaads-cli)](https://github.com/wisent-ai/metaads-cli)
[![Discord](https://img.shields.io/badge/Discord-Join%20Wisent-5865F2?logo=discord&logoColor=white)](https://discord.gg/qRjpkthq54)

**Meta Ads CLI is a small Meta Marketing API client for ad-account discovery, campaign inventory, and dated campaign-level performance reporting.**

The command line reads its token by the role a secret plays, through Stado or an owner-only credentials file; the JavaScript API accepts an injected `fetch` implementation and returns normalized account, campaign, and insight records.

## Included

- accessible Meta ad accounts;
- campaign inventory and delivery status;
- daily impressions, reach, clicks, spend, actions, and action values;
- normalized account IDs, currencies, statuses, and campaign records; a field
  or metric the Graph API answer omits is `null`, never an invented name,
  currency or zero;
- pagination across Graph API collection responses, following every next page;
  a page whose body is not JSON is refused with its status, the parse cause and
  the body instead of ending the list early.

## Explicit non-goals

- The CLI does not mint OAuth tokens, store long-lived tokens, choose budgets, or publish campaigns automatically.
- API access does not imply permission to mutate an advertiser account.
- Meta action arrays require product-specific attribution interpretation; the library preserves them rather than inventing one conversion total.
- Reported values must be reconciled with first-party conversion and revenue systems.

## Quick start

Requires Node.js 20 or newer and a Meta access token authorized for the requested ad accounts, held either by a Stado credential item tagged with a role or in an owner-only credentials file.

```bash
git clone https://github.com/wisent-ai/metaads-cli.git
cd metaads-cli
node src/cli.js accounts --access-token meta-ads#access_token
node src/cli.js campaigns --account act_123456789 --access-token meta-ads#access_token
node src/cli.js metrics --account act_123456789 --from 2026-08-01 --to 2026-08-11 --access-token meta-ads#access_token
```

`--access-token` names a credential reference `ROLE#FIELD`: the field of the secret that plays the role, not the name of a vault item, so renaming or rotating the item changes no invocation. The CLI reads it with `stado credentials get --role ROLE --field FIELD`; Stado refuses a role no item plays, or one several items play, and the CLI exits 1 with that refusal.

Without Stado, pass `--credentials-file PATH`: a JSON object of roles, each an object of fields,

```json
{ "meta-ads": { "access_token": "…" } }
```

owned by the user running the CLI and closed to group and others (`chmod go= PATH`). A file owned by someone else, open to group or others, not JSON, or without the role or a non-empty string field is refused by name with exit 1. No token is accepted in argv or the environment. Pass `--graph-version` when Meta advances the contract.

An unknown command, missing option value or duplicate valued option exits 2
before reading credentials. A reference that is not `ROLE#FIELD` also exits 2;
a failed credential read or API call exits 1 with its cause.

`node --test 'tests/**/*.test.mjs'` runs the CLI journeys: malformed references, a role Stado has no secret for, credentials files refused for permissions, shape and missing fields, and a file's token sent to the Meta Graph API, whose refusal of it is reported.

Library use:

```js
import { createMetaAdsClient, normalizeMetaAdAccount } from '@wisent-ai/metaads-cli'

const metaAds = createMetaAdsClient({ accessToken })
const accounts = await metaAds.listAdAccounts()
```

## Operational model

- **Transport:** official Meta Graph and Marketing APIs over HTTPS.
- **Credentials:** `ROLE#FIELD` references for the CLI, read through Stado or an owner-only `--credentials-file`; explicit constructor fields for the library; bearer headers on requests.
- **State:** none.
- **Output:** JSON to stdout, `--text` path-value output, or normalized JavaScript records.
- **Cost and mutation:** reporting may consume API quota; this release exposes read operations only.

## Project status and support

- **Maturity:** public development source, version `0.1.0`.
- **Issues:** [wisent-ai/metaads-cli](https://github.com/wisent-ai/metaads-cli/issues).
- **Security:** use private GitHub Security Advisories; never attach tokens, account data, query responses, or customer identifiers to a public issue.
- **License:** Apache License 2.0; see [LICENSE](LICENSE).
