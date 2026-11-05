# Glossary

Terms of the call path (epic #30, D13). One line each.

- **API entry** — `src/apis/<api>.ts`: default-exports the CLI name, its discovery document URL and the overlays (retired, deprecated, paid, reads, nocache, headers, helpers) for one API.
- **discovery document** — Google's machine-readable JSON description of one API version (resources, methods, parameters, schemas, scopes), fetched from its discovery URL and cached.
- **Catalog** — `src/catalog.ts`: finds the API entries, loads and caches their discovery documents, and normalizes each into an ApiModel.
- **ApiModel** — one API as the CLI sees it: the resource tree, method index, per-method scopes and auth kind, overlays applied, and schemas.
- **Planner** — `src/plan.ts`: pure `plan(model, target, input, settings)` that applies every parameter rule and returns a CallPlan or throws a validation error (exit 3).
- **CallPlan** — the request to send, as data: method id, HTTP method, URL, non-secret headers, body, auth kind and scopes, send mode, optional `decode`, warnings; `--dry-run` prints it.
- **Transport** — `src/transport.ts` + `src/transport/{upload,download,batch}.ts`: `send(plan, …)` authorizes and performs a CallPlan (single call, paging, upload, download, batch) and classifies HTTP errors.
- **Credentials** — `src/credentials.ts`: the only reader and writer of `config.json` and `credentials.json`; resolves settings, authorizes requests (Bearer or API key) and runs login.
- **Search** — `src/search.ts`: `gapi search <words…>`; ranks the methods of every ApiModel against the words with an in-memory SQLite FTS5 index built per call, best 20 first.
- **response cache** — `src/responses.ts`: opt-in store of read responses under `<config dir>/responses/`, used only on a call with `--cache <age>` (ADR 0001); keyed per Google account; login and logout delete it.
- **read overlay** — API entry field `reads: [<method id>…]`: POST methods that only read (GAQL `search`, GA4 `runReport`, GSC `searchanalytics query`); `--cache` accepts them like a `GET`.
- **nocache overlay** — API entry field `nocache: { reason, source }`: the API's terms forbid or bound caching, so `--cache` on it exits 3.
- **helper** — a `+name` command an API entry adds (e.g. `ads +gaql`) that builds its CallPlan through the Planner by method id.
- **Google source order** — the order that decides gapi behavior when Google sources disagree: product docs and AIPs, then the discovery document, then Google's official client libraries and `gcloud`.
- **run** — `src/run.ts`: `run(argv, io)` parses argv, routes the command, and maps a `GapiError` to its exit code and `gapi: …` on stderr; the bin only passes it the real process io.
