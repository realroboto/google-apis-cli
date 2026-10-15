// Catalog: the API entries found by glob, their discovery documents behind a
// 24 h disk cache, and the one normalized ApiModel per API (epic #30 D2, D8, D13).
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GapiError } from './errors.ts';
import type {
  ApiEntry,
  ApiMethod,
  ApiModel,
  ApiResource,
  DiscoveryParam,
  DiscoverySchema,
  FetchLike,
  HttpMethod,
} from './types.ts';

const TTL_MS = 24 * 60 * 60 * 1000;
const AUTH_PREFIX = 'https://www.googleapis.com/auth/';
// Scopes gapi never requests (D8); `drive.*` is matched by prefix.
const NEVER = new Set(['drive', 'openid', 'email', 'profile', 'display-video-user-management']);

// The parts of a discovery document the model reads.
type DiscoveryMethod = {
  id: string;
  httpMethod: HttpMethod;
  path: string;
  description?: string;
  parameters?: Record<string, DiscoveryParam>;
  parameterOrder?: string[];
  request?: { $ref: string };
  response?: { $ref: string };
  scopes?: string[];
  deprecated?: boolean;
  supportsMediaUpload?: boolean;
  mediaUpload?: { accept?: string[]; maxSize?: string; protocols?: { resumable?: object } };
  supportsMediaDownload?: boolean;
};
type DiscoveryResource = {
  resources?: Record<string, DiscoveryResource>;
  methods?: Record<string, DiscoveryMethod>;
};
type DiscoveryDoc = DiscoveryResource & {
  name?: string;
  version?: string;
  title?: string;
  description?: string;
  documentationLink?: string;
  rootUrl?: string;
  servicePath?: string;
  auth?: { oauth2?: { scopes?: Record<string, unknown> } };
  parameters?: Record<string, DiscoveryParam>;
  schemas?: Record<string, DiscoverySchema>;
};

export type CatalogOptions = {
  dir: string; // config dir; the cache lives in <dir>/cache
  fetch: FetchLike;
  warn: (message: string) => void;
  apisDir?: string;
};

export async function openCatalog({
  dir,
  fetch,
  warn,
  apisDir = join(import.meta.dirname, 'apis'),
}: CatalogOptions) {
  const entries = await loadEntries(apisDir);
  const cacheDir = join(dir, 'cache');
  const models = new Map<string, ApiModel>();

  // A non-2xx answer or a body that is not a JSON object is a failed fetch, so it is never cached.
  async function download(url: string): Promise<{ text: string; doc: DiscoveryDoc }> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const doc: unknown = JSON.parse(text);
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
      throw new Error('response is not a JSON object');
    }
    return { text, doc };
  }

  async function document(entry: ApiEntry, refresh: boolean): Promise<DiscoveryDoc> {
    const file = join(cacheDir, `${entry.api}.json`);
    const mtime = await stat(file).then(
      (s) => s.mtimeMs,
      () => undefined,
    );
    const cached = async (): Promise<DiscoveryDoc> => JSON.parse(await readFile(file, 'utf8'));
    if (!refresh && mtime !== undefined && Date.now() - mtime < TTL_MS) return cached();
    const got = await download(entry.discovery).catch((e: unknown) =>
      e instanceof Error ? e : new Error(String(e)),
    );
    if (!(got instanceof Error)) {
      await writeAtomic(file, got.text);
      return got.doc;
    }
    if (mtime === undefined) {
      throw new GapiError(4, `discovery fetch failed for ${entry.api}: ${got.message}`);
    }
    warn(`discovery fetch failed for ${entry.api}: ${got.message}; using cached copy`);
    return cached();
  }

  async function load(api: string, { refresh = false } = {}): Promise<ApiModel> {
    const memo = models.get(api);
    if (memo && !refresh) return memo;
    const entry = Object.hasOwn(entries, api) ? entries[api] : undefined;
    if (!entry) throw new GapiError(3, `unknown api: ${api}`);
    const model = toModel(await document(entry, refresh), entry);
    models.set(api, model);
    return model;
  }

  return { entries, load, cacheDir };
}

const isNever = (scope: string): boolean => {
  const short = scope.startsWith(AUTH_PREFIX) ? scope.slice(AUTH_PREFIX.length) : scope;
  return NEVER.has(short) || short.startsWith('drive.');
};

