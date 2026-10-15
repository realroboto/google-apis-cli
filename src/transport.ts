// Transport: sends a CallPlan and prints the response (epic #30 D13).
// `authorize` adds the credential before every request; a non-2xx exits 1, a missing scope 2.
import { GapiError } from './errors.ts';
import { batch } from './transport/batch.ts';
import { download } from './transport/download.ts';
import { upload } from './transport/upload.ts';
import type { Authorize, CallPlan, FetchLike, FetchResponse } from './types.ts';

export type SendDeps = {
  fetch: FetchLike;
  authorize: Authorize;
  out: { write(chunk: string): unknown };
};

// One authorized request. A non-2xx throws the classified error, except the `allowed` status.
export type Call = (
  url: string,
  init: RequestInit & { headers: Record<string, string> },
  allowed?: number,
) => Promise<FetchResponse>;

export async function send(plan: CallPlan, deps: SendDeps): Promise<void> {
  const call = caller(plan, deps);
  const print = (data: unknown) => deps.out.write(`${JSON.stringify(data, null, 2)}\n`);
  if (plan.send === 'upload') {
    print(await json(await upload(plan, call)));
    return;
  }
  if (plan.send === 'download') {
    print(await download(plan, call));
    return;
  }
  if (plan.send === 'batch') {
    const sent = await batch(plan, call);
    const results = sent.results.map(({ status, text }) => ({
      status,
      body: text ? parseOrText(text) : undefined,
    }));
    // Results print before any failure: the parts already sent were acted on.
    if (results.length > 0 || !sent.error) print(plan.decode ? plan.decode(results) : results);
    if (sent.error) throw sent.error;
    const failed = results.filter((r) => r.status < 200 || r.status > 299).length;
    if (failed > 0) throw new GapiError(1, `${failed} of ${results.length} batch parts failed`);
    return;
  }
  const init = {
    method: plan.httpMethod,
    headers: plan.headers,
    body: plan.body === undefined ? undefined : JSON.stringify(plan.body),
  };
  if (plan.send === 'once') {
    const data = await json(await call(plan.url, init));
    print(plan.decode ? plan.decode(data) : data);
    return;
  }
  // D6: one compact JSON line per page, until no nextPageToken or pageLimit pages.
  const url = new URL(plan.url);
  for (let page = 1; page <= plan.pageLimit; page++) {
    const data = (await json(await call(url.href, init))) as { nextPageToken?: unknown };
    deps.out.write(`${JSON.stringify(data)}\n`);
    if (typeof data?.nextPageToken !== 'string' || !data.nextPageToken) return;
    url.searchParams.set('pageToken', data.nextPageToken);
  }
}

function caller(plan: CallPlan, { fetch, authorize }: SendDeps): Call {
  return async (url, init, allowed) => {
    const headers = { ...init.headers, ...(await authorize(plan.auth)) };
    const res = await fetch(url, { ...init, headers });
    if (!res.ok && res.status !== allowed) throw failure(plan, res.status, await res.text());
    return res;
  };
}

async function json(res: FetchResponse): Promise<unknown> {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function failure(plan: CallPlan, status: number, text: string): GapiError {
  // A front-end error page can be HTML; keep it as text rather than fail on parse.
  const body = parseOrText(text);
  const error = (body as { error?: { message?: string; details?: { reason?: string }[] } })?.error;
  // D8: the stored grant lacks this method's scope; a new consent fixes it.
  if (error?.details?.some((d) => d?.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
    const scopes = plan.auth.scopes.join(', ');
    return new GapiError(2, `missing scope (${scopes}); run gapi auth login`, body);
  }
  return new GapiError(1, error?.message ?? `HTTP ${status}`, body || undefined);
}

function parseOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
