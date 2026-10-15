// Transport: sends a CallPlan and prints the response (epic #30 D13).
// `authorize` adds the credential before every request; a non-2xx exits 1.
import { GapiError } from './errors.ts';
import type { Authorize, CallPlan, FetchLike } from './types.ts';

export type SendDeps = {
  fetch: FetchLike;
  authorize: Authorize;
  out: { write(chunk: string): unknown };
};

export async function send(plan: CallPlan, { fetch, authorize, out }: SendDeps): Promise<void> {
  const res = await fetch(plan.url, {
    method: plan.httpMethod,
    headers: { ...plan.headers, ...(await authorize(plan.auth)) },
    body: plan.body === undefined ? undefined : JSON.stringify(plan.body),
  });
  const text = await res.text();
  if (!res.ok) {
    // A front-end error page can be HTML; keep it as text rather than fail on parse.
    const body = parseOrText(text);
    const message = (body as { error?: { message?: string } })?.error?.message;
    throw new GapiError(1, message ?? `HTTP ${res.status}`, body || undefined);
  }
  out.write(`${JSON.stringify(text ? JSON.parse(text) : {}, null, 2)}\n`);
}

function parseOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
