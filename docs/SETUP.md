# Setup

Onboarding for one operator: register an OAuth client, store it, grant consent.
`gapi` is multi-tenant — every operator brings their own Google account and Cloud project,
and nothing in the CLI is pinned to one of them.

Work through steps 1–5 in order. Each ends on a **Done when** you can check before moving on.
**Traps** sit next to the step they bite in; runtime errors are indexed at the end.

---

## 1. Cloud project and APIs

Pick or create a project at [console.cloud.google.com](https://console.cloud.google.com/).
That project owns the OAuth client and, for Ads, the access level that decides what you may call.

Enable each API you plan to use, from **APIs & Services → Library**:

| API | Service name |
|---|---|
| Google Ads | `googleads.googleapis.com` |
| GA4 Admin | `analyticsadmin.googleapis.com` |
| GA4 Data | `analyticsdata.googleapis.com` |
| Search Console | `searchconsole.googleapis.com` |
| Indexing | `indexing.googleapis.com` |
| Tag Manager | `tagmanager.googleapis.com` |

> **Trap — the Ads API Center is dead.** Ads onboarding moved out of the Google Ads UI into
> Cloud Console. Applications started from `ads.google.com/aw/apicenter` are **not processed**.
> Use the [Google Ads API Overview page](https://console.cloud.google.com/google/ads-apis/overview) instead.
> The old API Center still renders, which is what makes this trap convincing.

> **Trap — developer tokens are gone.** Sunset on **2026-09-09**. The header is ignored by the
> API and `gapi` never sends it. Your Cloud project carries the access level now. Guides that
> tell you to fetch a 22-character token are stale.

**Done when** every API you plan to call shows **API Enabled** on its Library page.

---

## 2. Ads access level (Ads callers only)

The access level lives on the **Cloud project that owns your OAuth client** — not on a token,
not on the Ads account. Read it on the
[Google Ads API Overview page](https://console.cloud.google.com/google/ads-apis/overview).

| Level | Production accounts | Daily operations | How to reach |
|---|---|---|---|
| **Test** | test accounts only | 15,000 (test) | default for a new project |
| **Explorer** | **yes** | 2,880 (production) | apply; automatic review, minutes |
| **Basic** | yes | higher | apply; needs brand verification |
| **Standard** | yes | highest | apply; manual review |

**Explorer is the bar for production.** Below it, a call to a real account returns
`CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`.

Test level is workable only against Ads *test accounts*, which live under a separate test
manager account created from a Google account unconnected to your production manager.

> **Trap — the apply click looks idempotent.** *Apply for access* submits, then the page keeps
> rendering the button. Reloading mid-flow silently drops the application. Confirm by the
> banner: **"Your application … is currently under review."** No banner means no application.

**Done when** the Overview page reads **Explorer** or higher, or you accept test-account-only calls.

---

## 3. Consent screen and publishing status

**Google Auth Platform → Branding.** Fill app name, user support email, developer contact email.

**→ Audience.** Set user type **External**.

Publishing status decides who may log in and **how long your refresh token survives**:

| Status | Who can log in | Refresh token life | Price of admission |
|---|---|---|---|
| **Testing** | only addresses listed under *Test users* | **7 days** | free |
| **In production** | any Google account | no 7-day expiry | home page + privacy policy + terms of service URLs, on an authorized domain |

Testing is enough to evaluate the CLI; production is the steady state. `Publish app` stays
disabled until those three URLs are filled in on the Branding page — that is the whole gate.
Budget a hosted page per URL before planning on production.

In Testing, add your own address under **Test users** first.

> **Trap — 7 days is a rolling wall.** Testing refresh tokens expire about weekly. The symptom
> is `invalid_grant` on a command that worked on Friday. Rerun `gapi auth login`, or publish.

**Done when** your address appears in the *Test users* list, or publishing status reads
**In production**.

---

## 4. OAuth client

**Google Auth Platform → Clients → Create client.**

- Application type: **Desktop app**
- Name: anything (`gapi` reads well)

Copy the **client ID** and **client secret** from the dialog, then store them:

```
gapi auth setup
```

It prompts for the client ID, the client secret, and the optional Ads `login-customer-id`.
A blank answer keeps whatever is already stored. It writes `~/.config/gapi/config.json` (mode 600).

For CI, set `GAPI_OAUTH_CLIENT_ID` and `GAPI_OAUTH_CLIENT_SECRET` and skip the prompt —
environment wins over the config file.

> **Trap — the secret is shown once.** Closing the dialog without copying costs you a reset.
> Treat it like a password: it belongs in the prompt or the environment, never in a shell
> history, a commit, or a chat window. Leaked? Reset it under Clients → your client.

**Done when** `gapi auth setup` prints `saved to ~/.config/gapi/config.json`.

---

## 5. Consent

```
gapi auth login            # loopback on 127.0.0.1:4600
gapi auth login --manual   # headless: prints the URL, takes the pasted code
```

One consent grants all 13 scopes. Sign in with the address you listed as a test user.
An unverified app shows a warning screen — continue through **Advanced** to reach the
scope list, then accept.

Verify:

```
gapi auth status
```

It prints the account, whether a refresh token is stored, and the granted scopes.

> **Trap — port 4600 lingers.** A login you interrupted keeps the listener, and the next one
> dies on `EADDRINUSE`. Clear it: `lsof -tiTCP:4600 | xargs kill`.

**Done when** `gapi auth status` shows your account, `"hasRefreshToken": true`, and the scopes
for the APIs you enabled.

---

## Google Ads customer IDs

Both are 10 digits with the hyphens removed (`123-456-7890` → `1234567890`).

| Value | Meaning | Where to read it |
|---|---|---|
| `--customer` | the account a call targets | Google Ads UI, top right, while in that account |
| `--login-customer-id` | the manager (MCC) account acting on it | the manager account's own ID; omit it for direct access |

Direct-access accounts need only `--customer`. Confirm what your login can reach:

```
gapi ads customers list-accessible
gapi ads gaql "SELECT campaign.id, campaign.name FROM campaign" --customer <ID>
```

---

## Config file

`~/.config/gapi/config.json`, mode 600:

```json
{
  "oauth_client_id": "...apps.googleusercontent.com",
  "oauth_client_secret": "...",
  "login-customer-id": "1234567890",
  "project": "my-quota-project"
}
```

| Key | Flag | Environment variable |
|---|---|---|
| `oauth_client_id` | — | `GAPI_OAUTH_CLIENT_ID` |
| `oauth_client_secret` | — | `GAPI_OAUTH_CLIENT_SECRET` |
| `login-customer-id` | `--login-customer-id` | `GOOGLE_ADS_LOGIN_CUSTOMER_ID` |
| `project` | `--project` | `GOOGLE_CLOUD_PROJECT` |

Flags beat environment variables, which beat the file.

`gapi auth logout` deletes `credentials.json` and leaves `config.json` — a later
`gapi auth login` reuses the same client.

---

## Runtime errors

| Symptom | Cause | Fix |
|---|---|---|
| `OAuth client not configured` | no client ID or secret resolved | step 4 |
| `Error 403: access_denied` at consent | Testing, and the address is not a test user | step 3 |
| `invalid_grant` after about a week | Testing refresh token expired | `gapi auth login`, or publish |
| `EADDRINUSE :::4600` | an earlier login still holds the port | `lsof -tiTCP:4600 \| xargs kill` |
| `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` | Ads level is Test | step 2 |
| `403 SERVICE_DISABLED` | API not enabled on the project | step 1 |
| `401` on every call, fresh login | wrong Cloud project owns the client | check which project holds the client in use |
