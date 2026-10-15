# Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-10-15] Live checks on write methods (upload, set) can overwrite real data**
   Do instead: use a nonexistent id (`0`, `AAAAAAAAAAA`); the request still proves the protocol up to Google's resource check
   [google-apis-cli]

2. **[2026-10-15] Live checks: run `gapi auth status` first; `missing: []` + `hasApiKey: true` rule out scope/key causes**
   Do instead: `node bin/gapi.ts auth status` before any live read; re-run `gapi auth login` if token expired (~7 days, Testing mode)
   [google-apis-cli]

## Domain Behavior Guardrails
1. **[2026-10-15] `indexing urlNotifications getMetadata` exits 1 with 404 `NOT_FOUND` for a URL never published**
   Do instead: treat as Google result, not gapi bug; only 403 (ownership/scope) or `SERVICE_DISABLED` signals setup failure
   [google-apis-cli]

2. **[2026-10-15] Merchant API: 401 `GCP_NOT_REGISTERED` until Cloud project registered**
   Do instead: register per `docs/SETUP.md` step 8; no Merchant account → record 401, probe lists with `parent: accounts/0`
   [google-apis-cli]

3. **[2026-10-15] `bid-manager` 401 `Invalid credential, cannot get profile` = login has no DV360/CM360 profile, not a bad token**
   Do instead: confirm the token on another entry; record as Google access error, exit 1
   [google-apis-cli]

## Shell & Command Reliability
1. **[2026-10-15] `CLAUDE.md` is a symlink to `README.md`; `sed -i` on it replaces the link with a copy**
   Do instead: edit `README.md` only; `git ls-files -s CLAUDE.md` must show mode 120000
   [google-apis-cli]

2. **[2026-10-15] `cmd | head` hides the gapi exit code**
   Do instead: redirect to a file (`> /tmp/x.out; echo $?`), then inspect the file
   [google-apis-cli]

3. **[2026-10-15] `--dry-run` shows only the first request; multi-step sends (resumable, batch) hide later steps**
   Do instead: preload a `fetch` wrapper (`node --import <log.mjs> bin/gapi.ts …`) that logs method, path, status, headers to stderr
   [google-apis-cli]

## User Directives
1. **[2026-10-15] Repo is public: live-check comments must not expose real account ids, names or domains**
   Do instead: replace with placeholders (`<customer-id>`, `<account-id>`, `<property-id>`, `<domain>`); scan with `rg` before `gh issue comment`
   [google-apis-cli]
