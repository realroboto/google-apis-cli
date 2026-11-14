# Changelog

Newest first. One section per npm version.

## Unreleased

### Added

- `cloudquotas` entry: every Cloud Quotas v1 method (28); scope `cloud-platform`, already in the consent set, so no re-login (#210). SETUP step 9 (free-tier guards: project without billing, daily quotas, $1 budget alert) and recipes that set and list the BigQuery `QueryUsagePerDay` quota.
- `gapi bigquery +query "<sql>"`: one read-only SQL query under a byte budget (default 10 GiB, `--max-bytes`). A free dry run refuses a non-`SELECT` statement (exit 3) or an estimate over the budget (exit 1) before any job; rows print as plain JSON objects, one line per page; `--estimate` prints the estimate only. GA4 export recipes in `skills/gapi/recipes.md` (#209).
- `bigquery` entry: every BigQuery v2 method (47), scope `bigquery` (#208). **Re-login required:** run `gapi auth login` once; until then `gapi auth status` lists `bigquery` as missing and BigQuery calls exit 2.
- `gapi entities sync` and `gapi entities find <words…>`: an offline index of GA4 accounts, properties, web streams and Search Console sites, per Google account, deleted on login and logout and after 7 days (#211, ADR 0002). Also GTM accounts and containers, Ads customers, Merchant accounts, YouTube channels, Business Profile accounts and locations, BigQuery projects and datasets; one domain links them across APIs (#212).
- Skill recipes (`skills/gapi/recipes.md`): GA4, GSC, GTM, Ads, PageSpeed and YouTube business questions mapped to commands; a test dry-runs every SKILL.md and recipes example (#206).

### Changed

- Output: compact JSON on stdout when it is not a terminal (pipes, agents); a terminal keeps the 2-space indent. Applies to responses, `--dry-run`, `auth status` and `--cache` hits (#205).
- Stack: pnpm 12.18.0, Biome 2.6.7, `google-auth-library` 11.3.4. Dependabot opens weekly PRs for npm and GitHub Actions: minor and patch in one group, each major alone (#204).

## 0.3.0 — 2026-11-05

Since 0.2.0 (`e12a482..a916775`).

### Breaking

- Node >= 26 required; Node 24 and 25 dropped (#181).
- Stricter input, exit 3 before any network call (#195): flag given twice; request flags on a level listing; `[]` for a param; wrong integer or boolean type; `pattern` checked on every param (patterns JS can compile); path value `.` or `..` (also `%2e`).

### Added

- `--cache <age>` (1s–7d): opt-in response cache for GET reads, [ADR 0001](docs/adr/0001-response-cache.md) (#187).
- `nocache` overlay on places, web-risk, crux, pagespeed (#187).
- `reads` overlay: POST reports and searches accept `--cache` (ads, gsc, ga4-data, ga4-data-alpha, sa360, merchant-reports) (#192).
- `gapi search <words…>`: method search across all entries, best 20 (#189).
- `gapi schema … --find <word>`: prints only matching field paths (#191).
- Retry of 408/429/5xx, 403 rate limit and network errors on GET/HEAD/PUT/DELETE and `reads` POSTs: max 3, backoff with jitter (#195).
- Resumable upload resumes from the session `Range`; prints session URI on final failure (#195).

### Fixed (#195)

- Cache key includes helper decode: raw `searchStream` and `+gaql --stream` no longer share an entry.
- Response files older than 7 days are deleted on every run.
- `auth login` and `auth logout` delete stored responses, also when revoke fails.
- Refreshed refresh token is saved; `credentials.json` is written atomically.
- `auth login` warns on scopes not granted; exit 2 when Google returns no refresh token.
- `auth logout` keeps credentials on network or unexpected status errors (exit 1).
- `gapi search` splits camelCase in the query (`conversionActions`).
- 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT` inside an array error body or a batch part exits 2.
- stdout EPIPE exits 0; other stream errors exit 5.
- `ads` stream concat keeps `summaryRow`.
- `+publishBatch` posts to the document `batchPath`, not a fixed `batch`.
- `--output` to an unwritable directory exits 3 before the request.
- `auth login` checks `state` before the code exchange; a mismatched redirect gets 400 and login keeps waiting.
- Read-only discovery cache directory warns instead of failing; future cache mtime counts as stale.
- API entry name must match `[a-z0-9-]+`.
- `gapi auth` without subcommand prints usage, exit 3.
- `gapi schema <word>` error names the schema option ("or a schema name").

### Deps and build

- google-auth-library 11.3.3, Biome 2.6.5, @types/node 26, pnpm 12.16.1 (#181).
- CI runs `pnpm build`.
- Publish runs from GitHub Actions on tag push, npm trusted publishing with provenance (#196).

### Docs

- Skill: Search Console siteUrl forms, GA4 full-name rule, common errors, data notes, developer token sunset (#193).
- Skill reference regenerated; runbook publish path (#177); glossary search term (#190).
