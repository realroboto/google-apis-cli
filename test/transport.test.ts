// The D3 request iterator for consumers that read responses without printing (#200).
// `run` sets no signal yet, so this case calls `receive` directly. Follow rules and undefined
// decodes are covered at the `run` seam (`--page-all`, `bigquery +query`).
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
