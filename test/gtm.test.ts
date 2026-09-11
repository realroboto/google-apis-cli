import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRow, loadManifests } from '../src/manifest.ts';
import { execute } from '../src/rest.ts';
import type { FetchLike, FetchResponse, ResolvedRow } from '../src/types.ts';

// Coverage-oracle fixture: the full tagmanager v2 discovery surface MINUS the
// four methods flagged `deprecated: true` (containers.combine, .move_tag_id,
// destinations.get, destinations.link), as `${httpMethod} ${path}` with path
// params collapsed to `{}`. Frozen to discovery revision 20260909. Regenerate,
// excluding deprecated methods, with:
//   curl -s 'https://tagmanager.googleapis.com/$discovery/rest?version=v2' \
//   | jq -r 'def w: to_entries[]|.value as $r|(($r.methods//{})[]|select(.deprecated!=true)|"\(.httpMethod) /\(.flatPath//.path)"),(($r.resources//{})|w); .resources|w' \
//   | sed -E 's/\{[^}]+\}/{}/g' | sort
// The self-check below fails if the manifest drops a non-deprecated method or
// adds a deprecated/out-of-scope one.
const A = '/tagmanager/v2/accounts';
const C = `${A}/{}/containers/{}`;
const WS = `${C}/workspaces/{}`;

const crud = (base: string, name: string) => [
  `GET ${base}/${name}`,
  `GET ${base}/${name}/{}`,
  `POST ${base}/${name}`,
  `PUT ${base}/${name}/{}`,
  `DELETE ${base}/${name}/{}`,
];
const wsEntity = (name: string) => [...crud(WS, name), `POST ${WS}/${name}/{}:revert`];

const DISCOVERY = [
  // accounts + user_permissions
  `GET ${A}`,
  `GET ${A}/{}`,
  `PUT ${A}/{}`,
  ...crud(`${A}/{}`, 'user_permissions'),
  // containers
  `GET ${A}/{}/containers`,
  `GET ${C}`,
  `POST ${A}/{}/containers`,
  `PUT ${C}`,
  `DELETE ${C}`,
  `GET ${A}/containers:lookup`,
  `GET ${C}:snippet`,
  // destinations (get + link deprecated)
  `GET ${C}/destinations`,
  // environments
  ...crud(C, 'environments'),
  `POST ${C}/environments/{}:reauthorize`,
  // versions (no list/create)
  `GET ${C}/versions/{}`,
  `GET ${C}/versions:live`,
  `PUT ${C}/versions/{}`,
  `DELETE ${C}/versions/{}`,
  `POST ${C}/versions/{}:publish`,
  `POST ${C}/versions/{}:set_latest`,
  `POST ${C}/versions/{}:undelete`,
  // version_headers
  `GET ${C}/version_headers`,
  `GET ${C}/version_headers:latest`,
  // workspaces
  `GET ${C}/workspaces`,
  `GET ${WS}`,
  `POST ${C}/workspaces`,
  `PUT ${WS}`,
  `DELETE ${WS}`,
  `GET ${WS}/status`,
  `POST ${WS}:create_version`,
  `POST ${WS}/bulk_update`,
  `POST ${WS}:quick_preview`,
  `POST ${WS}:resolve_conflict`,
  `POST ${WS}:sync`,
  // built_in_variables (no get/update; collection-keyed)
  `GET ${WS}/built_in_variables`,
  `POST ${WS}/built_in_variables`,
  `DELETE ${WS}/built_in_variables`,
  `POST ${WS}/built_in_variables:revert`,
  // folders (crud + revert + entities + move)
  ...crud(WS, 'folders'),
  `POST ${WS}/folders/{}:revert`,
  `POST ${WS}/folders/{}:entities`,
  `POST ${WS}/folders/{}:move_entities_to_folder`,
  // workspace entities
  ...wsEntity('tags'),
  ...wsEntity('triggers'),
  ...wsEntity('variables'),
  ...wsEntity('clients'),
  ...wsEntity('transformations'),
  ...wsEntity('zones'),
  ...wsEntity('templates'),
  `POST ${WS}/templates:import_from_gallery`,
  // gtag_config (no revert)
  ...crud(WS, 'gtag_config'),
];

