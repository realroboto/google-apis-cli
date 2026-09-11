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
que expõe **100% das capacidades** de Google Ads, GTM, GA4 (Admin + Data) e
Search Console em **read+write com todos os scopes**, sob **um único login** que
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
2. Como operador, quero que o refresh token **não expire** (OAuth client em modo produção), para não refazer login toda semana.
3. Como operador em container headless (sem browser), quero um fluxo `gapi auth login --manual` que imprime a URL de consentimento e aceita colar o `code` de volta, para autenticar sem browser local.
4. Como operador em máquina com browser, quero o fluxo loopback automático (servidor local capturando o redirect), para um login sem copiar/colar.
5. Como operador, quero que o token fique em `~/.config/gapi/credentials.json` com permissão 600, para proteger a credencial.
6. Como operador, quero que a CLI faça refresh do access token automaticamente antes de cada chamada, para nunca lidar com token expirado no meio de um comando.
7. Como operador, quero `gapi auth status` mostrando quais scopes/contas o token cobre, para diagnosticar acesso.
8. Como operador, quero `gapi auth logout` que apaga a credencial local, para revogar o uso na máquina.
9. Como operador MCC (Google Ads), quero informar `login-customer-id` (via flag ou config), para operar contas gerenciadas.
10. Como operador, quero informar o `developer-token` do Google Ads via env/config, para habilitar chamadas Ads (credencial extra além do OAuth).

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

### Google Ads (REST cru)
30. Como operador, quero listar contas acessíveis e a hierarquia customer_client (MCC), para descobrir contas.
31. Como operador, quero rodar GAQL via `gapi ads gaql "<query>"` (search e searchStream), para consultar qualquer recurso/report.
32. Como operador, quero operações mutate (campaigns, ad-groups, budgets etc via `:mutate`), para **escrever** em Ads.
33. Como operador, quero enviar o header `developer-token` e opcional `login-customer-id` automaticamente, para chamadas válidas.

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

- **Runtime/stack:** Node ESM (`type: module`), Node ≥ 18 (fetch nativo, `node:util parseArgs`). Dependência única: `google-auth-library` (oficial Google). Nenhuma outra dep de runtime.
- **Bin:** `gapi` (`package.json` `"bin": { "gapi": "./bin/gapi.js" }`).
- **Dispatch:** `bin/gapi.js` faz parse de `argv` com `parseArgs` e roteia por uma tabela `{ api → módulo }` (`ga4`, `gsc`, `gtm`, `ads`, `auth`). Cada módulo expõe um dispatcher `{ recurso → { verbo → handler } }`. Sem framework CLI.
- **Módulo auth:** `OAuth2Client` do google-auth-library. `login` sobe loopback em porta fixa e imprime URL; `--manual` usa fluxo copy-paste do `code` (para headless). `access_type: 'offline'`, `prompt: 'consent'` → refresh token. `getToken(code)` troca code por tokens. Persistência em `~/.config/gapi/credentials.json` (mode 600). Refresh automático via `OAuth2Client` antes de cada request.
- **OAuth client próprio, modo produção** (não Testing) → refresh token sem expiração de 7 dias. Client type: Desktop app. `client_id`/`client_secret` embutidos no pacote (padrão de CLIs OAuth públicas: gcloud/gh/firebase-tools).
- **Scopes (máximos read+write das 4 APIs + Indexing):** `adwords`; GTM os 7 (`tagmanager.readonly`, `.edit.containers`, `.edit.containerversions`, `.publish`, `.delete.containers`, `.manage.users`, `.manage.accounts`); GA4 `analytics.readonly`, `analytics.edit`, `analytics.manage.users` (esta gateia o recurso v1alpha `accessBindings`, incluído nos endpoints abaixo); GSC `webmasters`; Indexing API `indexing`. **`cloud-platform` NÃO é pedido** — não é scope de nenhuma das 4 APIs; o quota project via header `x-goog-user-project` exige a permissão IAM `serviceusage.services.use`, não um scope OAuth [V, cloud.google.com/docs/authentication/rest]. Co-consentimento em prod: `google-relogin.sh:33-59` já concede num único login **9 destes 13 scopes** — `adwords`, `analytics.readonly/edit/manage.users`, `webmasters`, `indexing`, `tagmanager.readonly/edit.containers/edit.containerversions` [V]. Os **4 scopes GTM restantes** (`.publish`, `.delete.containers`, `.manage.accounts`, `.manage.users`) foram *deliberadamente omitidos* naquele script (least-privilege, `google-relogin.sh:51-53`) e são portanto **novos/não-verificados [A]** neste consentimento — T1 valida com um `gapi auth login` real da lista completa (ver Risco [B] e critério de aceite de T1).
- **Módulo rest (seam central):** um `apiCall({ method, url, body, headers })` genérico — generaliza o `api_call()` de `ga4-write.sh` (curl → fetch): injeta `Authorization: Bearer`, `x-goog-user-project` (quota project), headers extra (Ads `developer-token`/`login-customer-id`), faz paginação (segue `nextPageToken`), e formata `--json`/`--raw`. **Todo acesso a API passa por aqui.**
- **Endpoints REST [V]:**
  - GA4 Data — `POST analyticsdata.googleapis.com/v1beta/properties/{id}:runReport` (+ `batchRunReports`, `runRealtimeReport`, `checkCompatibility`, `GET :getMetadata`).
  - GA4 Admin — `analyticsadmin.googleapis.com/v1beta` (accounts/properties/dataStreams/conversionEvents/customDimensions/customMetrics/googleAdsLinks/firebaseLinks/dataRetention) **+ `v1alpha`** para recursos que só existem lá (`accessBindings` [usuários/permissões], `audiences`, `channelGroups`, `calculatedMetrics`, subproperties/rollups).
  - Ads — `POST googleads.googleapis.com/v25/customers/{id}/googleAds:searchStream` e `:search`; `:mutate` por recurso; header `developer-token` obrigatório.
  - GSC — `searchconsole.googleapis.com` (sites, sitemaps, searchanalytics, urlInspection:index).
  - Indexing API — `POST indexing.googleapis.com/v3/urlNotifications:publish` e `GET :getMetadata` (parte da superfície do gsc-mcp substituído; scope `indexing`).
  - GTM — `tagmanager.googleapis.com/tagmanager/v2` (accounts→containers→workspaces→tags/triggers/variables/versions:publish).
