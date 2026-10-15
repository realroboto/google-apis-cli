# Epic Spec: `gapi` — CLI Google unificada

> Status: ready-for-agent · Tipo: epic · Fundamentada (fatos [V] verificados contra
> docs oficiais Google; wiring do vmCODE citado por `file:line` no plano de origem
> `~/.claude/plans/liste-todos-os-mcps-greedy-pine.md`).

## Problem Statement

Hoje, para administrar as APIs Google (Google Ads, Google Tag Manager, Google
Analytics 4, Google Search Console), o operador depende de **4 servidores MCP
fragmentados**, cada um com runtime e binário próprios, auth compartilhada por
gambiarra e limitações que exigem workarounds:

- **analytics-mcp é read-only** — qualquer escrita em GA4 exige um script curl
  separado (`ga4-write.sh`).
- **O refresh token expira a cada 7 dias** (consent OAuth em *Testing mode*),
  forçando re-login manual semanal via `google-relogin.sh`.
- **GTM opera em least-privilege** (sem publish/delete/manage).
- **4 stacks** para instalar, versionar, documentar e manter em sincronia.

O operador quer uma superfície única, previsível e com escrita nativa.

## Solution

Um **repositório novo** com um **pacote npm** publicável cujo binário é **`gapi`**,
que expõe as **capacidades operacionais completas** (read+write) de Google Ads,
GTM, GA4 (Admin + Data) e Search Console, sob **um único login** que
não expira. A CLI absorve as funções de `google-relogin.sh` (auth) e
`ga4-write.sh` (escrita GA4), e depois é bakeada no vmCODE substituindo os 4 MCPs
— seguindo o mesmo padrão MCP→CLI já aplicado a context7 (`ctx7`), firecrawl
(`firecrawl`) e Bing (`bwt`).

Restrição de design do operador: **zero dependências de terceiros — apenas
Google-nativo**. Consequência: `google-auth-library` (oficial Google) como única
dependência; todo acesso às APIs via **REST cru com `fetch` nativo**; parsing de
argumentos com `node:util parseArgs` (stdlib). Sem oclif, sem commander, sem
`google-ads-api` (Opteo) — todos terceiros.

## User Stories

### Auth (login único)
1. Como operador, quero rodar `gapi auth login` uma vez e conceder todos os scopes das 4 APIs num único consentimento, para não gerenciar 4 autenticações.
2. Como operador, quero que o refresh token **não expire** (OAuth client em modo produção), para não refazer login toda semana. Em **Testing** o token expira em 7 dias — relogin até publicar o app.
2b. Como **novo operador** (outra conta, outro projeto Cloud), quero `gapi auth setup` guiado para informar meu próprio OAuth client id/secret (e o `login-customer-id` opcional) gravados em `~/.config/gapi/config.json` (600), para usar a CLI sem editar arquivo à mão nem exportar env vars.
3. Como operador em container headless (sem browser), quero um fluxo `gapi auth login --manual` que imprime a URL de consentimento e aceita colar o `code` de volta, para autenticar sem browser local.
4. Como operador em máquina com browser, quero o fluxo loopback automático (servidor local capturando o redirect), para um login sem copiar/colar.
5. Como operador, quero que o token fique em `~/.config/gapi/credentials.json` com permissão 600, para proteger a credencial.
6. Como operador, quero que a CLI faça refresh do access token automaticamente antes de cada chamada, para nunca lidar com token expirado no meio de um comando.
7. Como operador, quero `gapi auth status` mostrando quais scopes/contas o token cobre, para diagnosticar acesso.
8. Como operador, quero `gapi auth logout` que apaga a credencial local, para revogar o uso na máquina.
9. Como operador MCC (Google Ads), quero informar `login-customer-id` (via flag ou config), para operar contas gerenciadas.
10. ~~Como operador, quero informar o `developer-token` do Google Ads via env/config.~~ Removido: o `developer-token` foi descontinuado em 2026-09-09 (header ignorado pela API; o acesso passou a ser regido pelo projeto Google Cloud que possui o OAuth client). Ads não envia mais o header.

