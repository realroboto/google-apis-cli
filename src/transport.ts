// Transport: sends a CallPlan and yields or prints its responses (epic #30 D13, #200 D3).
// `authorize` adds the credential before every request; a non-2xx exits 1, a missing scope 2.
import { setTimeout } from 'node:timers/promises';
import { GapiError, reasonOf } from './errors.ts';
import { isRecord, parseOrText } from './json.ts';
import { batch } from './transport/batch.ts';
import { download } from './transport/download.ts';
import {
  backoff,
  NetworkError,
  RETRIES,
  retryAfter,
  retryable,
  type Sleep,
} from './transport/retry.ts';
import { upload } from './transport/upload.ts';
import type { Authorize, CallPlan, FetchLike, FetchResponse, Step } from './types.ts';

type SendDeps = {
  fetch: FetchLike;
  authorize: Authorize;
  sleep?: Sleep;
  signal?: AbortSignal; // e.g. AbortSignal.timeout(ms): a deadline for every request
};

// One authorized request. A non-2xx throws the classified error, except `allowed` statuses.
export type Call = (
  url: string,
  init: RequestInit & { headers: Record<string, string> },
  allowed?: (status: number) => boolean,
) => Promise<FetchResponse>;

// Prints each response: indented JSON, or one compact line per page (D6).
export async function send(
  plan: CallPlan,
  deps: SendDeps & { out: { write(chunk: string): unknown } },
): Promise<void> {
  const indent = plan.send === 'pages' ? undefined : 2;
  for await (const data of receive(plan, deps)) {
    deps.out.write(`${JSON.stringify(data, null, indent)}\n`);
  }
}

// Yields each decoded response of a plan; a decode result of `undefined` is not yielded.
// A batch yields its results before it throws a failure: the parts sent were acted on.
export async function* receive(plan: CallPlan, deps: SendDeps): AsyncGenerator<unknown> {
  const call = caller(plan, deps);
  const decode = (data: unknown) => (plan.decode ? plan.decode(data) : data);
  if (plan.send === 'upload') {
    yield* some(decode(await json(await upload(plan, call, deps.sleep ?? setTimeout))));
    return;
  }
  if (plan.send === 'download') {
    yield* some(decode(await download(plan, call)));
    return;
  }
  if (plan.send === 'batch') {
    const sent = await batch(plan, call);
    const results = sent.results.map(({ status, text }) => ({
      status,
      body: text ? parseOrText(text) : undefined,
    }));
    if (results.length > 0 || !sent.error) yield* some(decode(results));
    if (sent.error) throw sent.error;
    const failed = sent.results.filter((r) => r.status < 200 || r.status > 299);
    // A part that lacks a scope gets the same exit 2 and hint as a single call.
    const scope = failed.map((r) => failure(plan, r.status, r.text)).find((e) => e.exit === 2);
    if (scope) throw scope;
    if (failed.length > 0) {
      throw new GapiError(1, `${failed.length} of ${results.length} batch parts failed`);
    }
    return;
  }
  const fetchStep = async (step: Step) =>
    json(
      await call(step.url, {
        method: step.httpMethod,
        headers: plan.headers,
        body: step.body === undefined ? undefined : JSON.stringify(step.body),
      }),
    );
  let step: Step | undefined = { httpMethod: plan.httpMethod, url: plan.url, body: plan.body };
  if (plan.send === 'once') {
    yield* some(decode(await fetchStep(step)));
    return;
  }
  // D3: follow the rule until it stops or pageLimit responses were yielded.
  for (let yielded = 0; step && yielded < plan.pageLimit; ) {
    const data = await fetchStep(step);
    const decoded = decode(data);
    if (decoded !== undefined) {
      yielded++;
      yield decoded;
    }
    step = plan.follow(data, step);
  }
}

function* some(data: unknown): Generator<unknown> {
  if (data !== undefined) yield data;
}

// Uploads and batches never retry here; a resumable upload resumes on its own.
function caller(
  plan: CallPlan,
  { fetch, authorize, signal, sleep = (ms) => setTimeout(ms, undefined, { signal }) }: SendDeps,
): Call {
  const retry = plan.retry && plan.send !== 'upload' && plan.send !== 'batch';
  return async (url, init, allowed) => {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted(); // a deadline that passed during a backoff stops the retries
      const headers = { ...init.headers, ...(await authorize(plan.auth)) };
      const res = await fetch(url, { ...init, headers, ...(signal && { signal }) }).catch(
        (e: unknown) => {
          if (signal?.aborted) throw signal.reason; // a deadline is never retried
          const cause = e instanceof Error && e.cause !== undefined ? e.cause : e;
          return new NetworkError(1, `network: ${reasonOf(cause)}`);
        },
      );
      const last = !retry || attempt === RETRIES;
      if (res instanceof NetworkError) {
        if (last) throw res;
        await sleep(backoff(attempt));
        continue;
      }
      if (res.ok || allowed?.(res.status)) return res;
      const text = await res.text();
      if (last || !retryable(res.status, text)) throw failure(plan, res.status, text);
      await sleep(Math.max(backoff(attempt), retryAfter(res)));
    }
  };
}

// A 2xx body that is not JSON is Google's surprise, not gapi's: exit 1 with the body.
async function json(res: FetchResponse): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new GapiError(1, `HTTP ${res.status}: the response body is not JSON`, text);
  }
}

export function failure(plan: CallPlan, status: number, text: string): GapiError {
  // A front-end error page can be HTML; keep it as text rather than fail on parse.
  // A streaming method wraps the error in an array (Go googleapi errorReplyFromBody).
  const parsed = parseOrText(text);
  const body = Array.isArray(parsed) ? parsed[0] : parsed;
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  // D8: the stored grant lacks this method's scope; a new consent fixes it. AIP-193: the
  // (reason, domain) pair of the ErrorInfo detail identifies the error.
  const info = (Array.isArray(error.details) ? error.details : []).find(
    (d) =>
      isRecord(d) && typeof d['@type'] === 'string' && d['@type'].endsWith('google.rpc.ErrorInfo'),
  );
  if (
    isRecord(info) &&
    info.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' &&
    info.domain === 'googleapis.com'
  ) {
    const scopes = plan.auth.scopes.join(', ');
    return new GapiError(2, `missing scope (${scopes}); run gapi auth login`, body);
  }
  const message = typeof error.message === 'string' ? error.message : `HTTP ${status}`;
  return new GapiError(1, message, body || undefined);
}
