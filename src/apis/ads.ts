// Google Ads API v26: the discovery entry, plus the `login-customer-id` header for MCC
// callers (D8) and the `+gaql` helper (D10). A version bump renames the resource literally
// named `v26` (`gapi ads v26 listPlannableLocations`), so its commands change with it.
// No developer-token header: it was sunset 2026-09-09 and the API ignores it
// (https://developers.google.com/google-ads/api/docs/api-policy/developer-token).
//
// `:search` keeps its raw {results, nextPageToken}; `ads customers googleAds search
// --page-all` pages it through the request body (epic #30 D6); `--stream` is the all-rows path.
import { GapiError } from '../errors.ts';
import { isRecord } from '../json.ts';
import { plan } from '../plan.ts';
import type { ApiEntry, Helper } from '../types.ts';

const GAQL_ARGS = '"<query>" --customer <id> [--stream]';

// searchStream (gRPC server-streaming) → over REST a JSON array of {results, ...} chunks
// with no nextPageToken; concat into one list. No Google doc covers an error mid-stream,
// so a chunk with an `error` key fails the call rather than vanish from the rows.
const streamConcat = (data: unknown): unknown => {
  if (!Array.isArray(data)) return data;
  const failed = data.find((c) => isRecord(c) && Object.hasOwn(c, 'error'));
  if (isRecord(failed)) {
    const message = isRecord(failed.error) ? failed.error.message : undefined;
    throw new GapiError(
      1,
      typeof message === 'string' ? message : 'searchStream: a chunk holds an error',
      failed,
    );
  }
  return data.flatMap((c) => (isRecord(c) && Array.isArray(c.results) ? c.results : []));
};

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
        params: { customerId: flags.customer },
        body: { query: args[0] },
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
