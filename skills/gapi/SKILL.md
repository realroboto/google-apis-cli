---
name: gapi
description: Call Google marketing and data APIs through the gapi CLI. Use for GAQL reports, GA4 reporting/admin, Search Console analytics and URL inspection, GTM publish, Indexing, Merchant, Business Profile, SA360, CM360, DV360, YouTube uploads/analytics, PageSpeed/CrUX, BigQuery queries and Data Transfer, Sheets, Places, Web Risk, Cloud Quotas free-tier guards — any method of the 49 discovery-driven entries. One OAuth login, read+write.
---

# gapi (`gapi`)

One CLI over Google's discovery documents. Every resource and method of every API entry is a command, named exactly as Google names it. One OAuth consent grants the scopes of every entry; one refresh token drives every call.

Business questions (GA4, GSC, GTM, Ads, PageSpeed, YouTube) mapped to dry-run-tested commands: [recipes.md](recipes.md).

## Setup

One-time, per operator — each brings their own Cloud project and Google account:

```sh
gapi auth setup    # OAuth Desktop client id + secret, optional login-customer ids and API key (stored 0600); piped stdin: one answer per line
gapi auth login    # one consent screen → every scope the API entries use; writes the refresh token
gapi auth status   # account, refresh token and API key presence, granted scopes, missing scopes
gapi auth logout   # revoke the refresh token, then delete stored credentials and --cache responses (config.json stays)
```

