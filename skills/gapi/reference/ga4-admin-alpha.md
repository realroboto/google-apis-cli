# gapi `ga4-admin-alpha` — full command reference

Base `https://analyticsadmin.googleapis.com`. Live source of truth: `gapi ga4-admin-alpha` / `gapi ga4-admin-alpha <resource>`.
Call: `gapi ga4-admin-alpha <resource> <verb> [path-arg ...] [--body '<json>'] [--limit N] [--json|--raw]`.
Positionals fill the `{param}` tokens left-to-right. ⬦ = needs `--body`.

## access-bindings

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1alpha/properties/{property}/accessBindings` | `analytics.manage.users` |
| `get` | GET | `/v1alpha/properties/{property}/accessBindings/{accessBinding}` | `analytics.manage.users` |
| `batch-get` | GET | `/v1alpha/properties/{property}/accessBindings:batchGet` | `analytics.manage.users` |
| `create` ⬦ | POST | `/v1alpha/properties/{property}/accessBindings` | `analytics.manage.users` |
| `patch` ⬦ | PATCH | `/v1alpha/properties/{property}/accessBindings/{accessBinding}` | `analytics.manage.users` |
| `delete` | DELETE | `/v1alpha/properties/{property}/accessBindings/{accessBinding}` | `analytics.manage.users` |
| `batch-create` ⬦ | POST | `/v1alpha/properties/{property}/accessBindings:batchCreate` | `analytics.manage.users` |
| `batch-update` ⬦ | POST | `/v1alpha/properties/{property}/accessBindings:batchUpdate` | `analytics.manage.users` |
| `batch-delete` ⬦ | POST | `/v1alpha/properties/{property}/accessBindings:batchDelete` | `analytics.manage.users` |

## account-access-bindings

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1alpha/accounts/{account}/accessBindings` | `analytics.manage.users` |
| `get` | GET | `/v1alpha/accounts/{account}/accessBindings/{accessBinding}` | `analytics.manage.users` |
| `batch-get` | GET | `/v1alpha/accounts/{account}/accessBindings:batchGet` | `analytics.manage.users` |
| `create` ⬦ | POST | `/v1alpha/accounts/{account}/accessBindings` | `analytics.manage.users` |
| `patch` ⬦ | PATCH | `/v1alpha/accounts/{account}/accessBindings/{accessBinding}` | `analytics.manage.users` |
| `delete` | DELETE | `/v1alpha/accounts/{account}/accessBindings/{accessBinding}` | `analytics.manage.users` |
| `batch-create` ⬦ | POST | `/v1alpha/accounts/{account}/accessBindings:batchCreate` | `analytics.manage.users` |
| `batch-update` ⬦ | POST | `/v1alpha/accounts/{account}/accessBindings:batchUpdate` | `analytics.manage.users` |
| `batch-delete` ⬦ | POST | `/v1alpha/accounts/{account}/accessBindings:batchDelete` | `analytics.manage.users` |

## audiences

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1alpha/properties/{property}/audiences` | `analytics.readonly` |
| `get` | GET | `/v1alpha/properties/{property}/audiences/{audience}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1alpha/properties/{property}/audiences` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1alpha/properties/{property}/audiences/{audience}` | `analytics.edit` |
| `archive` ⬦ | POST | `/v1alpha/properties/{property}/audiences/{audience}:archive` | `analytics.edit` |

## calculated-metrics

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1alpha/properties/{property}/calculatedMetrics` | `analytics.readonly` |
| `get` | GET | `/v1alpha/properties/{property}/calculatedMetrics/{calculatedMetric}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1alpha/properties/{property}/calculatedMetrics` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1alpha/properties/{property}/calculatedMetrics/{calculatedMetric}` | `analytics.edit` |
| `delete` | DELETE | `/v1alpha/properties/{property}/calculatedMetrics/{calculatedMetric}` | `analytics.edit` |

## channel-groups

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1alpha/properties/{property}/channelGroups` | `analytics.readonly` |
| `get` | GET | `/v1alpha/properties/{property}/channelGroups/{channelGroup}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1alpha/properties/{property}/channelGroups` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1alpha/properties/{property}/channelGroups/{channelGroup}` | `analytics.edit` |
| `delete` | DELETE | `/v1alpha/properties/{property}/channelGroups/{channelGroup}` | `analytics.edit` |

## rollup-properties

| verb | method | path | scope |
|---|---|---|---|
| `create` ⬦ | POST | `/v1alpha/properties:createRollupProperty` | `analytics.edit` |

## subproperties

| verb | method | path | scope |
|---|---|---|---|
| `provision` ⬦ | POST | `/v1alpha/properties:provisionSubproperty` | `analytics.edit` |

## rollup-property-source-links

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1alpha/properties/{property}/rollupPropertySourceLinks` | `analytics.readonly` |
| `get` | GET | `/v1alpha/properties/{property}/rollupPropertySourceLinks/{rollupPropertySourceLink}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1alpha/properties/{property}/rollupPropertySourceLinks` | `analytics.edit` |
| `delete` | DELETE | `/v1alpha/properties/{property}/rollupPropertySourceLinks/{rollupPropertySourceLink}` | `analytics.edit` |

## subproperty-event-filters

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1alpha/properties/{property}/subpropertyEventFilters` | `analytics.readonly` |
| `get` | GET | `/v1alpha/properties/{property}/subpropertyEventFilters/{subpropertyEventFilter}` | `analytics.readonly` |
| `create` ⬦ | POST | `/v1alpha/properties/{property}/subpropertyEventFilters` | `analytics.edit` |
| `patch` ⬦ | PATCH | `/v1alpha/properties/{property}/subpropertyEventFilters/{subpropertyEventFilter}` | `analytics.edit` |
| `delete` | DELETE | `/v1alpha/properties/{property}/subpropertyEventFilters/{subpropertyEventFilter}` | `analytics.edit` |

## subproperty-sync-configs

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/v1alpha/properties/{property}/subpropertySyncConfigs` | `analytics.readonly` |
| `get` | GET | `/v1alpha/properties/{property}/subpropertySyncConfigs/{subpropertySyncConfig}` | `analytics.readonly` |
| `patch` ⬦ | PATCH | `/v1alpha/properties/{property}/subpropertySyncConfigs/{subpropertySyncConfig}` | `analytics.edit` |

