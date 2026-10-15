import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadManifests } from '../src/manifest.ts';

test('auto-discovers the gsc manifest', async () => {
  const m = await loadManifests();
  assert.ok(m.gsc, 'gsc manifest discovered');
  assert.equal(m.gsc.baseUrl, 'https://searchconsole.googleapis.com');
  assert.equal(m.gsc.resources.sites.list.httpMethod, 'GET');
});
