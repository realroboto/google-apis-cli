import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, type TestContext, test } from 'node:test';
import { fakeFetch } from './helpers/fetch.ts';
import { gapi } from './helpers/io.ts';

// `gapi entities` over the shipped ga4-admin and gsc entity sources (#200 D6).
// test/fixtures/entities/<api>.json = the real discovery document pruned to the list methods
// the sources call, schemas dropped.
const root = mkdtempSync(join(tmpdir(), 'gapi-entities-'));
after(() => rmSync(root, { recursive: true, force: true }));

const credentials = (dir: string, refreshToken: string) =>
  writeFileSync(
    join(dir, 'credentials.json'),
    JSON.stringify({
      access_token: 'TOK',
      refresh_token: refreshToken,
      expiry_date: Date.now() + 3600e3,
    }),
  );

// A fresh config dir per test: mode 700, documents cached, a stored token.
function setup(t: TestContext) {
  const dir = mkdtempSync(join(root, 'cfg-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(import.meta.dirname, 'fixtures', 'entities'), join(dir, 'cache'), {
    recursive: true,
  });
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({ oauth_client_id: 'c', oauth_client_secret: 's' }),
  );
  credentials(dir, 'RT');
  const env = { GAPI_CONFIG_DIR: dir };
  return { dir, env, run: (argv: string[], io = {}) => gapi(argv, { env, ...io }) };
}

const SUMMARIES = {
  accountSummaries: [
    {
      account: 'accounts/100',
      displayName: 'Acme Group',
      propertySummaries: [
        { property: 'properties/123456', displayName: 'Acme Web', parent: 'accounts/100' },
      ],
    },
  ],
};
const STREAMS = {
  dataStreams: [
    {
      name: 'properties/123456/dataStreams/9',
      displayName: 'Acme site',
      type: 'WEB_DATA_STREAM',
      webStreamData: { defaultUri: 'https://www.Acme.com/' },
    },
  ],
};
const SITES = {
  siteEntry: [{ siteUrl: 'sc-domain:acme.com' }, { siteUrl: 'https://beta.example.org/' }],
};

type Replies = { summaries?: unknown; streams?: unknown; sites?: unknown; gscStatus?: number };
const google = ({
  summaries = SUMMARIES,
  streams = STREAMS,
  sites = SITES,
  gscStatus = 200,
}: Replies = {}) =>
  fakeFetch((url) => {
    const { pathname } = new URL(url);
    if (pathname === '/v1beta/accountSummaries') return Response.json(summaries);
    if (pathname === '/v1beta/properties/123456/dataStreams') return Response.json(streams);
    if (pathname === '/webmasters/v3/sites') {
      return gscStatus === 200
        ? Response.json(sites)
        : Response.json(
            { error: { code: gscStatus, message: 'Search Console API disabled' } },
            { status: gscStatus },
          );
    }
    return new Response('not found', { status: 404 });
  });

const date = new Date().toISOString().slice(0, 10);
const line = (...cells: string[]) => `${[...cells, date].join('\t')}\n`;

test('entities sync stores both sources; find matches part of an ID and a domain across APIs', async (t) => {
  const { dir, run } = setup(t);
  const { fetch, calls } = google();
  const sync = await run(['entities', 'sync'], { fetch });
  assert.equal(sync.code, 0, sync.stderr);
  assert.equal(
    sync.stderr,
    'gapi: entities sync: 2 list calls, then 1 per ga4-admin property; max 10 pages per list\n',
  );
  assert.equal(sync.stdout, 'ga4-admin: 3 entities\ngsc: 2 entities\n');
  assert.deepEqual(
    calls.map((c) => new URL(c.url).pathname),
    ['/v1beta/accountSummaries', '/v1beta/properties/123456/dataStreams', '/webmasters/v3/sites'],
  );
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.equal(statSync(join(dir, 'entities.db')).mode & 0o777, 0o600);

  const id = await run(['entities', 'find', '3456']);
  assert.equal(id.code, 0, id.stderr);
  assert.equal(id.stderr, '');
  assert.equal(
    id.stdout,
    // bm25: the stream holds the term twice (ID and parent), so it ranks first.
    line(
      'ga4-admin',
      'stream',
      'properties/123456/dataStreams/9',
      'Acme site',
      'properties/123456',
      'acme.com',
    ) + line('ga4-admin', 'property', 'properties/123456', 'Acme Web', 'accounts/100', ''),
  );
  // One host links the GA4 web stream and the Search Console domain property.
  const domain = await run(['entities', 'find', 'acme.com']);
  assert.deepEqual(
    domain.stdout
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t').slice(0, 3).join(' '))
      .toSorted(),
    ['ga4-admin stream properties/123456/dataStreams/9', 'gsc site sc-domain:acme.com'],
  );
  const only = await run(['entities', 'find', 'acme.com', '--api', 'gsc']);
  assert.equal(only.stdout, line('gsc', 'site', 'sc-domain:acme.com', '', '', 'acme.com'));
});

