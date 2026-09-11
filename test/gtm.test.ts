import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRow, loadManifests } from '../src/manifest.ts';
import { execute } from '../src/rest.ts';
import type { FetchLike, FetchResponse, ResolvedRow } from '../src/types.ts';

// Coverage-oracle fixture: the T4a core-family subset of the tagmanager v2
// discovery doc, as `${httpMethod} ${path}` with path params collapsed to `{}`.
// Frozen to discovery revision 20260909. Regenerate the full list with:
//   curl -s 'https://tagmanager.googleapis.com/$discovery/rest?version=v2' \
//   | jq -r 'def w: to_entries[]|.value as $r|(($r.methods//{})[]|"\(.httpMethod) /\(.flatPath//.path)"),(($r.resources//{})|w); .resources|w' \
//   | sed -E 's/\{[^}]+\}/{}/g' | sort
// then keep the accounts/containers/workspaces get+list rows and the
// tags/triggers/variables/folders create+list+get+update+delete rows.
// yagni: T4a subset only — T4b adds the rest and extends this list.
const A = '/tagmanager/v2/accounts';
const WS = `${A}/{}/containers/{}/workspaces/{}`;
const entityRows = (name: string) => [
  `GET ${WS}/${name}`,
  `GET ${WS}/${name}/{}`,
  `POST ${WS}/${name}`,
  `PUT ${WS}/${name}/{}`,
  `DELETE ${WS}/${name}/{}`,
];
const DISCOVERY_T4A = [
  `GET ${A}`,
  `GET ${A}/{}`,
  `GET ${A}/{}/containers`,
  `GET ${A}/{}/containers/{}`,
  `GET ${A}/{}/containers/{}/workspaces`,
  `GET ${A}/{}/containers/{}/workspaces/{}`,
  ...entityRows('tags'),
  ...entityRows('triggers'),
  ...entityRows('variables'),
  ...entityRows('folders'),
];

const norm = (p: string) => p.replace(/\{\w+\}/g, '{}');

test('coverage-oracle: gtm manifest covers the T4a core families exactly', async () => {
  const m = (await loadManifests()).gtm;
  assert.ok(m, 'gtm manifest discovered');
  const manifest = new Set<string>();
  for (const verbs of Object.values(m.resources)) {
    for (const row of Object.values(verbs)) {
      manifest.add(`${row.httpMethod} ${norm(row.pathTemplate)}`);
    }
  }
  const discovery = new Set(DISCOVERY_T4A);
  const missing = [...discovery].filter((x) => !manifest.has(x));
  const extra = [...manifest].filter((x) => !discovery.has(x));
  assert.deepEqual(missing, [], 'T4a discovery methods missing from manifest');
  assert.deepEqual(extra, [], 'manifest methods outside the T4a subset');
});

// --- executor-seam demos (fake fetch; no real network) ---
const token = async () => 'TOK';
type Rec = {
  url: string;
  init: { method?: string; headers: Record<string, string>; body?: string };
};
function fakeFetch(bodies: unknown[]): FetchLike & { calls: Rec[] } {
  const calls: Rec[] = [];
  const queue = [...bodies];
  return Object.assign(
    async (url: string, init?: RequestInit): Promise<FetchResponse> => {
      calls.push({ url, init: init as unknown as Rec['init'] });
      const body = queue.shift();
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    },
    { calls },
  );
}
const row = async (resource: string, verb: string): Promise<ResolvedRow> => {
  const r = findRow(await loadManifests(), 'gtm', resource, verb);
  assert.ok(r, `${resource} ${verb} row`);
  return r;
};

test('accounts→containers→workspaces list: GET, merges listKey (navigation demo)', async () => {
  const acc = fakeFetch([
    { account: [{ accountId: '1' }], nextPageToken: 'p2' },
    { account: [{ accountId: '2' }] },
  ]);
  const r1 = await execute(await row('accounts', 'list'), {}, { tokenProvider: token, fetch: acc });
  assert.deepEqual(r1.json, { account: [{ accountId: '1' }, { accountId: '2' }] });
  assert.equal(new URL(acc.calls[0].url).pathname, '/tagmanager/v2/accounts');

  const ws = fakeFetch([{ workspace: [{ workspaceId: '7' }] }]);
  const r2 = await execute(
    await row('workspaces', 'list'),
    { account: '1', container: '9' },
    { tokenProvider: token, fetch: ws },
  );
  assert.deepEqual(r2.json, { workspace: [{ workspaceId: '7' }] });
  assert.equal(
    new URL(ws.calls[0].url).pathname,
    '/tagmanager/v2/accounts/1/containers/9/workspaces',
  );
});

test('tags create: POST with body to workspace path (write demo)', async () => {
  const fetch = fakeFetch([{ tagId: '5', name: 'ga4' }]);
  await execute(
    await row('tags', 'create'),
    { account: '1', container: '9', workspace: '7', body: { name: 'ga4' } },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'POST');
  assert.equal(new URL(c.url).pathname, '/tagmanager/v2/accounts/1/containers/9/workspaces/7/tags');
  assert.equal(c.init.body, JSON.stringify({ name: 'ga4' }));
});

test('triggers update: PUT to item path (write demo)', async () => {
  const fetch = fakeFetch([{ triggerId: '3' }]);
  await execute(
    await row('triggers', 'update'),
    { account: '1', container: '9', workspace: '7', trigger: '3', body: { name: 'click' } },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'PUT');
  assert.equal(
    new URL(c.url).pathname,
    '/tagmanager/v2/accounts/1/containers/9/workspaces/7/triggers/3',
  );
});

test('variables delete: DELETE to item path (write demo)', async () => {
  const fetch = fakeFetch([{}]);
  await execute(
    await row('variables', 'delete'),
    { account: '1', container: '9', workspace: '7', variable: '2' },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'DELETE');
  assert.equal(
    new URL(c.url).pathname,
    '/tagmanager/v2/accounts/1/containers/9/workspaces/7/variables/2',
  );
});

test('folders get: GET to item path (read demo)', async () => {
  const fetch = fakeFetch([{ folderId: '4' }]);
  const { json } = await execute(
    await row('folders', 'get'),
    { account: '1', container: '9', workspace: '7', folder: '4' },
    { tokenProvider: token, fetch },
  );
  assert.deepEqual(json, { folderId: '4' });
  assert.equal(
    new URL(fetch.calls[0].url).pathname,
    '/tagmanager/v2/accounts/1/containers/9/workspaces/7/folders/4',
  );
});
