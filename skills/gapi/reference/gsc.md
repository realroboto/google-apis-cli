# gapi `gsc` — full command reference

Base `https://searchconsole.googleapis.com`. Live source of truth: `gapi gsc` / `gapi gsc <resource>`.
Call: `gapi gsc <resource> <verb> [path-arg ...] [--body '<json>'] [--limit N] [--json|--raw]`.
Positionals fill the `{param}` tokens left-to-right. ⬦ = needs `--body`.
All verbs use scope `webmasters`.

## sites

| verb | method | path |
|---|---|---|
| `list` | GET | `/webmasters/v3/sites` |
| `get` | GET | `/webmasters/v3/sites/{siteUrl}` |
| `add` ⬦ | PUT | `/webmasters/v3/sites/{siteUrl}` |
| `delete` | DELETE | `/webmasters/v3/sites/{siteUrl}` |

## sitemaps

| verb | method | path |
|---|---|---|
| `list` | GET | `/webmasters/v3/sites/{siteUrl}/sitemaps` |
| `get` | GET | `/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}` |
| `submit` ⬦ | PUT | `/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}` |
| `delete` | DELETE | `/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}` |

## searchanalytics

| verb | method | path |
|---|---|---|
| `query` ⬦ | POST | `/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` |

## url-inspection

| verb | method | path |
|---|---|---|
| `inspect` ⬦ | POST | `/v1/urlInspection/index:inspect` |

## url-testing-tools

| verb | method | path |
|---|---|---|
| `mobile-friendly-test` ⬦ | POST | `/v1/urlTestingTools/mobileFriendlyTest:run` |

