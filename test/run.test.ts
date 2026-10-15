import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fakeFetch } from './helpers/fetch.ts';
import { gapi } from './helpers/io.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const apisDir = join(FIXTURES, 'apis');

// Config, cache and credentials live in a temp GAPI_CONFIG_DIR, passed through io.env
// only. The cache is fresh, so no row fetches a document; the access token is unexpired,
// so no row refreshes it.
const dir = mkdtempSync(join(tmpdir(), 'gapi-run-'));
const env = { GAPI_CONFIG_DIR: dir };
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
// The shipped ads entry: googleads v26 (revision 20261014) pruned to the two GAQL methods
// and one method of the resource named `v26`; schemas dropped, the Planner reads only the
// request $ref.
const ADWORDS = 'https://www.googleapis.com/auth/adwords';
const gaqlMethod = (verb: string, request: string) => ({
  id: `googleads.customers.googleAds.${verb}`,
  path: `v26/customers/{+customerId}/googleAds:${verb}`,
  httpMethod: 'POST',
  parameters: {
    customerId: { type: 'string', location: 'path', required: true, pattern: '^[^/]+$' },
  },
  request: { $ref: `GoogleAdsGoogleadsV26Services__${request}` },
  scopes: [ADWORDS],
});
writeFileSync(
  join(dir, 'cache', 'ads.json'),
  JSON.stringify({
    name: 'googleads',
    version: 'v26',
    rootUrl: 'https://googleads.googleapis.com/',
    servicePath: '',
    auth: { oauth2: { scopes: { [ADWORDS]: {} } } },
    resources: {
      v26: {
        methods: {
          listPlannableLocations: {
            id: 'googleads.listPlannableLocations',
            path: 'v26:listPlannableLocations',
            httpMethod: 'POST',
            parameters: {},
            request: { $ref: 'GoogleAdsGoogleadsV26Services__ListPlannableLocationsRequest' },
            scopes: [ADWORDS],
          },
        },
      },
      customers: {
        resources: {
          googleAds: {
            methods: {
              search: gaqlMethod('search', 'SearchGoogleAdsRequest'),
              searchStream: gaqlMethod('searchStream', 'SearchGoogleAdsStreamRequest'),
            },
          },
        },
      },
    },
  }),
);
writeFileSync(
  join(dir, 'config.json'),
  JSON.stringify({ oauth_client_id: 'cid', oauth_client_secret: 'secret', api_key: 'KEY' }),
);
writeFileSync(
  join(dir, 'credentials.json'),
  JSON.stringify({ access_token: 'TOK', refresh_token: 'RT', expiry_date: Date.now() + 3600e3 }),
);

// `gapi` over the shipped entries, and over the fixture entries (discovery documents
// from the seeded cache).
const sh = (argv: string[], io = {}) => gapi(argv, { env, ...io });
const fx = (argv: string[], io = {}) => gapi(argv, { env, apisDir, ...io });
const dryRun = async (argv: string[], shipped = false) => {
  const r = await (shipped ? sh : fx)([...argv, '--dry-run']);
  assert.equal(r.stderr, '');
  assert.equal(r.code, 0);
  return JSON.parse(r.stdout);
};

test('--help prints the usage and every api entry without loading a document', async () => {
  const r = await sh(['--help']);
  assert.equal(r.code, 0);
  assert.ok(r.stdout.startsWith('gapi <api> <resource> [<sub-resource>…] <method>'));
  assert.match(r.stdout, /^gapi <api> \+<helper> … /m);
  const shipped = readdirSync(fileURLToPath(new URL('../src/apis/', import.meta.url)))
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))
    .map((f) => basename(f, extname(f)))
    .sort();
  assert.ok(shipped.length > 0);
  assert.ok(r.stdout.endsWith(`\napis:\n${shipped.map((api) => `  ${api}\n`).join('')}`));
  assert.equal(r.stderr, '');
});

