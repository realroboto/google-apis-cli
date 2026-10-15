import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadManifests } from '../src/manifest.ts';

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
