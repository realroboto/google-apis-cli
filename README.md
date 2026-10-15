# google-apis-cli (`gapi`)

`gapi` is one CLI for Google Ads, GTM, GA4 (Admin + Data), Search Console, and Indexing.

- One login. One refresh token. All scopes. Read and write.
- One runtime dependency: `google-auth-library` (Google). Nothing third-party.
- All network calls use native `fetch`.
- TypeScript 7 (strict), Node 24. Node runs `.ts` directly (type-stripping) — no build step in dev. Biome for lint + format. pnpm 12 (corepack-pinned) for package management.
- It replaces the 4 fragmented Google MCPs in vmCODE.

Command shape: `gapi <api> <resource>… <method> [--params '<json>'] [--body '<json>'] [--upload <file> [--upload-content-type <type>] [--upload-protocol media|multipart|resumable]] [--output <file>] [--page-all [--page-limit <n>]] [--dry-run]`. `gapi <api> [<resource>…]` lists a level (the api level also lists helpers); `… <method> --help` shows method help. `gapi <api> +<helper> … [--dry-run] [--project <id>]` runs a hand command, e.g. `gapi ads +gaql "<query>" --customer <id> [--stream]`. `gapi schema <api> <resource>[.<sub>…].<method> | <SchemaName> [--resolve-refs]` prints a method shape or a schema as JSON. `gapi discovery refresh [<api>…]` refetches discovery documents now; `gapi discovery path` prints the cache dir.

## Install

```
npm i -g google-apis-cli    # installs the `gapi` bin
```

Needs **Node ≥ 24** — `gapi` ships as TypeScript and runs on Node's native type-stripping, so there is no build step and no bundle.

## Start here

```
gapi auth setup   # store your own OAuth Desktop client (id + secret), optional ids and API key
gapi auth login   # one consent for every scope the API entries use
gapi auth status  # account, refresh token, granted and missing scopes
```

First run, or a console step fails? **[docs/SETUP.md](docs/SETUP.md)** walks the five steps and
the traps in each. `gapi` is multi-tenant: every operator brings their own Cloud project.

## OAuth App Verification

`gapi` asks for sensitive scopes (`analytics.manage.users`, `tagmanager.manage.*`, `adwords`, `webmasters`).

- **Testing mode** (default) works for all commands, but the refresh token expires every ~7 days — re-run `gapi auth login` when it does.
- **Production** removes that expiry, but Google requires **OAuth App Verification** first: a privacy-policy URL, a homepage, and a reviewed consent screen. Review timeline is not guaranteed.

Testing mode is enough to use the CLI; Production is the no-expiry target. Until verification passes, stay in Testing and re-auth on the ~7-day cadence.

## Flow

A call moves through these parts in order.

| Part | File | Function |
|---|---|---|
| **run** | `src/run.ts` | `run(argv, io)`: strict argv parse, routing (`--help`, `auth`, `schema`, `discovery`, `<api> …`), `GapiError` → exit code. `bin/gapi.ts` passes process io. |
| **Catalog** | `src/catalog.ts` | API entries (`src/apis/*.ts`, glob, no registry) → `ApiModel`. Discovery entries: document cached 24 h. |
| **Planner** | `src/plan.ts` | `plan(model, words \| methodId, input, settings)` → `CallPlan`. Pure. Every `--params`/`--body` rule; validation fails exit 3 before network. |
| **Transport** | `src/transport.ts` | `send(plan, { fetch, authorize, out })`. `authorize` adds the credential per request; non-2xx → exit 1; 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT` → exit 2. `--page-all` follows `nextPageToken`: one JSON line per page, max `--page-limit` (default 10). `--upload` streams a file to `rootUrl` + `upload/` (media, multipart, or resumable in 8 MiB chunks); `--output` writes the `alt=media` body to a file. `--dry-run` prints the plan instead. |
| **Renderers** | `src/render.ts` | Root help, level listing, method help, `schemaView` (`$ref` expansion, cycle guard). |
| **Credentials** | `src/credentials.ts` | Only reader and writer of `config.json` and `credentials.json` (mode 600) in the config dir (`GAPI_CONFIG_DIR` or `~/.config/gapi`). `settings`: `--project`, `--api-key` and entry header flags, each flag → env → config. `authorize`: OAuth Bearer (refreshed token saved) or `X-Goog-Api-Key`. `login`, `status` (with `missing`), `logout`, `setup`. |

CLI tests call `run` in-process (`test/run.test.ts`, `test/helpers/io.ts`). Terms: [GLOSSARY.md](GLOSSARY.md).

## Where to look

| For | Read |
|---|---|
| Onboarding a Google account: consent, Ads access level, customer IDs, runtime errors | **[docs/SETUP.md](docs/SETUP.md)** |
| What the CLI does, decisions, scopes, endpoints, risks | **[docs/SPEC.md](docs/SPEC.md)** — behavior source of truth |
| How work is tracked (issues, blocking edges) | [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) |
| Triage labels | [docs/agents/triage-labels.md](docs/agents/triage-labels.md) |
| Domain vocabulary (GLOSSARY.md, ADRs) | [docs/agents/domain.md](docs/agents/domain.md) |
| Real commands and scripts | `package.json`, `gapi --help` |

## Add an API or a resource

- New API = one new `src/apis/<api>.ts` file that default-exports an API entry (`satisfies ApiEntry`): the discovery URL plus overlays (`retired`, `deprecated`, `paid`, `headers`, `helpers`). The discovery document gives every resource and method. The glob finds the file; `api` must equal the file name, or the Catalog fails to load. No shared file changes.
- Accept rule — `pnpm discovery:check` exits 0. It fails when an overlay names a method id that is not in the document.
- Test through `run(argv, io)`: fixture entries via `io.apisDir`, cache seeded in a temp `GAPI_CONFIG_DIR`, fake `fetch` (`test/helpers/fetch.ts`). `--dry-run` shows the request. Use no real network.
- Before commit: `pnpm typecheck` (tsc --noEmit) · `pnpm lint` (biome) · `pnpm test`.
- Fix lint by fixing the code it flags — never `biome --unsafe`, never disable a rule to clear it.

## Agent skills

| Topic | Rule | Detail |
|---|---|---|
| Issue tracker | GitHub issues via `gh` | [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) |
| Triage labels | 5 canonical labels (string == role) | [docs/agents/triage-labels.md](docs/agents/triage-labels.md) |
| Domain docs | Single-context (`GLOSSARY.md` + `docs/adr/`) | [docs/agents/domain.md](docs/agents/domain.md) |
