# google-apis-cli (`gapi`)

Uma CLI para administrar **Google Ads · GTM · GA4 (Admin + Data) · Search Console · Indexing** sob **um login**, read+write, todos os scopes. Zero deps de terceiros — só `google-auth-library` (Google-nativo) + `fetch` nativo. Substitui os 4 MCPs Google fragmentados do vmCODE.

## Fluxo (como o projeto funciona)

Três peças, um caminho:

1. **auth** (`src/auth.js`) — `gapi auth login` faz um consent OAuth único (loopback ou `--manual`), guarda o refresh token em `~/.config/gapi/credentials.json` (600), e `getAccessToken()` reidrata o access token sozinho. É a única peça com handlers de verdade.
2. **manifest** (`src/apis/*.js`) — cada API é **dados, não código**: linhas `recurso → verbo → { httpMethod, pathTemplate, scopes, requiredHeaders?, decoder? }`. Um arquivo por superfície (`ga4-admin.js`, `ga4-data.js`, `gsc.js`, `indexing.js`, `gtm.js`, `ads.js`). Auto-descobertos por glob — nenhum registry central.
3. **executor seam** (`src/rest.js`) — `execute(manifestRow, params, { tokenProvider, fetch })` resolve URL, monta headers (Bearer injetado, `x-goog-user-project`, `requiredHeaders`), segue paginação, aplica `decoder`, formata `--json`/`--raw`. **Todo acesso à rede passa aqui** — é o único seam de teste (mock `fetch` + token fake).

`bin/gapi.js` faz `parseArgs`; **dispatch, `--help` e resolução de URL derivam dos manifests**. Forma de comando: `gapi <api> <resource> <verb> [--json|--raw]`.

## Onde olhar

| Precisa de | Leia |
|---|---|
| O que a CLI faz, por quê, decisões, scopes, endpoints, riscos | **[docs/SPEC.md](docs/SPEC.md)** — fonte da verdade comportamental |
| Como o trabalho é rastreado (issues, blocking edges) | [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) |
| Labels de triage | [docs/agents/triage-labels.md](docs/agents/triage-labels.md) |
| CONTEXT.md / ADRs — vocabulário de domínio | [docs/agents/domain.md](docs/agents/domain.md) |
| Comandos e scripts reais | `package.json`, `gapi --help` (fonte da verdade — não duplicada aqui) |

## Adicionar uma API ou recurso

Um recurso novo = **uma linha de manifest**, não uma função. Adicionar uma API = um arquivo `src/apis/<api>.js` novo (auto-descoberto, sem tocar arquivo compartilhado). Regra de aceite: **coverage-oracle** — o self-check falha se o manifest não cobrir 100% dos recursos do discovery doc da API. Testes sempre pelo executor seam (token+`fetch` injetados), nunca rede real.

## Agent skills

### Issue tracker
Issues no GitHub via `gh`. Ver [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

### Triage labels
Cinco labels canônicos (string == papel). Ver [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs
Single-context (`CONTEXT.md` + `docs/adr/` na raiz). Ver [docs/agents/domain.md](docs/agents/domain.md).
