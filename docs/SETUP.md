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
| `bigquery-dts` | `bigquerydatatransfer.googleapis.com` |
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

For CI, set `GAPI_OAUTH_CLIENT_ID` and `GAPI_OAUTH_CLIENT_SECRET` and skip the prompt —
environment wins over the config file.

> **Trap — the secret is shown once.** Closing the dialog without copying costs you a reset.
> Treat it like a password: it belongs in the prompt or the environment, never in a shell
> history, a commit, or a chat window. Leaked? Reset it under Clients → your client.

**Done when** `gapi auth setup` prints `saved to <config dir>/config.json`.

---

## 6. API key (CrUX, PageSpeed callers only)

`crux` and `pagespeed` take an API key, not the OAuth token. CrUX needs it; PageSpeed sends it
when one is set. Create it in the same Cloud project
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

`~/.config/gapi/config.json`, mode 600. Set `GAPI_CONFIG_DIR` to move the whole directory (config, credentials, discovery cache). `gapi discovery path` prints the cache dir; `gapi discovery refresh [<api>…]` refetches its documents past the 24 h TTL.

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

`gapi auth logout` deletes `credentials.json` and leaves `config.json` — a later
`gapi auth login` reuses the same client.

---

## Runtime errors

| Symptom | Cause | Fix |
|---|---|---|
| `OAuth client not configured` | no client ID or secret resolved | step 5 |
| `Error 403: access_denied` at consent | Testing, and the address is not a test user | step 4 |
| `token expired or revoked` (exit 2) after about a week | Testing refresh token expired (`invalid_grant`) | `gapi auth login`, or publish |
| `missing scope (…); run gapi auth login` (exit 2) | the stored grant predates a scope a new API needs | `gapi auth login` |
| `API key required` (exit 2) | CrUX call with no key | step 6 |
| `config.json is not valid JSON` / `is not a JSON object` / `cannot read …config.json` (exit 2) | config file broken or unreadable; every command stops before any prompt or write | fix the file, or remove it and re-run step 5 (`gapi auth setup`) |
| `not logged in` (exit 2) | `credentials.json` missing, or no `refresh_token` in it | `gapi auth login` |
| `cannot listen on 127.0.0.1:4600: … EADDRINUSE …` (exit 2) | an earlier login still holds the port | `lsof -tiTCP:4600 \| xargs kill` |
| `state mismatch` (exit 2) | the pasted or redirected URL comes from another login attempt | run `gapi auth login` again and use its URL |
| `consent failed: access_denied` (exit 2) | consent was refused | run `gapi auth login` again and accept |
| `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` | Ads level is Test | step 2 |
| `403 SERVICE_DISABLED` | API not enabled on the project | step 1; Business Profile: step 3 |
| `403 BILLING_DISABLED` | no billing account on the project | add a billing account to the project; step 1 trap |
| `401 GCP_NOT_REGISTERED` on a `merchant-*` call | project not registered with a Merchant Center account | step 8 |
| `unavailable: scope not grantable` (exit 2) | one of the 6 `dv360 users` methods; its only scope is never granted to this app | none; `--dry-run` still prints the request |
| `401` on every call, fresh login | wrong Cloud project owns the client | check which project holds the client in use |
| `401 UNAUTHENTICATED` `Invalid credential, cannot get profile` on `bid-manager` only | the login has no DV360 or CM360 user profile | get a DV360 or CM360 user profile for the login, or log in with an account that has one |
