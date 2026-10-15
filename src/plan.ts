// Planner: command words + --params/--body text → one validated CallPlan (epic #30 D4, D5).
// Pure: no I/O; every rejection is a GapiError thrown before any network call.
import { extname } from 'node:path';
import { GapiError } from './errors.ts';
import type {
  ApiMethod,
  ApiModel,
  ApiResource,
  CallPlan,
  DiscoveryParam,
  SendMode,
  Settings,
  Upload,
} from './types.ts';

// Document-level parameters gapi sets itself (D5).
const OWNED = new Set([
  'alt',
  'key',
  'access_token',
  'oauth_token',
  'callback',
  'prettyPrint',
  'uploadType',
  'upload_protocol',
  '$.xgafv',
]);
// The document-level parameters a caller may pass (D5).
const SHARED = ['fields', 'quotaUser'];

export type PlanInput = {
  params?: string;
  body?: string;
  dryRun?: boolean;
  pageAll?: boolean;
  pageLimit?: string;
  upload?: string;
  uploadContentType?: string;
  uploadProtocol?: string;
  output?: string;
};

const PROTOCOLS = ['media', 'multipart', 'resumable'] as const;

// --upload-content-type default by file extension (D7); anything else is octet-stream.
const CONTENT_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
  ['.csv', 'text/csv'],
  ['.txt', 'text/plain'],
  ['.json', 'application/json'],
  ['.pdf', 'application/pdf'],
  ['.zip', 'application/zip'],
]);

const invalid = (message: string): GapiError => new GapiError(3, message);

// Walk the resources tree by exact key; a method key must be the last word.
export function resolve(
  model: ApiModel,
  words: string[],
): { node: ApiResource; method?: undefined } | { method: ApiMethod } {
  let node: ApiResource = model;
  for (const [i, word] of words.entries()) {
    const method = node.methods.get(word);
    if (method) {
      if (i < words.length - 1) throw invalid(`unexpected argument '${words[i + 1]}'`);
      return { method };
    }
    const next = node.resources.get(word);
    if (!next) {
      // A level with both: the last word names a method, an inner word a resource.
      const last = i === words.length - 1;
      const kind =
        node.methods.size > 0 && (node.resources.size === 0 || last) ? 'method' : 'resource';
      const valid = [...node.resources.keys(), ...node.methods.keys()].join(', ');
      throw invalid(`unknown ${kind} '${word}' (valid: ${valid})`);
    }
    node = next;
  }
  return { node };
}

export function plan(
  model: ApiModel,
  target: string[] | string,
  input: PlanInput,
  settings: Settings,
): CallPlan {
  const method =
    typeof target === 'string' ? model.byId.get(target) : resolve(model, target).method;
  if (!method)
    throw invalid(`not a method: ${typeof target === 'string' ? target : target.join(' ')}`);
  const command = `${model.api} ${method.words.join(' ')}`;
  if (method.retired) throw invalid(`retired: ${method.retired.reason} (${method.retired.source})`);
  if (method.unavailable && !input.dryRun) {
    throw new GapiError(2, `${command}: unavailable: scope not grantable`);
  }
  const warnings = method.deprecated
    ? [
        `${command} is deprecated${method.deprecated.source ? ` (${method.deprecated.source})` : ''}`,
      ]
    : [];

  const values = paramValues(model, method, parseJson('--params', input.params) ?? {});

  const body = parseJson('--body', input.body);
  if (body !== undefined && !method.request)
    throw invalid(`--body: ${command} takes no request body`);

  const mode = sendMode(method, command, input, body !== undefined);
  const url = buildUrl(model, method, values, mode);

  const headers = contentHeaders(mode, body !== undefined);
  if (model.auth === 'oauth' && settings.project) headers['x-goog-user-project'] = settings.project;
  Object.assign(headers, settings.headers);

  return {
    methodId: method.id,
    httpMethod: method.httpMethod,
    url,
    headers,
    body,
    auth: { kind: model.auth, scopes: method.scopes },
    warnings,
    ...mode,
  };
}

// JSON for a body, the file type for a media upload; Transport adds the multipart boundary.
function contentHeaders(mode: SendMode, hasBody: boolean): Record<string, string> {
  const json: Record<string, string> = hasBody ? { 'Content-Type': 'application/json' } : {};
  if (mode.send !== 'upload') return json;
  const { protocol, contentType } = mode.upload;
  if (protocol === 'media') return { 'Content-Type': contentType };
  if (protocol === 'multipart') return {};
  return { ...json, 'X-Upload-Content-Type': contentType };
}

// D6 paging, D7 media: at most one of --page-all, --upload, --output, each only where the
// method supports it.
function sendMode(
  method: ApiMethod,
  command: string,
  input: PlanInput,
  hasBody: boolean,
): SendMode {
  const chosen = [
    input.pageAll && '--page-all',
    input.upload !== undefined && '--upload',
    input.output !== undefined && '--output',
  ].filter((flag) => typeof flag === 'string');
  if (chosen.length > 1) throw invalid(`${chosen[0]} and ${chosen[1]} cannot be combined`);
  if (input.pageLimit !== undefined && !input.pageAll) {
    throw invalid('--page-limit needs --page-all');
  }
  if (input.upload !== undefined) {
    return { send: 'upload', upload: upload(method, command, input.upload, input, hasBody) };
  }
  for (const [flag, value] of [
    ['--upload-content-type', input.uploadContentType],
    ['--upload-protocol', input.uploadProtocol],
  ]) {
    if (value !== undefined) throw invalid(`${flag} needs --upload`);
  }
  if (input.output !== undefined) {
    if (!method.download) throw invalid(`--output: ${command} has no media download`);
    return { send: 'download', output: input.output };
  }
  if (!input.pageAll) return { send: 'once' };
  if (!method.pageable) throw invalid(`--page-all: ${command} has no pageToken parameter`);
  const limit = input.pageLimit ?? '10';
  if (!/^[1-9]\d*$/.test(limit)) throw invalid('--page-limit must be a positive integer');
  return { send: 'pages', pageLimit: Number(limit) };
}

