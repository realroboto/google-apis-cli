---
name: gapi
description: Call Google marketing and data APIs through the gapi CLI. Use for GAQL reports, GA4 reporting/admin, Search Console analytics and URL inspection, GTM publish, Indexing, Merchant, Business Profile, SA360, CM360, DV360, YouTube uploads/analytics, PageSpeed/CrUX, BigQuery Data Transfer, Sheets, Places, Web Risk — any method of the 47 discovery-driven entries. One OAuth login, read+write.
---

# gapi (`gapi`)

One CLI over Google's discovery documents. Every resource and method of every API entry is a command, named exactly as Google names it. One OAuth consent grants the scopes of every entry; one refresh token drives every call.

## Setup

One-time, per operator — each brings their own Cloud project and Google account:

```sh
gapi auth setup    # OAuth Desktop client id + secret, optional login-customer ids and API key (stored 0600)
gapi auth login    # one consent screen → every scope the API entries use; writes the refresh token
gapi auth status   # account, refresh token and API key presence, granted scopes, missing scopes
gapi auth logout   # delete stored credentials (config.json stays)
```

Headless box (no browser)? `gapi auth login --manual` prints the URL and reads the pasted code. `gapi auth status` shows `missing` after an upgrade adds an API: run `gapi auth login` again. Console steps (services to enable, API key, Ads access level, Business Profile access) and their traps: [docs/SETUP.md](https://github.com/realroboto/google-apis-cli/blob/main/docs/SETUP.md). In **Testing** mode the refresh token expires ~7 days.

## Grammar

```sh
gapi <api> <resource> [<sub-resource>…] <method> [--params '<json>'] [--body '<json>'] [--dry-run]
gapi <api> [<resource>…]                     # list sub-resources and methods at that level
gapi <api> <resource>… <method> --help       # method help: HTTP method, URL, params, body schema, scopes, marks, docs link
```

- Words after `<api>` are the discovery `resources` path, then the method key, verbatim casing: `analyticsadmin.properties.dataStreams.list` → `gapi ga4-admin properties dataStreams list`.
- Unknown word → exit 3 with the valid words. `gapi --help` lists every API.

```sh
gapi ga4-admin properties dataStreams list --params '{"parent":"properties/123"}'
```

## `--params` and `--body`

- `--params` = one JSON object with every path and query parameter, Google's names. Also accepts `fields` and `quotaUser`.
- Path values use the full resource name (`properties/123`, `accounts/1/containers/2`). Value checked against the discovery `pattern` before any network call.
- Repeated parameter → JSON array. Enum value outside the enum → exit 3.
- Unknown name or missing required parameter → exit 3. Help shows `required (per description)` when only the description says "Required."; gapi does not enforce those (Google's 400 names them).
- `--body` = request body JSON. Rejected (exit 3) on methods without a request body.

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
```

A `$ref` already on the expansion path stays `{"$ref":"<name>"}` (cycle guard).

## `--dry-run`

Prints `{ method, url, headers, body }` (plus `upload`, `output` or `parts`) and exits 0. No auth, no network. Credentials print as `<redacted>`. Check every write with it first — some calls spend money.

Dry-run proves the request shape only: it does not check `required (per description)` params, and it prints unavailable methods that exit 2 live.

## Paging

Default: one request, response printed as pretty JSON (`nextPageToken` included).

```sh
gapi gtm accounts list --page-all --page-limit 5
```

`--page-all` follows `nextPageToken`: one compact JSON line per page (NDJSON), at most `--page-limit` pages (default 10; needs `--page-all`). Only on methods with a `pageToken` query parameter, else exit 3. Ads `googleAds.search` pages in the body: use `+gaql --stream` for every row.

## Media

```sh
gapi youtube videos insert --params '{"part":["snippet","status"]}' --body '{"snippet":{"title":"Demo"},"status":{"privacyStatus":"private"}}' --upload video.mp4 --upload-protocol resumable --dry-run
gapi cm360 files get --params '{"reportId":"1","fileId":"2"}' --output report.csv --dry-run
```

- `--upload <file>` on methods with media upload. `--upload-protocol media|multipart|resumable` (default `multipart` with `--body`, else `media`; `resumable` only where Google offers it, 8 MiB chunks). `--upload-content-type` default from the file extension, else `application/octet-stream`.
- `--output <file>` on methods with media download: adds `alt=media`, writes the body to the file, prints `{"path","bytes"}`.
- `--page-all`, `--upload` and `--output` do not combine.

## Helpers

Hand commands carry a `+` prefix; `gapi <api>` lists them.

```sh
gapi ads +gaql "SELECT campaign.id, campaign.name FROM campaign" --customer 1234567890 --dry-run
gapi ads +gaql "SELECT campaign.id FROM campaign" --customer 1234567890 --stream --dry-run
gapi indexing +publishBatch urls.txt --dry-run
```

- `+gaql`: `--customer` = account id, 10 digits, no hyphens. Without `--stream`: first `search` page as returned. With `--stream`: `searchStream`, every row in one `results` array.
- `+publishBatch <file>`: lines `URL_UPDATED <url>` or `URL_DELETED <url>` (blank and `#` lines skipped); 100 per batch call; prints `[{ url, type, status, body }]`; exit 1 if any part fails.

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
| 1 | Google API returned non-2xx (body on stderr) |
| 2 | auth: no credentials, token expired or revoked, missing scope, missing API key, unavailable method |
| 3 | validation: unknown command or param, missing required, pattern, bad JSON, flag not valid for the method, retired method |
| 4 | discovery document fetch failed and no cache |
| 5 | internal |

Errors print `gapi: <message>` to stderr. `missing scope (…); run gapi auth login` (exit 2) → run `gapi auth login`.

## Marks

Help and the reference mark methods. A call to a deprecated method prints one stderr warning.

- **Retired** (exit 3 before any network call):
  - `gsc urlTestingTools mobileFriendlyTest run` — retired by Google in December 2023.
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

## Google Ads v26 notes

`ads` follows API v26. Changes from v25 that break old queries and bodies:

- `ConversionTrackingSetting.enhanced_conversions_for_leads_enabled` removed → read `ConversionTrackingSetting.enablement_setting`.
- `AdGroupBidModifier` hotel fields → `user_set_dates`, `advance_booking_window`, `length_of_booking` (`min_days`/`max_days`), `start_day_of_week`, `start_date_range`.
- `HotelDateSelectionType` → `DateSelectionType`.
- Local Services Performance Max: `country_code` and `listing_id` required on create.
- New Search Lift segments (`segments.search_lift_keyword_bundle`, `segments.search_property`) and metrics.
- 9 methods sit under the resource named `v26` (`gapi ads v26 listPlannableLocations`); the next version renames it.

## Command reference

`gapi --help`, `gapi <api>` and `… <method> --help` are the live source of truth. The generated reference adds one file per API: resource tree, command, HTTP method, one-line description, required params, body schema, marks.

- API index (title, version, method count, auth): [`reference/index.md`](reference/index.md)
- One file per API: `reference/<api>.md`, e.g. [`reference/ads.md`](reference/ads.md), [`reference/ga4-admin.md`](reference/ga4-admin.md), [`reference/gtm.md`](reference/gtm.md)

## Discovery cache

Documents cache 24 h under the config dir (`GAPI_CONFIG_DIR` or `~/.config/gapi`). `gapi discovery refresh [<api>…]` refetches now; `gapi discovery path` prints the cache dir. A failed refetch falls back to the stale copy with a stderr warning.
