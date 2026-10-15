# Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-10-15] Live checks: run `gapi auth status` first; `missing: []` + `hasApiKey: true` rule out scope/key causes**
   Do instead: `node bin/gapi.ts auth status` before any live read; re-run `gapi auth login` if token expired (~7 days, Testing mode)
   [google-apis-cli]

## Domain Behavior Guardrails
1. **[2026-10-15] `indexing urlNotifications getMetadata` exits 1 with 404 `NOT_FOUND` for a URL never published**
   Do instead: treat as Google result, not gapi bug; only 403 (ownership/scope) or `SERVICE_DISABLED` signals setup failure
   [google-apis-cli]

2. **[2026-10-15] Merchant API: 401 `GCP_NOT_REGISTERED` until project registered via `merchant-accounts … developerRegistration registerGcp`**
   Do instead: no Merchant account → record 401 as result; probe each list with `parent: accounts/0` (401 `PERMISSION_DENIED_ACCOUNTS`)
   [google-apis-cli]

## Shell & Command Reliability
1. **[2026-10-15] `cmd | head` hides the gapi exit code**
   Do instead: redirect to a file (`> /tmp/x.out; echo $?`), then inspect the file
   [google-apis-cli]