test('gapi <api> [<resource>…] lists that level', async () => {
  const gsc = await sh(['gsc']);
  assert.equal(gsc.code, 0);
  assert.match(gsc.stdout, /^resources:\n(?: {2}\S+\n)* {2}sites\n/m);
  assert.doesNotMatch(gsc.stdout, /^helpers:/m);
  assert.match((await sh(['ads'])).stdout, /^helpers:\n {2}\+gaql {2}"<query>" --customer <id>/m);

  const r = await fx(['ga4-admin', 'properties']);
  assert.equal(r.code, 0);
  assert.equal(
    r.stdout,
    'gapi ga4-admin properties\n\nresources:\n  dataStreams\n\nmethods:\n  list\n',
  );
  assert.match(
    (await sh(['gsc', 'urlTestingTools', 'mobileFriendlyTest'])).stdout,
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
    await dryRun(
      ['ga4-admin', 'properties', 'list', '--params', '{"filter":"parent:accounts/1"}'],
      true,
    ),
    {
      method: 'GET',
      url: 'https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent%3Aaccounts%2F1',
      headers: { Authorization: 'Bearer <redacted>' },
    },
  );
  const get = ['ga4-admin', 'properties', 'dataStreams', 'get', '--params'];
  assert.equal(
    (await dryRun([...get, '{"name":"properties/1/dataStreams/2"}'], true)).url,
    'https://analyticsadmin.googleapis.com/v1beta/properties/1/dataStreams/2',
  );
  const bad = await sh([...get, '{"name":"2"}', '--dry-run']);
  assert.equal(bad.code, 3);
  assert.equal(bad.stderr, 'gapi: name must match ^properties/[^/]+/dataStreams/[^/]+$\n');
  assert.equal(
    (await dryRun(['gsc', 'sites', 'get', '--params', '{"siteUrl":"https://a.com/"}'], true)).url,
    'https://searchconsole.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fa.com%2F',
  );
});

test('credentials: API-key header, entry header flags', async () => {
  const crux = await dryRun(['crux', 'records', 'queryRecord', '--body', '{}']);
  assert.deepEqual(crux.headers, {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': '<redacted>',
  });
  const psi = ['pagespeed', 'pagespeedapi', 'runpagespeed', '--params', '{"url":"https://a.com"}'];
  assert.deepEqual((await dryRun(psi)).headers, { 'X-Goog-Api-Key': '<redacted>' });

  const search = ['ads', 'customers', 'googleAds', 'search', '--params', '{"customerId":"1"}'];
  const ads = await dryRun([...search, '--body', '{}', '--login-customer-id', '9'], true);
  assert.equal(ads.headers['login-customer-id'], '9');

  const { fetch, calls } = fakeFetch(() => Response.json({}));
  const gsc = await fx(['gsc', 'sites', 'list', '--login-customer-id', '9'], { fetch });
  assert.equal(gsc.code, 3);
  assert.match(gsc.stderr, /^gapi: Unknown option '--login-customer-id'/);
  assert.equal(calls.length, 0);
});

test('ads: the resource named v26 is a tree path, not the method id', async () => {
  assert.deepEqual(await dryRun(['ads', 'v26', 'listPlannableLocations'], true), {
    method: 'POST',
    url: 'https://googleads.googleapis.com/v26:listPlannableLocations',
    headers: { Authorization: 'Bearer <redacted>' },
  });
});

test('ads +gaql: --dry-run prints the search request; --stream concatenates every chunk', async () => {
  const query = 'SELECT campaign.id FROM campaign';
  assert.deepEqual(await dryRun(['ads', '+gaql', query, '--customer', '1'], true), {
    method: 'POST',
    url: 'https://googleads.googleapis.com/v26/customers/1/googleAds:search',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer <redacted>' },
    body: { query },
  });

  const chunks = [{ results: [{ id: 1 }] }, { results: [{ id: 2 }] }];
  const { fetch, calls } = fakeFetch(() => Response.json(chunks));
  const r = await sh(['ads', '+gaql', query, '--customer', '1', '--stream'], { fetch });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, `${JSON.stringify([{ id: 1 }, { id: 2 }], null, 2)}\n`);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://googleads.googleapis.com/v26/customers/1/googleAds:searchStream',
  );
  assert.equal(calls[0].init?.body, JSON.stringify({ query }));
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

