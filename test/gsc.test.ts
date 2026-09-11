import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRow, loadManifests } from '../src/manifest.ts';
import { execute } from '../src/rest.ts';
import type { FetchLike, FetchResponse, ResolvedRow } from '../src/types.ts';

// Coverage-oracle fixture: every method of the Search Console v1 discovery doc,
// as `${httpMethod} ${path}` with path params collapsed to `{}` (naming-agnostic).
// Frozen to discovery revision 20260909. Regenerate with:
//   curl -s 'https://searchconsole.googleapis.com/$discovery/rest?version=v1' \
//   | jq -r 'def w: to_entries[]|.value as $r|(($r.methods//{})[]|"\(.httpMethod) /\(.flatPath//.path)"),(($r.resources//{})|w); .resources|w' \
//   | sed -E 's/\{[^}]+\}/{}/g' | sort
// yagni: frozen list, not a live fetch — regen when Google adds a v1 method.
const DISCOVERY_V1 = [
  'DELETE /webmasters/v3/sites/{}',
  'DELETE /webmasters/v3/sites/{}/sitemaps/{}',
  'GET /webmasters/v3/sites',
  'GET /webmasters/v3/sites/{}',
  'GET /webmasters/v3/sites/{}/sitemaps',
  'GET /webmasters/v3/sites/{}/sitemaps/{}',
  'POST /v1/urlInspection/index:inspect',
  'POST /v1/urlTestingTools/mobileFriendlyTest:run',
  'POST /webmasters/v3/sites/{}/searchAnalytics/query',
  'PUT /webmasters/v3/sites/{}',
  'PUT /webmasters/v3/sites/{}/sitemaps/{}',
];

const norm = (p: string) => p.replace(/\{\w+\}/g, '{}');

test('coverage-oracle: gsc manifest covers 100% of v1 discovery, nothing extra', async () => {
  const m = (await loadManifests()).gsc;
  assert.ok(m, 'gsc manifest discovered');
  const manifest = new Set<string>();
  for (const verbs of Object.values(m.resources)) {
    for (const row of Object.values(verbs)) {
      manifest.add(`${row.httpMethod} ${norm(row.pathTemplate)}`);
    }
  }
  const discovery = new Set(DISCOVERY_V1);
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
  const r = findRow(await loadManifests(), 'gsc', resource, verb);
  assert.ok(r, `${resource} ${verb} row`);
  return r;
};

test('sites add: PUT, siteUrl encoded into path, no body (acceptance demo)', async () => {
  const fetch = fakeFetch([{}]);
  await execute(
    await row('sites', 'add'),
    { siteUrl: 'sc-domain:example.com' },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'PUT');
  assert.equal(new URL(c.url).pathname, '/webmasters/v3/sites/sc-domain%3Aexample.com');
  assert.equal(c.init.body, undefined);
});

test('sitemaps list: GET, merges listKey `sitemap` (acceptance demo)', async () => {
  const fetch = fakeFetch([{ sitemap: [{ path: 'https://e.com/sitemap.xml' }] }]);
  const { json } = await execute(
    await row('sitemaps', 'list'),
    { siteUrl: 'https://e.com/' },
    { tokenProvider: token, fetch },
  );
  assert.deepEqual(json, { sitemap: [{ path: 'https://e.com/sitemap.xml' }] });
  assert.equal(
    new URL(fetch.calls[0].url).pathname,
    '/webmasters/v3/sites/https%3A%2F%2Fe.com%2F/sitemaps',
  );
});

test('sitemaps submit: PUT with both path params (feedpath encoded)', async () => {
  const fetch = fakeFetch([{}]);
  await execute(
    await row('sitemaps', 'submit'),
    { siteUrl: 'https://e.com/', feedpath: 'https://e.com/sitemap.xml' },
    { tokenProvider: token, fetch },
  );
  assert.equal(fetch.calls[0].init.method, 'PUT');
  assert.equal(
    new URL(fetch.calls[0].url).pathname,
    '/webmasters/v3/sites/https%3A%2F%2Fe.com%2F/sitemaps/https%3A%2F%2Fe.com%2Fsitemap.xml',
  );
});

test('searchanalytics query: POST with body, single page (acceptance demo)', async () => {
  const fetch = fakeFetch([{ rows: [{ clicks: 3 }] }]);
  const { json } = await execute(
    await row('searchanalytics', 'query'),
    {
      siteUrl: 'https://e.com/',
      body: { startDate: '2026-01-01', endDate: '2026-01-31', dimensions: ['query'] },
    },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(fetch.calls.length, 1, 'no auto-paging (body-paged)');
  assert.equal(c.init.method, 'POST');
  assert.equal(
    new URL(c.url).pathname,
    '/webmasters/v3/sites/https%3A%2F%2Fe.com%2F/searchAnalytics/query',
  );
  assert.equal(
    c.init.body,
    JSON.stringify({ startDate: '2026-01-01', endDate: '2026-01-31', dimensions: ['query'] }),
  );
  assert.deepEqual(json, { rows: [{ clicks: 3 }] });
});

test('url-inspection inspect: POST body, no path params (acceptance demo)', async () => {
  const fetch = fakeFetch([{ inspectionResult: { indexStatusResult: { verdict: 'PASS' } } }]);
  const { json } = await execute(
    await row('url-inspection', 'inspect'),
    { body: { inspectionUrl: 'https://e.com/p', siteUrl: 'https://e.com/' } },
    { tokenProvider: token, fetch },
  );
  assert.equal(new URL(fetch.calls[0].url).pathname, '/v1/urlInspection/index:inspect');
  assert.equal(fetch.calls[0].init.method, 'POST');
  assert.deepEqual(json, { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } });
});