// D7: protocol defaults to multipart with --body, else media; the type must fit `accept`.
function upload(
  method: ApiMethod,
  command: string,
  path: string,
  input: PlanInput,
  hasBody: boolean,
): Upload {
  if (!method.upload) throw invalid(`--upload: ${command} takes no media upload`);
  const protocol = input.uploadProtocol ?? (hasBody ? 'multipart' : 'media');
  if (!isProtocol(protocol)) {
    throw invalid(`--upload-protocol must be one of: ${PROTOCOLS.join(', ')}`);
  }
  if (protocol === 'resumable' && !method.upload.resumable) {
    throw invalid(`--upload-protocol resumable: ${command} has no resumable upload`);
  }
  // An explicit protocol that would drop or lack the --body metadata.
  if (protocol === 'multipart' && !hasBody) {
    throw invalid('--upload-protocol multipart needs --body');
  }
  if (protocol === 'media' && hasBody) throw invalid('--upload-protocol media takes no --body');
  const contentType =
    input.uploadContentType ??
    CONTENT_TYPES.get(extname(path).toLowerCase()) ??
    'application/octet-stream';
  const { accept } = method.upload;
  if (accept.length > 0 && !accept.some((pattern) => accepts(pattern, contentType))) {
    throw invalid(`--upload-content-type ${contentType}: ${command} accepts ${accept.join(', ')}`);
  }
  return { path, contentType, protocol };
}

const isProtocol = (p: string): p is Upload['protocol'] =>
  (PROTOCOLS as readonly string[]).includes(p);

// A discovery `accept` pattern: `*/*`, `<type>/*` or an exact type; MIME types ignore case.
function accepts(pattern: string, contentType: string): boolean {
  const p = pattern.toLowerCase();
  const t = contentType.split(';')[0].trim().toLowerCase();
  return p === '*/*' || p === t || (p.endsWith('/*') && t.startsWith(p.slice(0, -1)));
}

function parseJson(flag: string, text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch (e) {
    throw invalid(`${flag} is not valid JSON: ${(e as Error).message}`);
  }
}

// --params → one list of string values per known parameter (D5 value rules).
function paramValues(
  model: ApiModel,
  method: ApiMethod,
  params: unknown,
): Map<string, { spec: DiscoveryParam; values: string[] }> {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw invalid('--params must be a JSON object');
  }
  const shared = SHARED.filter((k) => model.parameters.has(k));
  const out = new Map<string, { spec: DiscoveryParam; values: string[] }>();
  for (const [name, raw] of Object.entries(params)) {
    const spec =
      method.parameters.get(name) ??
      (shared.includes(name) ? model.parameters.get(name) : undefined);
    if (!spec) {
      if (OWNED.has(name)) throw invalid(`${name} is set by gapi`);
      const valid = [...method.parameters.keys(), ...shared].join(', ');
      throw invalid(`unknown param ${name} (valid: ${valid})`);
    }
    if (Array.isArray(raw) && !spec.repeated)
      throw invalid(`${name} takes one value, not an array`);
    const values = (Array.isArray(raw) ? raw : [raw]).map((v: unknown) => {
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      throw invalid(`${name} must be a string, number or boolean`);
    });
    for (const v of values) {
      if (spec.enum && !spec.enum.includes(v)) {
        throw invalid(`${name} must be one of: ${spec.enum.join(', ')}`);
      }
    }
    out.set(name, { spec, values });
  }
  for (const [name, spec] of method.parameters) {
    if (spec.required && !out.has(name)) throw invalid(`missing required param ${name}`);
  }
  return out;
}

// rootUrl + servicePath + the discovery `path` with {x}/{+x} expanded, then the query string.
// D7: an upload goes to rootUrl + `upload/` + …, a download adds alt=media.
function buildUrl(
  model: ApiModel,
  method: ApiMethod,
  params: Map<string, { spec: DiscoveryParam; values: string[] }>,
  mode: SendMode,
): string {
  const path = method.path.replace(
    /\{(\+?)([^}]+)\}/g,
    (_, reserved: string, name: string, offset: number) => {
      const param = params.get(name);
      if (!param) throw invalid(`missing required param ${name}`);
      const value = param.values[0];
      if (param.spec.pattern && !new RegExp(param.spec.pattern).test(value)) {
        throw invalid(`${name} must match ${param.spec.pattern}`);
      }
      if (reserved) return value.split('/').map(encodeURIComponent).join('/');
      // #28: `properties/{property}` + `properties/123` would encode to properties%2F123.
      const segment = /[^/]+\/$/.exec(method.path.slice(0, offset))?.[0];
      if (segment && value.startsWith(segment)) {
        throw invalid(
          `pass the bare id: ${value.slice(segment.length)} (the path already has ${segment})`,
        );
      }
      return encodeURIComponent(value);
    },
  );
  const query = new URLSearchParams();
  for (const [name, { spec, values }] of params) {
    if (spec.location !== 'path') for (const v of values) query.append(name, v);
  }
  if (mode.send === 'upload') query.append('uploadType', mode.upload.protocol);
  if (mode.send === 'download') query.append('alt', 'media');
  const qs = query.toString();
  const root = mode.send === 'upload' ? `${model.rootUrl}upload/` : model.rootUrl;
  return `${root}${model.servicePath}${path}${qs ? `?${qs}` : ''}`;
}
