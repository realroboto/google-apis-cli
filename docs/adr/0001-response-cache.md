# Opt-in response cache for reads

Status: accepted (2026-11-05, epic #182, ticket #185). Supersedes `docs/SPEC.md` Out of Scope "Cache local de respostas / camada offline".

Agents repeat identical reads (a new session lists accounts again, a report re-runs after a context reset), and Google counts every repeat against small free quotas. `gapi` therefore gets an opt-in read cache: `--cache <age>` on a call returns a stored response younger than `<age>` instead of calling Google. Only the caller turns it on, per call. Nothing is cached without the flag.

## Rules

- Age: `<n>s|m|h|d`, from 1 s to 7 d. Any other value → exit 3 before any network call.
- Eligibility, checked in this order before any network call (exit 3 on failure):
  1. API entry has no `nocache` overlay. Message names the reason and the source.
  2. Send mode is one request or `--page-all` pages. Uploads, downloads (`--output`) and batches (`+publishBatch`) never qualify.
  3. Method is `GET`. POST methods that only read become eligible through a per-entry `reads` overlay (follow-up ticket #186).
- `nocache` entries: `places`, `web-risk`, `crux`, `pagespeed` (Terms below).
- Key: sha256 of identity, HTTP method, URL (every query value), non-secret headers (`login-customer-id`, quota project), body, send mode, page limit. Two different requests never share an entry.
- Store: `<config dir>/responses/`, dir mode 700, one file per key mode 600, temp file + rename. Each write deletes files older than 7 days.
- Hit: prints the stored text exactly (also every NDJSON line of `--page-all`), then `gapi: cached response from <ISO time>` on stderr. No authorize, no fetch. `--dry-run` adds `"cache": "hit" | "miss"`.
- Miss: stores the printed output only after a successful send. A non-2xx, an error chunk or a failure during paging stores nothing. A failed store write warns on stderr; exit stays 0.

## Account isolation

- Identity in the key: sha256 of the stored refresh token (OAuth), or `apiKey` (API-key auth; only `crux` and `pagespeed` use it, and both are `nocache`). Credentials computes it and stays the only reader of `credentials.json`.
- Another Google account, or a replaced `credentials.json`, never reads the other account's entries. No stored token → no entry matches, because entries are stored only after an authorized success.
- `gapi auth login` deletes `responses/` before the consent. `gapi auth logout` deletes it after the revoke, also when the revoke fails. The key already isolates accounts; the clear keeps account data off disk.
- Limit: the identity assumes Google does not rotate the refresh token on refresh. If it does, every lookup misses. No data leaks.

## Quota evidence (Google docs, read 2026-11-05)

- YouTube: "100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints"; "All API requests, including invalid requests, incur a quota cost of at least one point." https://developers.google.com/youtube/v3/determine_quota_cost
- Search Console: URL Inspection "2000 QPD", "600 QPM" per site; Search Analytics "1,200 QPM" per site; "Avoid requerying the same data". https://developers.google.com/webmaster-tools/limits
- Google Ads: Explorer "2,880 operations / day for production accounts", Basic "15,000 operations / day"; "A `Search` or `SearchStream` request counts as one operation." https://developers.google.com/google-ads/api/docs/access-levels, https://developers.google.com/google-ads/api/docs/best-practices/quotas
- GA4 Data: 200,000 tokens/property/day, 40,000/hour, 10 concurrent (standard). https://developers.google.com/analytics/devguides/reporting/data/v1/quotas
- Tag Manager: "10,000 requests per project per day", "0.25 queries per second". https://developers.google.com/tag-platform/tag-manager/api/v2/limits-quotas
- Bid Manager: "2,000 requests per project per day". https://developers.google.com/bid-manager/quotas
- Business Profile: "Cache static data". https://developers.google.com/my-business/content/limits

## Terms evidence (read 2026-11-05)

- Google APIs Terms §5: "Unless expressly permitted by the content owner or by applicable law, you will not … keep cached copies longer than permitted by the cache header". https://developers.google.com/terms
  - Reading: the operator owns their Ads, GA4, Search Console, Tag Manager, Merchant, Business Profile, SA360, CM360, DV360, YouTube channel and Postmaster data. `--cache` is the content owner's express, per-call permission.
  - CrUX and PageSpeed return Google-owned content → `nocache`.
- Places: "You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions, although the `place_id` is exempt from caching restrictions." → `nocache`. https://developers.google.com/maps/documentation/places/web-service/policies
- Web Risk: "Clients of the Lookup API should cache each returned `ThreatUrl` item until the the time defined in the `expireTime` field." A fixed age ignores `expireTime` → `nocache`. https://cloud.google.com/web-risk/docs/caching
- YouTube: Non-Authorized Data may be stored "but not longer than 30 calendar days"; Authorized Data must be deleted "within 7 calendar days of the revocation". The 7-day max age and the clear on logout meet both. https://developers.google.com/youtube/terms/developer-policies

## Accepted limits

- Content shared with the operator but owned by others (a shared spreadsheet, an agency property) is cached only when the operator asks with `--cache`. The skill says `--cache` means "I permit caching of this content".
- In Testing mode the refresh token expires every 7 days; the weekly re-login clears the cache.

## Considered options

- Honor `Cache-Control` headers: rejected. Entries whose content the operator does not own are `nocache` instead.
- `gapi cache list|clear` commands: out of scope. Login and logout clear; entries older than 7 days go on each write.
