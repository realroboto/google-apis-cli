import assert from 'node:assert/strict';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { openCatalog } from '../src/catalog.ts';
import { GapiError } from '../src/errors.ts';
import { fakeFetch } from './helpers/fetch.ts';

const apisDir = join(import.meta.dirname, 'fixtures', 'apis');
const DAY = 24 * 60 * 60;
const KIND = 'discovery#restDescription';

// A temp config dir, optionally holding a cached `mini` document aged `ageSec`.
function setup(cached?: { doc: unknown; ageSec: number }) {
  const dir = mkdtempSync(join(tmpdir(), 'gapi-catalog-'));
  const file = join(dir, 'cache', 'mini.json');
  if (cached) {
    mkdirSync(join(dir, 'cache'));
    writeFileSync(file, JSON.stringify(cached.doc));
    const t = Date.now() / 1000 - cached.ageSec;
    utimesSync(file, t, t);
  }
  return { dir, file };
}

async function open(dir: string, respond: () => Response | Promise<Response>) {
  const warnings: string[] = [];
  const { fetch, calls } = fakeFetch(respond);
  const catalog = await openCatalog({ dir, fetch, warn: (m) => warnings.push(m), apisDir });
  return { catalog, calls, warnings };
}

const fresh = () => Response.json({ kind: KIND, name: 'fresh' });
const down = () => Promise.reject(new TypeError('fetch failed'));

test('a fresh cache file is used without a fetch', async () => {
  const { dir } = setup({ doc: { kind: KIND, name: 'cached' }, ageSec: 60 });
  const { catalog, calls } = await open(dir, fresh);
  assert.equal((await catalog.load('mini')).name, 'cached');
  assert.equal(calls.length, 0);
});

test('a stale cache file is refetched and rewritten with mode 600', async () => {
  const { dir, file } = setup({ doc: { kind: KIND, name: 'cached' }, ageSec: DAY + 60 });
  const { catalog, calls } = await open(dir, fresh);
  assert.equal((await catalog.load('mini')).name, 'fresh');
  assert.deepEqual(
    calls.map((c) => c.url),
    ['https://mini.invalid/$discovery/rest?version=v1'],
  );
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { kind: KIND, name: 'fresh' });
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('a failed fetch falls back to a stale file and warns', async () => {
  const { dir } = setup({ doc: { kind: KIND, name: 'cached' }, ageSec: DAY + 60 });
  const { catalog, warnings } = await open(dir, () => new Response('nope', { status: 503 }));
  assert.equal((await catalog.load('mini')).name, 'cached');
  assert.deepEqual(warnings, ['discovery fetch failed for mini: HTTP 503; using cached copy']);
});

test('a failed fetch with no cache file exits 4, caches nothing, and a later load retries', async () => {
  const failures: [() => Response | Promise<Response>, string][] = [
    [down, 'fetch failed'],
    [() => Response.json({ error: { code: 404 } }, { status: 404 }), 'HTTP 404'],
    [() => new Response('<html>'), 'Unexpected token'],
    [() => Response.json([]), 'response is not a discovery#restDescription'],
    [() => Response.json({ name: 'x' }), 'response is not a discovery#restDescription'],
  ];
  for (const [respond, reason] of failures) {
    const { dir } = setup();
    const { catalog, calls } = await open(dir, respond);
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        catalog.load('mini'),
        (e) =>
          e instanceof GapiError &&
          e.exit === 4 &&
          e.message.startsWith(`discovery fetch failed for mini: ${reason}`),
      );
    }
    assert.equal(calls.length, 2);
    assert.equal(existsSync(catalog.cacheDir), false);
  }
});

test('refresh ignores the TTL; one parse per api otherwise', async () => {
  const { dir, file } = setup({ doc: { kind: KIND, name: 'cached' }, ageSec: 60 });
  const { catalog, calls } = await open(dir, fresh);
  await catalog.load('mini');
  writeFileSync(file, JSON.stringify({ kind: KIND, name: 'edited' }));
  assert.equal((await catalog.load('mini')).name, 'cached'); // parsed once, file not re-read
  assert.equal((await catalog.load('mini', { refresh: true })).name, 'fresh');
  assert.equal((await catalog.load('mini')).name, 'fresh');
  assert.equal(calls.length, 1);
});

test('fixture documents normalize into auth kind, scopes, overlays, words and media facts', async () => {
  const { dir } = setup();
  mkdirSync(join(dir, 'cache'));
  const docs = join(import.meta.dirname, 'fixtures', 'discovery');
  const files = {
    gsc: 'searchconsole',
    dv360: 'dv360',
    crux: 'crux',
    pagespeed: 'pagespeed',
    mini: 'mini',
  };
  for (const [api, file] of Object.entries(files)) {
    copyFileSync(join(docs, `${file}.json`), join(dir, 'cache', `${api}.json`));
  }
  const { catalog, calls } = await open(dir, down);
  const [gsc, dv360, crux, pagespeed, mini] = await Promise.all(
    Object.keys(files).map((api) => catalog.load(api)),
  );
  assert.deepEqual(
    [gsc, dv360, crux, pagespeed, mini].map((m) => m.auth),
    ['oauth', 'oauth', 'apiKey', 'apiKey', 'oauth'],
  );
  assert.deepEqual(
    [...dv360.byId.values()].filter((m) => m.unavailable).map((m) => m.words.join(' ')),
    [
      'users bulkEditAssignedUserRoles',
      'users patch',
      'users get',
      'users list',
      'users delete',
      'users create',
    ],
  );
  assert.equal(
    dv360.byId.get('displayvideo.advertisers.get')?.scope,
    'https://www.googleapis.com/auth/display-video',
  );
  assert.equal(pagespeed.byId.get('pagespeedonline.pagespeedapi.runpagespeed')?.unavailable, false);
  assert.ok(gsc.byId.get('searchconsole.urlTestingTools.mobileFriendlyTest.run')?.retired);
  assert.deepEqual(gsc.problems, []);
  assert.deepEqual(mini.problems, ['retired mini.files.gone: not in the document']);
  assert.deepEqual(mini.resources.get('v26')?.methods.get('listThings')?.words, [
    'v26',
    'listThings',
  ]);
  assert.equal(mini.byId.get('mini.files.list')?.pageable, true);
  assert.equal(mini.byId.get('mini.files.download')?.download, true);
  assert.equal(mini.byId.get('mini.files.upload')?.upload?.resumable, true);
  assert.equal(mini.schemas.has('constructor'), false);
  assert.equal(calls.length, 0);
});

test('an entry whose api differs from its file name is rejected', async () => {
  const { dir } = setup();
  const apis = join(dir, 'apis');
  mkdirSync(apis);
  writeFileSync(join(apis, 'wrong.ts'), "export default { api: 'right', discovery: 'x' };\n");
  const { fetch } = fakeFetch(fresh);
  await assert.rejects(openCatalog({ dir, fetch, warn: () => {}, apisDir: apis }), {
    message: `${join(apis, 'wrong.ts')}: api 'right' must equal 'wrong'`,
  });
});

test('entries load from a directory whose path holds a #', async () => {
  const { dir } = setup();
  const apis = mkdtempSync(join(tmpdir(), 'gapi-#-'));
  cpSync(apisDir, apis, { recursive: true });
  const { fetch } = fakeFetch(fresh);
  const catalog = await openCatalog({ dir, fetch, warn: () => {}, apisDir: apis });
  assert.deepEqual(
    Object.keys(catalog.entries).sort(),
    readdirSync(apisDir)
      .map((f) => basename(f, '.ts'))
      .sort(),
  );
});
