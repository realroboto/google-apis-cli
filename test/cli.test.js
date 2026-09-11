import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const BIN = fileURLToPath(new URL('../bin/gapi.js', import.meta.url));

async function gapi(args) {
  try {
    const { stdout, stderr } = await run('node', [BIN, ...args]);
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

test('--help lists the derived command tree and exits 0', async () => {
  const r = await gapi(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /gsc/);
  assert.match(r.stdout, /sites {2}list/);
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
