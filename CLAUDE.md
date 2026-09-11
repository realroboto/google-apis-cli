# google-apis-cli (`gapi`)

CLI única para administrar Google Ads + GTM + GA4 (Admin+Data) + Search Console
sob um login, read+write com todos os scopes. Zero deps de terceiros — só
`google-auth-library` (Google-nativo) + `fetch` nativo → REST. Substitui os 4 MCPs
Google do vmCODE.

Spec da epic: [docs/SPEC.md](docs/SPEC.md).

## Agent skills

### Issue tracker

Issues tracked as GitHub issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical triage labels (label string == role name). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`CONTEXT.md` + `docs/adr/` at repo root). See `docs/agents/domain.md`.
