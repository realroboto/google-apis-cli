import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRow, loadManifests } from '../src/manifest.ts';
import { execute } from '../src/rest.ts';
import type { FetchLike, FetchResponse, ResolvedRow } from '../src/types.ts';

// Coverage-oracle fixture: the v1alpha-ONLY resource families this manifest
// scopes to (SPEC §GA4: accessBindings, audiences, channelGroups,
// calculatedMetrics, subproperties/rollups), as `${httpMethod} ${path}` with
// path params collapsed to `{}`. Frozen to discovery revision 20260909. Regen:
//   curl -s 'https://analyticsadmin.googleapis.com/$discovery/rest?version=v1alpha' \
//   | jq -r 'def w: to_entries[]|.value as $r|(($r.methods//{})[]|"\(.httpMethod) /\(.flatPath//.path)"),(($r.resources//{})|w); .resources|w' \
//   | sed -E 's/\{[^}]+\}/{}/g' \
//   | grep -E 'accessBindings|/audiences|/calculatedMetrics|/channelGroups|createRollupProperty|provisionSubproperty|/rollupPropertySourceLinks|/subpropertyEventFilters|/subpropertySyncConfigs' | sort
// yagni: frozen list, not a live fetch — regen when Google adds an in-scope method.
const DISCOVERY_IN_SCOPE = [
  'DELETE /v1alpha/accounts/{}/accessBindings/{}',
  'DELETE /v1alpha/properties/{}/accessBindings/{}',
  'DELETE /v1alpha/properties/{}/calculatedMetrics/{}',
  'DELETE /v1alpha/properties/{}/channelGroups/{}',
  'DELETE /v1alpha/properties/{}/rollupPropertySourceLinks/{}',
  'DELETE /v1alpha/properties/{}/subpropertyEventFilters/{}',
  'GET /v1alpha/accounts/{}/accessBindings',
  'GET /v1alpha/accounts/{}/accessBindings:batchGet',
  'GET /v1alpha/accounts/{}/accessBindings/{}',
  'GET /v1alpha/properties/{}/accessBindings',
  'GET /v1alpha/properties/{}/accessBindings:batchGet',
  'GET /v1alpha/properties/{}/accessBindings/{}',
  'GET /v1alpha/properties/{}/audiences',
  'GET /v1alpha/properties/{}/audiences/{}',
  'GET /v1alpha/properties/{}/calculatedMetrics',
  'GET /v1alpha/properties/{}/calculatedMetrics/{}',
  'GET /v1alpha/properties/{}/channelGroups',
  'GET /v1alpha/properties/{}/channelGroups/{}',
  'GET /v1alpha/properties/{}/rollupPropertySourceLinks',
  'GET /v1alpha/properties/{}/rollupPropertySourceLinks/{}',
  'GET /v1alpha/properties/{}/subpropertyEventFilters',
  'GET /v1alpha/properties/{}/subpropertyEventFilters/{}',
  'GET /v1alpha/properties/{}/subpropertySyncConfigs',
  'GET /v1alpha/properties/{}/subpropertySyncConfigs/{}',
  'PATCH /v1alpha/accounts/{}/accessBindings/{}',
  'PATCH /v1alpha/properties/{}/accessBindings/{}',
  'PATCH /v1alpha/properties/{}/audiences/{}',
  'PATCH /v1alpha/properties/{}/calculatedMetrics/{}',
  'PATCH /v1alpha/properties/{}/channelGroups/{}',
  'PATCH /v1alpha/properties/{}/subpropertyEventFilters/{}',
  'PATCH /v1alpha/properties/{}/subpropertySyncConfigs/{}',
  'POST /v1alpha/accounts/{}/accessBindings',
  'POST /v1alpha/accounts/{}/accessBindings:batchCreate',
  'POST /v1alpha/accounts/{}/accessBindings:batchDelete',
  'POST /v1alpha/accounts/{}/accessBindings:batchUpdate',
  'POST /v1alpha/properties:createRollupProperty',
  'POST /v1alpha/properties:provisionSubproperty',
  'POST /v1alpha/properties/{}/accessBindings',
  'POST /v1alpha/properties/{}/accessBindings:batchCreate',
  'POST /v1alpha/properties/{}/accessBindings:batchDelete',
  'POST /v1alpha/properties/{}/accessBindings:batchUpdate',
  'POST /v1alpha/properties/{}/audiences',
  'POST /v1alpha/properties/{}/audiences/{}:archive',
  'POST /v1alpha/properties/{}/calculatedMetrics',
  'POST /v1alpha/properties/{}/channelGroups',
  'POST /v1alpha/properties/{}/rollupPropertySourceLinks',
  'POST /v1alpha/properties/{}/subpropertyEventFilters',
];

