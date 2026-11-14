// The D3 request iterator for consumers that read responses without printing (#200).
// `run` reaches it only through `--page-all`, so these cases call `receive` directly.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receive } from '../src/transport.ts';
import type { CallPlan } from '../src/types.ts';
import { fakeFetch } from './helpers/fetch.ts';

const base = {
  methodId: 'x.jobs.get',
  httpMethod: 'GET',
  url: 'https://x.invalid/jobs/1',
  headers: {},
  auth: { kind: 'apiKey', scopes: [] },
  retry: true,
  warnings: [],
} satisfies Partial<CallPlan>;
const authorize = async () => ({});

test('receive: a follow rule chains requests; an undefined decode yields nothing and is not counted', async () => {
  const bodies = [{ done: false }, { done: true, n: 1, next: 2 }, { done: true, n: 2, next: 3 }];
  const { fetch, calls } = fakeFetch(() => Response.json(bodies[calls.length - 1]));
  const plan: CallPlan = {
    ...base,
    send: 'pages',
    pageLimit: 2,
    decode: (d) => ((d as { done: boolean }).done ? (d as { n: number }).n : undefined),
    follow: (d, last) => ({
      ...last,
      url: `https://x.invalid/jobs/${(d as { next?: number }).next ?? 1}`,
    }),
  };
  const got = [];
  for await (const r of receive(plan, { fetch, authorize })) got.push(r);
  assert.deepEqual(got, [1, 2]);
  assert.deepEqual(
    calls.map((c) => c.url),
    ['https://x.invalid/jobs/1', 'https://x.invalid/jobs/1', 'https://x.invalid/jobs/2'],
  );
});

test('receive: a signal aborted during a request reaches fetch and is never retried', async () => {
  const deadline = new AbortController();
  const { signal } = deadline;
  const { fetch, calls } = fakeFetch((_, init) => {
    deadline.abort(new Error('deadline'));
    throw init?.signal?.reason;
  });
  const plan: CallPlan = { ...base, send: 'once' };
  const sleep = async () => assert.fail('retried after abort');
  await assert.rejects(receive(plan, { fetch, authorize, sleep, signal }).next(), /deadline/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.signal, signal);
});