test('entities sync: a failed source exits 1, keeps its old rows and stores the others', async (t) => {
  const { run } = setup(t);
  assert.equal((await run(['entities', 'sync'], { fetch: google().fetch })).code, 0);
  const renamed = { accountSummaries: [{ account: 'accounts/100', displayName: 'Acme Holding' }] };
  const { fetch } = google({ summaries: renamed, gscStatus: 403 });
  const r = await run(['entities', 'sync'], { fetch });
  assert.equal(r.code, 1);
  assert.equal(
    r.stdout,
    'ga4-admin: 1 entities\ngsc: failed, old rows kept: Search Console API disabled\n',
  );
  assert.match(r.stderr, /\ngapi: 1 of 2 entity sources failed\n$/);
  // ga4-admin replaced: the vanished property and stream are gone; gsc rows stay.
  assert.equal((await run(['entities', 'find', '3456'])).stderr, 'gapi: no match\n');
  assert.match(
    (await run(['entities', 'find', 'holding'])).stdout,
    /^ga4-admin\taccount\taccounts\/100\tAcme Holding\t/,
  );
  assert.match(
    (await run(['entities', 'find', 'beta.example'])).stdout,
    /^gsc\tsite\thttps:\/\/beta\.example\.org\/\t/,
  );
});

test('entities sync <api> --page-limit bounds each list and refreshes only that API', async (t) => {
  const { run } = setup(t);
  const { fetch, calls } = google({ summaries: { ...SUMMARIES, nextPageToken: 'p2' } });
  const r = await run(['entities', 'sync', 'ga4-admin', '--page-limit', '1'], { fetch });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'ga4-admin: 3 entities\n');
  assert.equal(calls.length, 2);
  assert.match(
    r.stderr,
    /^gapi: entities sync: 1 list calls, then 1 per ga4-admin property; max 1 pages per list\n$/,
  );
  for (const [argv, message] of [
    [['entities', 'sync', '--page-limit', '0'], 'gapi: --page-limit must be a positive integer\n'],
    [['entities', 'sync', 'bogus'], 'gapi: unknown api: bogus\n'],
    [['entities', 'sync', 'places'], 'gapi: places has no entity sources\n'],
    [['entities', 'find', 'acme', '--api', 'crux'], 'gapi: crux has no entity sources\n'],
    [['entities', 'find', 'ac'], "gapi: find: each term needs 3 or more characters: 'ac'\n"],
    [['entities', 'find'], 'gapi: find: each term needs 3 or more characters\n'],
    [
      ['entities', 'list'],
      'gapi: usage: gapi entities sync [<api>…] [--page-limit <n>] | find <words…> [--api <api>]\n',
    ],
  ] as const) {
    const e = await run([...argv], { fetch });
    assert.deepEqual([e.code, e.stderr], [3, message]);
  }
  assert.equal(calls.length, 2);
});

test('entities find: an empty, foreign-identity, aged or unreadable index says so on stderr', async (t) => {
  const { dir, run } = setup(t);
  const empty =
    'gapi: entities index is empty or older than 7 days; run gapi entities sync\ngapi: no match\n';
  assert.deepEqual(await run(['entities', 'find', 'acme']), { code: 0, stdout: '', stderr: empty });
  // A synced index read by another account: nothing.
  assert.equal((await run(['entities', 'sync'], { fetch: google().fetch })).code, 0);
  credentials(dir, 'RT2');
  assert.equal((await run(['entities', 'find', 'acme'])).stderr, empty);
  credentials(dir, 'RT');
  assert.notEqual((await run(['entities', 'find', 'acme'])).stdout, '');
  // Rows synced 8 days ago are swept on the next run.
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() - 8 * 86400e3 });
  assert.equal((await run(['entities', 'sync'], { fetch: google().fetch })).code, 0);
  t.mock.timers.reset();
  assert.equal((await run(['entities', 'find', 'acme'])).stderr, empty);
  // A file that is not this schema version (here: no database at all) is dropped and rebuilt.
  writeFileSync(join(dir, 'entities.db'), 'not a database');
  assert.equal((await run(['entities', 'find', 'acme'])).stderr, empty);
  assert.equal((await run(['entities', 'sync'], { fetch: google().fetch })).code, 0);
  assert.notEqual((await run(['entities', 'find', 'acme'])).stdout, '');
});
