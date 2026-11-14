import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, type TestContext, test } from 'node:test';
import { fakeFetch } from './helpers/fetch.ts';
import { gapi } from './helpers/io.ts';

// `gapi entities` over the shipped entity sources (#200 D6).
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

// Every shipped source, keyed by request host + path. One brand (acme.com) across APIs.
const ROUTES: Record<string, unknown> = {
  'tagmanager.googleapis.com/tagmanager/v2/accounts': {
    account: [{ path: 'accounts/7', name: 'Acme GTM' }],
  },
  'tagmanager.googleapis.com/tagmanager/v2/accounts/7/containers': {
    container: [
      {
        path: 'accounts/7/containers/8',
        name: 'Acme web',
        publicId: 'GTM-ABC123',
        domainName: ['acme.com', 'www.acme.com', 'shop.acme.com'],
      },
    ],
  },
  'googleads.googleapis.com/v26/customers:listAccessibleCustomers': {
    resourceNames: ['customers/1112223333', 'customers/4445556666'],
  },
  'googleads.googleapis.com/v26/customers/1112223333/googleAds:search': {
    results: [
      { customerClient: { id: '1112223333', descriptiveName: 'Acme MCC', level: '0' } },
      { customerClient: { id: '4445556666', descriptiveName: 'Acme Ads', level: '1' } },
    ],
  },
  'googleads.googleapis.com/v26/customers/4445556666/googleAds:search': {
    results: [{ customerClient: { id: '4445556666', descriptiveName: 'Acme Ads', level: '0' } }],
  },
  'merchantapi.googleapis.com/accounts/v1/accounts': {
    accounts: [
      { name: 'accounts/555', accountName: 'Acme Store', homePageUri: 'https://acme.com/shop' },
    ],
  },
  'youtube.googleapis.com/youtube/v3/channels': {
    items: [{ id: 'UCacme', snippet: { title: 'Acme TV', customUrl: '@acmetv' } }],
  },
  'mybusinessaccountmanagement.googleapis.com/v1/accounts': {
    accounts: [{ name: 'accounts/900', accountName: 'Acme Locations' }],
  },
  'mybusinessbusinessinformation.googleapis.com/v1/accounts/900/locations': {
    locations: [
      { name: 'locations/42', title: 'Acme Berlin', websiteUri: 'http://WWW.acme.com/berlin' },
    ],
  },
  'bigquery.googleapis.com/bigquery/v2/projects': {
    projects: [{ projectReference: { projectId: 'acme-data' }, friendlyName: 'Acme Data' }],
  },
  'bigquery.googleapis.com/bigquery/v2/projects/acme-data/datasets': {
    datasets: [
      { datasetReference: { projectId: 'acme-data', datasetId: 'analytics_123456' } },
      { datasetReference: { projectId: 'acme-data', datasetId: 'crm' } },
    ],
  },
};

type Replies = { summaries?: unknown; streams?: unknown; sites?: unknown; gscStatus?: number };
const google = ({
  summaries = SUMMARIES,
  streams = STREAMS,
  sites = SITES,
  gscStatus = 200,
}: Replies = {}) =>
  fakeFetch((url) => {
    const { host, pathname } = new URL(url);
    const key = `${host}${pathname}`;
    if (key === 'analyticsadmin.googleapis.com/v1beta/accountSummaries') {
      return Response.json(summaries);
    }
    if (key === 'analyticsadmin.googleapis.com/v1beta/properties/123456/dataStreams') {
      return Response.json(streams);
    }
    if (key === 'searchconsole.googleapis.com/webmasters/v3/sites') {
      return gscStatus === 200
        ? Response.json(sites)
        : Response.json(
            { error: { code: gscStatus, message: 'Search Console API disabled' } },
            { status: gscStatus },
          );
    }
    if (Object.hasOwn(ROUTES, key)) return Response.json(ROUTES[key]);
    return new Response('not found', { status: 404 });
  });

const SYNCED =
  'ads: 2 entities\nbigquery: 3 entities\nbusiness-information: 2 entities\n' +
  'ga4-admin: 3 entities\ngsc: 2 entities\ngtm: 2 entities\nmerchant-accounts: 1 entities\n' +
  'youtube: 1 entities\n';

const date = new Date().toISOString().slice(0, 10);
const line = (...cells: string[]) => `${[...cells, date].join('\t')}\n`;

