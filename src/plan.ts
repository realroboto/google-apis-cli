// Planner: command words + --params/--body text → one validated CallPlan (epic #30 D4, D5).
// Pure: no I/O; every rejection is a GapiError thrown before any network call.
import { GapiError } from './errors.ts';
import type {
  ApiMethod,
  ApiModel,
  ApiResource,
  CallPlan,
  DiscoveryParam,
  Settings,
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

export type PlanInput = { params?: string; body?: string; dryRun?: boolean };

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
      const kind =
        node.methods.size === 0 ? 'resource' : node.resources.size === 0 ? 'method' : 'command';
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
  const url = buildUrl(model, method, values);

  const body = parseJson('--body', input.body);
  if (body !== undefined && !method.request)
    throw invalid(`--body: ${command} takes no request body`);

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (model.auth === 'oauth' && settings.project) headers['x-goog-user-project'] = settings.project;
  Object.assign(headers, settings.headers);

  return {
    methodId: method.id,
    httpMethod: method.httpMethod,
    url,
    headers,
    body,
    auth: { kind: model.auth, scopes: method.scopes },
    send: 'once',
    warnings,
  };
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
function buildUrl(
  model: ApiModel,
  method: ApiMethod,
  params: Map<string, { spec: DiscoveryParam; values: string[] }>,
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
  const qs = query.toString();
  return `${model.rootUrl}${model.servicePath}${path}${qs ? `?${qs}` : ''}`;
}
