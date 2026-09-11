---
name: gapi
description: Google Ads, GTM, GA4 Admin+Data, Search Console, Indexing via the gapi CLI — one OAuth login, all scopes, read+write. Run GAQL reports, GA4 reporting/admin, GSC analytics, URL inspection, GTM publish.
---

# gapi (`gapi`)

One CLI over five Google surfaces. One OAuth consent grants all 13 scopes; one refresh token drives every call. Each API is a data manifest, so **one pattern covers the whole tree** — learn it once here, then reach the per-API command list only when you run that API.

## Setup

One-time, per operator — each brings their own Cloud project and Google account:

```sh
gapi auth setup    # paste your OAuth Desktop client id + secret (stored 0600)
gapi auth login    # one consent screen → all 13 scopes; writes the refresh token
gapi auth status   # account email, refresh token presence, granted scopes
gapi auth logout   # wipe stored credentials
```

Headless box (no browser)? `gapi auth login --manual` prints the URL and reads the pasted code. Credentials live in `~/.config/gapi/`. Console steps (enable APIs, Ads access level, OAuth client) and their traps: [docs/SETUP.md](https://github.com/realroboto/google-apis-cli/blob/main/docs/SETUP.md). In **Testing** mode the refresh token expires ~7 days; **Production** needs OAuth App Verification (see the README).

## The one pattern

```sh
gapi <api> <resource> <verb> [positional ...] [--body '<json>'] [--limit N] [--json|--raw]
```

- **Positionals fill path params in order** — the `{name}` tokens in the path, then any query params.
  `gapi ga4-admin properties get properties/123`
- **Write verbs take `--body '<json>'`** — parsed as JSON, sent as the request body.
  `gapi gsc sites add '--body={"siteUrl":"https://x.com/"}'`
- `--limit N` caps paginated results; otherwise `nextPageToken` pages are followed automatically.
- **Output is JSON-first**: the unwrapped, decoded payload, ready to pipe into `jq`. `--raw` emits the full API envelope instead.
- Errors print `gapi: <message>` (plus the API error body) to stderr, exit 1.

**Ads is the one exception** — reads go through GAQL, `--customer <id>` required:

```sh
gapi ads gaql search "SELECT campaign.id, campaign.name FROM campaign" --customer 1234567890
gapi ads gaql searchStream "<query>" --customer 1234567890 --stream
```

`--login-customer-id <id>` sets the manager header for MCC access. Ads alone sends `login-customer-id`.

## Command reference — one file per API

`gapi --help` (whole tree) and `gapi <api>` (one API) are the **live source of truth**. The files below add what `--help` omits: HTTP method, full path with `{param}` names, per-verb scope, and which verbs need `--body`.

- **Ads** — GAQL search/searchStream + per-resource mutate → [`reference/ads.md`](reference/ads.md)
- **GA4 Admin** (v1beta) — accounts, properties, data-streams, key/conversion events, custom dimensions/metrics, links → [`reference/ga4-admin.md`](reference/ga4-admin.md)
- **GA4 Admin** (v1alpha) — access-bindings, audiences, calculated-metrics, channel-groups, sub/rollup properties → [`reference/ga4-admin-alpha.md`](reference/ga4-admin-alpha.md)
- **GA4 Data** — reports (run/pivot/realtime/batch/compatibility), audience-exports, metadata → [`reference/ga4-data.md`](reference/ga4-data.md)
- **Search Console** — sites, sitemaps, searchanalytics, url-inspection, mobile-friendly-test → [`reference/gsc.md`](reference/gsc.md)
- **Tag Manager** — accounts→containers→workspaces→tags/triggers/variables/…/versions:publish → [`reference/gtm.md`](reference/gtm.md)
- **Indexing** — url-notifications publish / get-metadata → [`reference/indexing.md`](reference/indexing.md)

## Quota project

Some APIs bill a quota project. Set it per call with `--project <id>`, or via the `GOOGLE_CLOUD_PROJECT` env / stored config. Sent as the `x-goog-user-project` header.
