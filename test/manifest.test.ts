import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadManifests } from '../src/manifest.ts';

test('auto-discovers the gsc API entry', async () => {
  const m = await loadManifests();
  assert.equal(m.gsc?.api, 'gsc');
});
