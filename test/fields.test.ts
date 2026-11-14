import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fakeFetch } from './helpers/fetch.ts';
import { gapi } from './helpers/io.ts';

// #200 D7 `gapi fields` over the shipped ads, sa360 and ga4-data entries; the cache holds
// pruned documents, so only the GA4 call reaches (fake) fetch.
const dir = mkdtempSync(join(tmpdir(), 'gapi-fields-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const env = { GAPI_CONFIG_DIR: dir };
mkdirSync(join(dir, 'cache'));
writeFileSync(
  join(dir, 'config.json'),
  JSON.stringify({ oauth_client_id: 'cid', oauth_client_secret: 's' }),
);
writeFileSync(
  join(dir, 'credentials.json'),
  JSON.stringify({ access_token: 'TOK', refresh_token: 'RT', expiry_date: Date.now() + 3600e3 }),
);

// The GAQL schemas: a resource with a nested message (expanded), an array of messages and a
// message of resources (both one field), a cycle, plus metrics and segments.
const gaqlDoc = (name: string, p: string) => ({
  kind: 'discovery#restDescription',
  name,
  version: 'v0',
  rootUrl: `https://${name}.googleapis.com/`,
  servicePath: '',
  resources: {},
  schemas: {
    [`${p}Resources__AdGroupAd`]: {
      properties: {
        resourceName: { type: 'string', description: 'Immutable. The resource name of the ad.' },
        policySummary: { $ref: `${p}Resources_AdGroupAd_PolicySummary` },
        labels: { type: 'array', items: { $ref: `${p}Resources_AdGroupAd_PolicySummary` } },
      },
    },
    [`${p}Resources_AdGroupAd_PolicySummary`]: {
      properties: {
        approvalStatus: { type: 'string', description: 'Output only. The approval status.' },
        parent: { $ref: `${p}Resources_AdGroupAd_PolicySummary` },
      },
    },
    [`${p}Resources__ChangeEvent`]: {
      properties: { oldResource: { $ref: `${p}Resources_ChangeEvent_ChangedResource` } },
    },
    [`${p}Resources_ChangeEvent_ChangedResource`]: {
      properties: { adGroupAd: { $ref: `${p}Resources__AdGroupAd` } },
    },
    [`${p}Common__Metrics`]: {
      properties: {
        videoQuartileP25Rate: { type: 'number', description: 'Percentage of 25% views.' },
        costPerConversion: {
          type: 'number',
          description: 'The cost of ad interactions divided by conversions. More text.',
        },
      },
    },
    [`${p}Common__Segments`]: {
      properties: {
        date: { type: 'string', description: 'Date to which metrics apply.' },
        dateRange: { type: 'string', description: 'Date range: date to date.' },
      },
    },
  },
});
writeFileSync(
  join(dir, 'cache', 'ads.json'),
  JSON.stringify(gaqlDoc('googleads', 'GoogleAdsGoogleadsV26')),
);
writeFileSync(
  join(dir, 'cache', 'sa360.json'),
  JSON.stringify(gaqlDoc('searchads360', 'GoogleAdsSearchads360V0')),
);
const ga4 = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'skill', 'ga4-data.json'), 'utf8'),
);
ga4.resources.properties.methods.getMetadata = {
  id: 'analyticsdata.properties.getMetadata',
  path: 'v1beta/{+name}',
  httpMethod: 'GET',
  parameters: {
    name: {
      type: 'string',
      location: 'path',
      required: true,
      pattern: '^properties/[^/]+/metadata$',
    },
  },
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
};
writeFileSync(join(dir, 'cache', 'ga4-data.json'), JSON.stringify(ga4));

const run = (argv: string[], io = {}) => gapi(argv, { env, ...io });

