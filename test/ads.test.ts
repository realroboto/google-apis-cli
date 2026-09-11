import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gaqlBody } from '../src/apis/ads.ts';
import { resolveAdsHeaders } from '../src/config.ts';
import { findRow, loadManifests } from '../src/manifest.ts';
import { execute } from '../src/rest.ts';
import type { FetchLike, FetchResponse, ResolvedRow } from '../src/types.ts';

// Coverage-oracle: the T5 Ads subset. Ads has no discovery REST doc (proto-
// defined API), so this frozen list stands in for one — endpoints verified
// against the v25 RPC reference. It fails if a row is dropped or an
// out-of-scope method sneaks in. `${httpMethod} ${path}`, params → {}.
const C = '/v25/customers/{}';
const DISCOVERY_T5 = [
  'GET /v25/customers:listAccessibleCustomers',
  `POST ${C}/googleAds:search`,
  `POST ${C}/googleAds:searchStream`,
  `POST ${C}/campaigns:mutate`,
  `POST ${C}/campaignBudgets:mutate`,
  `POST ${C}/campaignCriteria:mutate`,
  `POST ${C}/adGroups:mutate`,
  `POST ${C}/adGroupAds:mutate`,
  `POST ${C}/adGroupCriteria:mutate`,
];
const norm = (p: string) => p.replace(/\{\w+\}/g, '{}');

test('coverage-oracle: ads manifest covers the T5 subset exactly', async () => {
  const m = (await loadManifests()).ads;
  assert.ok(m, 'ads manifest discovered');
  const manifest = new Set<string>();
  for (const verbs of Object.values(m.resources)) {
    for (const row of Object.values(verbs)) {
      manifest.add(`${row.httpMethod} ${norm(row.pathTemplate)}`);
    }
  }
  const discovery = new Set(DISCOVERY_T5);
  assert.deepEqual(
    [...discovery].filter((x) => !manifest.has(x)),
    [],
    'T5 methods missing from manifest',
  );
  assert.deepEqual(
    [...manifest].filter((x) => !discovery.has(x)),
    [],
    'manifest methods outside the T5 subset',
  );
});

// --- executor-seam demos (fake fetch; no real network) ---
const token = async () => 'TOK';
const DEV = { 'developer-token': 'DEV' };
type Rec = {
  url: string;
  init: { method?: string; headers: Record<string, string>; body?: string };
};
function fakeFetch(bodies: unknown[]): FetchLike & { calls: Rec[] } {
  const calls: Rec[] = [];
  const queue = [...bodies];
  return Object.assign(
    async (url: string, init?: RequestInit): Promise<FetchResponse> => {
      calls.push({ url, init: init as unknown as Rec['init'] });
      return { ok: true, status: 200, text: async () => JSON.stringify(queue.shift()) };
    },
    { calls },
  );
}
const row = async (resource: string, verb: string): Promise<ResolvedRow> => {
  const r = findRow(await loadManifests(), 'ads', resource, verb);
  assert.ok(r, `${resource} ${verb} row`);
  return r;
};

test('customers list-accessible: GET, sends developer-token header (read demo)', async () => {
  const fetch = fakeFetch([{ resourceNames: ['customers/123'] }]);
  const { json } = await execute(
    await row('customers', 'list-accessible'),
    {},
    { tokenProvider: token, fetch, extraHeaders: DEV },
  );
  assert.deepEqual(json, { resourceNames: ['customers/123'] });
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'GET');
  assert.equal(new URL(c.url).pathname, '/v25/customers:listAccessibleCustomers');
  assert.equal(c.init.headers['developer-token'], 'DEV');
});

test('gaql search: POST {query} body, raw {results,nextPageToken} out', async () => {
  const fetch = fakeFetch([{ results: [{ a: 1 }], nextPageToken: 'p2' }]);
  const { json } = await execute(
    await row('gaql', 'search'),
    { customer: '55', body: gaqlBody('SELECT campaign.id FROM campaign') },
    { tokenProvider: token, fetch, extraHeaders: { ...DEV, 'login-customer-id': '999' } },
  );
  assert.deepEqual(json, { results: [{ a: 1 }], nextPageToken: 'p2' });
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'POST');
  assert.equal(new URL(c.url).pathname, '/v25/customers/55/googleAds:search');
  assert.equal(c.init.body, JSON.stringify({ query: 'SELECT campaign.id FROM campaign' }));
  assert.equal(c.init.headers['login-customer-id'], '999');
});

test('gaql searchStream: stream-concat decoder flattens the chunk array', async () => {
  const fetch = fakeFetch([[{ results: [{ a: 1 }] }, { results: [{ b: 2 }] }]]);
  const { json } = await execute(
    await row('gaql', 'searchStream'),
    { customer: '55', body: gaqlBody('SELECT campaign.id FROM campaign') },
    { tokenProvider: token, fetch, extraHeaders: DEV },
  );
  assert.deepEqual(json, [{ a: 1 }, { b: 2 }]);
  assert.equal(new URL(fetch.calls[0].url).pathname, '/v25/customers/55/googleAds:searchStream');
});

test('campaigns mutate: POST :mutate with operations body (write demo)', async () => {
  const fetch = fakeFetch([{ results: [{ resourceName: 'customers/55/campaigns/9' }] }]);
  const ops = { operations: [{ create: { name: 'x' } }] };
  await execute(
    await row('campaigns', 'mutate'),
    { customer: '55', body: ops },
    { tokenProvider: token, fetch, extraHeaders: DEV },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'POST');
  assert.equal(new URL(c.url).pathname, '/v25/customers/55/campaigns:mutate');
  assert.equal(c.init.body, JSON.stringify(ops));
});

test('missing developer-token: executor rejects before fetch', async () => {
  const fetch = fakeFetch([{}]);
  await assert.rejects(
    execute(
      await row('gaql', 'search'),
      { customer: '55', body: gaqlBody('SELECT 1') },
      {
        tokenProvider: token,
        fetch,
      },
    ),
    /missing required header: developer-token/,
  );
  assert.equal(fetch.calls.length, 0);
});

// --- pure units ---
test('gaqlBody wraps the query string', () => {
  assert.deepEqual(gaqlBody('SELECT campaign.id FROM campaign'), {
    query: 'SELECT campaign.id FROM campaign',
  });
});

test('resolveAdsHeaders precedence: flag > env > config', () => {
  // flag wins
  assert.equal(
    resolveAdsHeaders({ 'developer-token': 'F' }, { 'developer-token': 'C' })['developer-token'],
    'F',
  );
  // env over config (no flag)
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'E';
  try {
    assert.equal(resolveAdsHeaders({}, { 'developer-token': 'C' })['developer-token'], 'E');
  } finally {
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  }
  // config fallback
  assert.equal(resolveAdsHeaders({}, { 'developer-token': 'C' })['developer-token'], 'C');
  // login-customer-id resolved too; absent creds omitted
  const h = resolveAdsHeaders({ 'login-customer-id': '999' }, {});
  assert.equal(h['login-customer-id'], '999');
  assert.equal('developer-token' in h, false);
});
