import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fakeFetch } from './helpers/fetch.ts';
import { gapi } from './helpers/io.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const apisDir = join(FIXTURES, 'apis');

// Config, cache and credentials live in a temp GAPI_CONFIG_DIR. The cache is fresh, so
// no row fetches a document; the access token is unexpired, so no row refreshes it.
const dir = mkdtempSync(join(tmpdir(), 'gapi-run-'));
process.env.GAPI_CONFIG_DIR = dir;
delete process.env.GOOGLE_CLOUD_PROJECT;
delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
mkdirSync(join(dir, 'cache'));
const DOCS = {
  crux: 'crux',
  dv360: 'dv360',
  'ga4-admin': 'ga4-admin',
  gsc: 'searchconsole',
  indexing: 'indexing',
  mini: 'mini',
  pagespeed: 'pagespeed',
};
for (const [api, doc] of Object.entries(DOCS)) {
  copyFileSync(join(FIXTURES, 'discovery', `${doc}.json`), join(dir, 'cache', `${api}.json`));
}
writeFileSync(
  join(dir, 'config.json'),
  JSON.stringify({ oauth_client_id: 'cid', oauth_client_secret: 'secret' }),
);
writeFileSync(
  join(dir, 'credentials.json'),
  JSON.stringify({ access_token: 'TOK', refresh_token: 'RT', expiry_date: Date.now() + 3600e3 }),
);

// `gapi` over the fixture entries (discovery documents from the seeded cache).
const fx = (argv: string[], io = {}) => gapi(argv, { apisDir, ...io });
const dryRun = async (argv: string[], shipped = false) => {
  const r = await (shipped ? gapi : fx)([...argv, '--dry-run']);
  assert.equal(r.stderr, '');
  assert.equal(r.code, 0);
  return JSON.parse(r.stdout);
};

test('--help prints the usage and every api entry without loading a document', async () => {
  const r = await gapi(['--help']);
  assert.equal(r.code, 0);
  assert.ok(r.stdout.startsWith('gapi <api> <resource> [<sub-resource>…] <method>'));
  assert.match(r.stdout, /^apis:\n {2}ads\n/m);
  assert.match(r.stdout, /^ {2}gsc$/m);
  assert.equal(r.stderr, '');
});

test('gapi <api> [<resource>…] lists that level', async () => {
  const hand = await gapi(['gsc']);
  assert.equal(hand.code, 0);
  assert.match(hand.stdout, /^resources:\n(?: {2}\S+\n)* {2}sites\n/m);

  const r = await fx(['ga4-admin', 'properties']);
  assert.equal(r.code, 0);
  assert.equal(
    r.stdout,
    'gapi ga4-admin properties\n\nresources:\n  dataStreams\n\nmethods:\n  list\n',
  );
  assert.match(
    (await fx(['gsc', 'urlTestingTools', 'mobileFriendlyTest'])).stdout,
    /run \(retired\)/,
  );
});