- **Help/discovery:** `gapi --help` e `gapi <api> --help` (story 35) derivam a árvore da própria tabela de dispatch (sem texto duplicado); `parseArgs` trata `--help`.
- **Config:** `developer-token` e `login-customer-id` do Ads via env (`GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`) ou `~/.config/gapi/config.json`. Quota project via env `GOOGLE_CLOUD_PROJECT` ou config.
- **Ordem de construção (epic → tickets):** (T1) scaffold + auth + rest seam — **critério de aceite:** registrar um `gapi auth login` real (OAuth client em Production) concedendo os **13 scopes completos** e confirmar o consent sem erro/warning "unverified app"; (T2) GA4 Admin+Data; (T3) GSC; (T4) GTM; (T5) Ads; (T6) skill `gapi/SKILL.md` + publicação npm; (T7) bake no vmCODE + remoção dos 4 MCPs e scripts absorvidos.
- **Bake (T7) — arquivos vmCODE:** `Containerfile` (add `google-apis-cli` ao `npm -g`; remove `suganthan-gsc-mcp`, `google-tag-manager-mcp-server`, `pipx analytics-mcp`, `install-google-ads-mcp.sh`, COPY do `gtm-mcp`); `install-skills.sh` (+bloco git-clone do skill, espelhando bing); `versions.yml` (+entry npm/skills, −4 entries MCP); `seed-claude-settings.py` (−4 records/builders/resolvers/bins, +prune LEGACY dos 4 nomes); `r2-tools.sh` (+export dev-token/login-id); `secrets.sh` (menu `g` → `gapi auth login`); remove `google-relogin.sh`/`ga4-write.sh`/`gtm-mcp`/`gsc-auth.sh`; docs (MCPs 9→5); `test/seed_config_test.py` (roster atualizado).

## Testing Decisions

