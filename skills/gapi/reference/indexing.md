# gapi `indexing` — full command reference

Base `https://indexing.googleapis.com`. Live source of truth: `gapi indexing` / `gapi indexing <resource>`.
Call: `gapi indexing <resource> <verb> [path-arg ...] [--body '<json>'] [--limit N] [--json|--raw]`.
Positionals fill the `{param}` tokens left-to-right. ⬦ = needs `--body`.
All verbs use scope `indexing`.

## url-notifications

| verb | method | path |
|---|---|---|
| `publish` ⬦ | POST | `/v3/urlNotifications:publish` |
| `get-metadata` | GET | `/v3/urlNotifications/metadata` |