test('fields ads and sa360: snake_case GAQL names with their prefix, ranked, no request', async () => {
  const { fetch, calls } = fakeFetch(() => Response.json({}));
  const run = (argv: string[]) => gapi(argv, { env, fetch });
  for (const api of ['ads', 'sa360']) {
    const all = await run(['fields', api, 'ad', 'group', 'cost', 'date', 'video', 'old']);
    assert.equal(all.code, 0, all.stderr);
    assert.deepEqual(all.stdout.split('\n').toSorted(), [
      '',
      'ad_group_ad.labels  attribute',
      'ad_group_ad.policy_summary.approval_status  attribute  The approval status.',
      'ad_group_ad.policy_summary.parent  attribute',
      'ad_group_ad.resource_name  attribute  The resource name of the ad.',
      'change_event.old_resource  attribute',
      'metrics.cost_per_conversion  metric  The cost of ad interactions divided by conversions.',
      'metrics.video_quartile_p25_rate  metric  Percentage of 25% views.',
      'segments.date  segment  Date to which metrics apply.',
      'segments.date_range  segment  Date range: date to date.',
    ]);
    const cost = await run(['fields', api, 'cost', 'per', 'conversion']);
    assert.equal(cost.stdout.split('\n')[0].split(' ')[0], 'metrics.cost_per_conversion');
    const desc = await run(['fields', api, 'interactions']); // description words rank too
    assert.match(desc.stdout, /^metrics\.cost_per_conversion /);
    const exact = await run(['fields', api, 'date']); // an exact last name part comes first
    assert.match(exact.stdout, /^segments\.date /);
  }
  const none = await run(['fields', 'ads', 'nothing']);
  assert.deepEqual([none.code, none.stdout, none.stderr], [0, '', 'gapi: no match\n']);
  assert.equal(calls.length, 0);
});

test('fields ga4-data: one getMetadata request; custom and deprecated names rank', async () => {
  const metadata = {
    name: 'properties/123/metadata',
    dimensions: [
      {
        apiName: 'sessionDefaultChannelGroup',
        uiName: 'Session default channel group',
        description: "The session's default channel group. More.",
        deprecatedApiNames: ['sessionChannelGrouping'],
      },
      { apiName: 'customEvent:plan_tier', uiName: 'Plan tier', customDefinition: true },
    ],
    metrics: [{ apiName: 'sessions', uiName: 'Sessions', description: 'Number of sessions.' }],
  };
  const { fetch, calls } = fakeFetch(() => Response.json(metadata));
  const r = await run(['fields', 'ga4-data', 'channel', 'tier', 'sessions', '--property', '123'], {
    fetch,
  });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.stdout.split('\n').toSorted(), [
    '',
    'customEvent:plan_tier  dimension',
    "sessionDefaultChannelGroup  dimension  The session's default channel group.",
    'sessions  metric  Number of sessions.',
  ]);
  assert.deepEqual(
    calls.map((c) => [c.init?.method, c.url]),
    [['GET', 'https://analyticsdata.googleapis.com/v1beta/properties/123/metadata']],
  );
  const old = await run(['fields', 'ga4-data', 'grouping', '--property', 'properties/123'], {
    fetch,
  });
  assert.equal(
    old.stdout,
    "sessionDefaultChannelGroup  dimension  The session's default channel group.\n",
  );
  assert.equal(
    calls.at(-1)?.url,
    'https://analyticsdata.googleapis.com/v1beta/properties/123/metadata',
  );
});

test('fields: usage errors exit 3 before any request; --help names googleAdsFields.search', async () => {
  const { fetch, calls } = fakeFetch(() => Response.json({}));
  const rows: [string[], string][] = [
    [
      ['fields', 'gsc', 'clicks'],
      'fields: gsc has no field source; supported: ads, ga4-data, sa360',
    ],
    [['fields', 'ads', 'clicks', '--cache', '1h'], '--cache: fields is not cacheable'],
    [['fields', 'ga4-data', 'clicks'], '--property is required'],
    [['fields', 'ads', 'clicks', '--property', '1'], '--property: not an option of fields ads'],
    [['fields', 'ga4-data', 'x', '--property', 'abc'], '--property: abc is not a GA4 property id'],
    [
      ['fields', 'ads', '***'],
      'usage: gapi fields ads|sa360 <words…> | ga4-data <words…> --property <id>',
    ],
    [['fields'], 'usage: gapi fields ads|sa360 <words…> | ga4-data <words…> --property <id>'],
  ];
  for (const [argv, message] of rows) {
    const r = await run(argv, { fetch });
    assert.deepEqual([r.code, r.stderr], [3, `gapi: ${message}\n`], argv.join(' '));
  }
  assert.equal(calls.length, 0);
  const help = await run(['fields', '--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /^gapi fields /);
  assert.match(help.stdout, /googleAdsFields\.search/);
});
