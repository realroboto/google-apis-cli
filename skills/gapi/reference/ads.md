# gapi `ads` — full command reference

Base `https://googleads.googleapis.com`. Live source of truth: `gapi ads` / `gapi ads <resource>`.
Call: `gapi ads <resource> <verb> [path-arg ...] [--body '<json>'] [--limit N] [--json|--raw]`.
Positionals fill the `{param}` tokens left-to-right. ⬦ = needs `--body`.
All verbs use scope `adwords`.

## customers

| verb | method | path |
|---|---|---|
| `list-accessible` | GET | `/v25/customers:listAccessibleCustomers` |

## gaql

| verb | method | path |
|---|---|---|
| `search` ⬦ | POST | `/v25/customers/{customer}/googleAds:search` |
| `searchStream` ⬦ | POST | `/v25/customers/{customer}/googleAds:searchStream` |

## campaigns

| verb | method | path |
|---|---|---|
| `mutate` ⬦ | POST | `/v25/customers/{customer}/campaigns:mutate` |

## campaign-budgets

| verb | method | path |
|---|---|---|
| `mutate` ⬦ | POST | `/v25/customers/{customer}/campaignBudgets:mutate` |

## campaign-criteria

| verb | method | path |
|---|---|---|
| `mutate` ⬦ | POST | `/v25/customers/{customer}/campaignCriteria:mutate` |

## ad-groups

| verb | method | path |
|---|---|---|
| `mutate` ⬦ | POST | `/v25/customers/{customer}/adGroups:mutate` |

## ad-group-ads

| verb | method | path |
|---|---|---|
| `mutate` ⬦ | POST | `/v25/customers/{customer}/adGroupAds:mutate` |

## ad-group-criteria

| verb | method | path |
|---|---|---|
| `mutate` ⬦ | POST | `/v25/customers/{customer}/adGroupCriteria:mutate` |

