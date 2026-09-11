import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRow, loadManifests } from '../src/manifest.ts';
import { execute } from '../src/rest.ts';
import type { FetchLike, FetchResponse, ResolvedRow } from '../src/types.ts';

// Coverage-oracle fixture: every method of the GA4 Admin v1beta discovery doc,
// as `${httpMethod} ${path}` with path params collapsed to `{}` (naming-agnostic).
// Frozen to discovery revision 20260909. Regenerate with:
//   curl -s 'https://analyticsadmin.googleapis.com/$discovery/rest?version=v1beta' \
//   | jq -r 'def w: to_entries[]|.value as $r|(($r.methods//{})[]|"\(.httpMethod) /\(.flatPath//.path)"),(($r.resources//{})|w); .resources|w' \
//   | sed -E 's/\{[^}]+\}/{}/g' | sort
// yagni: frozen list, not a live fetch — regen when Google adds a v1beta method.
const DISCOVERY_V1BETA = [
  'DELETE /v1beta/accounts/{}',
  'DELETE /v1beta/properties/{}',
  'DELETE /v1beta/properties/{}/conversionEvents/{}',
  'DELETE /v1beta/properties/{}/dataStreams/{}',
  'DELETE /v1beta/properties/{}/dataStreams/{}/measurementProtocolSecrets/{}',
  'DELETE /v1beta/properties/{}/firebaseLinks/{}',
  'DELETE /v1beta/properties/{}/googleAdsLinks/{}',
  'DELETE /v1beta/properties/{}/keyEvents/{}',
  'GET /v1beta/accounts',
  'GET /v1beta/accounts/{}',
  'GET /v1beta/accounts/{}/dataSharingSettings',
  'GET /v1beta/accountSummaries',
  'GET /v1beta/properties',
  'GET /v1beta/properties/{}',
  'GET /v1beta/properties/{}/conversionEvents',
  'GET /v1beta/properties/{}/conversionEvents/{}',
  'GET /v1beta/properties/{}/customDimensions',
  'GET /v1beta/properties/{}/customDimensions/{}',
  'GET /v1beta/properties/{}/customMetrics',
  'GET /v1beta/properties/{}/customMetrics/{}',
  'GET /v1beta/properties/{}/dataRetentionSettings',
  'GET /v1beta/properties/{}/dataStreams',
  'GET /v1beta/properties/{}/dataStreams/{}',
  'GET /v1beta/properties/{}/dataStreams/{}/measurementProtocolSecrets',
  'GET /v1beta/properties/{}/dataStreams/{}/measurementProtocolSecrets/{}',
  'GET /v1beta/properties/{}/firebaseLinks',
  'GET /v1beta/properties/{}/googleAdsLinks',
  'GET /v1beta/properties/{}/keyEvents',
  'GET /v1beta/properties/{}/keyEvents/{}',
  'PATCH /v1beta/accounts/{}',
  'PATCH /v1beta/properties/{}',
  'PATCH /v1beta/properties/{}/conversionEvents/{}',
  'PATCH /v1beta/properties/{}/customDimensions/{}',
  'PATCH /v1beta/properties/{}/customMetrics/{}',
  'PATCH /v1beta/properties/{}/dataRetentionSettings',
  'PATCH /v1beta/properties/{}/dataStreams/{}',
  'PATCH /v1beta/properties/{}/dataStreams/{}/measurementProtocolSecrets/{}',
  'PATCH /v1beta/properties/{}/googleAdsLinks/{}',
  'PATCH /v1beta/properties/{}/keyEvents/{}',
  'POST /v1beta/accounts:provisionAccountTicket',
  'POST /v1beta/accounts/{}:runAccessReport',
  'POST /v1beta/accounts/{}:searchChangeHistoryEvents',
  'POST /v1beta/properties',
  'POST /v1beta/properties/{}:acknowledgeUserDataCollection',
  'POST /v1beta/properties/{}:runAccessReport',
  'POST /v1beta/properties/{}/conversionEvents',
  'POST /v1beta/properties/{}/customDimensions',
  'POST /v1beta/properties/{}/customDimensions/{}:archive',
  'POST /v1beta/properties/{}/customMetrics',
  'POST /v1beta/properties/{}/customMetrics/{}:archive',
  'POST /v1beta/properties/{}/dataStreams',
  'POST /v1beta/properties/{}/dataStreams/{}/measurementProtocolSecrets',
  'POST /v1beta/properties/{}/firebaseLinks',
  'POST /v1beta/properties/{}/googleAdsLinks',
  'POST /v1beta/properties/{}/keyEvents',
];

const norm = (p: string) => p.replace(/\{\w+\}/g, '{}');

