# gapi `ga4-data` — full command reference

Base `https://analyticsdata.googleapis.com`. Live source of truth: `gapi ga4-data` / `gapi ga4-data <resource>`.
Call: `gapi ga4-data <resource> <verb> [path-arg ...] [--body '<json>'] [--limit N] [--json|--raw]`.
Positionals fill the `{param}` tokens left-to-right. ⬦ = needs `--body`.
All verbs use scope `analytics.readonly`.

## reports

| verb | method | path |
|---|---|---|
| `run` ⬦ | POST | `/v1beta/properties/{property}:runReport` |
| `run-realtime` ⬦ | POST | `/v1beta/properties/{property}:runRealtimeReport` |
| `run-pivot` ⬦ | POST | `/v1beta/properties/{property}:runPivotReport` |
| `batch-run` ⬦ | POST | `/v1beta/properties/{property}:batchRunReports` |
| `batch-run-pivot` ⬦ | POST | `/v1beta/properties/{property}:batchRunPivotReports` |
| `check-compatibility` ⬦ | POST | `/v1beta/properties/{property}:checkCompatibility` |

## metadata

| verb | method | path |
|---|---|---|
| `get` | GET | `/v1beta/properties/{property}/metadata` |

## audience-exports

| verb | method | path |
|---|---|---|
| `list` | GET | `/v1beta/properties/{property}/audienceExports` |
| `get` | GET | `/v1beta/properties/{property}/audienceExports/{audienceExport}` |
| `create` ⬦ | POST | `/v1beta/properties/{property}/audienceExports` |
| `query` ⬦ | POST | `/v1beta/properties/{property}/audienceExports/{audienceExport}:query` |