// Upload sources in the temp dir: text (accepted by `mini files upload`) and raw bytes.
const TXT = join(dir, 'note.txt');
writeFileSync(TXT, 'hello');
const BIN = join(dir, 'raw.bin');
writeFileSync(BIN, Buffer.from([0xff, 0xfe, 0x00, 0x01]));
const attach = ['mini', 'files', 'attach', '--params', '{"name":"files/a"}'];
const bytes = async (body: RequestInit['body']) =>
  Buffer.from(await new Response(body).arrayBuffer());

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
      ['mini', 'files', 'list', '--upload', TXT],
      /^gapi: --upload: mini files list takes no media upload\n$/,
    ],
    [
      [...attach, '--upload', BIN, '--upload-protocol', 'resumable'],
      /^gapi: --upload-protocol resumable: mini files attach has no resumable upload\n$/,
    ],
    [
      ['mini', 'files', 'upload', '--upload', TXT, '--upload-content-type', 'video/mp4'],
      /^gapi: --upload-content-type video\/mp4: mini files upload accepts image\/\*, text\/plain\n$/,
    ],
    [
      ['mini', 'files', 'list', '--upload-protocol', 'media'],
      /^gapi: --upload-protocol needs --upload\n$/,
    ],
    [
      ['mini', 'files', 'upload', '--upload', TXT, '--upload-protocol', 'multipart'],
      /^gapi: --upload-protocol multipart needs --body\n$/,
    ],
    [
      ['mini', 'files', 'list', '--page-all', '--output', TXT],
      /^gapi: --page-all and --output cannot be combined\n$/,
    ],
    [
      [...attach, '--upload', join(dir, 'missing.bin')],
      /^gapi: --upload: cannot read .*missing\.bin: ENOENT\n$/,
    ],
    [[...attach, '--upload', dir], /^gapi: --upload: .* is not a file\n$/],
    [
      ['mini', 'files', 'get', '--params', '{"name":"files/a"}', '--output', TXT],
      /^gapi: --output: mini files get has no media download\n$/,
    ],
    [
      ['gsc', 'urlTestingTools', 'mobileFriendlyTest', 'run', '--body', '{}'],
      /^gapi: retired: Retired by Google in December 2023 \(https:\/\/developers\.google\.com\//,
      true,
    ],
    [
      ['ads', '+gaql', 'SELECT campaign.id FROM campaign'],
      /^gapi: --customer is required\n$/,
      true,
    ],
    [['ads', '+nope'], /^gapi: unknown helper '\+nope' \(valid: \+gaql\)\n$/, true],
    // #28: the value repeats the literal segment before a simple {x} placeholder.
    [
      ['gsc', 'sites', 'get', '--params', '{"siteUrl":"sites/x"}'],
      /^gapi: pass the bare id: x \(the path already has sites\/\)\n$/,
      true,
    ],
  ];
  for (const [argv, stderr, shipped] of rows) {
    const { fetch, calls } = fakeFetch(() => new Response('{}'));
    const r = await (shipped ? sh : fx)(argv, { fetch });
    assert.equal(r.code, 3, argv.join(' '));
    assert.match(r.stderr, stderr);
    assert.equal(calls.length, 0);
  }
});

test('schema prints the D9 method shape, or a schema with $ref expanded up to a cycle', async () => {
  const method = await fx(['schema', 'mini', 'files.get']);
  assert.equal(method.code, 0);
  assert.deepEqual(JSON.parse(method.stdout), {
    id: 'mini.files.get',
    httpMethod: 'GET',
    path: 'v1/{+name}',
    description: 'Gets a file.',
    parameters: {
      name: {
        type: 'string',
        location: 'path',
        required: true,
        pattern: '^files/[^/]+$',
        description: 'Required. Resource name, files/{file}.',
      },
    },
    response: 'File',
    scopes: [
      'https://www.googleapis.com/auth/mini',
      'https://www.googleapis.com/auth/mini.readonly',
    ],
    supportsMediaUpload: false,
    supportsMediaDownload: false,
  });

  const node = await fx(['schema', 'mini', 'ListFilesResponse', '--resolve-refs']);
  assert.equal(node.code, 0);
  assert.deepEqual(JSON.parse(node.stdout).properties.files.items.properties.name, {
    type: 'string',
  });
  const cycle = JSON.parse((await fx(['schema', 'mini', 'Node', '--resolve-refs'])).stdout);
  assert.deepEqual(cycle.properties.parent, { $ref: 'Node' });
  assert.deepEqual(cycle.properties.children.items, { $ref: 'Node' });

  const rows: [string[], string][] = [
    [['schema', 'mini', 'files'], 'gapi: files is a resource, not a method or schema\n'],
    [['schema', 'mini'], 'gapi: usage: gapi schema <api> <resource>[.<sub-resource>…].<method>'],
    [['gsc', 'sites', 'list', '--resolve-refs'], "gapi: Unknown option '--resolve-refs'"],
  ];
  for (const [argv, stderr] of rows) {
    const { fetch, calls } = fakeFetch(() => new Response('{}'));
    const r = await fx(argv, { fetch });
    assert.equal(r.code, 3, argv.join(' '));
    assert.ok(r.stderr.startsWith(stderr), r.stderr);
    assert.equal(calls.length, 0);
  }
});

