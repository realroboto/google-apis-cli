# Entities store

Status: accepted (2026-11-14, epic #200 D6, ticket #211).

Agents need IDs (GA4 property, Search Console site, Ads customer) before most calls. Each lookup today is one or more list calls per session. `gapi entities sync` stores the operator's own accounts, properties and sites once; `gapi entities find <words…>` resolves a name, part of an ID or a domain offline.

## Rules

- Owner: Entities (`src/entities.ts`). Only reader and writer of `<config dir>/entities.db`. SQL, FTS5 table, transactions and file modes stay inside.
- File: mode 600, created before SQLite opens it, in the config dir (mode 700). Schema version in `PRAGMA user_version`; another version, or a file that is not a database, is dropped. The next `sync` rebuilds it. A lock by another `gapi` process waits up to 5 s and never drops the file; a failed sweep warns and the next run retries.
- Sources: API entry overlay `entities` (entity source overlay). A source names a list method id, its params, body and headers from the parent entity, the mapping of one response page to rows, and child sources per entity kind. `api` names another entry whose document has the method (Business Profile: accounts from Account Management, locations from Business Information); its settings apply. An unknown method id is a Catalog problem (another entry's method: `foreignSourceProblems`) and fails `pnpm discovery:check`.
- Rows of one kind and ID within an API merge; later defined fields win. A customer seen as accessible and as a client is one row (#212).
- Source in `sync` status, exit and transaction terms = one API entry with all its `entities` sources: one status line, one transaction, one failure unit.
- Sync: one list call per top-level source, then one per parent entity of a child source; each list is read up to `--page-limit` pages (default 10). Call count on stderr before the first call. Each API's rows are replaced in one transaction after all its calls succeed. A failed API keeps its old rows; exit 1.
- Find: trigram FTS5 over ID, name, parent and domain; each whitespace term is one quoted FTS5 string (any substring of 3+ characters), terms joined by OR, best 20 by bm25. A shorter term → exit 3. Output: one tab-separated line per hit (API, kind, ID, name, parent, domain, sync date).
- Domain key: URL host, lower case, no leading `www.`; `sc-domain:` prefix stripped. No public-suffix parsing.
- No implicit ID: `find` prints IDs; no command reads the index to fill a parameter. `gapi` writes data, so an implicit ID could change the wrong account.

## Account isolation and age

- Each row holds `identity(auth)` from Credentials (refresh-token hash, as ADR 0001). `find` reads only the current identity's rows. No stored refresh token → `sync` exits 2 before any call.
- `gapi auth login` and `gapi auth logout` delete the file, next to `responses/`.
- Every run deletes rows older than 7 days (`MAX_AGE_MS`, ADR 0001): one age rule for all account data on disk. ADR 0001 Terms evidence is the basis (operator-owned content; YouTube authorized-data deletion).
- Limit: the note checks the whole identity (or the `--api` filter), not each API. One API swept while another stays gives no note; `find --api <api>` shows it.
- Empty index for the identity (never synced, swept, another account) → stderr note: run `gapi entities sync`.

## Excluded

- Places content is never a source: Places terms forbid storage beyond `place_id` (ADR 0001).
- Embeddings for entities: trigram and bm25 cover names and IDs (epic #200 Out of Scope).

## Considered options

- Search's match builder (`src/search.ts`): rejected for `find`. It splits `sc-domain:acme.com` into `sc`, `domain`, `acme`, `com`, so a term under 3 characters appears inside a valid ID. A quoted FTS5 string per term keeps IDs whole and lets no FTS5 syntax through.
- Status of a stale index older than 7 days: the sweep deletes such rows, so "stale" reads as "empty".
