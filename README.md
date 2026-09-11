# google-apis-cli (`gapi`)

`gapi` is one CLI for Google Ads, GTM, GA4 (Admin + Data), Search Console, and Indexing.

- One login. One refresh token. All scopes. Read and write.
- One runtime dependency: `google-auth-library` (Google). Nothing third-party.
- All network calls use native `fetch`.
- TypeScript 7 (strict), Node 24. Node runs `.ts` directly (type-stripping) — no build step in dev. Biome for lint + format.
- It replaces the 4 fragmented Google MCPs in vmCODE.

Command shape: `gapi <api> <resource> <verb> [--json|--raw]`

## Flow

The project has 3 parts. A call moves through them in order.

| Part | File | Function |
|---|---|---|
| **auth** | `src/auth.ts` | `gapi auth login` gets one OAuth consent. It stores the refresh token in `~/.config/gapi/credentials.json` (mode 600). `getAccessToken()` refreshes the access token. Only part with real handlers. |
| **manifest** | `src/apis/*.ts` | Each API is data, not code: `resource → verb → { httpMethod, pathTemplate, scopes, requiredHeaders?, decoder? }`. One file per surface. A glob finds them. No central registry. Row/seam types live in `src/types.ts`. |
| **executor seam** | `src/rest.ts` | `execute(manifestRow, params, { tokenProvider, fetch })` builds the URL, adds headers, follows pagination, applies the `decoder`, and formats `--json`/`--raw`. All network calls pass here. It is the one test seam. |

`bin/gapi.ts` parses argv. The dispatch, `--help`, and URL resolution all come from the manifests.

## Where to look

| For | Read |
|---|---|
| What the CLI does, decisions, scopes, endpoints, risks | **[docs/SPEC.md](docs/SPEC.md)** — behavior source of truth |
| How work is tracked (issues, blocking edges) | [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) |
| Triage labels | [docs/agents/triage-labels.md](docs/agents/triage-labels.md) |
| Domain vocabulary (CONTEXT.md, ADRs) | [docs/agents/domain.md](docs/agents/domain.md) |
| Real commands and scripts | `package.json`, `gapi --help` |

## Add an API or a resource

- New resource = one manifest row.
- New API = one new `src/apis/<api>.ts` file (default-export `satisfies Manifest`). The glob finds it. No shared file changes.
- Accept rule — **coverage-oracle**: the self-check fails if the manifest does not cover 100% of the discovery-doc resources.
- Test through the executor seam. Inject a fake `tokenProvider` and `fetch`. Use no real network.
- Before commit: `npm run typecheck` (tsc --noEmit) · `npm run lint` (biome) · `npm test`.

## Agent skills

| Topic | Rule | Detail |
|---|---|---|
| Issue tracker | GitHub issues via `gh` | [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) |
| Triage labels | 5 canonical labels (string == role) | [docs/agents/triage-labels.md](docs/agents/triage-labels.md) |
| Domain docs | Single-context (`CONTEXT.md` + `docs/adr/`) | [docs/agents/domain.md](docs/agents/domain.md) |