test('method --help shows the story-8 fields', async () => {
  const r = await fx(['ga4-admin', 'properties', 'list', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^gapi ga4-admin properties list\n/);
  assert.match(r.stdout, /^GET https:\/\/analyticsadmin\.googleapis\.com\/v1beta\/properties$/m);
  assert.match(r.stdout, /^id: analyticsadmin\.properties\.list$/m);
  assert.match(r.stdout, /^ {2}filter {2}query, string, required \(per description\)$/m);
  assert.match(r.stdout, /^ {2}pageSize {2}query, integer$/m);
  assert.match(r.stdout, /^body \(--body\): none$/m);
  assert.match(r.stdout, /^response: GoogleAnalyticsAdminV1betaListPropertiesResponse$/m);
  assert.match(r.stdout, /^scopes: https:\/\/www\.googleapis\.com\/auth\/analytics\.edit, /m);
  assert.match(
    r.stdout,
    /^docs: http:\/\/code\.google\.com\/apis\/analytics\/docs\/mgmt\/home\.html$/m,
  );
});

test('D5 examples: --dry-run prints the exact request', async () => {
  assert.deepEqual(
    await dryRun(['ga4-admin', 'properties', 'list', '--params', '{"filter":"parent:accounts/1"}']),
    {
      method: 'GET',
      url: 'https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent%3Aaccounts%2F1',
      headers: { Authorization: 'Bearer <redacted>' },
    },
  );
  const get = ['ga4-admin', 'properties', 'dataStreams', 'get', '--params'];
  assert.equal(
    (await dryRun([...get, '{"name":"properties/1/dataStreams/2"}'])).url,
    'https://analyticsadmin.googleapis.com/v1beta/properties/1/dataStreams/2',
  );
  const bad = await fx([...get, '{"name":"2"}', '--dry-run']);
  assert.equal(bad.code, 3);
  assert.equal(bad.stderr, 'gapi: name must match ^properties/[^/]+/dataStreams/[^/]+$\n');
  assert.equal(
    (await dryRun(['gsc', 'sites', 'get', '--params', '{"siteUrl":"https://a.com/"}'])).url,
    'https://searchconsole.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fa.com%2F',
  );
});

test('hand manifests run through the same path', async () => {
  assert.deepEqual(
    await dryRun(
      ['ads', 'campaigns', 'mutate', '--params', '{"customer":"1"}', '--body', '{}'],
      true,
    ),
    {
      method: 'POST',
      url: 'https://googleads.googleapis.com/v25/customers/1/campaigns:mutate',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer <redacted>' },
      body: {},
    },
  );
  assert.equal(
    (await dryRun(['gtm', 'containers', 'lookup', '--params', '{"tagId":"G-1"}'], true)).url,
    'https://tagmanager.googleapis.com/tagmanager/v2/accounts/containers:lookup?tagId=G-1',
  );
});

test('path and query encoding: {+x} per segment, repeated params, scalars', async () => {
  assert.equal(
    (await dryRun(['mini', 'files', 'get', '--params', '{"name":"files/a b"}'])).url,
    'https://mini.googleapis.com/v1/files/a%20b',
  );
  assert.equal(
    (await dryRun(['mini', 'files', 'list', '--params', '{"view":["BASIC","FULL"],"pageSize":5}']))
      .url,
    'https://mini.googleapis.com/v1/files?view=BASIC&view=FULL&pageSize=5',
  );
});

test('an unavailable method exits 2 without a fetch; --dry-run still prints it', async () => {
  const { fetch, calls } = fakeFetch(() => new Response('{}'));
  const r = await fx(['dv360', 'users', 'list'], { fetch });
  assert.equal(r.code, 2);
  assert.equal(r.stderr, 'gapi: dv360 users list: unavailable: scope not grantable\n');
  assert.equal(calls.length, 0);
  assert.equal(
    (await dryRun(['dv360', 'users', 'list'])).url,
    'https://displayvideo.googleapis.com/v4/users',
  );
});

test('validation errors exit 3 before any network call', async () => {
  const get = ['ga4-admin', 'properties', 'dataStreams', 'get'];
  const rows: [string[], RegExp, boolean?][] = [
    [['ga4-admin', 'bogus', 'list'], /^gapi: unknown resource 'bogus' \(valid: properties\)\n$/],
    [['gsc', 'sites', 'get', 'extra'], /^gapi: unexpected argument 'extra'\n$/],
    [['bogus'], /^gapi: unknown api: bogus\n$/],
    [[...get, '--params', '{'], /^gapi: --params is not valid JSON: /],
    [[...get, '--params', '[]'], /^gapi: --params must be a JSON object\n$/],
    [
      [...get, '--params', '{"nme":"x"}'],
      /^gapi: unknown param nme \(valid: name, fields, quotaUser\)\n$/,
    ],
    [[...get, '--params', '{"alt":"media"}'], /^gapi: alt is set by gapi\n$/],
    [get, /^gapi: missing required param name\n$/],
    [[...get, '--params', '{"name":["a"]}'], /^gapi: name takes one value, not an array\n$/],
    [[...get, '--params', '{"name":{}}'], /^gapi: name must be a string, number or boolean\n$/],
    [
      ['mini', 'files', 'list', '--params', '{"view":"NOPE"}'],
      /^gapi: view must be one of: BASIC, FULL\n$/,
    ],
    [
      ['gsc', 'sites', 'list', '--body', '{}'],
      /^gapi: --body: gsc sites list takes no request body\n$/,
    ],
    [['gsc', 'sites', 'list', '--json'], /^gapi: Unknown option '--json'/],
    [
      ['mini', 'files', 'list', '--page-all', '--page-limit', '0'],
      /^gapi: --page-limit must be a positive integer\n$/,
    ],
    [['mini', 'files', 'list', '--page-limit', '2'], /^gapi: --page-limit needs --page-all\n$/],
    [
      ['gsc', 'urlTestingTools', 'mobileFriendlyTest', 'run', '--body', '{}'],
      /^gapi: retired: Retired by Google in December 2023 \(https:\/\/developers\.google\.com\//,
    ],
    // #28: the value repeats the literal segment before a simple {x} placeholder.
    [
      ['ga4-admin', 'properties', 'get', '--params', '{"property":"properties/1"}'],
      /^gapi: pass the bare id: 1 \(the path already has properties\/\)\n$/,
      true,
    ],
  ];
  for (const [argv, stderr, shipped] of rows) {
    const { fetch, calls } = fakeFetch(() => new Response('{}'));
    const r = await (shipped ? gapi : fx)(argv, { fetch });
    assert.equal(r.code, 3, argv.join(' '));
    assert.match(r.stderr, stderr);
    assert.equal(calls.length, 0);
  }
});

test('send: one authorized request, response printed as JSON', async () => {
  const { fetch, calls } = fakeFetch(() => Response.json({ siteEntry: [{ siteUrl: 'x' }] }));
  const r = await fx(['gsc', 'sites', 'list'], { fetch });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, `${JSON.stringify({ siteEntry: [{ siteUrl: 'x' }] }, null, 2)}\n`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://searchconsole.googleapis.com/webmasters/v3/sites');
  assert.deepEqual(calls[0].init?.headers, { Authorization: 'Bearer TOK' });
});

test('send: --page-all follows nextPageToken and prints one NDJSON line per page', async () => {
  const pages = [{ files: [1], nextPageToken: 't2' }, { files: [2] }];
  const { fetch, calls } = fakeFetch(() => Response.json(pages[calls.length - 1]));
  const r = await fx(['mini', 'files', 'list', '--page-all'], { fetch });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, pages.map((p) => `${JSON.stringify(p)}\n`).join(''));
  assert.deepEqual(
    calls.map((c) => c.url),
    ['https://mini.googleapis.com/v1/files', 'https://mini.googleapis.com/v1/files?pageToken=t2'],
  );
  for (const c of calls) assert.deepEqual(c.init?.headers, { Authorization: 'Bearer TOK' });

  const one = fakeFetch(() => Response.json(pages[0]));
  const limited = await fx(['mini', 'files', 'list', '--page-all', '--page-limit', '1'], {
    fetch: one.fetch,
  });
  assert.equal(limited.code, 0);
  assert.equal(limited.stdout, `${JSON.stringify(pages[0])}\n`);
  assert.equal(one.calls.length, 1);

  const none = fakeFetch(() => Response.json({}));
  const bad = await fx(['gsc', 'sites', 'list', '--page-all'], { fetch: none.fetch });
  assert.equal(bad.code, 3);
  assert.equal(bad.stderr, 'gapi: --page-all: gsc sites list has no pageToken parameter\n');
  assert.equal(none.calls.length, 0);
});

test('send: a Google non-2xx exits 1 with the error body', async () => {
  const error = {
    code: 400,
    message: 'Request contains an invalid argument.',
    status: 'INVALID_ARGUMENT',
  };
  const { fetch } = fakeFetch(() => Response.json({ error }, { status: 400 }));
  const r = await fx(['ga4-admin', 'properties', 'list'], { fetch });
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, `gapi: ${error.message}\n${JSON.stringify(error, null, 2)}\n`);
});