test('discovery refresh refetches and rewrites the cache; discovery path prints it', async () => {
  const file = join(dir, 'cache', 'mini.json');
  const text = readFileSync(join(FIXTURES, 'discovery', 'mini.json'), 'utf8');
  writeFileSync(file, '{}'); // fresh, so only a refresh refetches it
  const { fetch, calls } = fakeFetch(() => new Response(text));
  const r = await fx(['discovery', 'refresh', 'mini', 'mini'], { fetch });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'refreshed mini\n');
  assert.deepEqual(
    calls.map((c) => c.url),
    ['https://mini.invalid/$discovery/rest?version=v1'],
  );
  assert.equal(readFileSync(file, 'utf8'), text);

  const path = await fx(['discovery', 'path']);
  assert.equal(path.code, 0);
  assert.equal(path.stdout, `${join(dir, 'cache')}\n`);

  const rows: [string[], string, boolean?][] = [
    [['discovery', 'refresh', 'mini', 'nope'], 'gapi: unknown api: nope\n'],
    [['discovery', 'bogus'], 'gapi: usage: gapi discovery refresh [<api>…] | path\n'],
  ];
  for (const [argv, stderr, shipped] of rows) {
    const none = fakeFetch(() => new Response(text));
    const bad = await (shipped ? sh : fx)(argv, { fetch: none.fetch });
    assert.equal(bad.code, 3, argv.join(' '));
    assert.equal(bad.stderr, stderr);
    assert.equal(none.calls.length, 0);
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

test('send: reads only the config dir in io.env, never HOME', async () => {
  const home = mkdtempSync(join(tmpdir(), 'gapi-home-'));
  const { fetch, calls } = fakeFetch(() => Response.json({ properties: [] }));
  const r = await fx(
    ['ga4-admin', 'properties', 'list', '--params', '{"filter":"parent:accounts/1"}'],
    {
      fetch,
      env: { ...env, HOME: home },
    },
  );
  assert.equal(r.code, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].init?.headers, { Authorization: 'Bearer TOK' });
});

test('send: a 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT exits 2 naming the scope', async () => {
  const error = {
    code: 403,
    message: 'Request had insufficient authentication scopes.',
    status: 'PERMISSION_DENIED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
      },
    ],
  };
  const { fetch } = fakeFetch(() => Response.json({ error }, { status: 403 }));
  const r = await fx(['indexing', 'urlNotifications', 'getMetadata'], { fetch });
  assert.equal(r.code, 2);
  assert.ok(
    r.stderr.startsWith(
      'gapi: missing scope (https://www.googleapis.com/auth/indexing); run gapi auth login\n',
    ),
    r.stderr,
  );
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

test('media --dry-run prints the upload session request and the alt=media request', async () => {
  assert.deepEqual(
    await dryRun(['mini', 'files', 'upload', '--upload', TXT, '--upload-protocol', 'resumable']),
    {
      method: 'POST',
      url: 'https://mini.googleapis.com/upload/v1/files?uploadType=resumable',
      headers: { 'X-Upload-Content-Type': 'text/plain', Authorization: 'Bearer <redacted>' },
      upload: { path: TXT, contentType: 'text/plain', protocol: 'resumable' },
    },
  );
  const out = join(dir, 'never-written.bin');
  const download = ['mini', 'files', 'download', '--params', '{"name":"files/a"}'];
  assert.deepEqual(await dryRun([...download, '--output', out]), {
    method: 'GET',
    url: 'https://mini.googleapis.com/v1/files/a:download?alt=media',
    headers: { Authorization: 'Bearer <redacted>' },
    output: out,
  });
  assert.equal(existsSync(out), false);
});

test('send: media and multipart uploads send the file in one request', async () => {
  const media = fakeFetch(() => Response.json({ name: 'files/a' }));
  const r = await fx([...attach, '--upload', BIN], { fetch: media.fetch });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, `${JSON.stringify({ name: 'files/a' }, null, 2)}\n`);
  assert.equal(media.calls.length, 1);
  const [call] = media.calls;
  assert.equal(call.url, 'https://mini.googleapis.com/upload/v1/files/a:attach?uploadType=media');
  assert.equal(call.init?.method, 'POST');
  assert.deepEqual(call.init?.headers, {
    'Content-Type': 'application/octet-stream',
    Authorization: 'Bearer TOK',
  });
  assert.deepEqual(await bytes(call.init?.body), readFileSync(BIN));

  const multi = fakeFetch(() => Response.json({ name: 'files/b' }));
  const m = await fx(['mini', 'files', 'upload', '--upload', TXT, '--body', '{"name":"b"}'], {
    fetch: multi.fetch,
  });
  assert.equal(m.code, 0, m.stderr);
  assert.equal(multi.calls.length, 1);
  const [part] = multi.calls;
  assert.equal(part.url, 'https://mini.googleapis.com/upload/v1/files?uploadType=multipart');
  const headers = part.init?.headers as Record<string, string>;
  const boundary = /^multipart\/related; boundary=(.+)$/.exec(headers['Content-Type'])?.[1];
  assert.ok(boundary, headers['Content-Type']);
  assert.equal(
    (await bytes(part.init?.body)).toString(),
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name":"b"}` +
      `\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\nhello\r\n--${boundary}--`,
  );
});

