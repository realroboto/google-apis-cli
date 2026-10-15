// Google Ads API v26: the discovery entry, plus the `login-customer-id` header for MCC
// callers (D8) and the `+gaql` helper (D10). A version bump renames the resource literally
// named `v26` (`gapi ads v26 listPlannableLocations`), so its commands change with it.
// No developer-token header: it was sunset 2026-09-09 and the API ignores it.
//
// `:search` keeps its raw {results, nextPageToken}: it pages via the request body, not a
// query token, so gapi does not page it (epic #30 D6); `--stream` is the all-rows path.
import { GapiError } from '../errors.ts';
import { plan } from '../plan.ts';
import type { ApiEntry, Helper } from '../types.ts';

const GAQL_ARGS = '"<query>" --customer <id> [--stream]';

// searchStream (gRPC server-streaming) → over REST a JSON array of {results, ...} chunks
// with no nextPageToken; concat into one list.
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
      `googleads.customers.googleAds.${stream ? 'searchStream' : 'search'}`,
      {
        params: JSON.stringify({ customerId: flags.customer }),
        body: JSON.stringify({ query: args[0] }),
        dryRun: flags['dry-run'] === true,
      },
      settings,
    );
    return stream ? { ...call, decode: streamConcat } : call;
  },
};

export default {
  api: 'ads',
  discovery: 'https://googleads.googleapis.com/$discovery/rest?version=v26',
  headers: [
    {
      name: 'login-customer-id',
      flag: 'login-customer-id',
      env: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
      configKey: 'login-customer-id',
    },
  ],
  helpers: { '+gaql': gaql },
} satisfies ApiEntry;
