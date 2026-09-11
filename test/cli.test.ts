import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const BIN = fileURLToPath(new URL('../bin/gapi.ts', import.meta.url));

async function gapi(args: string[]) {
  try {
    const { stdout, stderr } = await run('node', [BIN, ...args]);
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('--help lists the derived command tree and exits 0', async () => {
  const r = await gapi(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /gsc/);
  assert.match(r.stdout, /sites {2}add \| delete \| get \| list/);
  assert.match(r.stdout, /auth {2}login/);
});

test('unknown api exits non-zero with a clear message', async () => {
  const r = await gapi(['bogus', 'x', 'y']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /unknown api: bogus/);
});

test('gapi <api> with no verb prints that api subtree', async () => {
  const r = await gapi(['gsc']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /sites/);
});

test('ads gaql sugar: query positional routes into the gaql branch (needs --customer)', async () => {
  // Proves argv reaches the `ads gaql` branch with the query bound as a
  // positional; the missing --customer guard fires before any network call.
  const r = await gapi(['ads', 'gaql', 'SELECT campaign.id FROM campaign']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /ads gaql requires --customer/);
});
