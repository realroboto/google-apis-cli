---
type: research
title: Google Ads API Explorer access for the operator project
date: 2026-11-14
ticket: 247
---

# Google Ads API Explorer access for the operator project

## Question

How does the operator project get Google Ads API **Explorer** access (or higher)? Why did Google deny the first application?

## Answer (short)

- Google publishes no Explorer eligibility list. Google "may let you apply"; approval is "in most cases".
- The denial email text matches a **known issue** on Google's developer-token page (updated 2026-11-13). Google names the trigger: Free Trial, or a suspended or disabled billing account. Google says a fix is in progress.
- Per Google Cloud, a project with no billing account linked does not have billing enabled. The operator project has no billing account. The approved project has billing linked (since 2026-10-28).
- Billing state is **not proven** as the trigger. On 2026-09-11 a project with no billing got Explorer, and a project linked to the operator's paid account was denied. See [Application record](#application-record-cloud-quotas).
- Brand verification does not explain the denial. Both projects are unverified. Google requires it only for Basic and Standard.
- Candidate fix: link the operator's paid billing account (owner cost decision), verify the brand (needed for Basic later), wait a few minutes, re-apply. Denied again: Ads API Compliance form, and wait for Google's fix.

## Eligibility facts

Page dates are the "Last updated" line, read 2026-11-14.