function toModel(doc: DiscoveryDoc, entry: ApiEntry): ApiModel {
  const scopes = (entry.scopes ?? []).map((s) => AUTH_PREFIX + s);
  const byId = new Map<string, ApiMethod>();
  const build = (node: DiscoveryResource, words: string[]): ApiResource => ({
    methods: new Map(
      Object.entries(node.methods ?? {}).map(([key, m]) => {
        const method = toMethod(m, [...words, key], scopes);
        byId.set(method.id, method);
        return [key, method];
      }),
    ),
    resources: new Map(
      Object.entries(node.resources ?? {}).map(([key, r]) => [key, build(r, [...words, key])]),
    ),
  });
  const root = build(doc, []);

  // Auth kind first (D8): no grantable scope anywhere and no entry scopes → API key.
  const listed = [
    ...Object.keys(doc.auth?.oauth2?.scopes ?? {}),
    ...[...byId.values()].flatMap((m) => m.scopes),
  ];
  const auth = scopes.length === 0 && listed.every(isNever) ? 'apiKey' : 'oauth';
  if (auth === 'oauth') {
    for (const m of byId.values()) m.unavailable = m.scopes.length > 0 && m.scopes.every(isNever);
  }

  const problems: string[] = [];
  const overlay = <T>(
    kind: string,
    values: Record<string, T> | undefined,
    apply: (m: ApiMethod, v: T) => void,
  ) => {
    for (const [id, value] of Object.entries(values ?? {})) {
      const m = byId.get(id);
      if (m) apply(m, value);
      else problems.push(`${kind} ${id}: not in the document`);
    }
  };
  overlay('retired', entry.retired, (m, v) => {
    m.retired = v;
  });
  overlay('deprecated', entry.deprecated, (m, v) => {
    m.deprecated = v;
  });
  overlay('paid', entry.paid, (m, v) => {
    m.paid = v;
  });

  return {
    ...root,
    api: entry.api,
    name: doc.name ?? entry.api,
    version: doc.version ?? '',
    title: doc.title,
    description: doc.description,
    documentationLink: doc.documentationLink,
    rootUrl: doc.rootUrl ?? '',
    servicePath: doc.servicePath ?? '',
    auth,
    scopes,
    byId,
    parameters: new Map(Object.entries(doc.parameters ?? {})),
    schemas: new Map(Object.entries(doc.schemas ?? {})),
    headers: entry.headers,
    problems,
  };
}

// A method whose document lists no scopes takes the entry scopes (D8: `business-*`).
function toMethod(m: DiscoveryMethod, words: string[], entryScopes: string[]): ApiMethod {
  const scopes = m.scopes?.length ? m.scopes : entryScopes;
  const parameters = new Map(Object.entries(m.parameters ?? {}));
  return {
    id: m.id,
    words,
    httpMethod: m.httpMethod,
    path: m.path,
    description: m.description,
    parameters,
    parameterOrder: m.parameterOrder ?? [],
    request: m.request?.$ref,
    response: m.response?.$ref,
    scopes,
    scope: scopes.find((s) => !isNever(s)),
    unavailable: false,
    deprecated: m.deprecated ? {} : undefined,
    upload: m.supportsMediaUpload
      ? {
          accept: m.mediaUpload?.accept ?? [],
          maxSize: m.mediaUpload?.maxSize,
          resumable: m.mediaUpload?.protocols?.resumable !== undefined,
        }
      : undefined,
    download: m.supportsMediaDownload === true,
    pageable: parameters.get('pageToken')?.location === 'query',
  };
}

// Dev (.ts) and published (.js) entries, keyed by `api`; D1 ties `api` to the file name.
async function loadEntries(dir: string): Promise<Record<string, ApiEntry>> {
  const files = (await readdir(dir)).filter(
    (f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'),
  );
  const entries: Record<string, ApiEntry> = {};
  for (const f of files) {
    const e = (await import(pathToFileURL(join(dir, f)).href)).default as ApiEntry;
    const name = basename(f, extname(f));
    if (e.api !== name) throw new Error(`${join(dir, f)}: api '${e.api}' must equal '${name}'`);
    entries[e.api] = e;
  }
  return entries;
}

// Temp file + rename so a reader never sees a half-written document.
async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text, { mode: 0o600 });
  await rename(tmp, file);
}