test('send: a resumable upload opens a session, then PUTs 8 MiB chunks until a 2xx', async () => {
  const chunk = 8 * 1024 * 1024;
  const big = join(dir, 'big.txt');
  writeFileSync(big, Buffer.alloc(chunk + 3, 'a'));
  const session = 'https://mini.googleapis.com/upload/v1/files?upload_id=s1';
  const opened = () => new Response(null, { headers: { Location: session } });
  const replies = [
    opened,
    () => new Response(null, { status: 308, headers: { Range: `bytes=0-${chunk - 1}` } }),
    () => Response.json({ name: 'files/big' }),
  ];
  const { fetch, calls } = fakeFetch(() => replies[calls.length - 1]());
  const r = await fx(
    ['mini', 'files', 'upload', '--upload', big, '--upload-protocol', 'resumable'],
    {
      fetch,
    },
  );
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, `${JSON.stringify({ name: 'files/big' }, null, 2)}\n`);
  assert.deepEqual(
    calls.map((c) => [c.init?.method, c.url, c.init?.headers]),
    [
      [
        'POST',
        'https://mini.googleapis.com/upload/v1/files?uploadType=resumable',
        {
          'X-Upload-Content-Type': 'text/plain',
          'X-Upload-Content-Length': String(chunk + 3),
          Authorization: 'Bearer TOK',
        },
      ],
      [
        'PUT',
        session,
        { 'Content-Range': `bytes 0-${chunk - 1}/${chunk + 3}`, Authorization: 'Bearer TOK' },
      ],
      [
        'PUT',
        session,
        {
          'Content-Range': `bytes ${chunk}-${chunk + 2}/${chunk + 3}`,
          Authorization: 'Bearer TOK',
        },
      ],
    ],
  );
  assert.deepEqual(
    await Promise.all(calls.slice(1).map(async (c) => (await bytes(c.init?.body)).length)),
    [chunk, 3],
  );

  // A 308 without Range means Google kept nothing: the same bytes go again.
  const retry = [opened, () => new Response(null, { status: 308 }), () => Response.json({})];
  const again = fakeFetch(() => retry[again.calls.length - 1]());
  const argv = ['mini', 'files', 'upload', '--upload', TXT, '--upload-protocol', 'resumable'];
  assert.equal((await fx(argv, { fetch: again.fetch })).code, 0);
  assert.deepEqual(
    again.calls.slice(1).map((c) => new Headers(c.init?.headers).get('Content-Range')),
    ['bytes 0-4/5', 'bytes 0-4/5'],
  );

  // A session that never moves past byte 0 stops after a bounded number of PUTs.
  const stuck = fakeFetch(() =>
    stuck.calls.length === 1 ? opened() : new Response(null, { status: 308 }),
  );
  const s = await fx(argv, { fetch: stuck.fetch });
  assert.equal(s.code, 5);
  assert.match(s.stderr, /^gapi: Error: resumable upload: 308 at byte 0 of 5, no progress\n$/);
  assert.equal(stuck.calls.length, 4);
});

test('send: --output streams the body to the file and prints its path and size', async () => {
  const body = Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x0a]);
  const out = join(dir, 'download.bin');
  const download = ['mini', 'files', 'download', '--params', '{"name":"files/a"}', '--output', out];
  const { fetch, calls } = fakeFetch(() => new Response(body));
  const r = await fx(download, { fetch });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, `${JSON.stringify({ path: out, bytes: body.length }, null, 2)}\n`);
  assert.deepEqual(readFileSync(out), body);
  assert.equal(calls[0].url, 'https://mini.googleapis.com/v1/files/a:download?alt=media');

  const empty = fakeFetch(() => new Response(null));
  assert.equal((await fx(download, { fetch: empty.fetch })).code, 0);
  assert.equal(readFileSync(out).length, 0);

  const gone = join(dir, 'not-found.bin');
  const missing = fakeFetch(() => Response.json({ error: { message: 'nope' } }, { status: 404 }));
  const e = await fx([...download.slice(0, -1), gone], { fetch: missing.fetch });
  assert.equal(e.code, 1);
  assert.equal(existsSync(gone), false);
});
