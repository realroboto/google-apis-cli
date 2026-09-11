// Google Ads API v25 (REST) — GAQL search/searchStream + per-resource :mutate.
// Ads has no discovery REST doc (the API is proto-defined); endpoints verified
// against the v25 RPC reference (googleads.googleapis.com/v25). MCC callers add
// the optional `login-customer-id` header, resolved flag→env→config in
// src/config.ts (resolveAdsHeaders). One OAuth scope: `adwords`.
//
// developer-token was sunset 2026-09-09 — the header is ignored by the API
// (access is now governed by the Cloud project that owns the OAuth client), so
// no row requires it.
//
// searchStream is a gRPC server-streaming method: over REST the transport
// transcodes it to a JSON ARRAY of SearchGoogleAdsStreamResponse objects, each
// with a `results` field and no nextPageToken. The `streamConcat` decoder
// flattens that array into one results list — the one non-identity decoder
// (the Ads decoder seam). `:search` keeps its raw {results, nextPageToken}:
// it pages via the request body (like GSC searchAnalytics), not a query token,
// so no listKey — the executor's query-token paging would loop on it.
//
// MCC hierarchy (story 30) is a GAQL query on the `customer_client` resource
// through gaql/search — no separate endpoint.
import type { Manifest } from '../types.ts';

const ADS = ['adwords'];
const C = '/v25/customers/{customer}';

// Build the search-request body from a bare GAQL string (story 31). Trivial by
// design — kept a named pure function so bin/gapi.ts's `gapi ads gaql "<q>"`
// sugar has one tested seam.
export const gaqlBody = (query: string): { query: string } => ({ query });

// searchStream → JSON array of {results, ...} chunks; concat into one list.
const streamConcat = (data: unknown): unknown =>
  Array.isArray(data) ? data.flatMap((c) => (c as { results?: unknown[] })?.results ?? []) : data;

// Every :mutate service is the same shape: POST customers/{}/{collection}:mutate
// with a {operations:[...]} body. Only the collection segment varies.
const mutate = (collection: string) => ({
  mutate: {
    httpMethod: 'POST' as const,
    pathTemplate: `${C}/${collection}:mutate`,
    scopes: ADS,
  },
});

export default {
  api: 'ads',
  baseUrl: 'https://googleads.googleapis.com',
  resources: {
    customers: {
      // Empty body; returns { resourceNames: ["customers/123", ...] }. Ignores
      // login-customer-id (direct-access accounts only).
      'list-accessible': {
        httpMethod: 'GET',
        pathTemplate: '/v25/customers:listAccessibleCustomers',
        scopes: ADS,
      },
    },
    gaql: {
      // Body-paged: {query, pageToken}. Raw {results, nextPageToken} out.
      search: {
        httpMethod: 'POST',
        pathTemplate: `${C}/googleAds:search`,
        scopes: ADS,
      },
      // Streams the whole result set in one response (array of chunks).
      searchStream: {
        httpMethod: 'POST',
        pathTemplate: `${C}/googleAds:searchStream`,
        scopes: ADS,
        decoder: streamConcat,
      },
    },
    // Core write surface (:mutate). Body: {operations:[{create|update|remove}]}.
    campaigns: mutate('campaigns'),
    'campaign-budgets': mutate('campaignBudgets'),
    'campaign-criteria': mutate('campaignCriteria'),
    'ad-groups': mutate('adGroups'),
    'ad-group-ads': mutate('adGroupAds'),
    'ad-group-criteria': mutate('adGroupCriteria'),
  },
} satisfies Manifest;
