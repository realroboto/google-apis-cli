import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRow, loadManifests } from '../src/manifest.ts';
import { execute } from '../src/rest.ts';
import type { FetchLike, FetchResponse, ResolvedRow } from '../src/types.ts';

// Coverage-oracle fixture: every method of the GA4 Data (analyticsdata) v1beta
// discovery doc, as `${httpMethod} ${path}` with path params collapsed to `{}`.
// Frozen to discovery revision 20260909. Regenerate with:
//   curl -s 'https://analyticsdata.googleapis.com/$discovery/rest?version=v1beta' \
//   | jq -r 'def w: to_entries[]|.value as $r|(($r.methods//{})[]|"\(.httpMethod) /\(.flatPath//.path)"),(($r.resources//{})|w); .resources|w' \
//   | sed -E 's/\{[^}]+\}/{}/g' | sort
// yagni: frozen list, not a live fetch — regen when Google adds a v1beta method.
const DISCOVERY_V1BETA = [
  'GET /v1beta/properties/{}/audienceExports',
  'GET /v1beta/properties/{}/audienceExports/{}',
  'GET /v1beta/properties/{}/metadata',
  'POST /v1beta/properties/{}:batchRunPivotReports',
  'POST /v1beta/properties/{}:batchRunReports',
  'POST /v1beta/properties/{}:checkCompatibility',
  'POST /v1beta/properties/{}:runPivotReport',
  'POST /v1beta/properties/{}:runRealtimeReport',
  'POST /v1beta/properties/{}:runReport',
  'POST /v1beta/properties/{}/audienceExports',
  'POST /v1beta/properties/{}/audienceExports/{}:query',
];

const norm = (p: string) => p.replace(/\{\w+\}/g, '{}');

test('coverage-oracle: manifest covers 100% of v1beta discovery, nothing extra', async () => {
  const m = (await loadManifests())['ga4-data'];
  assert.ok(m, 'ga4-data manifest discovered');
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
  const r = findRow(await loadManifests(), 'ga4-data', resource, verb);
  assert.ok(r, `${resource} ${verb} row`);
  return r;
};

test('reports run: POST with body, no auto-paging (raw page returned)', async () => {
  const fetch = fakeFetch([{ rows: [{ x: 1 }], rowCount: 1 }]);
  const { json } = await execute(
    await row('reports', 'run'),
    {
      property: '123',
      body: { dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }] },
    },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'POST');
  assert.equal(c.url, 'https://analyticsdata.googleapis.com/v1beta/properties/123:runReport');
  assert.equal(fetch.calls.length, 1, 'single request, no auto-page loop');
  assert.deepEqual(json, { rows: [{ x: 1 }], rowCount: 1 });
});

test('metadata get: GET single (acceptance demo)', async () => {
  const fetch = fakeFetch([{ dimensions: [{ apiName: 'country' }] }]);
  const { json } = await execute(
    await row('metadata', 'get'),
    { property: '123' },
    { tokenProvider: token, fetch },
  );
  assert.equal(new URL(fetch.calls[0].url).pathname, '/v1beta/properties/123/metadata');
  assert.deepEqual(json, { dimensions: [{ apiName: 'country' }] });
});

test('audience-exports list: GET, merges listKey across pages', async () => {
  const fetch = fakeFetch([
    { audienceExports: [{ name: 'a1' }], nextPageToken: 'p2' },
    { audienceExports: [{ name: 'a2' }] },
  ]);
  const { json } = await execute(
    await row('audience-exports', 'list'),
    { property: '123' },
    { tokenProvider: token, fetch },
  );
  assert.deepEqual(json, { audienceExports: [{ name: 'a1' }, { name: 'a2' }] });
  assert.equal(fetch.calls.length, 2);
});

test('audience-exports query: nested path param fills, POST body', async () => {
  const fetch = fakeFetch([{ audienceRows: [{ v: 1 }] }]);
  await execute(
    await row('audience-exports', 'query'),
    { property: '123', audienceExport: '456', body: { offset: 0 } },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'POST');
  assert.equal(new URL(c.url).pathname, '/v1beta/properties/123/audienceExports/456:query');
});
