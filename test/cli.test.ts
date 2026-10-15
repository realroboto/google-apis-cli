import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const BIN = fileURLToPath(new URL('../bin/gapi.ts', import.meta.url));

// Bin wiring only; every CLI behavior is tested in-process in run.test.ts.
test('--help exits 0', async () => {
  const { stdout } = await promisify(execFile)('node', [BIN, '--help']);
  assert.match(stdout, /gsc/);
});
