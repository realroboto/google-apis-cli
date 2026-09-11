import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execute, resolvePath } from '../src/rest.ts';
import type { FetchLike, FetchResponse, ResolvedRow } from '../src/types.ts';
import { RestError } from '../src/types.ts';

const token = async () => 'TOK';

type FakeResponse = { ok?: boolean; status?: number; body?: unknown };
// The executor always sends headers as a plain object; record that shape so
// tests can read init.headers.Authorization etc. without HeadersInit unions.
type RecordedInit = { method?: string; headers: Record<string, string>; body?: string };
type FakeFetch = FetchLike & { calls: { url: string; init: RecordedInit }[] };

// Build a fake fetch that records calls and replays queued responses.
function fakeFetch(responses: FakeResponse[]): FakeFetch {
  const calls: { url: string; init: RecordedInit }[] = [];
  const queue = [...responses];
  return Object.assign(
    async (url: string, init?: RequestInit): Promise<FetchResponse> => {
      calls.push({ url, init: init as unknown as RecordedInit });
      const r = queue.shift() as FakeResponse;
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)),
      };
    },
    { calls },
  );
}

test('resolvePath fills placeholders and encodes', () => {
  const { path, used } = resolvePath('/v3/sites/{siteUrl}', { siteUrl: 'https://a.com/' });
  assert.equal(path, '/v3/sites/https%3A%2F%2Fa.com%2F');
  assert.ok(used.has('siteUrl'));
});

test('resolvePath throws on missing param', () => {
  assert.throws(() => resolvePath('/x/{id}', {}), /missing path param: id/);
});

test('builds URL, Bearer header, and returns payload', async () => {
  const row = { httpMethod: 'GET', baseUrl: 'https://h', pathTemplate: '/v/sites' };
  const fetch = fakeFetch([{ body: { siteEntry: [1] } }]);
  const { json } = await execute(
    row as unknown as ResolvedRow,
    {},
    { tokenProvider: token, fetch },
  );
  assert.equal(fetch.calls[0].url, 'https://h/v/sites');
  assert.equal(fetch.calls[0].init.headers.Authorization, 'Bearer TOK');
  assert.deepEqual(json, { siteEntry: [1] });
});

test('GET leftover params become query string; reserved excluded', async () => {
  const row = { httpMethod: 'GET', baseUrl: 'https://h', pathTemplate: '/v/x' };
  const fetch = fakeFetch([{ body: {} }]);
  await execute(
    row as unknown as ResolvedRow,
    { rowLimit: 5, json: true, limit: 9 },
    { tokenProvider: token, fetch },
  );
  const u = new URL(fetch.calls[0].url);
  assert.equal(u.searchParams.get('rowLimit'), '5');
  assert.equal(u.searchParams.get('json'), null);
  assert.equal(u.searchParams.get('limit'), null);
});

test('non-GET leftover params become query too; body excluded (PATCH updateMask)', async () => {
  const row = { httpMethod: 'PATCH', baseUrl: 'https://h', pathTemplate: '/v/x' };
  const fetch = fakeFetch([{ body: {} }]);
  await execute(
    row as unknown as ResolvedRow,
    { updateMask: 'displayName', body: { displayName: 'n' } },
    { tokenProvider: token, fetch },
  );
  const u = new URL(fetch.calls[0].url);
  assert.equal(u.searchParams.get('updateMask'), 'displayName');
  assert.equal(u.searchParams.get('body'), null);
  assert.equal(fetch.calls[0].init.body, JSON.stringify({ displayName: 'n' }));
});

test('x-goog-user-project header set from quotaProject', async () => {
  const row = { httpMethod: 'GET', baseUrl: 'https://h', pathTemplate: '/v/x' };
  const fetch = fakeFetch([{ body: {} }]);
  await execute(
    row as unknown as ResolvedRow,
    {},
    { tokenProvider: token, fetch, quotaProject: 'proj-1' },
  );
  assert.equal(fetch.calls[0].init.headers['x-goog-user-project'], 'proj-1');
});

test('requiredHeaders: throws when missing, passes when supplied', async () => {
  const row = {
    httpMethod: 'GET',
    baseUrl: 'https://h',
    pathTemplate: '/v/x',
    requiredHeaders: ['x-required-header'],
  };
  const fetch = fakeFetch([{ body: {} }]);
  await assert.rejects(
    execute(row as unknown as ResolvedRow, {}, { tokenProvider: token, fetch }),
    /missing required header: x-required-header/,
  );
  const f2 = fakeFetch([{ body: {} }]);
  await execute(
    row as unknown as ResolvedRow,
    {},
    { tokenProvider: token, fetch: f2, extraHeaders: { 'x-required-header': 'V' } },
  );
  assert.equal(f2.calls[0].init.headers['x-required-header'], 'V');
});

test('POST sends JSON body and Content-Type', async () => {
  const row = { httpMethod: 'POST', baseUrl: 'https://h', pathTemplate: '/v/x:run' };
  const fetch = fakeFetch([{ body: { ok: 1 } }]);
  await execute(row as unknown as ResolvedRow, { body: { a: 1 } }, { tokenProvider: token, fetch });
  assert.equal(fetch.calls[0].init.method, 'POST');
  assert.equal(fetch.calls[0].init.body, JSON.stringify({ a: 1 }));
  assert.equal(fetch.calls[0].init.headers['Content-Type'], 'application/json');
});

test('follows nextPageToken and merges listKey', async () => {
  const row = { httpMethod: 'GET', baseUrl: 'https://h', pathTemplate: '/v/x', listKey: 'items' };
  const fetch = fakeFetch([
    { body: { items: [1, 2], nextPageToken: 'p2' } },
    { body: { items: [3] } },
  ]);
  const { json } = await execute(
    row as unknown as ResolvedRow,
    {},
    { tokenProvider: token, fetch },
  );
  assert.deepEqual(json, { items: [1, 2, 3] });
  assert.equal(new URL(fetch.calls[1].url).searchParams.get('pageToken'), 'p2');
});

test('limit stops paging and slices', async () => {
  const row = { httpMethod: 'GET', baseUrl: 'https://h', pathTemplate: '/v/x', listKey: 'items' };
  const fetch = fakeFetch([{ body: { items: [1, 2, 3], nextPageToken: 'p2' } }]);
  const { json } = await execute(
    row as unknown as ResolvedRow,
    { limit: 2 },
    { tokenProvider: token, fetch },
  );
  assert.deepEqual(json, { items: [1, 2] });
  assert.equal(fetch.calls.length, 1);
});

test('decoder applied to payload', async () => {
  const row = {
    httpMethod: 'GET',
    baseUrl: 'https://h',
    pathTemplate: '/v/x',
    decoder: (d: { n: number }) => d.n * 2,
  };
  const fetch = fakeFetch([{ body: { n: 21 } }]);
  const { json, raw } = await execute(
    row as unknown as ResolvedRow,
    {},
    { tokenProvider: token, fetch },
  );
  assert.equal(json, 42);
  assert.deepEqual(raw, { n: 21 });
});

test('non-ok throws with status and REST error body', async () => {
  const row = { httpMethod: 'GET', baseUrl: 'https://h', pathTemplate: '/v/x' };
  const fetch = fakeFetch([{ ok: false, status: 403, body: { error: { message: 'denied' } } }]);
  await assert.rejects(
    execute(row as unknown as ResolvedRow, {}, { tokenProvider: token, fetch }),
    (e: unknown) => {
      assert.ok(e instanceof RestError);
      assert.equal(e.status, 403);
      assert.equal(e.message, 'denied');
      return true;
    },
  );
});