### Google Analytics 4 — Admin
11. Como operador, quero listar accounts e account-summaries, para descobrir o que tenho acesso.
12. Como operador, quero CRUD de properties (create/get/patch/delete), para provisionar e ajustar propriedades.
13. Como operador, quero gerenciar data streams (web/app) e measurement-protocol-secrets, para configurar coleta.
14. Como operador, quero gerenciar conversion-events / key-events, custom-dimensions e custom-metrics, para modelar a analítica.
15. Como operador, quero gerenciar google-ads-links e firebase-links, para integrar produtos.
16. Como operador, quero ler change-history e configurar data-retention, para auditoria e governança.
17. Como operador, quero **escrever** em GA4 Admin (o que analytics-mcp não fazia), para editar configuração sem script curl externo.

### Google Analytics 4 — Data
18. Como operador, quero `gapi ga4 data run-report` com dimensões/métricas/date-ranges/filtros, para extrair relatórios.
19. Como operador, quero run-realtime-report, batch-run-reports, check-compatibility e get-metadata, para cobrir a superfície de reporting.
20. Como operador, quero saída `--json` em todos os relatórios, para pipar em outras ferramentas.

### Search Console
21. Como operador, quero listar/adicionar/remover sites, para gerenciar propriedades GSC.
22. Como operador, quero submeter/listar/deletar sitemaps, para controlar indexação.
23. Como operador, quero rodar searchanalytics query (dimensões, filtros, date-range), para análise de performance de busca.
24. Como operador, quero url-inspection (index status), para diagnosticar URLs.

### Acesso e indexação
24a. Como operador, quero gerenciar access-bindings de GA4 (usuários e papéis) via Admin v1alpha, para administrar quem acessa as properties — cobre o scope `analytics.manage.users`.
24b. Como operador, quero publicar url notifications na Indexing API (`urlNotifications:publish` / `getMetadata`), para forçar (re)indexação — preserva a capacidade do gsc-mcp substituído e cobre o scope `indexing`.

### Google Tag Manager (full read+write)
25. Como operador, quero navegar accounts → containers → workspaces, para localizar recursos.
26. Como operador, quero CRUD de tags, triggers, variables, folders, templates, transformations, clients, zones, gtag-config, built-in-variables, para editar containers por completo.
27. Como operador, quero criar container-versions e **publicar** (publish), para lançar mudanças ao vivo.
28. Como operador, quero **delete** de containers/recursos e gerenciar user-permissions (manage), para operação plena — todos os scopes.
29. Como operador, quero gerenciar environments e destinations, para configurar entrega.
29b. Como operador, quero atualizar configurações de conta GTM (`accounts.update`), para gerenciar a conta — cobre o scope `tagmanager.manage.accounts`.

### Google Ads (REST cru)
30. Como operador, quero listar contas acessíveis e a hierarquia customer_client (MCC), para descobrir contas.
31. Como operador, quero rodar GAQL via `gapi ads gaql "<query>"` (search e searchStream), para consultar qualquer recurso/report.
32. Como operador, quero operações mutate (campaigns, ad-groups, budgets etc via `:mutate`), para **escrever** em Ads.
33. Como operador, quero enviar o header opcional `login-customer-id` automaticamente nas chamadas Ads, para operar contas via MCC. (O `developer-token` foi descontinuado em 2026-09-09 e não é mais enviado — ver item 10.)

### CLI / UX transversal
34. Como operador, quero saída JSON-first (payload limpo) com escape hatch `--raw` (envelope completo), espelhando as convenções do `bwt`.
35. Como operador, quero `gapi <api> --help` e `gapi --help` com a árvore de comandos, para descoberta.
36. Como operador, quero paginação transparente (a CLI segue nextPageToken) com opção de limitar, para não perder dados.
37. Como operador, quero exit codes não-zero e mensagem de erro clara (com o erro REST do Google) em falha, para automação confiável.
38. Como operador, quero instalar via `npm i -g google-apis-cli` sem puxar deps pesadas, para footprint mínimo.