const norm = (p: string) => p.replace(/\{\w+\}/g, '{}');

test('coverage-oracle: gtm manifest covers the full v2 surface minus deprecated', async () => {
  const m = (await loadManifests()).gtm;
  assert.ok(m, 'gtm manifest discovered');
  const manifest = new Set<string>();
  for (const verbs of Object.values(m.resources)) {
    for (const row of Object.values(verbs)) {
      manifest.add(`${row.httpMethod} ${norm(row.pathTemplate)}`);
    }
  }
  const discovery = new Set(DISCOVERY);
  assert.equal(DISCOVERY.length, 102, 'expected 102 non-deprecated v2 methods');
  const missing = [...discovery].filter((x) => !manifest.has(x));
  const extra = [...manifest].filter((x) => !discovery.has(x));
  assert.deepEqual(missing, [], 'discovery methods missing from manifest');
  assert.deepEqual(extra, [], 'manifest methods outside the non-deprecated surface');
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

// --- T4b demos ---

test('versions publish: POST to :publish action path (go-live demo)', async () => {
  const fetch = fakeFetch([{ containerVersion: { published: true } }]);
  const r = await execute(
    await row('versions', 'publish'),
    { account: '1', container: '9', version: '3' },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'POST');
  assert.equal(
    new URL(c.url).pathname,
    '/tagmanager/v2/accounts/1/containers/9/versions/3:publish',
  );
  assert.deepEqual(r.json, { containerVersion: { published: true } });
});

test('version-headers list: GET pages under containerVersionHeader listKey', async () => {
  const fetch = fakeFetch([
    { containerVersionHeader: [{ containerVersionId: '1' }], nextPageToken: 'n' },
    { containerVersionHeader: [{ containerVersionId: '2' }] },
  ]);
  const { json } = await execute(
    await row('version-headers', 'list'),
    { account: '1', container: '9' },
    { tokenProvider: token, fetch },
  );
  assert.deepEqual(json, {
    containerVersionHeader: [{ containerVersionId: '1' }, { containerVersionId: '2' }],
  });
  assert.equal(
    new URL(fetch.calls[0].url).pathname,
    '/tagmanager/v2/accounts/1/containers/9/version_headers',
  );
});

test('user-permissions create: POST under manage.users scope', async () => {
  const fetch = fakeFetch([{ path: 'accounts/1/user_permissions/8' }]);
  const r = await row('user-permissions', 'create');
  assert.deepEqual(r.scopes, ['tagmanager.manage.users']);
  await execute(
    r,
    { account: '1', body: { emailAddress: 'x@y.z' } },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  assert.equal(c.init.method, 'POST');
  assert.equal(new URL(c.url).pathname, '/tagmanager/v2/accounts/1/user_permissions');
});

test('accounts update: PUT under manage.accounts scope', async () => {
  const r = await row('accounts', 'update');
  assert.deepEqual(r.scopes, ['tagmanager.manage.accounts']);
  const fetch = fakeFetch([{ accountId: '1', name: 'renamed' }]);
  await execute(r, { account: '1', body: { name: 'renamed' } }, { tokenProvider: token, fetch });
  assert.equal(fetch.calls[0].init.method, 'PUT');
  assert.equal(new URL(fetch.calls[0].url).pathname, '/tagmanager/v2/accounts/1');
});

test('built-in-variables delete: DELETE collection path keyed by ?type', async () => {
  const fetch = fakeFetch([{}]);
  await execute(
    await row('built-in-variables', 'delete'),
    { account: '1', container: '9', workspace: '7', type: 'pageUrl' },
    { tokenProvider: token, fetch },
  );
  const c = fetch.calls[0];
  const u = new URL(c.url);
  assert.equal(c.init.method, 'DELETE');
  assert.equal(
    u.pathname,
    '/tagmanager/v2/accounts/1/containers/9/workspaces/7/built_in_variables',
  );
  assert.equal(u.searchParams.get('type'), 'pageUrl');
});
