import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadManifests } from '../src/manifest.ts';

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