- **Bom teste = comportamento externo, não implementação.** Testar o contrato observável da CLI (argv → efeito/saída), não internals dos módulos.
- **Seam único preferido:** `src/rest.js` `apiCall` é o ponto de fronteira com a rede. Todos os testes de comando **mockam o `fetch` global** (Node nativo) nesse seam e asseveram: URL/método/headers montados (Bearer, `developer-token`, `x-goog-user-project`), body correto, parsing da resposta, paginação (nextPageToken), formatação `--json`/`--raw`, exit codes e mensagem em erro REST. Nenhum teste bate na rede real.
- **Auth:** teste do refresh (token expirado → refresh chamado → novo access token usado) e da persistência/permissão 600, mockando o `OAuth2Client`. O fluxo `--manual` testado pela montagem da authUrl + troca de code (getToken mockado).
- **Help (story 35):** assertar que `gapi --help` e `gapi <api> --help` listam os comandos da tabela de dispatch e saem com código 0 — teste puro, sem rede.
- **Loopback (story 4):** teste do receptor HTTP local — simular uma requisição de redirect (`GET /?code=...`) contra o servidor de porta fixa e assertar que ele extrai o `code`, chama o mesmo `getToken` já coberto e derruba o servidor. Sem browser real.
- **Builders puros:** GAQL builder (Ads) e report-request builder (GA4 Data) testados como funções puras (entrada → JSON esperado), sem rede.
- **Framework:** `node:test` (stdlib) + `assert` — coerente com "zero deps de terceiros". Um arquivo de teste por módulo não-trivial (`auth`, `rest`, `ga4`, `gsc`, `gtm`, `ads`). Sem fixtures/frameworks extras.
- **Prior art:** convenções do `bing-webmaster-cli` (`bwt`) — JSON-first, `--raw`, zero-dep, README "Skipped/add on demand".
- **Bake (T7):** reusar `test/seed_config_test.py` do vmCODE (roster de MCPs esperado) — atualizar para 5 MCPs e presença do bin `gapi`.

## Out of Scope

- Empacotar wrappers `@googleapis/*` / `@google-analytics/*` (deps extra; REST cru cobre 100% com 1 dep). Reavaliar só se o boilerplate REST doer.
- Framework CLI (oclif/commander) — `parseArgs` + dispatch bastam.
- Outras APIs Google (BigQuery, Ads Data Manager, Merchant, YouTube) — fora das 4 pedidas. A **Indexing API está incluída** (fazia parte da superfície do gsc-mcp substituído).
- Cache local de respostas / camada offline.
- UI/TUI interativa; a CLI é não-interativa exceto o consent do `auth login`.
- A submissão do OAuth App Verification em si (formulário/review da Google) é operação externa, não código — mas seu impacto na story 2 (sem-expiração) está tratado como **Risco [B]** nas Further Notes, não ignorado.
- Métodos GTM v2 deprecados (`accounts.containers.combine`, `move_tag_id`, `destinations.link`/`.get`) — T4 não os conecta.

## Further Notes

- **Risco [A] principal — auth headless:** container não tem browser. Mitigação = `--manual` (paste do `code`) + fallback loopback com port-forward (o vmCODE já faz forward, `secrets.sh:255-261`). Verify: `gapi auth login --manual` no container grava `credentials.json` e `gapi gsc sites list` responde.
- **Ads sem lib Node oficial [V]** — REST cru é o caminho Google-nativo correto (não `google-ads-api`/terceiro).
- **Um consentimento cobre as 4 APIs + Indexing [V]** — já provado em prod pelo `google-relogin.sh:33-58` (um `gcloud login` que concede TODO este conjunto de scopes de uma vez, incluindo `analytics.manage.users` e `indexing`). `google-auth-library` aceita `scope: [...]` em `generateAuthUrl`. `cloud-platform`, presente naquele script legado, foi deliberadamente removido aqui (não é scope das 4 APIs).
- **Risco [B] — App Verification (gate real da story 2):** sair do Testing mode → Production exige o **Google OAuth App Verification** (scopes sensíveis: `analytics.manage.users`, `tagmanager.manage.*`, `adwords`, `webmasters`), review de timeline **não-garantida**. Requisitos: privacy policy URL, homepage, tela de consent revisada. **Fallback se travar/for negado:** o epic entrega com a story 2 (sem-expiração) **não-resolvida** — mantém Testing mode + re-auth manual documentado (cadência ~7 dias, herdada do fluxo atual) até a verificação passar. Verify: consent em Production sem warning "unverified app".
- **Footprint das deps:** `google-auth-library` traz ~6 transitivos Google-mantidos (gaxios, gcp-metadata, jws, base64-js, ecdsa-sig-formatter, google-logging-utils) — ainda **1 dep direta**. A framing "sem deps pesadas" (story 38) = não puxar `googleapis` (214 MB) nem os wrappers `@googleapis/*`; footprint muito menor que os 4 runtimes MCP atuais (2 pipx + 2 npm).
- **Migração vmCODE (T7)** é o último ticket do epic e depende da publicação npm (T6). Auto-heal de homes persistidos via prune LEGACY, sem ação do operador no reboot.