const norm = (p: string) => p.replace(/\{\w+\}/g, '{}');

test('coverage-oracle: manifest covers 100% of in-scope v1alpha methods, nothing extra', async () => {
  const m = (await loadManifests())['ga4-admin-alpha'];
  assert.ok(m, 'ga4-admin-alpha manifest discovered');
  const manifest = new Set<string>();
  for (const verbs of Object.values(m.resources)) {
    for (const row of Object.values(verbs)) {
      manifest.add(`${row.httpMethod} ${norm(row.pathTemplate)}`);
    }
  }
  const discovery = new Set(DISCOVERY_IN_SCOPE);
  const missing = [...discovery].filter((x) => !manifest.has(x));
  const extra = [...manifest].filter((x) => !discovery.has(x));
  assert.deepEqual(missing, [], 'discovery methods missing from manifest');
  assert.deepEqual(extra, [], 'manifest methods not in discovery');
});

test('access bindings carry the analytics.manage.users scope (acceptance)', async () => {
  const m = (await loadManifests())['ga4-admin-alpha'];
  for (const key of ['access-bindings', 'account-access-bindings']) {
    for (const row of Object.values(m.resources[key])) {
      assert.deepEqual(row.scopes, ['analytics.manage.users'], `${key} scope`);
    }
  }
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
  const r = findRow(await loadManifests(), 'ga4-admin-alpha', resource, verb);
  assert.ok(r, `${resource} ${verb} row`);
  return r;
};

test('access-bindings list: GET, merges listKey across pages (acceptance demo)', async () => {
  const fetch = fakeFetch([
    { accessBindings: [{ name: 'b1' }], nextPageToken: 'p2' },
    { accessBindings: [{ name: 'b2' }] },
  ]);
  const { json } = await execute(
    await row('access-bindings', 'list'),
    { property: '123' },
    { tokenProvider: token, fetch },
  );
  assert.equal(new URL(fetch.calls[0].url).pathname, '/v1alpha/properties/123/accessBindings');
  assert.deepEqual(json, { accessBindings: [{ name: 'b1' }, { name: 'b2' }] });
  assert.equal(fetch.calls.length, 2);
});

test('channel-groups list: GET single page (acceptance demo)', async () => {
  const fetch = fakeFetch([{ channelGroups: [{ name: 'cg1' }] }]);
  const { json } = await execute(
    await row('channel-groups', 'list'),
    { property: '123' },
    { tokenProvider: token, fetch },
  );
  assert.equal(new URL(fetch.calls[0].url).pathname, '/v1alpha/properties/123/channelGroups');
  assert.deepEqual(json, { channelGroups: [{ name: 'cg1' }] });
});

test('access-bindings batch-get: GET custom method, names → query string', async () => {
  const fetch = fakeFetch([{ accessBindings: [{ name: 'b1' }] }]);
  await execute(
    await row('access-bindings', 'batch-get'),
    { property: '123', names: 'properties/123/accessBindings/b1' },
    { tokenProvider: token, fetch },
  );
  const u = new URL(fetch.calls[0].url);
  assert.equal(u.pathname, '/v1alpha/properties/123/accessBindings:batchGet');
  assert.equal(u.searchParams.get('names'), 'properties/123/accessBindings/b1');
});

test('audiences archive: POST custom method on nested resource', async () => {
  const fetch = fakeFetch([{}]);
  await execute(
    await row('audiences', 'archive'),
    { property: '123', audience: '456' },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'POST');
  assert.equal(new URL(c.url).pathname, '/v1alpha/properties/123/audiences/456:archive');
});