Headless box (no browser)? `gapi auth login --manual` prints the URL; after consent, paste the full URL the browser was redirected to (`http://127.0.0.1:4600/?…`, which does not load). `gapi auth status` shows `missing` after an upgrade adds an API: run `gapi auth login` again. Console steps (services to enable, API key, Ads access level, Business Profile access, Merchant registration) and their traps: [docs/SETUP.md](https://github.com/realroboto/google-apis-cli/blob/main/docs/SETUP.md). In **Testing** mode the refresh token expires ~7 days.

## Grammar

```sh
gapi <api> <resource> [<sub-resource>…] <method> [--params '<json>'] [--body '<json>'] [--cache <age>] [--dry-run]
gapi search <words…>                         # find methods by intent across every API entry (max 20 lines)
gapi fields ads|sa360|ga4-data <words…>      # find GAQL / GA4 field names (max 20 lines; see Fields)
gapi <api> [<resource>…]                     # list sub-resources and methods at that level
gapi <api> <resource>… <method> --help       # method help: HTTP method, URL, params, body schema, scopes, marks, docs link
```

- Words after `<api>` are the discovery `resources` path, then the method key, verbatim casing: `analyticsadmin.properties.dataStreams.list` → `gapi ga4-admin properties dataStreams list`.
- Unknown word → exit 3 with the valid words. `gapi --help` lists every API. `gapi search --help`, `gapi fields --help`, `gapi schema --help`, `gapi discovery --help`, `gapi auth [<sub>] --help` print that command's usage (exit 0) and run nothing.
- Output: stdout is compact JSON, one line per response, when it is not a terminal (pipe, agent); a terminal gets a 2-space indent.

```sh
gapi ga4-admin properties dataStreams list --params '{"parent":"properties/123"}'
```

## `--params` and `--body`

- `--params` = one JSON object with every path and query parameter, Google's names. Also accepts `fields` and `quotaUser`.
- Path values use the full resource name (`properties/123`, `accounts/1/containers/2`), also on GA4: a bare `123` → exit 3. Value checked against the discovery `pattern` before any network call.
- `gsc` `siteUrl`: Domain property `sc-domain:example.com` (no `https://`); URL-prefix property `https://www.example.com/` (trailing slash kept) ([Google](https://developers.google.com/webmaster-tools/v1/sites/get)).
- Repeated parameter → JSON array. Enum value outside the enum → exit 3.
- Unknown name or missing required parameter → exit 3. Help shows `required (per description)` when only the description says "Required."; gapi does not enforce those (Google's 400 names them).
- `--body` = request body JSON. Rejected (exit 3) on methods without a request body.
- A number above 2^53 in `--params` or `--body` → exit 3 (JSON would round it). Pass int64 ids as strings: `{"profileId":"12345678901234567890"}`.

```sh
gapi ga4-admin properties list --params '{"filter":"parent:accounts/123"}'
gapi ga4-admin properties patch --params '{"name":"properties/123","updateMask":"displayName"}' --body '{"displayName":"Shop"}' --dry-run
gapi gsc searchanalytics query --params '{"siteUrl":"https://example.com/"}' --body '{"startDate":"2026-09-01","endDate":"2026-09-30","dimensions":["query"]}'
```

## `schema`

Request and response shape, before you build a body:

```sh
gapi schema ga4-admin properties.dataStreams.get              # method: params, request/response schema names, scopes
gapi schema ga4-admin GoogleAnalyticsAdminV1betaDataStream --resolve-refs   # one schema, every $ref expanded
gapi schema ads GoogleAdsGoogleadsV26Services__MutateCampaignsRequest --find budget   # only the matching field paths
# operations[].update.campaignBudget: string — The resource name of the campaign budget of the campaign.
# operations[].create.campaignBudget: string — The resource name of the campaign budget of the campaign.
```

`--find <word>` expands every `$ref` and prints one line per leaf field whose path or printed description contains the word (case-insensitive): `path: <type>[ enum] — <first sentence, max 100 chars>`. An array or map item without its own description shows the field's. Paths: `a.b` for properties, `a[]` for array items, `a{}` for map values. On a method path it searches the request (`request.…`) and the response (`response.…`). A `$ref` the cycle guard stops prints `path: $ref <Name>` and matches on its path only. `--resolve-refs` adds nothing. `--find ''` → exit 3. No match → `gapi: no match` on stderr, exit 0: retry with another word.

A `$ref` already on the expansion path stays `{"$ref":"<name>"}`, sibling keys such as `description` kept (cycle guard).

`--resolve-refs` re-expands every shared schema at each use: on large Ads schemas the output explodes (`GoogleAdsGoogleadsV26Services__GoogleAdsRow` ≈ 18 MB, vs ≈ 34 KB unresolved). Use `--find <word>` for the field you need, or read the unresolved view, then `gapi schema <api> <Name>` for the one `$ref` you need.

## `--dry-run`

Prints `{ method, url, headers, body }` (plus `upload`, `output` or `parts`) and exits 0. No auth, no API request (may fetch the discovery document when the cache is missing or stale). Credentials print as `<redacted>`. Check every write with it first — some calls spend money.

Dry-run proves the request shape only: it does not check `required (per description)` params, and it prints unavailable methods that exit 2 live.

## Paging

Default: one request, response printed as JSON (form: Output rule above) (`nextPageToken` included).

```sh
gapi gtm accounts list --page-all --page-limit 5
```

`--page-all` follows `nextPageToken`: one JSON value per page (NDJSON off a terminal), at most `--page-limit` pages (default 10; needs `--page-all`). Only on methods with a `pageToken` query parameter, or a `pageToken` request field whose response has `nextPageToken` (Ads/SA360 `search`, Places `searchText`, Merchant `reports.search`, …): there each page re-sends the same `--body` with `pageToken` set. Else exit 3. For every Ads row in one response, `+gaql --stream`: a list of rows, or `{results, summaryRow}` when the query sets `SUMMARY_ROW_SETTING`.

## Media

```sh
gapi youtube videos insert --params '{"part":["snippet","status"]}' --body '{"snippet":{"title":"Demo"},"status":{"privacyStatus":"private"}}' --upload video.mp4 --upload-protocol resumable --dry-run
gapi cm360 files get --params '{"reportId":"1","fileId":"2"}' --output report.csv --dry-run
```

- `--upload <file>` on methods with media upload. `--upload-protocol media|multipart|resumable` (default `multipart` with `--body`, else `media`; `resumable` only where Google offers it, 8 MiB chunks). `--upload-content-type` default from the file extension, else `application/octet-stream`.
- `--output <file>` on methods with media download: adds `alt=media` (and the `download/` path prefix where Google sets `useMediaDownloadService`), writes the body to the file, prints `{"path","bytes"}`.
- `--page-all`, `--upload` and `--output` do not combine.

## `--cache`

```sh
gapi gsc sites list --cache 1h
gapi ga4-admin properties list --params '{"filter":"parent:accounts/1"}' --page-all --cache 1d
gapi ads +gaql "SELECT campaign.id, campaign.name FROM campaign" --customer 1234567890 --cache 1h
```

`--cache <age>` returns a stored response younger than `<age>` instead of calling Google, so a repeated identical read costs no quota. Off unless you pass it, per call.

- `<age>` = `<n>s`, `<n>m`, `<n>h` or `<n>d`, from 1s to 7d. Else exit 3.
- Qualifies: `GET` methods and these POST reads, one request or `--page-all`, on method calls and helpers:
  - `ads`: `customers googleAds search`, `customers googleAds searchStream` (so `+gaql`, also `--stream`), `googleAdsFields search`
  - `gsc`: `searchanalytics query`, `urlInspection index inspect`
  - `ga4-data`: `properties` `runReport`, `runPivotReport`, `batchRunReports`, `batchRunPivotReports`, `runRealtimeReport`, `checkCompatibility`
  - `ga4-data-alpha`: `properties` `runReport`, `runFunnelReport`
  - `sa360`: `customers searchAds360 search`, `searchAds360Fields search`
  - `merchant-reports`: `accounts reports search`
- Other writes (POST, PUT, PATCH, DELETE), `--upload`, `--output` and batch helpers (`+publishBatch`) exit 3: they always reach Google.
- Never: `places` (terms forbid caching), `web-risk` (results expire at `expireTime`), `crux` and `pagespeed` (Google-owned content; Google APIs Terms §5). Exit 3 with the reason and the source.
- Hit: same stdout as the live call (also every NDJSON line), plus `gapi: cached response from <ISO time>` on stderr. No API request. `--dry-run --cache <age>` adds `"cache": "hit"` or `"cache": "miss"`.
- A failed call stores nothing. Entries are per Google account. `gapi auth login` and `gapi auth logout` delete all stored responses; entries older than 7 days are deleted.
- `--cache` means the operator permits caching of this content (Google APIs Terms §5: content owner's permission). Content shared with you but owned by others: cache it only when that owner allows it.

## Helpers

Hand commands carry a `+` prefix; `gapi <api>` lists them.

```sh
gapi ads +gaql "SELECT campaign.id, campaign.name FROM campaign" --customer 1234567890 --dry-run
gapi ads +gaql "SELECT campaign.id FROM campaign" --customer 1234567890 --stream --dry-run
gapi indexing +publishBatch urls.txt --dry-run
gapi bigquery +query 'SELECT 1 AS n' --project my-project --dry-run
```

- `+gaql`: `--customer` = account id, 10 digits, no hyphens. Without `--stream`: first `search` page as returned. With `--stream`: `searchStream`, every row in one `results` array; a chunk with an `error` key → exit 1 with that chunk.
- `+publishBatch <file>`: lines `URL_UPDATED <url>` or `URL_DELETED <url>` (blank and `#` lines skipped); 100 per batch call; prints `[{ url, type, status, body }]`; exit 1 if any part fails.
- `+query "<sql>" [--max-bytes <n>] [--estimate] [--page-limit <n>]`: one read-only GoogleSQL statement; job project = `--project`, `GOOGLE_CLOUD_PROJECT` or config `project` (none → exit 3). A free dry run runs first: statement not `SELECT` → exit 3 (use `jobs insert`); estimate over the budget (default 10 GiB) → exit 1; nothing runs. The query carries the budget as `maximumBytesBilled`: over it, BigQuery fails it without charge → exit 1. Waits for the job, then prints one line per result page (max `--page-limit`, default 10): `{ rows, totalRows, totalBytesProcessed, cacheHit }`. Rows are objects by column name: INT64, NUMERIC, BIGNUMERIC as strings; TIMESTAMP as ISO 8601; RECORD as object; REPEATED as array. `--estimate` prints `{ statementType, totalBytesProcessed }` only. `--cache` → exit 3. GA4 export SQL: [recipes](recipes.md#bigquery-ga4-export).

## Entities

Find an ID offline instead of listing accounts again.

```sh
gapi entities sync                     # every API with entity sources (list below)
gapi entities sync gsc --page-limit 2  # one API; each list max 2 pages
gapi entities find acme.com            # name, part of an ID, or domain
gapi entities find 3456 --api ga4-admin
```

- `find` line: `<api>\t<kind>\t<id>\t<name>\t<parent>\t<domain>\t<sync date>`, best 20. Paste `<id>` (e.g. `properties/123456`, `sc-domain:acme.com`) into the next call.
- Kinds per API (domain from):
  - `ga4-admin`: `account`, `property`, `stream` (web stream default URI).
  - `gsc`: `site` (site URL).
  - `gtm`: `account`, `container` (domain names; name holds the `GTM-…` public ID).
  - `ads`: `customer`, 10 digits; a client's parent is its manager (`--login-customer-id`).
  - `merchant-accounts`: `account` (store homepage).
  - `youtube`: `channel` (own channels; name holds the `@handle`).
  - `business-information`: `account`, `location` (website).
  - `bigquery`: `project`, `dataset` as `project.dataset`; a GA4 export dataset `analytics_<id>` has parent `properties/<id>`.
- Domain = URL host, lower case, no `www.`; one host links the APIs. `shop.acme.com` does not match `acme.com` as a domain (no public-suffix parsing), only as a substring.
- Each term: 3+ characters, any substring; terms are OR'ed. Shorter → exit 3. No hit → exit 0, `gapi: no match`.
- Empty index (never synced, rows older than 7 days, another account): stderr says run `gapi entities sync`.
- `sync`: call count on stderr first, then one `<api>: <n> entities` line per API. A failed API keeps its old rows; exit 1.
- `find` never picks an ID for you: check the hit belongs to the account you mean before a write.
- Login and logout delete the index.

## Fields

Find a GAQL or GA4 field name before you write a query.

```sh
gapi fields ads cost per conversion          # GAQL names, offline from the discovery document
gapi fields sa360 clicks
gapi fields ga4-data channel group --property 123456   # one getMetadata request, custom fields too
```

- Line: `<name>  <kind>  <first sentence>`, best 20. Kinds: `ads`/`sa360` `attribute` (`<resource>.<field>`), `metric` (`metrics.`), `segment` (`segments.`); `ga4-data` `dimension`, `metric`.
- GAQL names follow the discovery shape: nested messages expand (`campaign.network_settings.target_google_search`), arrays stay one field. Discovery has no compatibility (`selectable_with`): check it with `gapi ads googleAdsFields search` or `gapi sa360 searchAds360Fields search`.
- `--property`: `123456` or `properties/123456`; `0` = fields common to all properties (no custom ones). Required on `ga4-data`, rejected elsewhere.
- Words rank like `gapi search` (camelCase and `_` split, OR, bm25); GA4 UI names and deprecated API names rank too. A field whose last name part equals the words comes first (`date` → `segments.date`). No hit → exit 0, `gapi: no match`.
- Other API, no word, or `--cache` → exit 3.

## Auth and headers

- `--login-customer-id <id>` (manager account) only on `ads` and `sa360`; elsewhere exit 3. Env `GOOGLE_ADS_LOGIN_CUSTOMER_ID` / `SA360_LOGIN_CUSTOMER_ID`.
- `crux` and `pagespeed` use an API key, not OAuth: `--api-key`, `GAPI_API_KEY`, or `gapi auth setup`. `crux` needs it.
- `--project <id>` (or `GOOGLE_CLOUD_PROJECT`) sends `x-goog-user-project` with OAuth calls.

```sh
gapi crux records queryRecord --body '{"origin":"https://example.com"}' --dry-run
gapi sa360 customers searchAds360 search --params '{"customerId":"1234567890"}' --body '{"query":"SELECT campaign.id FROM campaign"}' --login-customer-id 1111111111 --dry-run
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | Google API returned non-2xx after retries, a network failure (`network: <cause>`), or a response gapi cannot read (2xx body not JSON, upload or batch protocol reply, `searchStream` chunk with `error`); body on stderr. GET, HEAD, PUT, DELETE and `reads` POSTs retry 408, 429, 5xx and network errors up to 3 times (backoff 1 s × 2ⁿ + jitter, max 32 s, `Retry-After` as floor); other writes never retry |
| 2 | auth: no credentials, token expired or revoked, missing scope, missing API key, unavailable method |
| 3 | validation: unknown command or param, missing or empty required, pattern, integer or boolean value, `.`/`..` path segment, bad JSON, flag not valid for the method or given twice, request flag on a listing, unwritable `--output` dir, retired method |
| 4 | discovery document fetch failed and no usable cache (`gapi discovery refresh <api>` retries) |
| 5 | internal, or a stdout/stderr write error other than EPIPE (output lost) |

Errors print `gapi: <message>` to stderr. `missing scope (…); run gapi auth login` (exit 2) → run `gapi auth login`.

Common errors (full table: [docs/SETUP.md runtime errors](https://github.com/realroboto/google-apis-cli/blob/main/docs/SETUP.md#runtime-errors)):

| Symptom | Cause | Fix |
|---|---|---|
| `token expired or revoked` (exit 2) after about a week | Testing refresh token expired (`invalid_grant`) | `gapi auth login`, or publish the app |
| `403 SERVICE_DISABLED` | API not enabled on the Cloud project | enable it (SETUP step 1; Business Profile: step 3) |
| `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` | Ads access level is Test | apply for Ads access (SETUP step 2) |

## Marks

Help and the reference mark methods. A call to a deprecated method prints one stderr warning.

- **Retired** (exit 3 before any network call):
  - `gsc urlTestingTools mobileFriendlyTest run` — retired by Google in December 2023 ([source](https://developers.google.com/search/blog/2017/01/introducing-mobile-friendly-test-api): "As of December 2023, the Mobile-Friendly Test and API have been retired.").
  - `business-v4`: `accounts locations reportInsights`, `accounts locations localPosts reportInsights`, `accounts locations insuranceNetworks list`, `accounts locations getHealthProviderAttributes`, `accounts locations updateHealthProviderAttributes`, every `accounts locations questions …` and `… questions answers …` method.
- **Unavailable** (exit 2; `--dry-run` works): the 6 `dv360 users` methods `create`, `patch`, `list`, `get`, `delete`, `bulkEditAssignedUserRoles`. Their only scope, `display-video-user-management`, is not grantable to this app.
- **Paid** (call goes through; check cost first):
  - `places places` `autocomplete`, `get`, `searchNearby`, `searchText`, `photos getMedia` — free monthly caps, then billed.
  - `web-risk hashes search` — paid only. `web-risk projects submissions create` — closed to new customers.
- **Deprecated**: e.g. GTM `accounts containers combine`, `accounts containers move_tag_id`, `accounts containers destinations link|get`; `business-v4` account and admin methods.

## Places field mask

Places `get`, `searchNearby` and `searchText` need a response field mask, else the API errors. Pass it as `fields`:

```sh
gapi places places searchText --params '{"fields":"places.displayName,places.formattedAddress"}' --body '{"textQuery":"pizza in Lisbon"}' --dry-run
```

Search paths start with `places.`; `get` paths do not.

## Data notes

- GA4 `sessions` counts sessions, not unique users ([Google](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)).
- GSC `position` is an impression-weighted average of the topmost position ([Google](https://support.google.com/webmasters/answer/7042828)).
- GSC data arrives 2–3 days late ([Google](https://support.google.com/webmasters/answer/96568)).
- Indexing `urlNotifications publish` only notifies Google. It does not index the page: a 200 means Google "may try to recrawl this URL soon" ([Google](https://developers.google.com/search/apis/indexing-api/v3/using-api)).

## Google Ads v26 notes

`ads` follows API v26. Changes from v25 that break old queries and bodies ([release notes](https://developers.google.com/google-ads/api/docs/release-notes), v26 2026-10-14):

- `ConversionTrackingSetting.enhanced_conversions_for_leads_enabled` removed → read `ConversionTrackingSetting.enablement_setting`.
- `AdGroupBidModifier` hotel fields → `user_set_dates`, `advance_booking_window`, `length_of_booking` (`min_days`/`max_days`), `start_day_of_week`, `start_date_range`.
- `HotelDateSelectionType` → `DateSelectionType`.
- Local Services Performance Max: `country_code` and `listing_id` required on create.
- New Search Lift segments (`segments.search_lift_keyword_bundle`, `segments.search_property`) and metrics.
- No developer token: Google sunset them on 2026-09-09; gapi never sends the header.
- 9 methods sit under the resource named `v26` (`gapi ads v26 listPlannableLocations`); the next version renames it.

## Command reference

Find a command with `gapi search <words…>` first: it costs a few hundred tokens, a reference file costs thousands. Then `… <method> --help` for the params and body.

```sh
gapi search "search analytics query"
# gapi gsc searchanalytics query  POST  Query your data with filters and parameters that you define.
```

- One line per hit, best first, max 20: command, marks (`deprecated`, `retired`, `paid`, `unavailable`), HTTP method, first sentence of the description (max 100 chars).
- Words match command words split at camelCase (`conversion actions` → `conversionActions`), stems (`reports` → `report`), the API name and title, request/response schema names, and `upload`/`download`. A hit needs only some of the words; more matching words rank higher.
- Quotes, `*`, `-` are plain text. No letter or digit in the query → exit 3. No hit → `gapi: no match` on stderr, exit 0: retry with other words.
- Search loads every discovery document through the 24 h cache; a warm cache makes no network call.

`gapi --help`, `gapi <api>` and `… <method> --help` are the live source of truth. The generated reference adds one file per API: resource tree, command, HTTP method, one-line description, required params, body schema, marks.

- API index (title, version, method count, auth): [`reference/index.md`](reference/index.md)
- One file per API: `reference/<api>.md`, e.g. [`reference/ads.md`](reference/ads.md), [`reference/ga4-admin.md`](reference/ga4-admin.md), [`reference/gtm.md`](reference/gtm.md)

## Discovery cache

Documents cache 24 h under the config dir (`GAPI_CONFIG_DIR` or `~/.config/gapi`). `gapi discovery refresh [<api>…]` refetches now; `gapi discovery path` prints the cache dir. A failed refetch (network error, non-2xx, or a download that is not a `discovery#restDescription` document) falls back to a usable cached copy with a stderr warning; with none it exits 4 (`gapi discovery refresh <api>` retries). A cache file that is not a `discovery#restDescription` JSON document is refetched.
