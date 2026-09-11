import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRow, loadManifests } from '../src/manifest.ts';
import { execute } from '../src/rest.ts';
import type { FetchLike, FetchResponse, ResolvedRow } from '../src/types.ts';

// Coverage-oracle fixture, frozen to Indexing v3 discovery revision 20260907.
// Regenerate with:
//   curl -s 'https://indexing.googleapis.com/$discovery/rest?version=v3' \
//   | jq -r 'def w: to_entries[]|.value as $r|(($r.methods//{})[]|"\(.httpMethod) /\(.flatPath//.path)"),(($r.resources//{})|w); .resources|w' \
//   | sed -E 's/\{[^}]+\}/{}/g' | sort
const DISCOVERY_V3 = ['GET /v3/urlNotifications/metadata', 'POST /v3/urlNotifications:publish'];

const norm = (p: string) => p.replace(/\{\w+\}/g, '{}');

test('coverage-oracle: indexing manifest covers 100% of v3 discovery, nothing extra', async () => {
  const m = (await loadManifests()).indexing;
  assert.ok(m, 'indexing manifest discovered');
  const manifest = new Set<string>();
  for (const verbs of Object.values(m.resources)) {
    for (const row of Object.values(verbs)) {
      manifest.add(`${row.httpMethod} ${norm(row.pathTemplate)}`);
    }
  }
  const discovery = new Set(DISCOVERY_V3);
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
  const r = findRow(await loadManifests(), 'indexing', resource, verb);
  assert.ok(r, `${resource} ${verb} row`);
  return r;
};

test('url-notifications publish: POST with body (acceptance demo)', async () => {
  const fetch = fakeFetch([{ urlNotificationMetadata: { url: 'https://e.com/p' } }]);
  const { json } = await execute(
    await row('url-notifications', 'publish'),
    { body: { url: 'https://e.com/p', type: 'URL_UPDATED' } },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'POST');
  assert.equal(new URL(c.url).pathname, '/v3/urlNotifications:publish');
  assert.equal(c.init.body, JSON.stringify({ url: 'https://e.com/p', type: 'URL_UPDATED' }));
  assert.deepEqual(json, { urlNotificationMetadata: { url: 'https://e.com/p' } });
});

test('url-notifications get-metadata: GET, url goes to ?url= query (acceptance demo)', async () => {
  const fetch = fakeFetch([{ url: 'https://e.com/p' }]);
  await execute(
    await row('url-notifications', 'get-metadata'),
    { url: 'https://e.com/p' },
    { tokenProvider: token, fetch },
  );
  const u = new URL(fetch.calls[0].url);
  assert.equal(fetch.calls[0].init.method, 'GET');
  assert.equal(u.pathname, '/v3/urlNotifications/metadata');
  assert.equal(u.searchParams.get('url'), 'https://e.com/p');
});
