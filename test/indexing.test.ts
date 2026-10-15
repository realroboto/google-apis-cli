import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadManifests } from '../src/manifest.ts';

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
