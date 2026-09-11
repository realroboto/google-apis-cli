// The one executor seam. Every API call passes here.
// A manifest row + params become an authenticated REST call.
// tokenProvider and fetch are injected (the test seam): callers never
// build a URL or touch the token.
import type { ExecuteOpts, Params, ResolvedRow } from './types.ts';
import { RestError } from './types.ts';

const RESERVED = new Set(['json', 'raw', 'limit', 'body']);

// The {name} placeholders a pathTemplate declares. Shared with the dispatcher
// so path params are extracted in exactly one place.
export function pathParams(pathTemplate: string): string[] {
  return [...pathTemplate.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

// Fill {placeholders} in the path from params; return the used keys too.
export function resolvePath(
  pathTemplate: string,
  params: Params,
): { path: string; used: Set<string> } {
  const used = new Set<string>();
  const path = pathTemplate.replace(/\{(\w+)\}/g, (_, name) => {
    if (params[name] == null) throw new Error(`missing path param: ${name}`);
    used.add(name);
    return encodeURIComponent(String(params[name]));
  });
  return { path, used };
}

function buildUrl(baseUrl: string, pathTemplate: string, params: Params): URL {
  const { path, used } = resolvePath(pathTemplate, params);
  const url = new URL(baseUrl + path);
  // Leftover non-reserved params become query string, for every method: writes
  // carry query params too (e.g. PATCH `updateMask`, list `pageSize`). The body
  // is separate — RESERVED excludes it.
  for (const [k, v] of Object.entries(params)) {
    if (used.has(k) || RESERVED.has(k) || v == null) continue;
    url.searchParams.set(k, String(v));
  }
  return url;
}

// Merge a page's list array into acc under listKey. Returns the merged list.
function mergeList(acc: unknown[], page: unknown, listKey: string): unknown[] {
  const items = (page as Record<string, unknown>)?.[listKey];
  if (Array.isArray(items)) return acc.concat(items);
  return acc;
}

export async function execute(
  row: ResolvedRow,
  params: Params,
  opts: ExecuteOpts,
): Promise<{ json: unknown; raw: unknown }> {
  const { tokenProvider, fetch: fetchImpl, quotaProject, extraHeaders = {} } = opts;
  const method = row.httpMethod;

  const headers: Record<string, string> = { Authorization: `Bearer ${await tokenProvider()}` };
  if (quotaProject) headers['x-goog-user-project'] = quotaProject;
  for (const name of row.requiredHeaders || []) {
    if (extraHeaders[name] == null) throw new Error(`missing required header: ${name}`);
  }
  Object.assign(headers, extraHeaders);

  const hasBody = method !== 'GET' && params.body != null;
  if (hasBody) headers['Content-Type'] = 'application/json';

  const limit = params.limit != null ? Number(params.limit) : undefined;
  let url = buildUrl(row.baseUrl, row.pathTemplate, params);
  let last: unknown;
  let merged: unknown[] = [];
  let paged = false;

  while (true) {
    const res = await fetchImpl(url.toString(), {
      method,
      headers,
      body: hasBody ? JSON.stringify(params.body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new RestError(data?.error?.message || `HTTP ${res.status}`, res.status, data);
    }
    last = data;

    if (row.listKey) {
      merged = mergeList(merged, data, row.listKey);
      paged = true;
      if (limit != null && merged.length >= limit) {
        merged = merged.slice(0, limit);
        break;
      }
      const next = data.nextPageToken;
      if (!next) break;
      url = buildUrl(row.baseUrl, row.pathTemplate, { ...params, pageToken: next });
      continue; // yagni: sequential paging; parallel prefetch if a surface ever needs it
    }
    break;
  }

  const raw = last;
  let payload: unknown = paged ? { [row.listKey as string]: merged } : last;
  if (row.decoder) payload = row.decoder(paged ? merged : last, raw);
  return { json: payload, raw };
}
