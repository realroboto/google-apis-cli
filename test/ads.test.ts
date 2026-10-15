import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveAdsHeaders } from '../src/config.ts';
import { loadManifests } from '../src/manifest.ts';

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

// --- pure units ---
test('resolveAdsHeaders precedence: flag > env > config', () => {
  const K = 'login-customer-id';
  // flag wins
  assert.equal(resolveAdsHeaders({ [K]: 'F' }, { [K]: 'C' })[K], 'F');
  // env over config (no flag)
  process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = 'E';
  try {
    assert.equal(resolveAdsHeaders({}, { [K]: 'C' })[K], 'E');
  } finally {
    delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  }
  // config fallback
  assert.equal(resolveAdsHeaders({}, { [K]: 'C' })[K], 'C');
  // absent → omitted (and developer-token is never sent)
  const h = resolveAdsHeaders({}, {});
  assert.equal(K in h, false);
  assert.equal('developer-token' in h, false);
});