### Bake no vmCODE (migração dos MCPs)
39. Como mantenedor do vmCODE, quero `gapi` bakeado na imagem substituindo analytics-mcp/gsc-mcp/google-ads/gtm, para consolidar 4 stacks em 1.
40. Como mantenedor, quero o skill `gapi` bakeado do HEAD do repo (como bing-webmaster-cli), para o agente in-container saber usá-la.
41. Como mantenedor, quero o seed remover os 4 records MCP e auto-limpar homes persistidos (prune LEGACY), para não deixar entradas órfãs.
42. Como mantenedor, quero o menu `k → g` repontar para `gapi auth login`, e `scripts/google-relogin.sh`/`ga4-write.sh`/`gtm-mcp`/`gsc-auth.sh` removidos, para eliminar código absorvido.
43. Como mantenedor, quero docs (agent-instructions.md, available_tools.md) refletirem MCPs 9→5 + a CLI nova, para consistência.

## Implementation Decisions

- **Runtime/stack:** TypeScript 7 strict, Node ESM (`type: module`), **Node ≥ 24 LTS**. Fonte em `.ts`; o Node executa `.ts` direto por **type-stripping** (estável em v24.12/v25.2) — sem build step no dev, sem bundler. `node:util parseArgs` + `fetch` nativos. **Uma dep de runtime:** `google-auth-library` (oficial Google). Dev-deps (dev-time only): `typescript@^7` (`tsc --noEmit` = type-check, o stripping não checa), `@biomejs/biome@^2` (lint + format, substitui eslint+prettier), `@types/node`. `tsconfig` strict + `erasableSyntaxOnly` + `verbatimModuleSyntax` + `rewriteRelativeImportExtensions` — imports relativos carregam a extensão `.ts`. Package manager: **pnpm 12** (corepack-pinned via `packageManager`). **Decisão revista:** o T1 era JS puro + npm; o projeto migrou para TS7-strict + Biome + pnpm 12 (branch `chore/ts7-biome-migration`) mantendo a dep de runtime única e o runtime nativo. Publish (#7): `tsc` build → `.js`+`.d.ts` no `prepublishOnly`; nada de `dist/` no dev. <!-- yagni: build só no publish -->
- **Bin:** `gapi` (`package.json` `"bin": { "gapi": "./bin/gapi.ts" }`; Node faz o stripping ao rodar).
- **Dispatch + entradas de API (deep-module):** cada API é uma **entrada discovery** — dados, não handlers: `{ api, discovery, service?, scopes?, retired?, deprecated?, paid?, headers?, helpers? }` (tipo `ApiEntry` em `src/types.ts`; cada arquivo faz `satisfies ApiEntry`). Recursos e métodos vêm do documento discovery; o Catalog (`src/catalog.ts`) o normaliza em `ApiModel`, e Planner (`src/plan.ts`) + Transport (`src/transport.ts`) montam e enviam o request. `ads`, `gsc`, `indexing`, `ga4-admin`, `ga4-admin-alpha`, `ga4-data`, `ga4-data-alpha` e `gtm` são entradas (#42–#46); os manifestos à mão e o strangler `legacyDoc` saíram em #47. `gsc` marca `urlTestingTools.mobileFriendlyTest.run` como retired (exit 3). `src/run.ts` (`run(argv, io)`, chamado por `bin/gapi.ts` com o io do processo) faz `parseArgs`; a **tabela de dispatch, o `--help` e a resolução de URL derivam todos das entradas por auto-descoberta** (glob de `src/apis/*.{ts,js}` — **sem registry central editado à mão**; `api` = nome do arquivo, senão o Catalog falha ao carregar). Sem framework CLI. Racional: handlers per-recurso seriam pass-throughs rasos (interface ≈ implementação — falham o deletion test); dados concentram path/paginação/auth/erro no Planner e no Transport (locality) e tornam "adicionar API = um arquivo" (leverage).
- **Módulo auth:** `OAuth2Client` do google-auth-library. `login` sobe loopback em porta fixa e imprime URL; `--manual` usa fluxo copy-paste do `code` (para headless). `access_type: 'offline'`, `prompt: 'consent'` → refresh token. `getToken(code)` troca code por tokens. Persistência em `~/.config/gapi/credentials.json` (mode 600). Refresh automático via `OAuth2Client` antes de cada request.
- **OAuth client por operador (multi-tenant).** Cada operador registra o **próprio** projeto Cloud + OAuth client Desktop; nada na CLI é atado a uma conta ou projeto. Credenciais do client resolvidas com precedência **env (`GAPI_OAUTH_CLIENT_ID`/`_SECRET`) → `~/.config/gapi/config.json` (via `gapi auth setup`, mode 600) → embutidas no pacote** (padrão de CLIs OAuth públicas: gcloud/gh/firebase-tools). Resolução **lazy** (`getOAuthClient()`, não constante de import) para captar um `auth setup` no mesmo processo. O prompt do secret é **mascarado** (eco do readline vai para um sink e `terminal: true` põe o tty em raw mode, calando também o driver) — o valor vai do stdin direto ao arquivo. Escrita de segredos centralizada em `writeSecureJson()` (dir 700, arquivo 600), usada pelo config e pelas credenciais.
  - **Publishing status decide a vida do refresh token:** **Testing** → só emails em *Test users*, refresh token expira em **7 dias**; **In production** → qualquer conta, sem a expiração de 7 dias, mas o botão `Publish app` exige home page + privacy policy + terms of service em domínio autorizado. Produção é o estado-alvo; Testing é suficiente para avaliar. Em produção restam gatilhos residuais (inatividade 6 meses, cap ~100 refresh tokens/client, troca de senha em tokens Gmail-scoped) — não aplicáveis ao uso normal desta CLI; o refresh automático (getAccessToken) reidrata transparente.
  - Onboarding passo a passo (Console, níveis de acesso Ads, customer IDs, troubleshooting): **[SETUP.md](SETUP.md)**.
- **Scopes (máximos read+write das 4 APIs + Indexing):** `adwords`; GTM os 7 (`tagmanager.readonly`, `.edit.containers`, `.edit.containerversions`, `.publish`, `.delete.containers`, `.manage.users`, `.manage.accounts`); GA4 `analytics.readonly`, `analytics.edit`, `analytics.manage.users` (esta gateia o recurso v1alpha `accessBindings`, incluído nos endpoints abaixo); GSC `webmasters`; Indexing API `indexing`. Além destes 13 scopes de API, o consent inclui os scopes de identidade não-sensíveis `openid` e `email` — o `id_token` resultante alimenta `gapi auth status` com a conta autenticada (nenhum dos 13 scopes de API carrega identidade). **`cloud-platform` NÃO é pedido** — não é scope de nenhuma das 4 APIs; o quota project via header `x-goog-user-project` exige a permissão IAM `serviceusage.services.use`, não um scope OAuth [A — doc Google; confirmar no T1 ao exercitar o header `x-goog-user-project`]. Co-consentimento em prod: `google-relogin.sh:33-59` já concede num único login **9 destes 13 scopes** — `adwords`, `analytics.readonly/edit/manage.users`, `webmasters`, `indexing`, `tagmanager.readonly/edit.containers/edit.containerversions` [V]. Os **4 scopes GTM restantes** (`.publish`, `.delete.containers`, `.manage.accounts`, `.manage.users`) foram *deliberadamente omitidos* naquele script (least-privilege, `google-relogin.sh:51-53`) e são portanto **novos/não-verificados [A]** neste consentimento — T1 valida com um `gapi auth login` real da lista completa (ver Risco [B] e critério de aceite de T1).
- **Planner + Transport (substituem o executor `src/rest.ts`, #37):** `plan(model, words | methodId, input, settings) → CallPlan` (puro) aplica todas as regras D5 do epic #30 — `--params` JSON com os nomes do Google, required, repeated, enum, `pattern`, `{x}`/`{+x}`, guard #28 (`sites/{siteUrl}` + `sites/x` → `pass the bare id: x`), `--body` só onde o método tem request — e falha com exit 3 antes de qualquer chamada de rede. `send(plan, { fetch, authorize, out })` envia; `authorize` (Credentials, `src/credentials.ts`, #41: Bearer OAuth ou `X-Goog-Api-Key`) roda antes de cada request; não-2xx → exit 1 com o corpo de erro do Google; 403 com `ACCESS_TOKEN_SCOPE_INSUFFICIENT` → exit 2 `missing scope (…); run gapi auth login`. `--page-all` (#38; só em método com parâmetro `pageToken`, senão exit 3) repete o request com `pageToken` = `nextPageToken` anterior até ele faltar ou `--page-limit` páginas (default 10), uma linha JSON compacta por página (NDJSON). Mídia (#48, só em método com `supportsMediaUpload`/`supportsMediaDownload`, senão exit 3): `--upload <file>` envia para `rootUrl` + `upload/` + `servicePath` + path com `uploadType` = `--upload-protocol` (default `multipart` com `--body`, senão `media`; `resumable` só onde discovery lista: sessão com `X-Upload-Content-Type`/`-Length`, URI do `Location`, PUT de 8 MiB com `Content-Range`, `308` = continua a partir do `Range`); `--upload-content-type` vem da extensão, senão `application/octet-stream`, e precisa casar com `mediaUpload.accept`; o arquivo é lido do disco em stream. `--output <file>` adiciona `alt=media`, grava o corpo no arquivo e imprime `{"path","bytes"}`. `--page-all`, `--upload` e `--output` não combinam. `--dry-run` imprime `{ method, url, headers, body, upload?, output? }` com `Authorization: Bearer <redacted>` ou `X-Goog-Api-Key: <redacted>` e nunca abre `credentials.json`. `--json`, `--raw`, `--limit` e args posicionais saíram.
- **Helpers (#40):** uma entrada declara `helpers` (`+nome → { summary, options, plan(ctx) }`); `run` roteia a segunda palavra com `+`, aceita `--dry-run`, `--project`, `--help` + as `options` do helper (outras flags → exit 3), e o helper monta o `CallPlan` via `plan(…)` por method id. `gapi ads +gaql "<query>" --customer <id> [--stream]`: body `{query}`; sem `--stream` imprime a primeira página de `search` como veio; `--stream` usa `searchStream` e `CallPlan.decode` concatena os `results` de todos os chunks. O helper planeja `googleads.customers.googleAds.search`/`.searchStream` com `customerId` = `--customer` (#46). Entradas não têm `decoder`; `ads customers googleAds searchStream` direto imprime os chunks crus.
- **Endpoints REST [V]:**
  - GA4 Data — `ga4-data` = documento discovery `analyticsdata` v1beta inteiro (11 métodos em 2026-10-13: `properties` runReport/runRealtimeReport/runPivotReport/batchRunReports/batchRunPivotReports/checkCompatibility/getMetadata e `audienceExports` list/get/create/query); `ga4-data-alpha` = documento v1alpha inteiro (16 métodos: runFunnelReport, chat, getPropertyQuotasSnapshot, `audienceLists`, `recurringAudienceLists`, `reportTasks`) (#44).
  - GA4 Admin — `ga4-admin` = documento discovery `analyticsadmin` v1beta inteiro (55 métodos em 2026-10-13: accounts, accountSummaries, properties e sub-recursos); `ga4-admin-alpha` = documento v1alpha inteiro (166 métodos, inclui `accessBindings`, `audiences`, `channelGroups`, `calculatedMetrics`, subproperties/rollups e repete os recursos v1beta) (#43).
  - Ads — `ads` = documento discovery `googleads` v26 inteiro (175 métodos em 2026-10-14; ex.: `customers googleAds search` → `POST …/v26/customers/{customerId}/googleAds:search`, `customers campaigns mutate`); os 9 métodos do recurso chamado `v26` têm o caminho na árvore (`gapi ads v26 listPlannableLocations` → `POST …/v26:listPlannableLocations`) e mudam de nome a cada versão (#46); header opcional `login-customer-id` (MCC). `developer-token` descontinuado 2026-09-09 — não enviado. **O nível de acesso é do projeto Cloud** que possui o OAuth client (Test → só contas de teste; Explorer/Basic/Standard → produção); abaixo de Explorer, chamada a conta de produção retorna `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`.
  - GSC — `searchconsole.googleapis.com` (sites, sitemaps, searchanalytics, urlInspection:index).
  - Indexing API — `POST indexing.googleapis.com/v3/urlNotifications:publish` e `GET :getMetadata` (parte da superfície do gsc-mcp substituído; scope `indexing`).
  - GTM — `gtm` = documento discovery `tagmanager` v2 inteiro (106 métodos em 2026-10-14: accounts→containers→workspaces→tags/triggers/variables/versions:publish). Os 4 métodos que o documento marca `deprecated` (`accounts.containers.combine`, `move_tag_id`, `destinations.link`/`.get`) funcionam, aparecem com `(deprecated)` no help e avisam no stderr (#45).
- **Help/discovery:** `gapi --help` e `gapi <api> --help` (story 35) derivam a árvore da própria tabela de dispatch (sem texto duplicado); `parseArgs` trata `--help`.
- **Diretório de config:** `$GAPI_CONFIG_DIR` se definido (não vazio), senão `~/.config/gapi` (`configDir(env)`, `src/credentials.ts`; `run` lê `io.env`). Contém `config.json`, `credentials.json` e `cache/<api>.json` (documentos discovery, TTL 24 h, `src/catalog.ts`). `gapi discovery refresh [<api>…]` ignora o TTL e rebusca (sem api: toda entrada discovery); `gapi discovery path` imprime o diretório do cache. `gapi schema <api> <recurso>[.<sub>…].<método> | <SchemaName> [--resolve-refs]` imprime em JSON a forma do método (`request`/`response` = nomes de schema) ou o schema; `--resolve-refs` expande cada `$ref`, e um nome já no caminho fica `{"$ref":"<nome>"}`. `pnpm discovery:check [apisDir]` rebusca todo documento discovery, imprime os métodos indisponíveis (scope nunca concedido) e as APIs de API key; exit 1 em qualquer falha de fetch ou id de overlay ausente do documento.
- **Config (`~/.config/gapi/config.json`, mode 600):** `oauth_client_id`/`oauth_client_secret` (gravados por `gapi auth setup`; env `GAPI_OAUTH_CLIENT_ID`/`_SECRET` tem precedência); headers de entrada (`headers` da entrada da API; flag aceita só nessa API, senão exit 3): Ads `--login-customer-id` / `GOOGLE_ADS_LOGIN_CUSTOMER_ID` / `login-customer-id`, SA360 `--login-customer-id` / `SA360_LOGIN_CUSTOMER_ID` / `sa360-login-customer-id`; API key via `--api-key`, env `GAPI_API_KEY` ou `api_key` (enviada como `X-Goog-Api-Key` nas APIs de API key; obrigatória só quando o método não lista scope — CrUX — senão exit 2); quota project via flag `--project`, env `GOOGLE_CLOUD_PROJECT` ou config (só com OAuth). Precedência geral **flag → env → config**. Credentials (`src/credentials.ts`) é o único leitor/escritor de `config.json` e `credentials.json`. `gapi auth login` pede o consent = scope por método de todas as entradas ∪ scopes de entrada ∪ `openid`, `email`; `gapi auth status` mostra `missing`; `invalid_grant` → exit 2 `token expired or revoked; run gapi auth login`. `auth logout` apaga só `credentials.json` — o `config.json` sobrevive, então o próximo `auth login` não precisa de novo client. (`developer-token` descontinuado 2026-09-09 — não configurável.)
- **Ordem de construção (epic → tickets):** (T1) scaffold + auth + rest seam — **critério de aceite (bloqueante, imediato):** um `gapi auth login` real em **Testing mode** concede os **13 scopes** num único consent (responde o `[A]` dos 4 scopes GTM novos, alcançável já) e o `rest` seam faz uma chamada autenticada bem-sucedida. **Não** depende de Production/App-Verification — isso é marco separado não-bloqueante (Risco [B]), atado só à story 2; (T2) GA4 Admin+Data; (T3) GSC; (T4) GTM; (T5) Ads; (T6) skill `gapi/SKILL.md` + publicação npm; (T7) bake no vmCODE + remoção dos 4 MCPs e scripts absorvidos.
- **Bake (T7) — arquivos vmCODE:** `Containerfile` (add `google-apis-cli` ao `npm -g`; remove `suganthan-gsc-mcp`, `google-tag-manager-mcp-server`, `pipx analytics-mcp`, `install-google-ads-mcp.sh`, COPY do `gtm-mcp`); `install-skills.sh` (+bloco git-clone do skill, espelhando bing); `versions.yml` (+entry npm/skills, −4 entries MCP); `seed-claude-settings.py` (−4 records/builders/resolvers/bins, +prune LEGACY dos 4 nomes); `r2-tools.sh` (+export login-id); `secrets.sh` (menu `g` → `gapi auth login`); remove `google-relogin.sh`/`ga4-write.sh`/`gtm-mcp`/`gsc-auth.sh`; docs (MCPs 9→5); `test/seed_config_test.py` (roster atualizado).

## Testing Decisions

- **Bom teste = comportamento externo, não implementação.** Testar o contrato observável da CLI (argv → efeito/saída), não internals dos módulos.
- **Seam: `run(argv, io)` (CLI in-process, `test/run.test.ts`; `test/cli.test.ts` só testa o bin com `--help`).** Testes usam entradas fixture (`io.apisDir` = `test/fixtures/apis`), cache semeado num `GAPI_CONFIG_DIR` temporário (com `credentials.json` de access token não expirado) e um `fetch` fake (`test/helpers/fetch.ts`, `Response` reais); asseveram o request exato (`--dry-run` ou chamadas gravadas), stdout, stderr e exit code. Nenhum teste bate na rede real.
- **Correção per-recurso = dados, não handlers.** `pnpm discovery:check` rebusca o documento de cada entrada e falha quando um overlay nomeia um method id ausente; o Catalog rejeita uma entrada cujo `api` difere do nome do arquivo — substitui N testes de handler.
- **Auth:** teste do refresh (token expirado → refresh chamado → novo access token usado) e da persistência/permissão 600, mockando o `OAuth2Client`. O fluxo `--manual` testado pela montagem da authUrl + troca de code (getToken mockado).
- **Help (story 35):** assertar que `gapi --help` e `gapi <api> --help` listam os comandos da tabela de dispatch e saem com código 0 — teste puro, sem rede.
- **Loopback (story 4):** teste do receptor HTTP local — simular uma requisição de redirect (`GET /?code=...`) contra o servidor de porta fixa e assertar que ele extrai o `code`, chama o mesmo `getToken` já coberto e derruba o servidor. Sem browser real.
- **Builders puros:** GAQL builder (Ads) e report-request builder (GA4 Data) testados como funções puras (entrada → JSON esperado), sem rede.
- **Framework:** `node:test` (stdlib) + `assert` — coerente com "zero deps de terceiros". Um arquivo de teste por seam (`run`, `catalog`, `auth`, `cli`), mais os arrays de cobertura congelados por API até a migração para discovery. Sem frameworks extras. Fixtures: documentos discovery reais (podados com `jq`) e o `mini` feito à mão em `test/fixtures/discovery/`, com as entradas correspondentes em `test/fixtures/apis/`.
- **Prior art:** convenções do `bing-webmaster-cli` (`bwt`) — JSON-first, `--raw`, zero-dep, README "Skipped/add on demand".
- **Bake (T7):** reusar `test/seed_config_test.py` do vmCODE (roster de MCPs esperado) — atualizar para 5 MCPs e presença do bin `gapi`.

## Out of Scope

- Empacotar wrappers `@googleapis/*` / `@google-analytics/*` (deps extra; REST cru cobre 100% com 1 dep). Reavaliar só se o boilerplate REST doer.
- Framework CLI (oclif/commander) — `parseArgs` + dispatch bastam.
- GA4 `analytics.provision` (provisionar contas novas) e `analytics.user.deletion` (GDPR) — scopes do script legado sem demanda atual; add quando pedir.
- Outras APIs Google (BigQuery, Ads Data Manager, Merchant, YouTube) — fora das 4 pedidas. A **Indexing API está incluída** (fazia parte da superfície do gsc-mcp substituído).
- Cache local de respostas / camada offline.
- UI/TUI interativa; a CLI é não-interativa exceto o consent do `auth login`.
- A submissão do OAuth App Verification em si (formulário/review da Google) é operação externa, não código — mas seu impacto na story 2 (sem-expiração) está tratado como **Risco [B]** nas Further Notes, não ignorado.

## Further Notes

- **Risco [A] principal — auth headless:** container não tem browser. Mitigação = `--manual` (paste do `code`) + fallback loopback com port-forward (o vmCODE já faz forward, `secrets.sh:255-261`). Verify: `gapi auth login --manual` no container grava `credentials.json` e `gapi gsc sites list` responde.
- **Ads sem lib Node oficial [V]** — REST cru é o caminho Google-nativo correto (não `google-ads-api`/terceiro).
- **Um consentimento cobre as 4 APIs + Indexing [V]** — já provado em prod pelo `google-relogin.sh:33-58` (um `gcloud login` que concede TODO este conjunto de scopes de uma vez, incluindo `analytics.manage.users` e `indexing`). `google-auth-library` aceita `scope: [...]` em `generateAuthUrl`. `cloud-platform`, presente naquele script legado, foi deliberadamente removido aqui (não é scope das 4 APIs).
- **Risco [B] — App Verification (gate real da story 2):** sair do Testing mode → Production exige o **Google OAuth App Verification** (scopes sensíveis: `analytics.manage.users`, `tagmanager.manage.*`, `adwords`, `webmasters`), review de timeline **não-garantida**. Requisitos: privacy policy URL, homepage, tela de consent revisada. **Fallback se travar/for negado:** o epic entrega com a story 2 (sem-expiração) **não-resolvida** — mantém Testing mode + re-auth manual documentado (cadência ~7 dias, herdada do fluxo atual) até a verificação passar. Verify: consent em Production sem warning "unverified app". Este marco roda **em paralelo**, sem gate sobre T1–T7 (que operam em Testing mode com até 100 test users).
- **Footprint das deps:** `google-auth-library` traz ~6 transitivos Google-mantidos (gaxios, gcp-metadata, jws, base64-js, ecdsa-sig-formatter, google-logging-utils) — ainda **1 dep direta**. A framing "sem deps pesadas" (story 38) = não puxar `googleapis` (214 MB) nem os wrappers `@googleapis/*`; footprint muito menor que os 4 runtimes MCP atuais (2 pipx + 2 npm).
- **Migração vmCODE (T7)** é o último ticket do epic e depende da publicação npm (T6). Auto-heal de homes persistidos via prune LEGACY, sem ação do operador no reboot.
