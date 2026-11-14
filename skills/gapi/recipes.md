# gapi recipes

Common business questions mapped to commands. A test dry-runs each one.

- Every command ends in `--dry-run`, so a test (`test/skill.test.ts`) runs it. Drop `--dry-run` to call the API.
- IDs here are placeholders (`123`, `1234567890`, `example.com`). Get real ones from [IDs](#ids).
- Projection = optional `jq` filter: pipe the live output into it.
- Dates: replace the sample dates with your period. GA4 also accepts `today`, `yesterday`, `NdaysAgo`.

## IDs

| ID | Form | Lookup command below | Projection |
|---|---|---|---|
| GA4 property | `properties/<id>` | 1 | `jq '.accountSummaries[].propertySummaries[] \| {property, displayName}'` |
| GSC site | `sc-domain:example.com` or `https://www.example.com/` | 2 | `jq '.siteEntry[] \| {siteUrl, permissionLevel}'` |
| GTM container | `accounts/<a>/containers/<c>` | 3, then 4 | `jq '.container[] \| {path, name, publicId}'` (4) |
| Ads customer | 10 digits, no hyphens | 5 | `jq -r '.resourceNames[] \| ltrimstr("customers/")'` |

```sh
gapi ga4-admin accountSummaries list --dry-run
gapi gsc sites list --dry-run
gapi gtm accounts list --dry-run
gapi gtm accounts containers list --params '{"parent":"accounts/123"}' --dry-run
gapi ads customers listAccessibleCustomers --dry-run
```

## GA4: this period vs the previous one

- Question: how did sessions and revenue change against the previous month?
- IDs: GA4 property.
- Two named `dateRanges` in one call. GA4 adds the `dateRange` dimension with each range's `name` ([Google](https://developers.google.com/analytics/devguides/reporting/data/v1/basics)).

```sh
gapi ga4-data properties runReport --params '{"property":"properties/123"}' --body '{"dateRanges":[{"startDate":"2026-10-01","endDate":"2026-10-31","name":"current"},{"startDate":"2026-09-01","endDate":"2026-09-30","name":"previous"}],"metrics":[{"name":"sessions"},{"name":"totalRevenue"}]}' --dry-run
```

Projection: `jq '.rows[] | {range: .dimensionValues[0].value, sessions: .metricValues[0].value, revenue: .metricValues[1].value}'`

## GA4: top pages

- Question: which pages get the most views?
- IDs: GA4 property.

```sh
gapi ga4-data properties runReport --params '{"property":"properties/123"}' --body '{"dateRanges":[{"startDate":"28daysAgo","endDate":"yesterday"}],"dimensions":[{"name":"pagePath"}],"metrics":[{"name":"screenPageViews"},{"name":"activeUsers"}],"orderBys":[{"metric":{"metricName":"screenPageViews"},"desc":true}],"limit":10}' --dry-run
```

Projection: `jq '.rows[] | {page: .dimensionValues[0].value, views: .metricValues[0].value, users: .metricValues[1].value}'`

## GA4: channel breakdown

- Question: which channels bring sessions, key events and revenue?
- IDs: GA4 property.

```sh
gapi ga4-data properties runReport --params '{"property":"properties/123"}' --body '{"dateRanges":[{"startDate":"28daysAgo","endDate":"yesterday"}],"dimensions":[{"name":"sessionDefaultChannelGroup"}],"metrics":[{"name":"sessions"},{"name":"keyEvents"},{"name":"totalRevenue"}],"orderBys":[{"metric":{"metricName":"sessions"},"desc":true}]}' --dry-run
```

Projection: `jq '.rows[] | {channel: .dimensionValues[0].value, sessions: .metricValues[0].value, keyEvents: .metricValues[1].value, revenue: .metricValues[2].value}'`

## GA4: organic landing pages

- Question: where do organic search sessions land?
- IDs: GA4 property.

```sh
gapi ga4-data properties runReport --params '{"property":"properties/123"}' --body '{"dateRanges":[{"startDate":"28daysAgo","endDate":"yesterday"}],"dimensions":[{"name":"landingPagePlusQueryString"}],"metrics":[{"name":"sessions"},{"name":"keyEvents"}],"dimensionFilter":{"filter":{"fieldName":"sessionDefaultChannelGroup","stringFilter":{"value":"Organic Search"}}},"orderBys":[{"metric":{"metricName":"sessions"},"desc":true}],"limit":20}' --dry-run
```

Projection: `jq '.rows[] | {page: .dimensionValues[0].value, sessions: .metricValues[0].value, keyEvents: .metricValues[1].value}'`

## GSC: low-CTR queries

- Question: which queries get impressions but few clicks?
- IDs: GSC site.
- Data lag: data is typically available after 2–3 days ([Google](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data)). End the range 3 days before today.
- The API has no metric filter; `jq` applies the thresholds.
- Rows come sorted by clicks. Low-CTR queries sit in the tail: raise `rowLimit` (max 25,000) to reach more of them.

```sh
gapi gsc searchanalytics query --params '{"siteUrl":"sc-domain:example.com"}' --body '{"startDate":"2026-10-01","endDate":"2026-10-28","dimensions":["query"],"rowLimit":1000}' --dry-run
```

Projection: `jq '.rows[] | select(.impressions >= 100 and .ctr < 0.02) | {query: .keys[0], impressions, clicks, ctr, position}'`

## GSC: URL inspection

- Question: is this page indexed, and which canonical does Google pick?
- IDs: GSC site; the URL must belong to it.
- Lag: the result shows the version in the Google index, from the last crawl (`lastCrawlTime`), not the live page. The API has no live test ([Google](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)).

```sh
gapi gsc urlInspection index inspect --body '{"inspectionUrl":"https://www.example.com/page","siteUrl":"sc-domain:example.com"}' --dry-run
```

Projection: `jq '.inspectionResult.indexStatusResult | {verdict, coverageState, lastCrawlTime, googleCanonical, userCanonical}'`

## GTM: tag audit

- Question: which tags are live, what type are they, and are any paused?
- IDs: GTM container.
- Reads the published (live) container version, not a workspace draft.

```sh
gapi gtm accounts containers versions live --params '{"parent":"accounts/123/containers/456"}' --dry-run
```

Projection: `jq '.tag[] | {name, type, paused, firingTriggerId}'`

## Ads: spend by campaign

- Question: what did each campaign spend in the last 30 days?
- IDs: Ads customer. Manager access: add `--login-customer-id <manager id>`.
- `cost_micros` is in the account currency; divide by 1,000,000. REST returns it as `costMicros`, an int64 string.

```sh
gapi ads +gaql "SELECT campaign.id, campaign.name, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_30_DAYS" --customer 1234567890 --stream --dry-run
```

Projection: `jq '.[] | {campaign: .campaign.name, cost: ((.metrics.costMicros // "0" | tonumber) / 1000000)}'`

## PageSpeed: performance score, trimmed

- Question: what is the mobile performance score and the field data of a page?
- IDs: none. PageSpeed uses the API key (`gapi auth setup`).
- `fields` trims the response (several MB in full) to the named paths.

```sh
gapi pagespeed pagespeedapi runpagespeed --params '{"url":"https://www.example.com/","strategy":"MOBILE","category":["PERFORMANCE"],"fields":"id,lighthouseResult/categories/performance/score,loadingExperience/metrics"}' --dry-run
```

Projection: `jq '{url: .id, score: .lighthouseResult.categories.performance.score, field: .loadingExperience.metrics}'`

## YouTube: all uploads of my channel

- Question: which videos did my channel upload?
- IDs: the uploads playlist id, from the first command.
- Quota: `playlistItems.list` and `channels.list` cost 1 unit per page from the 10,000-unit daily pool. `search.list` has its own bucket of 100 calls per day ([Google](https://developers.google.com/youtube/v3/determine_quota_cost)). The uploads playlist lists every upload without that bucket.
- `--page-all` stops at `--page-limit` pages (default 10, 50 items each). `--page-limit 100` reads up to 5,000 videos.

```sh
gapi youtube channels list --params '{"part":["contentDetails"],"mine":true}' --dry-run
gapi youtube playlistItems list --params '{"part":["snippet"],"playlistId":"UU0123456789abcdefghijkl","maxResults":50}' --page-all --page-limit 100 --dry-run
```

Projections: first command `jq -r '.items[0].contentDetails.relatedPlaylists.uploads'`; second (one JSON line per page) `jq -c '.items[] | {videoId: .snippet.resourceId.videoId, title: .snippet.title, publishedAt: .snippet.publishedAt}'`

## BigQuery: GA4 export

The GA4 daily export writes one table per day, `events_YYYYMMDD`, to the dataset `analytics_<property id>` ([Google](https://support.google.com/analytics/answer/7029846)).

- IDs: `my-project` = the Cloud project of the export dataset; `123` = the GA4 property id. `--project` is the job project.
- Date filter: `events_*` plus `_TABLE_SUFFIX BETWEEN "YYYYMMDD" AND "YYYYMMDD"` scans only those days. Bytes scanned = cost; select only the columns you need.
- SQL goes in single quotes: the shell then leaves the backticks alone. Use double quotes for SQL strings (GoogleSQL accepts both).
- `+query` runs a free dry run first: not `SELECT` → exit 3, estimate over `--max-bytes` (default 10 GiB) → exit 1. `--estimate` prints the estimate and runs nothing.
- Projection for every query: `jq -c '.rows[]'` (one JSON line per result page).

### Flattened events

- Question: which pages did each session view, day by day?
- `event_params` is a repeated record; a subquery per key pulls one value.

```sh
gapi bigquery +query 'SELECT event_date, event_name, (SELECT value.int_value FROM UNNEST(event_params) WHERE key = "ga_session_id") AS session_id, (SELECT value.string_value FROM UNNEST(event_params) WHERE key = "page_location") AS page_location FROM `my-project.analytics_123.events_*` WHERE _TABLE_SUFFIX BETWEEN "20261001" AND "20261031" AND event_name = "page_view" LIMIT 1000' --project my-project --dry-run
gapi bigquery +query 'SELECT event_name FROM `my-project.analytics_123.events_*` WHERE _TABLE_SUFFIX BETWEEN "20261001" AND "20261031"' --project my-project --estimate --dry-run
```

### Funnel

- Question: how many users viewed, added to cart, and bought?
- Users per step in the period, not in step order.

```sh
gapi bigquery +query 'SELECT COUNT(DISTINCT IF(event_name = "page_view", user_pseudo_id, NULL)) AS viewed, COUNT(DISTINCT IF(event_name = "add_to_cart", user_pseudo_id, NULL)) AS added, COUNT(DISTINCT IF(event_name = "purchase", user_pseudo_id, NULL)) AS purchased FROM `my-project.analytics_123.events_*` WHERE _TABLE_SUFFIX BETWEEN "20261001" AND "20261031" AND event_name IN ("page_view", "add_to_cart", "purchase")' --project my-project --dry-run
```

### Sessions by source

- Question: which source and medium bring sessions?
- One `session_start` event per session; source = last-click cross-channel attribution (`session_traffic_source_last_click`).

```sh
gapi bigquery +query 'SELECT session_traffic_source_last_click.cross_channel_campaign.source AS source, session_traffic_source_last_click.cross_channel_campaign.medium AS medium, COUNT(*) AS sessions FROM `my-project.analytics_123.events_*` WHERE _TABLE_SUFFIX BETWEEN "20261001" AND "20261031" AND event_name = "session_start" GROUP BY source, medium ORDER BY sessions DESC' --project my-project --dry-run
```

### Hashed user ids

- Question: which users are most active, without exposing their ids?
- `TO_HEX(SHA256(…))` hashes in SQL, so the raw `user_pseudo_id` never leaves BigQuery. Warehouse control: [column data masking](https://cloud.google.com/bigquery/docs/column-data-masking-intro).

```sh
gapi bigquery +query 'SELECT TO_HEX(SHA256(user_pseudo_id)) AS user_hash, COUNT(*) AS events FROM `my-project.analytics_123.events_*` WHERE _TABLE_SUFFIX BETWEEN "20261001" AND "20261031" GROUP BY user_hash ORDER BY events DESC LIMIT 100' --project my-project --dry-run
```
