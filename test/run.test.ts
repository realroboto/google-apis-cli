import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fakeFetch } from './helpers/fetch.ts';
import { gapi } from './helpers/io.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const apisDir = join(FIXTURES, 'apis');

// Config, cache and credentials live in a temp GAPI_CONFIG_DIR, passed through io.env
// only. The cache is fresh, so no row fetches a document; the access token is unexpired,
// so no row refreshes it.
const dir = mkdtempSync(join(tmpdir(), 'gapi-run-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const env = { GAPI_CONFIG_DIR: dir };
mkdirSync(join(dir, 'cache'));
const DOCS = {
  business: 'business',
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
    kind: 'discovery#restDescription',
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

test('auth login --help prints the auth usage and starts no login', async () => {
  const { fetch, calls } = fakeFetch(() => new Response('{}'));
  const r = await sh(['auth', 'login', '--help'], { fetch });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'gapi auth setup | login [--manual] | status | logout\n');
  assert.equal(r.stderr, '');
  assert.equal(calls.length, 0);
});

test('schema --help prints the schema usage', async () => {
  const r = await sh(['schema', '--help']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(
    r.stdout,
    'gapi schema <api> <resource>[.<sub-resource>…].<method> | <SchemaName> [--resolve-refs]\n',
  );
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

test('ads +gaql --stream: a chunk with an error exits 1 with that chunk', async () => {
  const failed = { error: { code: 500, message: 'Internal error encountered.' } };
  const { fetch } = fakeFetch(() => Response.json([{ results: [{ id: 1 }] }, failed]));
  const r = await sh(['ads', '+gaql', 'SELECT x FROM y', '--customer', '1', '--stream'], { fetch });
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.equal(
    r.stderr,
    `gapi: Internal error encountered.\n${JSON.stringify(failed.error, null, 2)}\n`,
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
  assert.equal(
    (await dryRun(['gsc', 'sites', 'get', '--params', `{"siteUrl":"a!'()*~"}`], true)).url,
    'https://searchconsole.googleapis.com/webmasters/v3/sites/a%21%27%28%29%2A~',
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

// Indexing batch files (one notification per line), and Google's multipart/mixed answer:
// one `application/http` part per [request Content-ID, status, body].
const URLS = join(dir, 'urls.txt');
writeFileSync(
  URLS,
  '# sitemap delta\n\nURL_UPDATED https://a.com/1\n  URL_DELETED https://a.com/2  \n',
);
const BAD_URLS = join(dir, 'bad-urls.txt');
writeFileSync(BAD_URLS, 'URL_UPDATED https://a.com/1\nURL_UPSERTED https://a.com/2\n');
const batchAnswer = (parts: [id: number, status: number, body: unknown][]) =>
  new Response(
    `${parts
      .map(
        ([id, status, body]) =>
          `--batch_x\r\nContent-Type: application/http\r\nContent-ID: <response-${id}>\r\n\r\n` +
          `HTTP/1.1 ${status} X\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
          `${JSON.stringify(body)}\r\n`,
      )
      .join('')}--batch_x--\r\n`,
    { headers: { 'Content-Type': 'multipart/mixed; boundary=batch_x' } },
  );

test('validation errors exit 3 before any network call', async () => {
  const get = ['ga4-admin', 'properties', 'dataStreams', 'get'];
  const rows: [string[], RegExp, boolean?][] = [
    [['ga4-admin', 'bogus', 'list'], /^gapi: unknown resource 'bogus' \(valid: properties\)\n$/],
    [
      ['ga4-admin', 'properties', 'bogus'],
      /^gapi: unknown resource or method 'bogus' \(valid: dataStreams, list\)\n$/,
    ],
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
      ['mini', 'files', 'list', '--params', '{"pageSize":12345678901234567890}'],
      /^gapi: --params pageSize: integer exceeds 2\^53; pass it as a string\n$/,
    ],
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
    [
      ['indexing', '+publishBatch', BAD_URLS],
      /^gapi: .*bad-urls\.txt:2: expected URL_UPDATED <url> or URL_DELETED <url>\n$/,
      true,
    ],
    [
      ['indexing', '+publishBatch', join(dir, 'missing.txt')],
      /^gapi: cannot read .*missing\.txt: ENOENT\n$/,
      true,
    ],
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
  writeFileSync(file, JSON.stringify({ kind: 'discovery#restDescription' })); // fresh: only a refresh refetches it
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

test('a corrupt or wrong-kind cache file is refetched; a failed refetch exits 4', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'gapi-cache-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const file = join(home, 'cache', 'mini.json');
  mkdirSync(join(home, 'cache'));
  const text = readFileSync(join(FIXTURES, 'discovery', 'mini.json'), 'utf8');
  const io = { env: { GAPI_CONFIG_DIR: home }, apisDir };
  for (const corrupt of ['{"name":', JSON.stringify({ kind: 'discovery#directoryList' })]) {
    writeFileSync(file, corrupt); // fresh, so only the failed guard refetches it
    const { fetch, calls } = fakeFetch(() => new Response(text));
    const r = await gapi(['mini'], { ...io, fetch });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stderr, '');
    assert.equal(calls.length, 1);
    assert.equal(readFileSync(file, 'utf8'), text);

    writeFileSync(file, corrupt);
    const down = await gapi(['mini'], {
      ...io,
      fetch: () => Promise.resolve(new Response('nope', { status: 503 })),
    });
    assert.equal(down.code, 4);
    assert.equal(
      down.stderr,
      'gapi: discovery fetch failed for mini: HTTP 503; retry: gapi discovery refresh mini\n',
    );
  }
});

test('an empty cache and a failed fetch exit 4', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'gapi-empty-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const { fetch, calls } = fakeFetch(() => new Response('nope', { status: 503 }));
  const r = await gapi(['mini'], { env: { GAPI_CONFIG_DIR: home }, apisDir, fetch });
  assert.equal(r.code, 4);
  assert.equal(r.stdout, '');
  assert.equal(
    r.stderr,
    'gapi: discovery fetch failed for mini: HTTP 503; retry: gapi discovery refresh mini\n',
  );
  assert.equal(calls.length, 1);
});

test('a deprecated method warns on stderr and still runs', async () => {
  const r = await fx(['mini', 'v26', 'listThings', '--body', '{}', '--dry-run']);
  assert.equal(r.code, 0);
  assert.equal(r.stderr, 'gapi: warning: mini v26 listThings is deprecated (fixture overlay)\n');
  assert.match(r.stdout, /v26:listThings/);
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
  assert.equal(
    bad.stderr,
    'gapi: --page-all: gsc sites list has no pageToken parameter or request field\n',
  );
  assert.equal(none.calls.length, 0);
});

test('send: --page-all pages through the request body, same body plus pageToken', async () => {
  const pages = [{ files: [1], nextPageToken: 't2' }, { files: [2] }];
  const { fetch, calls } = fakeFetch(() => Response.json(pages[calls.length - 1]));
  const r = await fx(['mini', 'files', 'search', '--body', '{"query":"q"}', '--page-all'], {
    fetch,
  });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, pages.map((p) => `${JSON.stringify(p)}\n`).join(''));
  for (const c of calls) {
    assert.equal(c.url, 'https://mini.googleapis.com/v1/files:search');
    assert.equal(c.init?.method, 'POST');
    assert.deepEqual(c.init?.headers, {
      'Content-Type': 'application/json',
      Authorization: 'Bearer TOK',
    });
  }
  assert.deepEqual(
    calls.map((c) => JSON.parse(String(c.init?.body))),
    [{ query: 'q' }, { query: 'q', pageToken: 't2' }],
  );
  const bare = await dryRun(['mini', 'files', 'search', '--page-all']);
  assert.deepEqual([bare.headers['Content-Type'], bare.body], ['application/json', {}]);
  const list = await fx(['mini', 'files', 'search', '--body', '[]', '--page-all', '--dry-run']);
  assert.equal(list.code, 3);
  assert.equal(list.stderr, 'gapi: --page-all: --body must be a JSON object\n');
});

test('send: reads only the config dir in io.env, never HOME', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'gapi-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
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
        domain: 'googleapis.com',
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

test('send: a 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT names the entry scope when the method lists none', async () => {
  const error = {
    code: 403,
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
        domain: 'googleapis.com',
      },
    ],
  };
  const { fetch } = fakeFetch(() => Response.json({ error }, { status: 403 }));
  const r = await fx(['business', 'locations', 'get', '--params', '{"name":"locations/1"}'], {
    fetch,
  });
  assert.equal(r.code, 2);
  assert.ok(
    r.stderr.startsWith(
      'gapi: missing scope (https://www.googleapis.com/auth/business.manage); run gapi auth login\n',
    ),
    r.stderr,
  );
});

test('send: ACCESS_TOKEN_SCOPE_INSUFFICIENT from another domain exits 1', async () => {
  const error = {
    code: 403,
    message: 'Denied.',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
        domain: 'example.invalid',
      },
    ],
  };
  const { fetch } = fakeFetch(() => Response.json({ error }, { status: 403 }));
  const r = await fx(['indexing', 'urlNotifications', 'getMetadata'], { fetch });
  assert.equal(r.code, 1);
  assert.equal(r.stderr, `gapi: Denied.\n${JSON.stringify(error, null, 2)}\n`);
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

test('send: a 2xx body that is not JSON exits 1 with the body', async () => {
  const { fetch } = fakeFetch(() => new Response('<html>oops</html>'));
  const r = await fx(['ga4-admin', 'properties', 'list'], { fetch });
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'gapi: HTTP 200: the response body is not JSON\n"<html>oops</html>"\n');
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
    url: 'https://mini.googleapis.com/download/v1/files/a:download?alt=media',
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
  assert.equal(s.code, 1);
  assert.equal(s.stderr, 'gapi: resumable upload: 308 at byte 0 of 5, no progress\n');
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
  assert.equal(calls[0].url, 'https://mini.googleapis.com/download/v1/files/a:download?alt=media');

  const empty = fakeFetch(() => new Response(null));
  assert.equal((await fx(download, { fetch: empty.fetch })).code, 0);
  assert.equal(readFileSync(out).length, 0);

  const gone = join(dir, 'not-found.bin');
  const missing = fakeFetch(() => Response.json({ error: { message: 'nope' } }, { status: 404 }));
  const e = await fx([...download.slice(0, -1), gone], { fetch: missing.fetch });
  assert.equal(e.code, 1);
  assert.equal(existsSync(gone), false);
});

const publish = (url: string, type: string) => ({
  method: 'POST',
  url: 'https://indexing.googleapis.com/v3/urlNotifications:publish',
  headers: { 'Content-Type': 'application/json' },
  body: { url, type },
});

test('indexing +publishBatch --dry-run prints every part', async () => {
  assert.deepEqual(await dryRun(['indexing', '+publishBatch', URLS], true), {
    method: 'POST',
    url: 'https://indexing.googleapis.com/batch',
    headers: { Authorization: 'Bearer <redacted>' },
    parts: [publish('https://a.com/1', 'URL_UPDATED'), publish('https://a.com/2', 'URL_DELETED')],
  });
});

test('send: +publishBatch sends at most 100 parts per call, results in input order', async () => {
  const many = join(dir, 'many.txt');
  const urls = Array.from({ length: 101 }, (_, i) => `https://a.com/${i}`);
  writeFileSync(many, urls.map((u) => `URL_UPDATED ${u}\n`).join(''));
  const ids = async (body: RequestInit['body']) =>
    [...(await new Response(body).text()).matchAll(/^Content-ID: <(\d+)>\r$/gm)].map((m) =>
      Number(m[1]),
    );
  const answer = async (_url: string, init?: RequestInit) =>
    batchAnswer((await ids(init?.body)).map((id) => [id, 200, { part: id }]));
  const { fetch, calls } = fakeFetch(answer);
  const r = await sh(['indexing', '+publishBatch', many], { fetch });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(
    calls.map((c) => c.url),
    ['https://indexing.googleapis.com/batch', 'https://indexing.googleapis.com/batch'],
  );
  assert.deepEqual(
    await Promise.all(calls.map(async (c) => (await ids(c.init?.body)).length)),
    [100, 1],
  );
  const results = urls.map((url, i) => ({
    url,
    type: 'URL_UPDATED',
    status: 200,
    body: { part: (i % 100) + 1 },
  }));
  assert.equal(r.stdout, `${JSON.stringify(results, null, 2)}\n`);

  // A failed second call still prints the 100 parts Google took in the first.
  const error = { code: 503, message: 'The service is currently unavailable.' };
  const second = fakeFetch((url, init) =>
    second.calls.length === 1 ? answer(url, init) : Response.json({ error }, { status: 503 }),
  );
  const p = await sh(['indexing', '+publishBatch', many], { fetch: second.fetch });
  assert.equal(p.code, 1);
  assert.equal(p.stderr, `gapi: ${error.message}\n${JSON.stringify(error, null, 2)}\n`);
  assert.equal(p.stdout, `${JSON.stringify(results.slice(0, 100), null, 2)}\n`);
});

test('send: +publishBatch prints every part result and exits 1 when one part fails', async () => {
  const error = { error: { code: 400, message: 'bad url', status: 'INVALID_ARGUMENT' } };
  // Google may answer the parts in any order; Content-ID maps them back.
  const { fetch, calls } = fakeFetch(() =>
    batchAnswer([
      [2, 400, error],
      [1, 200, { urlNotificationMetadata: {} }],
    ]),
  );
  const r = await sh(['indexing', '+publishBatch', URLS], { fetch });
  assert.equal(r.code, 1);
  assert.equal(r.stderr, 'gapi: 1 of 2 batch parts failed\n');
  const results = [
    {
      url: 'https://a.com/1',
      type: 'URL_UPDATED',
      status: 200,
      body: { urlNotificationMetadata: {} },
    },
    { url: 'https://a.com/2', type: 'URL_DELETED', status: 400, body: error },
  ];
  assert.equal(r.stdout, `${JSON.stringify(results, null, 2)}\n`);

  assert.equal(calls.length, 1);
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer TOK');
  const boundary = /^multipart\/mixed; boundary=(.+)$/.exec(headers['Content-Type'])?.[1];
  assert.ok(boundary, headers['Content-Type']);
  const part = (id: number, body: object) =>
    `--${boundary}\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n` +
    `Content-ID: <${id}>\r\n\r\nPOST /v3/urlNotifications:publish\r\n` +
    `Content-Type: application/json\r\n\r\n${JSON.stringify(body)}\r\n`;
  assert.equal(
    await new Response(calls[0].init?.body).text(),
    part(1, { url: 'https://a.com/1', type: 'URL_UPDATED' }) +
      part(2, { url: 'https://a.com/2', type: 'URL_DELETED' }) +
      `--${boundary}--`,
  );
});

test('send: a batch or resumable reply gapi cannot read exits 1 with the body', async () => {
  const upload = ['mini', 'files', 'upload', '--upload', TXT, '--upload-protocol', 'resumable'];
  const rows: [typeof sh, string[], Response, string][] = [
    [
      sh,
      ['indexing', '+publishBatch', URLS],
      new Response('<html>oops</html>', { headers: { 'Content-Type': 'text/html' } }),
      'gapi: batch: the response has no multipart boundary\n"<html>oops</html>"\n',
    ],
    [
      sh,
      ['indexing', '+publishBatch', URLS],
      new Response('--batch_x\r\nContent-Type: application/http\r\n\r\nno status\r\n--batch_x--', {
        headers: { 'Content-Type': 'multipart/mixed; boundary=batch_x' },
      }),
      'gapi: batch: malformed response part\n' +
        '"--batch_x\\r\\nContent-Type: application/http\\r\\n\\r\\nno status\\r\\n--batch_x--"\n',
    ],
    [
      fx,
      upload,
      Response.json({ kind: 'session' }),
      'gapi: resumable upload: the session response has no Location header\n' +
        `${JSON.stringify({ kind: 'session' }, null, 2)}\n`,
    ],
  ];
  for (const [gapiRun, argv, reply, stderr] of rows) {
    const { fetch, calls } = fakeFetch(() => reply);
    const r = await gapiRun(argv, { fetch });
    assert.deepEqual([r.code, r.stderr, r.stdout, calls.length], [1, stderr, '', 1]);
  }
});
