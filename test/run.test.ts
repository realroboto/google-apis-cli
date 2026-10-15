import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gapi } from './helpers/io.ts';

test('--help lists the derived command tree and exits 0', async () => {
  const r = await gapi(['--help']);
  assert.equal(r.code, 0);
  assert.ok(
    r.stdout.startsWith(
      'gapi <api> <resource> <verb> [--json|--raw]\n\nauth  setup | login [--manual] | status | logout\n\n',
    ),
  );
  assert.match(r.stdout, /gsc/);
  assert.match(r.stdout, /sites {2}add \| delete \| get \| list/);
  assert.match(r.stdout, /auth {2}setup \| login/);
  assert.equal(r.stderr, '');
});

test('gapi <api> with no verb prints that api subtree', async () => {
  const r = await gapi(['gsc']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /sites/);
  assert.doesNotMatch(r.stdout, /^ads$/m);
  assert.equal(r.stderr, '');
});

test('unknown api exits 1 with a clear message', async () => {
  const r = await gapi(['bogus', 'x', 'y']);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'gapi: unknown api: bogus (try `gapi --help`)\n');
});

test('ads gaql sugar: query positional routes into the gaql branch (needs --customer)', async () => {
  // The missing --customer guard fires before any network call (the fake fetch rejects).
  const r = await gapi(['ads', 'gaql', 'SELECT campaign.id FROM campaign']);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'gapi: ads gaql requires --customer <id>\n');
});