| # | Claim | Quote | Source |
|---|---|---|---|
| 1 | Level belongs to the Cloud project | "Your Google Cloud project is assigned an access level" | [access-levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels) (2026-11-13) |
| 2 | Which project counts | "the project that owns your OAuth client ID and secret" | [developer-token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token) (2026-11-13) |
| 3 | Test limit | "the project can only make Google Ads API requests against test accounts." | access-levels |
| 4 | Explorer quota | "2,880 operations / day for production accounts" | access-levels |
| 5 | No published criteria | "After you've completed the initial sign-up for the Google Ads API, Google may let you apply for Explorer access level." | access-levels |
| 6 | Apply steps | "Click the **Apply for access** button to apply for Explorer access level." | access-levels |
| 7 | Auto upgrade possible | "Google may automatically upgrade your project's API access level to Explorer after you submit your application." | access-levels |
| 8 | Approval usual, not certain | "upgrade it to Explorer in most cases. If you weren't granted Explorer access, don't worry" | [make-first-call](https://developers.google.com/google-ads/api/docs/get-started/make-first-call) (2026-11-13) |
| 9 | **Denial text is a known issue** | "some users signing up for Explorer access are also rejected with a rejection email that says "At this time, we are unable to grant Explorer Access to your Google Cloud project because it does not meet the eligibility criteria required for direct production account access …"" | developer-token |
| 10 | Its root cause | "Your Google Cloud project may be on Google Cloud Free Trial program or has a suspended or disabled billing account." | developer-token |
| 11 | How to check | "If your billing project shows as "Free trial account" or is in a suspended or disabled state, you are affected by this issue." | developer-token |
| 12 | Fix status | "We have identified the root cause and are working on a fix for this issue." | developer-token |
| 13 | Workarounds (text says Basic) | "Upgrade your Google Cloud project to a paid tier"; "remove billing for your Google Cloud project"; "Use a different Google Cloud project"; "Wait for a few minutes and try applying for Basic access again." | developer-token |
| 14 | No link = billing not enabled | "Billing is enabled on a project if the following are true: 1. The project is linked to a Cloud Billing account." | [verify-billing-enabled](https://docs.cloud.google.com/billing/docs/how-to/verify-billing-enabled) (2026-11-10) |
| 15 | Ads API costs nothing | "there are no charges for using the Google Ads API at Explorer access, Basic access, or Standard access levels." | [productionize/access-levels](https://developers.google.com/google-ads/api/docs/productionize/access-levels) (2026-11-13) |
| 16 | Brand verification: Basic and Standard only | "For new Basic and Standard access applications, you must complete brand verification" | developer-token |
| 17 | Basic needs External + In production | "you _must_ set your application's **User type** to **External** and its **Publishing status** to **In production**." | [brand-verification (Ads)](https://developers.google.com/google-ads/api/docs/api-policy/brand-verification) (2026-11-13) |
| 18 | Brand verification steps | "click **Verify Branding** under **Verification status**." / "After verification completes, click **Publish branding**." | brand-verification (Ads) |
| 19 | Brand verification time | "typically takes a few minutes" / "manual review process that usually takes 2-3 business days" | [brand-verification (Identity)](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) (2026-11-10) |
| 20 | Domains | "Google requires verification of all domains that are associated with an application's OAuth consent screen and credentials." | brand-verification (Identity) |
| 21 | No manager account needed | "You no longer need a Google Ads manager account to use the Google Ads API." | developer-token |
| 22 | API Center is dead | "these applications won't be processed." | developer-token |
| 23 | Token levels moved by history | "Your current and active developer token access level was automatically transferred to your Google Cloud projects based on API activity in the 90 days preceding the sunset." | developer-token |
| 24 | Second known issue after upgrade | "some users who upgraded their Google Cloud project's access level to approved Basic or Explorer access levels after September 9, 2026 receive an `AUTHORIZATION_ERROR`" | developer-token |
| 25 | Help path | "fill out the Contact Google Ads API Compliance form" | [compliance](https://developers.google.com/google-ads/api/support/compliance) (2026-08-13) |

Not Google docs, on Google's repo: in [google-ads-mcp#133](https://github.com/googleads/google-ads-mcp/issues/133), users with paid billing and verified brands report Explorer denials. A Google collaborator (2026-10-13): "I relayed it internally and the issue is being investigated".

## Prior success

No transcript records how the approved project got Explorer. Local transcripts start 2026-11-01. This timeline comes from repo history and docs.

| Date | Event | Evidence |
|---|---|---|
| 2026-09-03 | Approved project created | `gcloud projects describe` |
| 2026-09-09 | Developer tokens sunset; token levels move to projects by 90-day activity | fact 23 |
| 2026-09-11 | gapi Desktop client created in approved project. SETUP step 2 "apply" trap written the same day. | console Clients; gapi commit 0afdc94 |
| ≤ 2026-09-26 | Explorer active: Keyword Planner fails with "explorer access" | campanhas commit 3d570ad |
| 2026-10-28 | Billing linked to approved project (BigQuery sandbox expiry) | sgtm ADR 0007 |
| 2026-11-14 | Operator project applies; denied 0.3 s later (quota preference), then by email | session 4e086ec9 |

- Billing: **off** when Explorer started. Linked one month later.
- Brand: **not verified**, then and now.
- Consent: External, In production, app name and URLs filled (same values as operator project).
- No application form, design doc or manager-account link is recorded. Today's flow shows one "Apply for access" button, no form.
- Unknown: console application (inferred 2026-09-11) or developer-token transfer at the sunset.

## Application record (Cloud Quotas)

The console stores each Explorer application as a Cloud Quotas quota preference: service `googleads.googleapis.com`, quota `explorer-access-grant-limit-per-project`, `preferredValue` 1, `requestOrigin` `CLOUD_CONSOLE`. `grantedValue` 1 = approved, 0 = denied. Read it per project, read-only:

```
gapi cloudquotas projects locations quotaPreferences list --params '{"parent":"projects/<project>/locations/global"}'
```

Read 2026-11-14. Times UTC.

| Project | Billing at request | Requested | Result | Last update |
|---|---|---|---|---|
| Approved project | none (linked 2026-10-28 18:11, audit log `AssignResourceToBillingAccount`) | 2026-09-11 15:23 | granted 1, "Quota request approved to 1" | 2026-10-28 17:24 (47 min **before** the billing link) |
| Third operator project | linked to the operator's paid account (no billing change since 2026-08-16 in audit log) | 2026-09-11 15:11 | granted 0, "We cannot grant the preferred quota '1' … '0' was granted." | 2026-09-11 15:37 |
| Operator project | none | 2026-11-14 22:56:01.58 | granted 0, same text | 2026-11-14 22:56:01.88 (0.3 s: automated) |

- A project with no billing was approved; a project with linked billing was denied.
- Unknown: the operator's billing account state on 2026-09-11. Its Free Trial credits expired 2026-08-22. A Free Trial or ended-trial account matches Google's known-issue trigger.
- The approved project's 2026-10-28 update does not follow the billing link. Its cause is unknown.

## Diff table

Read 2026-11-14 (console via owner's Chromium, read-only; `gcloud` read commands; repo docs).

| Item | Approved project | Operator project |
|---|---|---|
| Ads access level | Explorer; next Basic, "Brand Verification needs to be completed" | Test; "Your application for explorer level access was not approved." |
| Billing link | linked, enabled (since 2026-10-28) | "This project has no billing account" |
| Billing when Explorer granted | off (sandbox) | n/a |
| Brand verification | "Your branding is not being shown to users" | same |
| Data access verification | "Verification is not required" | same |
| Audience | External, In production | External, In production |
| Branding fields | app name, home, privacy, terms, authorized domain | identical values; support email differs |
| OAuth client (gapi) | Desktop, created 2026-09-11 | Desktop, created 2026-11-14 |
| Other OAuth clients | 1 Desktop, 1 Web | none |
| Project created | 2026-09-03 | 2026-09-25 (audit log `CreateProject`) |
| Organization | none | not read |
| Owners | second owner Google account + operator account | operator account |
| Google Ads API enabled | yes; dashboard 0% errors | yes; dashboard 42% errors (403) |
| Ads manager-account link | none seen | none seen |
| Operator billing account | n/a | Paid, Direct; Free Trial credits expired 2026-08-22; already funds 2 other projects |

## Ranked causes

| Rank | Cause | Evidence | Strength |
|---|---|---|---|
| 1 | Google's known issue in the Explorer eligibility check | Exact email text quoted as a known issue (fact 9); fix in progress (fact 12); #133 denials with paid billing | strong |
| 2 | Billing not enabled on the operator project triggers that issue | Google's trigger includes "disabled billing" (fact 10); no link = billing not enabled (fact 14); denial in 0.3 s = automated check. Against: Google lists "remove billing" as a workaround (fact 13); a no-billing project was approved and a billed project was denied on 2026-09-11 ([Application record](#application-record-cloud-quotas)). | weak |
| 3 | No Ads history on the operator project (new client, all calls 403) | Approved project may have inherited its level by 90-day activity (fact 23). Google states no history criterion for Explorer. | weak |
| — | Brand not verified | Approved project also unverified; required only for Basic and Standard (fact 16) | ruled out as sole cause |
| — | No manager account or developer token | Not needed (facts 21, 22) | ruled out |
| — | Consent or client config | Identical audience, branding, client type | ruled out |

## Fix sequence

| # | Step | Who | Cost | Reversible | Source |
|---|---|---|---|---|---|
| 1 | Approve billing link in the #247 thread. Confirm #201 guards (budget alert, quota caps) cover the operator project first. | owner | none | yes | ticket #247 rule |
| 2 | Billing → Link a billing account: link the operator's paid account to the operator project. | owner (or agent after approval) | Ads API $0 (fact 15); other enabled paid APIs bill above free tier | yes (unlink) | facts 10, 13, 14 |
| 3 | Google Auth Platform → Branding → **Verify Branding**, then **Publish branding**. Domain is already a Search Console property of the operator account. | owner | $0; minutes or 2-3 business days | not stated by Google | facts 18-20 |
| 4 | Wait a few minutes after steps 2-3. | — | none | — | fact 13 |
| 5 | Ads API Overview → Upgrade access level → **Apply for access**. Confirm the "under review" banner; do not reload. | owner or agent | $0 | — | fact 6; SETUP step 2 |
| 6 | Check: Overview reads Explorer; `gapi ads +gaql` exits 0; `gapi entities sync ads` succeeds. `AUTHORIZATION_ERROR` → second known issue. | agent | $0 | — | fact 24; ticket acceptance |
| 7 | Denied again: send the Compliance form with project number, use case, link to the known issue and billing state. Re-check the known-issue "Status". | owner | $0 | — | fact 25 |

Excluded: "Use a different Google Cloud project" (fact 13). Owner rule forbids it.

## Open questions

- Billing account state (Free Trial, ended trial, paid) on 2026-09-11, when the billed project was denied.
- What changed the approved project's Explorer preference on 2026-10-28?
- Does "no billing account" count as "disabled billing" for the known issue? Google's page says both "disabled billing" (trigger) and "remove billing" (workaround).
- How did the approved project reach Explorer: console application or developer-token transfer?
- Is there a re-apply limit or cooldown after a denial? Google states none.
- Does a denial follow the project or the Google account? Google states nothing.
- Fix date for the known issue: none given.
- Operator project organization parent: not read.

## Sources

- https://developers.google.com/google-ads/api/docs/api-policy/access-levels (2026-11-13)
- https://developers.google.com/google-ads/api/docs/api-policy/developer-token (2026-11-13)
- https://developers.google.com/google-ads/api/docs/get-started/make-first-call (2026-11-13)
- https://developers.google.com/google-ads/api/docs/productionize/access-levels (2026-11-13)
- https://developers.google.com/google-ads/api/docs/api-policy/brand-verification (2026-11-13)
- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification (2026-11-10)
- https://docs.cloud.google.com/billing/docs/how-to/verify-billing-enabled (2026-11-10)
- https://developers.google.com/google-ads/api/support/compliance (2026-08-13); form https://support.google.com/adspolicy/contact/contact_ads_api
- https://developers.google.com/ads/blog/posts/2025/10/explorer-access-is-now-available-for (2025-10-28)
- https://developers.google.com/ads/blog/posts/2026/09/new-onboarding-experience-for-google-ads-api
- https://github.com/googleads/google-ads-mcp/issues/133 (Google repo, not docs)