test('entities sync stores every source; find matches part of an ID and a domain across APIs', async (t) => {
  const { dir, run } = setup(t);
  const { fetch, calls } = google();
  const sync = await run(['entities', 'sync'], { fetch });
  assert.equal(sync.code, 0, sync.stderr);
  assert.equal(
    sync.stderr,
    'gapi: entities sync: 8 list calls, then 1 per ads customer, then 1 per bigquery project, ' +
      'then 1 per business-information account, then 1 per ga4-admin property, ' +
      'then 1 per gtm account; max 10 pages per list\n',
  );
  assert.equal(sync.stdout, SYNCED);
  assert.equal(calls.length, 14);
  // Ads: one customer_client query per accessible customer, sent as that customer.
  const ads = calls.filter((c) => c.url.includes('googleAds:search'));
  assert.deepEqual(
    ads.map((c) => new Headers(c.init?.headers).get('login-customer-id')),
    ['1112223333', '4445556666'],
  );
  assert.match(String(ads[0].init?.body), /FROM customer_client WHERE customer_client\.level <= 1/);
  const locations = calls.find((c) => c.url.includes('/locations'));
  assert.equal(new URL(locations?.url ?? '').searchParams.get('readMask'), 'name,title,websiteUri');
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.equal(statSync(join(dir, 'entities.db')).mode & 0o777, 0o600);

  const id = await run(['entities', 'find', '3456']);
  assert.equal(id.code, 0, id.stderr);
  assert.equal(id.stderr, '');
  assert.equal(
    id.stdout,
    // bm25: the dataset and the stream hold the term twice (ID and parent), so they rank first.
    // The GA4 export dataset names its property as parent.
    line('bigquery', 'dataset', 'acme-data.analytics_123456', '', 'properties/123456', '') +
      line(
        'ga4-admin',
        'stream',
        'properties/123456/dataStreams/9',
        'Acme site',
        'properties/123456',
        'acme.com',
      ) +
      line('ga4-admin', 'property', 'properties/123456', 'Acme Web', 'accounts/100', ''),
  );
  // One host links the GA4 web stream, the GSC site, the Merchant homepage, the GTM container
  // and the Business Profile website.
  const domain = await run(['entities', 'find', 'acme.com']);
  assert.deepEqual(
    domain.stdout
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t').slice(0, 3).join(' '))
      .toSorted(),
    [
      'business-information location locations/42',
      'ga4-admin stream properties/123456/dataStreams/9',
      'gsc site sc-domain:acme.com',
      'gtm container accounts/7/containers/8',
      'merchant-accounts account accounts/555',
    ],
  );
  assert.match(domain.stdout, /\tAcme web GTM-ABC123\taccounts\/7\tacme\.com shop\.acme\.com\t/);
  // Ads: one row per customer; a client names its manager.
  assert.equal(
    (await run(['entities', 'find', 'acme', '--api', 'ads'])).stdout
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t').slice(0, 5).join(' '))
      .toSorted()
      .join('\n'),
    'ads customer 1112223333 Acme MCC \nads customer 4445556666 Acme Ads 1112223333',
  );
  // The GA4 export dataset links to its property; other datasets to their project.
  const bq = await run(['entities', 'find', 'acme-data', '--api', 'bigquery']);
  assert.match(
    bq.stdout,
    /^bigquery\tdataset\tacme-data\.analytics_123456\t\tproperties\/123456\t/m,
  );
  assert.match(bq.stdout, /^bigquery\tdataset\tacme-data\.crm\t\tacme-data\t/m);
  assert.match(
    (await run(['entities', 'find', '@acmetv'])).stdout,
    /^youtube\tchannel\tUCacme\tAcme TV @acmetv\t/,
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
    SYNCED.replace('ga4-admin: 3', 'ga4-admin: 1').replace(
      'gsc: 2 entities',
      'gsc: failed, old rows kept: Search Console API disabled',
    ),
  );
  assert.match(r.stderr, /\ngapi: 1 of 8 entity sources failed\n$/);
  // ga4-admin replaced: the vanished property and stream are gone; gsc rows stay.
  assert.equal(
    (await run(['entities', 'find', '3456', '--api', 'ga4-admin'])).stderr,
    'gapi: no match\n',
  );
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
    [['entities', 'sync', '--api', 'gsc'], 'gapi: --api: not an option of sync\n'],
    [
      ['entities', 'find', 'acme', '--page-limit', '1'],
      'gapi: --page-limit: not an option of find\n',
    ],
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

test('entities --help prints the usage and runs nothing', async (t) => {
  const { run } = setup(t);
  for (const argv of [
    ['entities', '--help'],
    ['entities', 'sync', '--help'],
    ['entities', 'find', '--help'],
  ]) {
    const r = await run(argv);
    assert.deepEqual(r, {
      code: 0,
      stdout: 'gapi entities sync [<api>…] [--page-limit <n>] | find <words…> [--api <api>]\n',
      stderr: '',
    });
  }
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
  // A database of another schema version, or no database at all, is dropped and rebuilt.
  for (const stale of ['future version', 'unversioned', 'not a database']) {
    assert.equal((await run(['entities', 'sync'], { fetch: google().fetch })).code, 0);
    if (stale !== 'not a database') {
      const db = new DatabaseSync(join(dir, 'entities.db'));
      db.exec(`pragma user_version = ${stale === 'future version' ? 99 : 0}`);
      db.close();
    } else writeFileSync(join(dir, 'entities.db'), stale);
    assert.equal((await run(['entities', 'find', 'acme'])).stderr, empty, stale);
  }
  assert.equal((await run(['entities', 'sync'], { fetch: google().fetch })).code, 0);
  assert.notEqual((await run(['entities', 'find', 'acme'])).stdout, '');
});
