# Changelog

Newest first. One section per npm version.

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
- Retry of 408/429/5xx and network errors on GET/HEAD/PUT/DELETE and `reads` POSTs: max 3, backoff with jitter (#195).
- Resumable upload resumes from the session `Range`; prints session URI on final failure (#195).

### Fixed (#195)

- Cache key includes helper decode: raw `searchStream` and `+gaql --stream` no longer share an entry.
- Response files older than 7 days are deleted on every run.
- `auth login` and `auth logout` delete stored responses, also when revoke fails.
- Refreshed refresh token is saved; `credentials.json` is written atomically.
- `auth login` warns on scopes not granted; exit 2 when Google returns no refresh token.
- `auth logout` keeps credentials on network or unexpected status errors (exit 1).
- `gapi search` splits camelCase in the query (`conversionActions`).
- 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT` inside an array error body exits 2.
- stdout EPIPE exits 0; other stream errors exit 5.
- `ads` stream concat keeps `summaryRow`.

### Deps and build

- google-auth-library 11.3.3, Biome 2.6.5, @types/node 26, pnpm 12.16.1 (#181).
- CI runs `pnpm build`.
- Publish runs from GitHub Actions on tag push, npm trusted publishing with provenance (#196).

### Docs

- Skill: Search Console siteUrl forms, GA4 full-name rule, common errors, data notes, developer token sunset (#193).
- Skill reference regenerated; runbook publish path (#177); glossary search term (#190).