test('coverage-oracle: manifest covers 100% of v1beta discovery, nothing extra', async () => {
  const m = (await loadManifests())['ga4-admin'];
  assert.ok(m, 'ga4-admin manifest discovered');
  const manifest = new Set<string>();
  for (const verbs of Object.values(m.resources)) {
    for (const row of Object.values(verbs)) {
      manifest.add(`${row.httpMethod} ${norm(row.pathTemplate)}`);
    }
  }
  const discovery = new Set(DISCOVERY_V1BETA);
  const missing = [...discovery].filter((x) => !manifest.has(x));
  const extra = [...manifest].filter((x) => !discovery.has(x));
  assert.deepEqual(missing, [], 'discovery methods missing from manifest');
  assert.deepEqual(extra, [], 'manifest methods not in discovery');
});

// --- executor-seam demos (fake fetch; no real network) ---
const token = async () => 'TOK';
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
      const body = queue.shift();
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    },
    { calls },
  );
}
const row = async (resource: string, verb: string): Promise<ResolvedRow> => {
  const r = findRow(await loadManifests(), 'ga4-admin', resource, verb);
  assert.ok(r, `${resource} ${verb} row`);
  return r;
};

test('account-summaries list: GET, merges listKey across pages', async () => {
  const fetch = fakeFetch([
    { accountSummaries: [{ a: 1 }], nextPageToken: 'p2' },
    { accountSummaries: [{ a: 2 }] },
  ]);
  const { json } = await execute(
    await row('account-summaries', 'list'),
    {},
    { tokenProvider: token, fetch },
  );
  assert.deepEqual(json, { accountSummaries: [{ a: 1 }, { a: 2 }] });
  assert.equal(new URL(fetch.calls[0].url).pathname, '/v1beta/accountSummaries');
});

test('properties list: GET, merges listKey (acceptance demo)', async () => {
  const fetch = fakeFetch([{ properties: [{ name: 'properties/1' }] }]);
  const { json } = await execute(
    await row('properties', 'list'),
    {},
    { tokenProvider: token, fetch },
  );
  assert.deepEqual(json, { properties: [{ name: 'properties/1' }] });
  assert.equal(new URL(fetch.calls[0].url).pathname, '/v1beta/properties');
});

test('properties patch: PATCH with body + updateMask query (write demo)', async () => {
  const fetch = fakeFetch([{ name: 'properties/123', displayName: 'New' }]);
  await execute(
    await row('properties', 'patch'),
    { property: '123', updateMask: 'displayName', body: { displayName: 'New' } },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'PATCH');
  assert.equal(new URL(c.url).pathname, '/v1beta/properties/123');
  // updateMask is a required query param on GA4 PATCH — must reach the URL.
  assert.equal(new URL(c.url).searchParams.get('updateMask'), 'displayName');
  assert.equal(c.init.body, JSON.stringify({ displayName: 'New' }));
});

test('measurement-protocol-secrets create: nested path params both fill', async () => {
  const fetch = fakeFetch([{ name: 'x' }]);
  await execute(
    await row('measurement-protocol-secrets', 'create'),
    { property: '123', dataStream: '456', body: { displayName: 's' } },
    { tokenProvider: token, fetch },
  );
  assert.equal(
    new URL(fetch.calls[0].url).pathname,
    '/v1beta/properties/123/dataStreams/456/measurementProtocolSecrets',
  );
  assert.equal(fetch.calls[0].init.method, 'POST');
});

test('measurement-protocol-secrets list: GET, nested path + listKey (acceptance demo)', async () => {
  const fetch = fakeFetch([{ measurementProtocolSecrets: [{ name: 's1' }] }]);
  const { json } = await execute(
    await row('measurement-protocol-secrets', 'list'),
    { property: '123', dataStream: '456' },
    { tokenProvider: token, fetch },
  );
  assert.deepEqual(json, { measurementProtocolSecrets: [{ name: 's1' }] });
  assert.equal(
    new URL(fetch.calls[0].url).pathname,
    '/v1beta/properties/123/dataStreams/456/measurementProtocolSecrets',
  );
});

test('search-change-history-events: POST, no auto-paging (raw page returned)', async () => {
  const fetch = fakeFetch([{ changeHistoryEvents: [1], nextPageToken: 'p2' }]);
  const { json } = await execute(
    await row('accounts', 'search-change-history-events'),
    { account: '9', body: {} },
    { tokenProvider: token, fetch },
  );
  assert.equal(fetch.calls.length, 1, 'single request, no auto-page loop');
  assert.deepEqual(json, { changeHistoryEvents: [1], nextPageToken: 'p2' });
});
