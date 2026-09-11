import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadManifests, findRow, checkSchema } from '../src/manifest.js';

test('auto-discovers gsc manifest and finds the tracer row', async () => {
  const m = await loadManifests();
  assert.ok(m.gsc, 'gsc manifest discovered');
  const row = findRow(m, 'gsc', 'sites', 'list');
  assert.equal(row.httpMethod, 'GET');
  assert.equal(row.baseUrl, 'https://searchconsole.googleapis.com');
});

test('checkSchema passes for shipped manifests', async () => {
  const m = await loadManifests();
  assert.equal(checkSchema(m), true);
});

test('checkSchema rejects unknown scope, missing field, bad placeholder', () => {
  const bad = {
    x: {
      api: 'x',
      baseUrl: 'https://h',
      resources: {
        r: {
          v1: { httpMethod: 'GET', pathTemplate: '/a', scopes: ['nope'] },
          v2: { pathTemplate: '/b', scopes: ['webmasters'] },
          v3: { httpMethod: 'GET', pathTemplate: '/{a.b}', scopes: ['webmasters'] },
        },
      },
    },
  };
  assert.throws(() => checkSchema(bad), (e) => {
    assert.match(e.message, /unknown scope "nope"/);
    assert.match(e.message, /missing httpMethod/);
    assert.match(e.message, /bad path placeholder/);
    return true;
  });
});
