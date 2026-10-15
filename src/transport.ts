// Transport: sends a CallPlan and prints the response (epic #30 D13).
// `authorize` adds the credential before every request; a non-2xx exits 1, a missing scope 2.
import { GapiError } from './errors.ts';
import type { Authorize, CallPlan, FetchLike } from './types.ts';

export type SendDeps = {
  fetch: FetchLike;
  authorize: Authorize;
  out: { write(chunk: string): unknown };
};

export async function send(plan: CallPlan, deps: SendDeps): Promise<void> {
  if (plan.send === 'once') {
    const data = await request(plan, plan.url, deps);
    deps.out.write(`${JSON.stringify(plan.decode ? plan.decode(data) : data, null, 2)}\n`);
    return;
  }
  // D6: one compact JSON line per page, until no nextPageToken or pageLimit pages.
  const url = new URL(plan.url);
  for (let page = 1; page <= plan.pageLimit; page++) {
    const data = (await request(plan, url.href, deps)) as { nextPageToken?: unknown };
    deps.out.write(`${JSON.stringify(data)}\n`);
    if (typeof data?.nextPageToken !== 'string' || !data.nextPageToken) return;
    url.searchParams.set('pageToken', data.nextPageToken);
  }
}

async function request(
  plan: CallPlan,
  url: string,
  { fetch, authorize }: SendDeps,
): Promise<unknown> {
  const res = await fetch(url, {
    method: plan.httpMethod,
    headers: { ...plan.headers, ...(await authorize(plan.auth)) },
    body: plan.body === undefined ? undefined : JSON.stringify(plan.body),
  });
  const text = await res.text();
  if (!res.ok) {
    // A front-end error page can be HTML; keep it as text rather than fail on parse.
    const body = parseOrText(text);
    const error = (body as { error?: { message?: string; details?: { reason?: string }[] } })
      ?.error;
    // D8: the stored grant lacks this method's scope; a new consent fixes it.
    if (error?.details?.some((d) => d?.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
      const scopes = plan.auth.scopes.join(', ');
      throw new GapiError(2, `missing scope (${scopes}); run gapi auth login`, body);
    }
    throw new GapiError(1, error?.message ?? `HTTP ${res.status}`, body || undefined);
  }
  return text ? JSON.parse(text) : {};
}

function parseOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
