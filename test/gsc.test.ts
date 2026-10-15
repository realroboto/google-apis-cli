import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadManifests } from '../src/manifest.ts';

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
