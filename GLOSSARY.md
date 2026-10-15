# Glossary

Terms of the call path (epic #30, D13). One line each.

- **API entry** — `src/apis/<api>.ts`: default-exports the CLI name, its discovery document URL and the overlays (retired, deprecated, paid, headers, helpers) for one API.
- **discovery document** — Google's machine-readable JSON description of one API version (resources, methods, parameters, schemas, scopes), fetched from its discovery URL and cached.
- **Catalog** — `src/catalog.ts`: finds the API entries, loads and caches their discovery documents, and normalizes each into an ApiModel.
- **ApiModel** — one API as the CLI sees it: the resource tree, method index, per-method scopes and auth kind, overlays applied, and schemas.
- **Planner** — `src/plan.ts`: pure `plan(model, target, input, settings)` that applies every parameter rule and returns a CallPlan or throws a validation error (exit 3).
- **CallPlan** — the request to send, as data: method id, HTTP method, URL, non-secret headers, body, auth kind and scopes, send mode, decoder, warnings; `--dry-run` prints it.
- **Transport** — `src/transport.ts`: `send(plan, …)` authorizes and performs a CallPlan (single call, paging, upload, download, batch) and classifies HTTP errors.
- **Credentials** — `src/credentials.ts`: the only reader and writer of `config.json` and `credentials.json`; resolves settings, authorizes requests (Bearer or API key) and runs login.
- **helper** — a `+name` command an API entry adds (e.g. `ads +gaql`) that builds its CallPlan through the Planner by method id.
- **run** — `src/run.ts`: `run(argv, io)` parses argv, routes the command, and maps a `GapiError` to its exit code and `gapi: …` on stderr; the bin only passes it the real process io.
