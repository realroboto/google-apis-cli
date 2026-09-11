---
name: gapi
description: Google Ads, GTM, GA4 (Admin + Data), Search Console, and Indexing via the `gapi` CLI — one login, all scopes, read and write. GAQL reports, GA4 reporting + admin, GSC search analytics + URL inspection, GTM containers/tags/publish, indexing push. Read before running `gapi`.
---

# gapi (`gapi`)

One CLI over five Google surfaces. One OAuth consent grants all 13 scopes; one refresh token drives every call. Each API is a data manifest, so one pattern covers the whole tree.

## Setup

One-time, per operator — each brings their own Cloud project and Google account:

```sh
gapi auth setup    # paste your OAuth Desktop client id + secret (stored 0600)
gapi auth login    # one consent screen → all 13 scopes; writes the refresh token
gapi auth status   # account email, refresh token presence, granted scopes
gapi auth logout   # wipe stored credentials
```

Headless box (no browser)? `gapi auth login --manual` prints the URL and reads the pasted code.

Credentials live in `~/.config/gapi/`. The console steps (enable APIs, Ads access level, OAuth client) and their traps are in [docs/SETUP.md](../../docs/SETUP.md). In **Testing** mode the refresh token expires ~7 days; **Production** needs OAuth App Verification (see the README).

## Call any command

```sh
gapi <api> <resource> <verb> [positional ...] [--body '<json>'] [--limit N] [--json|--raw]
```

- `gapi --help` prints the whole tree; `gapi <api>` prints one API's resources + verbs.
- **Positionals fill path params in order** (the `{name}` tokens), then any query params.
  `gapi ga4-admin properties get properties/123`
- **Write/body verbs** take `--body '<json>'` (parsed as JSON, sent as the request body).
  `gapi gsc sites add '--body={"siteUrl":"https://x.com/"}'` — or pass the path arg the verb names.
- `--limit N` caps paginated results; pagination (`nextPageToken`) is followed automatically otherwise.
- **Output is JSON-first**: the unwrapped, decoded payload, ready to pipe into `jq`. `--raw` emits the full API envelope instead.
- Errors print `gapi: <message>` (plus the API error body) to stderr, exit 1.

### Ads is special (GAQL)

Ads reads go through GAQL, not generic dispatch:

```sh
gapi ads gaql search "SELECT campaign.id, campaign.name FROM campaign" --customer 1234567890
gapi ads gaql searchStream "<query>" --customer 1234567890 --stream
gapi ads campaigns mutate --customer 1234567890 '--body={...operations...}'
```

`--customer <id>` is required (fills the path). `--login-customer-id <id>` sets the manager header for MCC access. Ads is the only API that sends `login-customer-id`.

## Surface

`gapi --help` is the source of truth. Summary:

| API | Key | Resources |
|---|---|---|
| **Google Ads** | `ads` | `gaql` (search/searchStream), per-resource `mutate` (campaigns, ad-groups, ad-group-ads, campaign-budgets, campaign-criteria, ad-group-criteria), `customers list-accessible` |
| **GA4 Admin** (v1beta) | `ga4-admin` | accounts, properties, data-streams, key-events, conversion-events, custom-dimensions/-metrics, firebase-/google-ads-links, measurement-protocol-secrets, account-summaries |
| **GA4 Admin** (v1alpha) | `ga4-admin-alpha` | access-bindings (+account-), audiences, calculated-metrics, channel-groups, rollup-properties, subproperties, subproperty-event-filters/-sync-configs |
| **GA4 Data** | `ga4-data` | reports (run/run-pivot/run-realtime/batch-run/check-compatibility), audience-exports, metadata |
| **Search Console** | `gsc` | sites, sitemaps, searchanalytics query, url-inspection, url-testing-tools |
| **Tag Manager** | `gtm` | accounts, containers, workspaces, tags, triggers, variables, folders, clients, templates, environments, versions (incl. `publish`), user-permissions, and more |
| **Indexing** | `indexing` | url-notifications publish / get-metadata |

## Quota project

Some APIs bill a quota project. Set it per call with `--project <id>`, or via the `GOOGLE_CLOUD_PROJECT` env / stored config. Sent as the `x-goog-user-project` header.
