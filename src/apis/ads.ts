// Google Ads API v26: the discovery entry, plus the `login-customer-id` header for MCC
// callers (D8) and the `+gaql` helper (D10). A version bump renames the resource literally
// named `v26` (`gapi ads v26 listPlannableLocations`), so its commands change with it.
// No developer-token header: it was sunset 2026-09-09 and the API ignores it
// (https://developers.google.com/google-ads/api/docs/api-policy/developer-token).
//
// `:search` keeps its raw {results, nextPageToken}; `ads customers googleAds search
// --page-all` pages it through the request body (epic #30 D6); `--stream` is the all-rows path.
import { items, text } from '../entities.ts';
import { GapiError } from '../errors.ts';
import { isRecord } from '../json.ts';
import { plan } from '../plan.ts';
import type { ApiEntry, EntitySource, Helper } from '../types.ts';

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
  const results = data.flatMap((c) => (isRecord(c) && Array.isArray(c.results) ? c.results : []));
  // SUMMARY_ROW_SETTING puts the totals in the last chunk's summaryRow; keep them.
  const summaryRow = data.findLast((c) => isRecord(c) && c.summaryRow !== undefined)?.summaryRow;
  return summaryRow === undefined ? results : { results, summaryRow };
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

// Per accessible customer: itself (level 0, gives its name) and its direct clients, queried
// as that customer (`login-customer-id`). A client's parent is its manager.
// shortcut: `level <= 1` skips clients of a sub-manager the login cannot access directly;
// upgrade to the whole tree when an operator needs them.
const customerClients: EntitySource = {
  method: 'googleads.customers.googleAds.search',
  params: (parent) => ({ customerId: parent?.id }),
  body: () => ({
    query:
      'SELECT customer_client.id, customer_client.descriptive_name, customer_client.level FROM customer_client WHERE customer_client.level <= 1',
  }),
  headers: (parent) => ({ 'login-customer-id': parent?.id ?? '' }),
  entities: (data, parent) =>
    items(data, 'results').flatMap((r) => {
      const c = isRecord(r.customerClient) ? r.customerClient : {};
      const id = text(c.id);
      if (!id) return [];
      const name = text(c.descriptiveName);
      return [{ kind: 'customer', id, name, parent: id === parent?.id ? undefined : parent?.id }];
    }),
};

export default {
  api: 'ads',
  discovery: 'https://googleads.googleapis.com/$discovery/rest?version=v26',
  reads: [
    'googleads.customers.googleAds.search',
    'googleads.customers.googleAds.searchStream',
    'googleads.googleAdsFields.search',
  ],
  headers: [
    {
      name: 'login-customer-id',
      flag: 'login-customer-id',
      env: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
      configKey: 'login-customer-id',
    },
    // Ads checks its access level on the quota project; this keeps it apart from `project`.
    {
      name: 'x-goog-user-project',
      flag: 'ads-project',
      env: 'GOOGLE_ADS_PROJECT',
      configKey: 'ads-project',
    },
  ],
  helpers: { '+gaql': gaql },
  // Customer IDs as calls take them: 10 digits, no `customers/` prefix.
  entities: [
    {
      method: 'googleads.customers.listAccessibleCustomers',
      entities: (data) =>
        isRecord(data) && Array.isArray(data.resourceNames)
          ? data.resourceNames.flatMap((n) => {
              const id = typeof n === 'string' ? n.replace(/^customers\//, '') : '';
              return id ? [{ kind: 'customer', id }] : [];
            })
          : [],
      children: { customer: customerClients },
    },
  ],
} satisfies ApiEntry;
