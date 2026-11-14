# Setup

Onboarding for one operator: register an OAuth client, store it, grant consent.
`gapi` is multi-tenant — every operator brings their own Google account and Cloud project,
and nothing in the CLI is pinned to one of them.

Work through the steps in order; skip the ones marked for callers you are not. Each ends on a
**Done when** you can check before moving on.
**Traps** sit next to the step they bite in; runtime errors are indexed at the end.

---

## 1. Cloud project and APIs

Pick or create a project at [console.cloud.google.com](https://console.cloud.google.com/).
That project owns the OAuth client, the API key and, for Ads, the access level that decides what you may call.

Enable each API you plan to use, from **APIs & Services → Library**. The service name is the
host of the entry's discovery URL (`src/apis/<api>.ts`); `business-v4` declares its own.

| gapi entries | Service name |
|---|---|
| `ads` | `googleads.googleapis.com` |
| `ga4-admin`, `ga4-admin-alpha` | `analyticsadmin.googleapis.com` |
| `ga4-data`, `ga4-data-alpha` | `analyticsdata.googleapis.com` |
| `gsc` | `searchconsole.googleapis.com` |
| `gtm` | `tagmanager.googleapis.com` |
| `indexing` | `indexing.googleapis.com` |
| `merchant-*` (all 14) | `merchantapi.googleapis.com` |
| `sa360` | `searchads360.googleapis.com` |
| `sa360-legacy` | `doubleclicksearch.googleapis.com` |
| `cm360` | `dfareporting.googleapis.com` |
| `dv360` | `displayvideo.googleapis.com` |
| `bid-manager` | `doubleclickbidmanager.googleapis.com` |
| `youtube` | `youtube.googleapis.com` |
| `youtube-analytics` | `youtubeanalytics.googleapis.com` |
| `youtube-reporting` | `youtubereporting.googleapis.com` |
| `pagespeed` | `pagespeedonline.googleapis.com` |
| `crux` | `chromeuxreport.googleapis.com` |
| `bigquery` | `bigquery.googleapis.com` |
| `bigquery-dts` | `bigquerydatatransfer.googleapis.com` |
| `cloudquotas` | `cloudquotas.googleapis.com` — on each project that sets quotas, step 9 |
| `data-manager` | `datamanager.googleapis.com` |
| `postmaster` | `gmailpostmastertools.googleapis.com` |
| `site-verification` | `siteverification.googleapis.com` (never `www.googleapis.com`, its `rootUrl`) |
| `sheets` | `sheets.googleapis.com` |
| `places` | `places.googleapis.com` |
| `web-risk` | `webrisk.googleapis.com` |
| `business-v4` | `mybusiness.googleapis.com` — **after approval**, step 3 |
| `business-account-management` | `mybusinessaccountmanagement.googleapis.com` — **after approval** |
| `business-information` | `mybusinessbusinessinformation.googleapis.com` — **after approval** |
| `business-lodging` | `mybusinesslodging.googleapis.com` — **after approval** |
| `business-notifications` | `mybusinessnotifications.googleapis.com` — **after approval** |
| `business-place-actions` | `mybusinessplaceactions.googleapis.com` — **after approval** |
| `business-verifications` | `mybusinessverifications.googleapis.com` — **after approval** |
| `business-performance` | `businessprofileperformance.googleapis.com` — **after approval** |

With `gcloud`, one call per batch of names: `gcloud services enable <service> … --project <id>`.

> **Trap — some APIs need a billing account, even for free calls.** Without a billing account
> on the project, calls such as `bigquery-dts … dataSources list` and `web-risk uris search`
> return 403 `PERMISSION_DENIED`, reason `BILLING_DISABLED`. Web Risk `uris.search` is free up
> to 100,000 calls a month ([pricing](https://cloud.google.com/web-risk/pricing): "free for up to
> 100,000 calls per month"); `hashes.search` is paid only. Places (New) also needs a billing
> account: free monthly caps, then billed.

> **Trap — the Ads API Center is dead.** Ads onboarding moved out of the Google Ads UI into
> Cloud Console. Applications started from `ads.google.com/aw/apicenter` are **not processed**.
> Use the [Google Ads API Overview page](https://console.cloud.google.com/google/ads-apis/overview) instead.
> The old API Center still renders, which is what makes this trap convincing.
> [Google](https://developers.google.com/google-ads/api/docs/api-policy/developer-token): applications
> "won't be processed if initiated from the API Center page".

> **Trap — developer tokens are gone.** Sunset on **2026-09-09**. The header is ignored by the
> API and `gapi` never sends it ([Google](https://developers.google.com/google-ads/api/docs/api-policy/developer-token):
> "We sunset developer tokens on September 9, 2026 … optional and ignored by the API servers").
> Your Cloud project carries the access level now. Guides that tell you to fetch a 22-character
> token are stale.

**Done when** every API you plan to call, except the Business Profile ones, shows **API Enabled**
on its Library page.

---

## 2. Ads access level (Ads callers only)

The access level lives on the **Cloud project that owns your OAuth client** — not on a token,
not on the Ads account. Read it on the
[Google Ads API Overview page](https://console.cloud.google.com/google/ads-apis/overview).

| Level | Production accounts | Daily operations | How to reach |
|---|---|---|---|
| **Test** | test accounts only | 15,000 | default for a new project |
| **Explorer** | **yes** | 2,880 production, 15,000 test | apply; Google may upgrade automatically |
| **Basic** | yes | 15,000 | apply; needs brand verification |
| **Standard** | yes | unlimited | apply; manual review |

Source: [Google Ads API access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels).

**Explorer is the bar for production.** Below it, a call to a real account returns
`CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`.

Test level is workable only against Ads *test accounts*, which live under a separate test
manager account created from a Google account unconnected to your production manager.

> **Trap — the apply click looks idempotent.** *Apply for access* submits, then the page keeps
> rendering the button. Reloading mid-flow silently drops the application. Confirm by the
> banner: **"Your application … is currently under review."** No banner means no application.

**Done when** the Overview page reads **Explorer** or higher, or you accept test-account-only calls.

---

## 3. Business Profile access (Business Profile callers only)

Google gates the 8 Business Profile services (`business-*` entries). Requirements
([prerequisites](https://developers.google.com/my-business/content/prereqs)):

- you manage a Google Business Profile **verified and active for 60+ days**;
- the business has a **website** listed on that profile;
- you apply from an address that is an owner or manager of that profile.

Order — approval → enable → login:

1. Read your **Project Number** on the Cloud project Dashboard (Project info card).
2. Submit the [GBP API contact form](https://support.google.com/business/contact/api_default),
   option **Application for Basic API Access**, with that project number. Wait for the reply email.
3. After approval, enable the 8 services from the table in step 1.
4. Run `gapi auth login` (step 7) after the services are enabled, so `business.manage` is in the
   grant. Approval arrives after your first login? Run it again.

> **Trap — quota 0 means not approved.** Before approval the services do not show in the
> Library, and calls return `SERVICE_DISABLED` or access denied (exit 1). The Business Profile
> quota page in Cloud Console reads **0 QPM** until approval and **300 QPM** after
> ([limits](https://developers.google.com/my-business/content/limits): "If your quota limit for the
> Google Business Profile API is 0, you have not yet been granted access"; default requests 300 QPM).

**Done when** the Business Profile quota reads 300 QPM and the 8 services show **API Enabled**.

---

## 4. Consent screen and publishing status

**Google Auth Platform → Branding.** Fill app name, user support email, developer contact email.

**→ Audience.** Set user type **External**.

Publishing status decides who may log in and **how long your refresh token survives**:

| Status | Who can log in | Refresh token life | Price of admission |
|---|---|---|---|
| **Testing** | only addresses listed under *Test users* (up to 100) | **7 days** | free |
| **In production** | any Google account | no 7-day expiry | home page + privacy policy + terms of service URLs, on an authorized domain |

Sources: [OAuth 2.0](https://developers.google.com/identity/protocols/oauth2#expiration) ("a
publishing status of "Testing" is issued a refresh token expiring in 7 days"),
[Manage App Audience](https://support.google.com/cloud/answer/15549945),
[Branding](https://support.google.com/cloud/answer/15549049) ("These links are required for all
external production apps.").

Testing is enough to evaluate the CLI; production is the steady state. Budget a hosted page per
URL before planning on production.

Publishing does not need OAuth App Verification. Until verification, the consent for `gapi`'s
sensitive scopes shows the **unverified app** warning (click through it) and the app has a cap
of 100 new users. Personal use needs no verification ([Google](https://support.google.com/cloud/answer/13464323):
"If the app is for your personal use (fewer than 100 users), you and your limited number of users
can continue using the app without going through verification"). Verification removes the
warning and the cap; its review timeline is not guaranteed.

In Testing, add your own address under **Test users** first.

> **Trap — 7 days is a rolling wall.** Testing refresh tokens expire about weekly. The symptom
> is `invalid_grant` on a command that worked on Friday. Rerun `gapi auth login`, or publish.

**Done when** your address appears in the *Test users* list, or publishing status reads
**In production**.

---

## 5. OAuth client

**Google Auth Platform → Clients → Create client.**

- Application type: **Desktop app**
- Name: anything (`gapi` reads well)

Copy the **client ID** and **client secret** from the dialog, then store them:

```
gapi auth setup
```

It prompts for the client ID, the client secret, and three optional values: the Ads
`login-customer-id`, the SA360 `sa360-login-customer-id`, and an API key (CrUX, PageSpeed).
A blank answer keeps whatever is already stored. It writes `~/.config/gapi/config.json` (mode 600).
The secret and API-key prompts stay blank while you type — that is the masking, not a dead terminal.
Piped stdin works too: one answer per line, in prompt order. Input that ends early exits 3 and saves nothing.

For CI, set `GAPI_OAUTH_CLIENT_ID` and `GAPI_OAUTH_CLIENT_SECRET` and skip the prompt —
environment wins over the config file.

> **Trap — the secret is shown once.** Closing the dialog without copying costs you a reset.
> Treat it like a password: it belongs in the prompt or the environment, never in a shell
> history, a commit, or a chat window. Leaked? Reset it under Clients → your client.

**Done when** `gapi auth setup` prints `saved to <config dir>/config.json`.

---

## 6. API key (CrUX, PageSpeed callers only)

`crux` and `pagespeed` take an API key, not the OAuth token. CrUX needs it; PageSpeed sends it
when one is set. Create it in a Cloud project **without a billing account** (step 9), so its
calls can never be billed. Enable both APIs there
([API keys](https://docs.cloud.google.com/docs/authentication/api-keys)):

1. **APIs & Services → Credentials → Create credentials → API key.**
2. On the key, **API restrictions → Restrict key**: select only the Chrome UX Report API
   (`chromeuxreport.googleapis.com`) and the PageSpeed Insights API (`pagespeedonline.googleapis.com`). Save.
3. Store it: `gapi auth setup` (the API-key prompt), or pass `--api-key` / set `GAPI_API_KEY` per call.

> **Trap — an unrestricted key is a bearer secret for every key-enabled API on the project.**
> Restrict it, and keep it out of shell history, commits and chat.

**Done when** `gapi crux records queryRecord --body '{"origin":"https://example.com"}' --dry-run`
prints no `API key required` warning on stderr (the header shows `<redacted>` either way).

---

## 7. Consent

```
gapi auth login            # loopback: listens on 127.0.0.1:4600 for the redirect
gapi auth login --manual   # headless: prints the URL, takes the pasted redirect URL
```

Both flows redirect to `http://127.0.0.1:4600` and send `state` and a PKCE (S256) challenge.
With `--manual`, open the URL in any browser; after consent that browser cannot load
`127.0.0.1:4600` (nothing listens there), so copy the full URL from its address bar and paste it at
the `redirected URL:` prompt. A refused consent exits 2 with `consent failed: access_denied`; a
pasted URL from another login attempt exits 2 with `state mismatch`.

One consent grants every scope the API entries use, plus `openid` and `email`. The set is computed
from the discovery documents (first scope of each method; never `drive`/`drive.*` or
`display-video-user-management`), so `login` fetches every document first. Desktop apps get no
incremental authorization: after an upgrade adds an API, run `login` again. Sign in with the address you listed as a test user.
An unverified app shows a warning screen — continue through **Advanced** to reach the
scope list, then accept.

Verify:

```
gapi auth status
```

It prints the account, whether a refresh token is stored, whether an API key is set (env or config), the granted scopes, and `missing`:
the consent scopes the stored grant lacks. A non-empty `missing` means run `gapi auth login` again.

> **Trap — port 4600 lingers.** A login you interrupted keeps the listener, and the next one
> exits 2 with `cannot listen on 127.0.0.1:4600: … EADDRINUSE …`. Clear it: `lsof -tiTCP:4600 | xargs kill`.

**Done when** `gapi auth status` shows your account, `"hasRefreshToken": true`, and `"missing": []`; after step 6, also `"hasApiKey": true`.

---

## 8. Merchant API registration (Merchant callers only)

Until you register the Cloud project with a Merchant Center account, Merchant API answers every
call with 401 `GCP_NOT_REGISTERED`. Register once, after step 7
([guide](https://developers.google.com/merchant/api/guides/quickstart/direct-api-calls#step_1_register_as_a_developer)):

```
gapi merchant-accounts accounts developerRegistration registerGcp \
  --params '{"name":"accounts/<merchant-id>/developerRegistration"}' \
  --body '{"developerEmail":"<email>"}'
```

- `<merchant-id>`: the Merchant Center account that lists your login as a direct user. It must
  be a production account with a verified website.
- `<email>`: a Google Account (not a service account). Google gives it the API developer role and
  API notification emails. Google invites an address that is not yet a user.

One registration covers every Merchant Center account the project calls.

> **Trap — test accounts and subaccounts.** Google rejects a test account. It also rejects a
> subaccount when your login has access only through the parent or advanced account.

> **Trap — the first call fails.** Registration takes up to 5 minutes. A call before then still
> returns `GCP_NOT_REGISTERED`.

**Done when** `gapi merchant-accounts accounts developerRegistration getDeveloperRegistration --params '{"name":"accounts/<merchant-id>/developerRegistration"}'`
lists your project number in `gcpIds`.

---

## 9. Free-tier guards (billed APIs)

Goal: no `gapi` call causes a charge. Each billable surface has a server-side hard limit, or its
project has no billing account. A local counter cannot see other clients (Looker Studio, the
console, a second machine), so `gapi` keeps none.

| Project | Billing | Holds | Guard |
|---|---|---|---|
| Free project | none | The `gapi` API key (step 6); a new GA4 export link (BigQuery sandbox) | No billing account: Google cannot charge |
| Billing project (step 1) | active | OAuth client; Places; Web Risk; existing GA4 export links | Daily quotas below the free tier; a $1 budget email alert |

1. **Free project.** Use a project without billing, or create one. Open **Billing** for it.
   It must say the project has no billing account; else **Disable billing**.
2. **API key** in the free project: step 6.
3. **GA4 export links.** List each property's link: recipe
   [GA4 export links](../skills/gapi/recipes.md#ga4-export-links). Keep an existing link, also into
   a billing project. Keep `dailyExportEnabled: true` and `streamingExportEnabled: false`: streaming
   export adds BigQuery costs ([GA4 Help](https://support.google.com/analytics/answer/9358801)).
   No link yet: link the property to the free project (GA4 **Admin → BigQuery links**). It
   exports "free of charge (sandbox limits apply)" ([GA4 Help](https://support.google.com/analytics/answer/9823238)).
4. **Quotas.** Query quota on each billing project that runs queries: recipe
   [BigQuery: 32 GiB of queries per day](../skills/gapi/recipes.md#bigquery-32-gib-of-queries-per-day).
   Read it back: recipe [All quota preferences](../skills/gapi/recipes.md#all-quota-preferences).
   **Places and Web Risk quotas** on the billing project: recipes
   [Places](../skills/gapi/recipes.md#places-32-requests-per-day-per-billed-method) and
   [Web Risk](../skills/gapi/recipes.md#web-risk-urissearch-2-per-minute-hashessearch-0).
5. **Budget alert** on the billing account: **Billing → Budgets & alerts → Create budget**,
   amount $1, email alerts on. It is a tripwire, not a cap. It reports a mistake; the
   quotas prevent it. The console sets it:
   the Budget API would add a scope.

Limits on the billing project come from Google's rule for a free cap: "divide the free usage cap
by 31 … and round down" ([Maps: Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs)).

- **BigQuery queries:** 1 TiB per month free per billing account. `QueryUsagePerDay` = 32 GiB
  (31 × 32 GiB = 992 GiB). All query projects on one billing account share the 1 TiB: their
  daily quotas add up to 33 GiB or less (two projects: 16 GiB each).
- **Places:** 32 requests per day on each billed method (`autocomplete`, `get`, `photos.getMedia`,
  `searchNearby`, `searchText`). 32 = floor(1,000 / 31). The field mask picks the SKU; the lowest
  Places cap is 1,000 per month. No SKU is billed by two of these methods, so each gets the full 32.
- **Web Risk:** no per-day quota exists, only per minute. `uris.search` 2 per minute
  (floor(100,000 / 31 / 1,440); at most 89,280 per 31 days); `hashes.search` 0 (no free use).
- A refused call exits 1 with Google's quota message.

**BigQuery sandbox** (the free project) ([BigQuery sandbox](https://docs.cloud.google.com/bigquery/docs/sandbox)):

- No billing account, so no charge.
- Tables expire after 60 days; no DML; no streaming.
- The GA4 export starts at the link and adds the previous day each day. So event history is a
  rolling 60 days; expired days do not come back. Long-term trends: `ga4-data`.
- **Upgrade path** (longer history): link billing to the free project, then set its
  `QueryUsagePerDay` (step 4) before the first query.

**Storage:** `gapi` stores nothing in BigQuery: `+query` is read-only, and `gapi` never sets a
table expiration (that deletes data). On a billing project, export storage above 10 GiB per month
is billed ([BigQuery pricing](https://cloud.google.com/bigquery/pricing#storage)). `gapi` cannot
control that cost.

**`+query` in this topology:** pass `--project <project>` per call (the project that holds the
export). Keep `project` unset in the config, so other calls keep their quota project.

> **Trap — a new project gets a billing account.** The console links your billing account to a
> new project. Check the project's **Billing** page after creation.

> **Trap — a quota cut over 10 % fails.** Cloud Quotas needs
> `ignoreSafetyChecks: QUOTA_DECREASE_PERCENTAGE_TOO_HIGH` for it. The recipe sends it. The
> default `QueryUsagePerDay` is 200 TiB ([Google](https://docs.cloud.google.com/bigquery/docs/custom-quotas)).

Rejected options:

| Option | Reason |
|---|---|
| Automatic billing disable on a budget alert | Google: it "terminate[s] all Google Cloud services in the project, including Free Tier services", and alert delays mean it "doesn't guarantee that you won't spend more than your budget" ([Cloud Billing](https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications)) |
| A local spend counter | It cannot see other clients. Server-side quotas and the project without billing are the guards |

**Done when** recipe [All quota preferences](../skills/gapi/recipes.md#all-quota-preferences) shows
`QueryUsagePerDay` with `grantedValue` = 32 GiB (or your share) in the `metricUnit` unit. Check
each billing project that runs queries. The billing project also shows the five Places quotas at
32 and the two Web Risk quotas at 2 and 0. The free project's **Billing** page shows no billing account.

---

## Client access (agencies)

One **operator account** runs `gapi`: it runs `gapi auth login` and owns the Cloud project of
step 1. Each **client account** stays the primary owner of its own products and adds the operator
account as an admin in each product. `gapi` never logs in as a client. One refresh token reaches
every client that granted access, and a new grant needs no new login: access lives on the
client's product, the scopes stay the same.

| Product | Client adds the operator at | Role | Check |
|---|---|---|---|
| GA4 | Admin → Account access management | Administrator (account level covers all properties) | `gapi ga4-admin accountSummaries list` |
| Google Cloud (only client-owned projects, e.g. a client's BigQuery export) | IAM & Admin → IAM → Grant access, in the Cloud console | Owner (`roles/owner`); the operator accepts the email invitation | the project shows in the operator's Cloud console project picker |
| Search Console | Settings → Users and permissions | Owner (delegated by a verified owner); the Indexing API needs an owner ([prereqs](https://developers.google.com/search/apis/indexing-api/v3/prereqs)) | `gapi gsc sites list` |
| Tag Manager | Admin → User Management (account) | account Administrator, container Publish | `gapi gtm accounts list` |
| Google Ads | Admin → Access and security → Managers: accept the link request from the operator's manager account | manager link (preferred), else Admin user access | `gapi ads customers listAccessibleCustomers` |
| Merchant Center | Settings → People and access | Admin | `gapi merchant-accounts accounts list` |
| Business Profile | Business Profile settings → People and access | Owner (a Manager cannot add users) | `gapi business-account-management accounts list` |

- **Google Ads manager link.** One manager account holds all client accounts. Calls then send
  `--login-customer-id <manager id>` (see Google Ads customer IDs below).
- **Google Cloud Owner for an outside user.** When the user or the project is outside an
  organization, grant `roles/owner` in the Cloud console; the API and `gcloud` cannot
  ([IAM docs](https://cloud.google.com/iam/docs/granting-changing-revoking-access)).
  Owner on a project with billing can spend on the client's card: set the free-tier quotas on that
  project before any call ([step 9](#9-free-tier-guards-billed-apis)).
- **Only when the client uses them:** Postmaster Tools (domain → Manage users), Sheets (share
  the file as Editor), SA360, CM360, DV360 and Bid Manager (each product's user admin).
- **YouTube is not covered.** Invited users "can't access … YouTube APIs" with channel
  permissions ([YouTube Help](https://support.google.com/youtube/answer/9481328)). The YouTube
  entries act on the channel of the signed-in account only.
- **Primary ownership stays with the client.** The client can remove the operator at any time;
  `gapi` needs no change.
- **Protect the operator account.** Its refresh token reaches every client. Use 2-Step
  Verification with a passkey or a security key. `credentials.json` is mode 600;
  `gapi auth logout` revokes the token.

**Done when** each check lists the client's account, property, site or container.

---

## Google Ads customer IDs

Both are 10 digits with the hyphens removed (`123-456-7890` → `1234567890`).

| Value | Meaning | Where to read it |
|---|---|---|
| `--customer` (`+gaql`) or `customerId` (`--params`) | the account a call targets | Google Ads UI, top right, while in that account |
| `--login-customer-id` | the manager (MCC) account acting on it | the manager account's own ID; omit it for direct access |

Direct-access accounts need only `--customer`. Confirm what your login can reach:

```
gapi ads customers listAccessibleCustomers
gapi ads +gaql "SELECT campaign.id, campaign.name FROM campaign" --customer <ID>
```

---

## Config file

`~/.config/gapi/config.json`, mode 600. Set `GAPI_CONFIG_DIR` to move the whole directory (config, credentials, discovery cache, `--cache` responses). `gapi discovery path` prints the cache dir; `gapi discovery refresh [<api>…]` refetches its documents past the 24 h TTL.

```json
{
  "oauth_client_id": "...apps.googleusercontent.com",
  "oauth_client_secret": "...",
  "login-customer-id": "1234567890",
  "sa360-login-customer-id": "1234567890",
  "api_key": "...",
  "project": "my-quota-project"
}
```

| Key | Flag | Environment variable |
|---|---|---|
| `oauth_client_id` | — | `GAPI_OAUTH_CLIENT_ID` |
| `oauth_client_secret` | — | `GAPI_OAUTH_CLIENT_SECRET` |
| `login-customer-id` | `--login-customer-id` (ads only) | `GOOGLE_ADS_LOGIN_CUSTOMER_ID` |
| `sa360-login-customer-id` | `--login-customer-id` (sa360 only) | `SA360_LOGIN_CUSTOMER_ID` |
| `api_key` | `--api-key` | `GAPI_API_KEY` |
| `project` | `--project` | `GOOGLE_CLOUD_PROJECT` |

Flags beat environment variables, which beat the file. A header flag such as
`--login-customer-id` works only on the APIs that declare it; elsewhere it exits 3.
API-key APIs (CrUX, PageSpeed) send `X-Goog-Api-Key`, never the OAuth token. CrUX needs the
key (exit 2 without it). PageSpeed sends the key only when one is set. `project` (the
`x-goog-user-project` header) is sent only with OAuth.

`gapi auth logout` revokes the refresh token at Google (the whole grant ends), then deletes
`credentials.json` and leaves `config.json` — a later `gapi auth login` reuses the same client.
A token Google already treats as invalid or revoked is deleted with a warning. A network error
or any other failure keeps `credentials.json` and exits 1: run `gapi auth logout` again.
In every case it deletes the stored `--cache` responses (`responses/`) and the entities index
(`entities.db`). `gapi auth login` deletes both too.

---

## Runtime errors

| Symptom | Cause | Fix |
|---|---|---|
| `OAuth client not configured` | no client ID or secret resolved | step 5 |
| `Error 403: access_denied` at consent | Testing, and the address is not a test user | step 4 |
| `token expired or revoked` (exit 2) after about a week | Testing refresh token expired (`invalid_grant`) | `gapi auth login`, or publish |
| `missing scope (…); run gapi auth login` (exit 2) | the stored grant predates a scope a new API needs | `gapi auth login` |
| `discovery fetch failed for <api>: …; retry: gapi discovery refresh <api>` (exit 4) | the document fetch failed and no usable cache copy (missing, or not a discovery document) | check network, then `gapi discovery refresh <api>` |
| `API key required` (exit 2) | CrUX call with no key | step 6 |
| `config.json is not valid JSON` / `is not a JSON object` / `cannot read …config.json` (exit 2) | config file broken or unreadable; every command stops before any prompt or write | fix the file, or remove it and re-run step 5 (`gapi auth setup`) |
| `not logged in` (exit 2) | `credentials.json` missing, or no `refresh_token` in it | `gapi auth login` |
| `cannot listen on 127.0.0.1:4600: … EADDRINUSE …` (exit 2) | an earlier login still holds the port | `lsof -tiTCP:4600 \| xargs kill` |
| `state mismatch` (exit 2, `--manual`) | the pasted URL comes from another login attempt; the loopback login answers 400 and keeps waiting | run `gapi auth login` again and use its URL |
| `no refresh token returned` (exit 2) | Google sent no refresh token; nothing is saved | `gapi auth login` again |
| `warning: scopes not granted: …` after login | boxes left unticked on the consent screen; those APIs answer 403 | `gapi auth login` and tick every box |
| `network: <cause>` (exit 1) | no HTTP answer after the retries (DNS, reset, timeout) | check network, then re-run |
| `consent failed: access_denied` (exit 2) | consent was refused | run `gapi auth login` again and accept |
| `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` | Ads level is Test | step 2 |
| `403 SERVICE_DISABLED` | API not enabled on the project | step 1; Business Profile: step 3 |
| `403 BILLING_DISABLED` | no billing account on the project | add a billing account to the project; step 1 trap |
| `401 GCP_NOT_REGISTERED` on a `merchant-*` call | project not registered with a Merchant Center account | step 8 |
| `unavailable: scope not grantable` (exit 2) | one of the 6 `dv360 users` methods; its only scope is never granted to this app | none; `--dry-run` still prints the request |
| `401` on every call, fresh login | wrong Cloud project owns the client | check which project holds the client in use |
| `401 UNAUTHENTICATED` `Invalid credential, cannot get profile` on `bid-manager` only | the login has no DV360 or CM360 user profile | get a DV360 or CM360 user profile for the login, or log in with an account that has one |
