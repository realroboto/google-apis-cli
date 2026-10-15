// Batch (epic #30 D7): parts go out as one multipart/mixed request per 100, sequentially.
// Format: https://developers.google.com/search/apis/indexing-api/v3/using-api#batch
import { randomUUID } from 'node:crypto';
import { GapiError } from '../errors.ts';
import { parseOrText } from '../json.ts';
import type { Call } from '../transport.ts';
import type { BatchPart, CallPlan } from '../types.ts';

// Google's per-call part limit for the Indexing batch endpoint.
const MAX_PARTS = 100;

type BatchPlan = Extract<CallPlan, { send: 'batch' }>;
// Transport decodes `text`, as it decodes every other response body.
type PartResult = { status: number; text: string };

// A failed call stops the run but keeps the results of the calls before it: Google has
// already acted on those parts, so the caller must still see them.
export async function batch(
  plan: BatchPlan,
  call: Call,
): Promise<{ results: PartResult[]; error?: unknown }> {
  const results: PartResult[] = [];
  for (let start = 0; start < plan.parts.length; start += MAX_PARTS) {
    try {
      results.push(...(await chunk(plan, plan.parts.slice(start, start + MAX_PARTS), call)));
    } catch (error) {
      return { results, error };
    }
  }
  return { results };
}

async function chunk(plan: BatchPlan, parts: BatchPart[], call: Call): Promise<PartResult[]> {
  const boundary = randomUUID();
  const body = `${parts.map((p, i) => request(boundary, i + 1, p)).join('')}--${boundary}--`;
  const headers = { ...plan.headers, 'Content-Type': `multipart/mixed; boundary=${boundary}` };
  const res = await call(plan.url, { method: 'POST', headers, body });
  // Google picks its own response boundary.
  const responseBoundary = /boundary="?([^";]+)"?/i.exec(
    res.headers.get('Content-Type') ?? '',
  )?.[1];
  // A response gapi cannot map to its parts is Google's surprise: exit 1 with the body.
  const text = await res.text();
  const surprise = (message: string) => new GapiError(1, message, parseOrText(text));
  if (!responseBoundary) throw surprise('batch: the response has no multipart boundary');
  const byId = responses(text, responseBoundary);
  if (!byId) throw surprise('batch: malformed response part');
  return parts.map((_, i) => {
    const result = byId.get(String(i + 1));
    if (!result) throw surprise(`batch: no response for part ${i + 1}`);
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
// A part with no Content-ID or status line makes the whole response unreadable: undefined.
function responses(text: string, boundary: string): Map<string, PartResult> | undefined {
  const byId = new Map<string, PartResult>();
  for (const raw of text.split(`--${boundary}`).slice(1)) {
    if (raw.startsWith('--')) break;
    const [head, response] = splitAtBlankLine(raw.replace(/^\r?\n/, ''));
    const id = /^content-id:\s*<response-([^>]+)>\s*$/im.exec(head)?.[1];
    const [statusHead, content] = splitAtBlankLine(response);
    const status = Number(/^HTTP\/\S+ (\d{3})/.exec(statusHead)?.[1]);
    if (id === undefined || !status) return undefined;
    byId.set(id, { status, text: content.trim() });
  }
  return byId;
}

function splitAtBlankLine(text: string): [string, string] {
  const blank = /\r?\n\r?\n/.exec(text);
  return blank
    ? [text.slice(0, blank.index), text.slice(blank.index + blank[0].length)]
    : [text, ''];
}
