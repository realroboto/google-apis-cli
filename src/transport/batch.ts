// Batch (epic #30 D7): parts go out as one multipart/mixed request per 100, sequentially.
// Format: https://developers.google.com/search/apis/indexing-api/v3/using-api#batch
import { randomUUID } from 'node:crypto';
import type { Call } from '../transport.ts';
import type { BatchPart, CallPlan } from '../types.ts';

// Google's per-call part limit for the Indexing batch endpoint.
const MAX_PARTS = 100;

type BatchPlan = Extract<CallPlan, { send: 'batch' }>;
// One inner response: its status and raw body text (Transport decodes it).
export type PartResult = { status: number; text: string };

// One result per part, in the plan's part order.
export async function batch(plan: BatchPlan, call: Call): Promise<PartResult[]> {
  const results: PartResult[] = [];
  for (let start = 0; start < plan.parts.length; start += MAX_PARTS) {
    results.push(...(await chunk(plan, plan.parts.slice(start, start + MAX_PARTS), call)));
  }
  return results;
}

async function chunk(plan: BatchPlan, parts: BatchPart[], call: Call): Promise<PartResult[]> {
  const boundary = randomUUID();
  const body = `${parts.map((p, i) => request(boundary, i + 1, p)).join('')}--${boundary}--`;
  const headers = { ...plan.headers, 'Content-Type': `multipart/mixed; boundary=${boundary}` };
  const res = await call(plan.url, { method: 'POST', headers, body });
  // Google picks its own response boundary.
  const answer = /boundary="?([^";]+)"?/i.exec(res.headers.get('Content-Type') ?? '')?.[1];
  if (!answer) throw new Error('batch: the response has no multipart boundary');
  const byId = responses(await res.text(), answer);
  return parts.map((_, i) => {
    const result = byId.get(String(i + 1));
    if (!result) throw new Error(`batch: no response for part ${i + 1}`);
    return result;
  });
}

// One `application/http` part: the inner request line (path only), its headers and JSON body.
function request(boundary: string, id: number, part: BatchPart): string {
  const { pathname, search } = new URL(part.url);
  const headers = Object.entries(part.headers).map(([k, v]) => `${k}: ${v}\r\n`);
  return (
    `--${boundary}\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n` +
    `Content-ID: <${id}>\r\n\r\n${part.httpMethod} ${pathname}${search}\r\n${headers.join('')}\r\n` +
    `${part.body === undefined ? '' : JSON.stringify(part.body)}\r\n`
  );
}

// Response parts keyed by request Content-ID: each answers `<response-n>` with an inner
// `HTTP/1.1 <status> …`, headers, blank line, body. Google may answer in any order.
function responses(text: string, boundary: string): Map<string, PartResult> {
  const byId = new Map<string, PartResult>();
  for (const raw of text.split(`--${boundary}`).slice(1)) {
    if (raw.startsWith('--')) break;
    const [head, response] = cut(raw.replace(/^\r?\n/, ''));
    const id = /^content-id:\s*<response-([^>]+)>\s*$/im.exec(head)?.[1];
    const [statusHead, content] = cut(response);
    const status = Number(/^HTTP\/\S+ (\d{3})/.exec(statusHead)?.[1]);
    if (id === undefined || !status) throw new Error('batch: malformed response part');
    byId.set(id, { status, text: content.trim() });
  }
  return byId;
}

// Splits at the first blank line: [headers, rest].
function cut(text: string): [string, string] {
  const blank = /\r?\n\r?\n/.exec(text);
  return blank
    ? [text.slice(0, blank.index), text.slice(blank.index + blank[0].length)]
    : [text, ''];
}
