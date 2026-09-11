# gapi `ga4-admin` — full command reference

Base `https://analyticsadmin.googleapis.com`. Live source of truth: `gapi ga4-admin` / `gapi ga4-admin <resource>`.
Call: `gapi ga4-admin <resource> <verb> [path-arg ...] [--body '<json>'] [--limit N] [--json|--raw]`.
Positionals fill the `{param}` tokens left-to-right. ⬦ = needs `--body`.

## accounts

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/accounts` | `analytics.readonly` |
| `get` | GET | `/v1beta/accounts/{account}` | `analytics.readonly` |
| `patch` ⬦ | PATCH | `/v1beta/accounts/{account}` | `analytics.edit` |
| `delete` | DELETE | `/v1beta/accounts/{account}` | `analytics.edit` |
| `get-data-sharing-settings` | GET | `/v1beta/accounts/{account}/dataSharingSettings` | `analytics.readonly` |
| `provision-account-ticket` ⬦ | POST | `/v1beta/accounts:provisionAccountTicket` | `analytics.edit` |
| `run-access-report` ⬦ | POST | `/v1beta/accounts/{account}:runAccessReport` | `analytics.readonly` |
| `search-change-history-events` ⬦ | POST | `/v1beta/accounts/{account}:searchChangeHistoryEvents` | `analytics.edit` |

## account-summaries

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/accountSummaries` | `analytics.readonly` |

## properties

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/properties` | `analytics.readonly` |
| `get` | GET | `/v1beta/properties/{property}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1beta/properties` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1beta/properties/{property}` | `analytics.edit` |
| `delete` | DELETE | `/v1beta/properties/{property}` | `analytics.edit` |
| `acknowledge-user-data-collection` ⬦ | POST | `/v1beta/properties/{property}:acknowledgeUserDataCollection` | `analytics.edit` |
| `run-access-report` ⬦ | POST | `/v1beta/properties/{property}:runAccessReport` | `analytics.readonly` |
| `get-data-retention-settings` | GET | `/v1beta/properties/{property}/dataRetentionSettings` | `analytics.readonly` |
| `update-data-retention-settings` ⬦ | PATCH | `/v1beta/properties/{property}/dataRetentionSettings` | `analytics.edit` |

## conversion-events

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/properties/{property}/conversionEvents` | `analytics.readonly` |
| `get` | GET | `/v1beta/properties/{property}/conversionEvents/{conversionEvent}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1beta/properties/{property}/conversionEvents` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1beta/properties/{property}/conversionEvents/{conversionEvent}` | `analytics.edit` |
| `delete` | DELETE | `/v1beta/properties/{property}/conversionEvents/{conversionEvent}` | `analytics.edit` |

## custom-dimensions

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/properties/{property}/customDimensions` | `analytics.readonly` |
| `get` | GET | `/v1beta/properties/{property}/customDimensions/{customDimension}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1beta/properties/{property}/customDimensions` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1beta/properties/{property}/customDimensions/{customDimension}` | `analytics.edit` |
| `archive` ⬦ | POST | `/v1beta/properties/{property}/customDimensions/{customDimension}:archive` | `analytics.edit` |

## custom-metrics

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/properties/{property}/customMetrics` | `analytics.readonly` |
| `get` | GET | `/v1beta/properties/{property}/customMetrics/{customMetric}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1beta/properties/{property}/customMetrics` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1beta/properties/{property}/customMetrics/{customMetric}` | `analytics.edit` |
| `archive` ⬦ | POST | `/v1beta/properties/{property}/customMetrics/{customMetric}:archive` | `analytics.edit` |

## data-streams

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/properties/{property}/dataStreams` | `analytics.readonly` |
| `get` | GET | `/v1beta/properties/{property}/dataStreams/{dataStream}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1beta/properties/{property}/dataStreams` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1beta/properties/{property}/dataStreams/{dataStream}` | `analytics.edit` |
| `delete` | DELETE | `/v1beta/properties/{property}/dataStreams/{dataStream}` | `analytics.edit` |

## measurement-protocol-secrets

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/properties/{property}/dataStreams/{dataStream}/measurementProtocolSecrets` | `analytics.readonly` |
| `get` | GET | `/v1beta/properties/{property}/dataStreams/{dataStream}/measurementProtocolSecrets/{secret}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1beta/properties/{property}/dataStreams/{dataStream}/measurementProtocolSecrets` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1beta/properties/{property}/dataStreams/{dataStream}/measurementProtocolSecrets/{secret}` | `analytics.edit` |
| `delete` | DELETE | `/v1beta/properties/{property}/dataStreams/{dataStream}/measurementProtocolSecrets/{secret}` | `analytics.edit` |

## firebase-links

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/properties/{property}/firebaseLinks` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1beta/properties/{property}/firebaseLinks` | `analytics.edit` |
| `delete` | DELETE | `/v1beta/properties/{property}/firebaseLinks/{firebaseLink}` | `analytics.edit` |

## google-ads-links

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/properties/{property}/googleAdsLinks` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1beta/properties/{property}/googleAdsLinks` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1beta/properties/{property}/googleAdsLinks/{googleAdsLink}` | `analytics.edit` |
| `delete` | DELETE | `/v1beta/properties/{property}/googleAdsLinks/{googleAdsLink}` | `analytics.edit` |

## key-events

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1beta/properties/{property}/keyEvents` | `analytics.readonly` |
| `get` | GET | `/v1beta/properties/{property}/keyEvents/{keyEvent}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1beta/properties/{property}/keyEvents` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1beta/properties/{property}/keyEvents/{keyEvent}` | `analytics.edit` |
| `delete` | DELETE | `/v1beta/properties/{property}/keyEvents/{keyEvent}` | `analytics.edit` |

