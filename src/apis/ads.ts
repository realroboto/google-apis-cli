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
// with a `results` field and no nextPageToken. `+gaql --stream` flattens that
// array into one results list (`streamConcat`). `:search` keeps its raw
// {results, nextPageToken}: it pages via the request body (like GSC
// searchAnalytics), not a query token, so gapi does not page it (epic #30 D6).
//
// MCC hierarchy (story 30) is a GAQL query on the `customer_client` resource
// through +gaql — no separate endpoint.
import { GapiError } from '../errors.ts';
import { plan } from '../plan.ts';
import type { Helper, Manifest } from '../types.ts';

const ADS = ['adwords'];
const C = '/v25/customers/{customer}';
const GAQL_ARGS = '"<query>" --customer <id> [--stream]';

// searchStream → JSON array of {results, ...} chunks; concat into one list.
const streamConcat = (data: unknown): unknown =>
  Array.isArray(data) ? data.flatMap((c) => (c as { results?: unknown[] })?.results ?? []) : data;

// D10: one GAQL query; `--stream` returns every row, without it the first page as returned.
const gaql: Helper = {
  summary: `${GAQL_ARGS}  run one GAQL query; --stream returns every row`,
  options: { customer: { type: 'string' }, stream: { type: 'boolean' } },
  plan: async ({ model, args, flags, settings }) => {
    if (args.length !== 1) throw new GapiError(3, `usage: gapi ads +gaql ${GAQL_ARGS}`);
    if (typeof flags.customer !== 'string') throw new GapiError(3, '--customer is required');
    const stream = flags.stream === true;
    const call = plan(
      model,
      stream ? 'ads.gaql.searchStream' : 'ads.gaql.search',
      {
        params: JSON.stringify({ customer: flags.customer }),
        body: JSON.stringify({ query: args[0] }),
        dryRun: flags['dry-run'] === true,
      },
      settings,
    );
    return stream ? { ...call, decode: streamConcat } : call;
  },
};

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
  helpers: { '+gaql': gaql },
} satisfies Manifest;
