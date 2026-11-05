// Process io is injected so tests drive the whole CLI in-process.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ParseArgsConfig, parseArgs } from 'node:util';
import { openCatalog } from './catalog.ts';
import { configDir, openCredentials } from './credentials.ts';
import { GapiError, messageOf, reasonOf } from './errors.ts';
import { isRecord } from './json.ts';
import { parseJson, plan, resolve } from './plan.ts';
import {
  AUTH_USAGE,
  DISCOVERY_USAGE,
  levelText,
  methodHelp,
  rootHelp,
  SCHEMA_USAGE,
  SEARCH_USAGE,
  schemaFind,
  schemaView,
  searchText,
} from './render.ts';
import { MAX_AGE_MS, openResponses } from './responses.ts';
import { matchQuery, search } from './search.ts';
import { send } from './transport.ts';
import type { ApiEntry, ApiMethod, ApiModel, Authorize, CallPlan, FetchLike } from './types.ts';

type Catalog = Awaited<ReturnType<typeof openCatalog>>;
type Creds = ReturnType<typeof openCredentials>;
type Responses = ReturnType<typeof openResponses>;
type Cache = { key: string; maxAgeMs: number };

export type Io = {
  env: NodeJS.ProcessEnv;
  fetch: FetchLike;
  stdout: { write(chunk: string): unknown };
  stderr: NodeJS.WritableStream; // also the prompt output
  stdin: NodeJS.ReadableStream;
  apisDir?: string;
};

const GLOBAL_OPTIONS = {
  params: { type: 'string' },
  body: { type: 'string' },
  'dry-run': { type: 'boolean' },
  'page-all': { type: 'boolean' },
  'page-limit': { type: 'string' },
  upload: { type: 'string' },
  'upload-content-type': { type: 'string' },
  'upload-protocol': { type: 'string' },
  output: { type: 'string' },
  project: { type: 'string' },
  'api-key': { type: 'string' },
  cache: { type: 'string' },
  help: { type: 'boolean' },
} as const;

// D10: a helper takes the global flags that do not shape the request, plus its own options.
const HELPER_OPTIONS = {
  'dry-run': GLOBAL_OPTIONS['dry-run'],
  project: GLOBAL_OPTIONS.project,
  'api-key': GLOBAL_OPTIONS['api-key'],
  cache: GLOBAL_OPTIONS.cache,
  help: GLOBAL_OPTIONS.help,
} as const;

const AGE_UNIT_MS: Record<string, number> = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 };

// `--cache <n>s|m|h|d`, from 1 s to the 7-day store limit (ADR 0001).
function parseAge(age: string): number {
  const m = /^(\d+)([smhd])$/.exec(age);
  const ms = m ? Number(m[1]) * AGE_UNIT_MS[m[2]] : 0;
  if (ms < 1000 || ms > MAX_AGE_MS) {
    throw new GapiError(3, `--cache: ${age} is not an age from 1s to 7d`);
  }
  return ms;
}

const isHelperName = (word: string): word is `+${string}` => word.startsWith('+');

// D4: an entry header flag is accepted only on the APIs whose entry declares it.
const headerOptions = (entry: { headers?: ApiEntry['headers'] } | undefined) =>
  Object.fromEntries((entry?.headers ?? []).map((h) => [h.flag, { type: 'string' as const }]));

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    await dispatch(argv, io);
    return 0;
  } catch (e) {
    const err = e instanceof GapiError ? e : new GapiError(5, messageOf(e));
    const { body } = err;
    const shown = isRecord(body) ? (body.error ?? body) : body;
    const detail = body ? `\n${JSON.stringify(shown, null, 2)}` : '';
    io.stderr.write(`gapi: ${err.message}${detail}\n`);
    return err.exit;
  }
}

// Strict argv parsing; an unknown flag or a missing flag value is a validation error.
function parse<T extends ParseArgsConfig['options']>(args: string[], options: T) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (e) {
    throw new GapiError(3, messageOf(e));
  }
}

async function runAuth(
  sub: string | undefined,
  values: { manual?: boolean; help?: boolean },
  {
    io,
    creds,
    catalog,
    responses,
  }: { io: Io; creds: Creds; catalog: Catalog; responses: Responses },
): Promise<void> {
  // --help never starts a side effect: no server, no fetch, no file write.
  if (values.help) {
    io.stdout.write(`${AUTH_USAGE}\n`);
    return;
  }
  if (sub === 'login') {
    const consent = await consentScopes(catalog);
    await responses.clear(); // a new account starts with no stored responses
    const tokens = await creds.login({ consent, manual: values.manual === true });
    io.stderr.write(
      `gapi: authorized (${tokens.refresh_token ? 'refresh token stored' : 'no refresh token'})\n`,
    );
    return;
  }
  if (sub === 'setup') {
    // Header prompts come from the entries' `headers` overlays, in api order.
    const headers = Object.values(catalog.entries)
      .toSorted((a, b) => a.api.localeCompare(b.api))
      .flatMap((e) => (e.headers ?? []).map((h) => ({ ...h, api: e.api })));
    io.stderr.write(`gapi: saved to ${await creds.setup(headers)}\n`);
    return;
  }
  if (sub === 'status') {
    const consent = await consentScopes(catalog);
    io.stdout.write(`${JSON.stringify(await creds.status(consent), null, 2)}\n`);
    return;
  }
  if (sub === 'logout') {
    try {
      await creds.logout();
    } finally {
      await responses.clear(); // also when the revoke fails: no account data stays on disk
    }
    io.stderr.write('gapi: credentials removed\n');
    return;
  }
  throw new GapiError(3, `unknown auth command: ${sub}`);
}

// D8 consent set: every entry's per-method scope plus its entry scopes (identity is added by login).
async function consentScopes(catalog: Catalog): Promise<string[]> {
  const models = await Promise.all(Object.keys(catalog.entries).map((api) => catalog.load(api)));
  const scopes = new Set<string>();
  for (const model of models) {
    for (const s of model.scopes) scopes.add(s);
    for (const m of model.byId.values()) if (m.scope) scopes.add(m.scope);
  }
  return [...scopes];
}

// D9 order: a method path, else a schema name. Only a document-level method can share a
// schema's name, since method paths of nested resources contain a dot.
function schemaTarget(model: ApiModel, path: string): { method: ApiMethod } | { schema: string } {
  if (!model.methods.has(path) && model.schemas.has(path)) return { schema: path };
  const found = resolve(model, path.split('.'));
  if (!found.method) throw new GapiError(3, `${path} is a resource, not a method or schema`);
  return { method: found.method };
}

async function dispatch(argv: string[], io: Io): Promise<void> {
  const dir = configDir(io.env);
  const warn = (message: string) => io.stderr.write(`gapi: warning: ${message}\n`);
  const catalog = await openCatalog({ dir, fetch: io.fetch, warn, apisDir: io.apisDir });
  const creds = openCredentials({
    dir,
    env: io.env,
    warn,
    stdin: io.stdin,
    stderr: io.stderr,
  });
  const responses = openResponses(join(dir, 'responses'));

  // ADR 0001 eligibility, before any network call: the entry allows caching, the call is
  // one request or pages, the method is a GET or a `reads` POST.
  const cacheFor = async (
    call: CallPlan,
    model: ApiModel,
    values: { cache?: string },
  ): Promise<Cache | undefined> => {
    if (values.cache === undefined) return undefined;
    const maxAgeMs = parseAge(values.cache);
    const { nocache } = catalog.entries[model.api];
    if (nocache) {
      throw new GapiError(
        3,
        `--cache: ${model.api} responses must not be cached: ${nocache.reason} (${nocache.source})`,
      );
    }
    const method = model.byId.get(call.methodId);
    const once = call.send === 'once' || call.send === 'pages';
    if (!once || (method?.httpMethod !== 'GET' && !method?.read)) {
      const command = method ? `${model.api} ${method.words.join(' ')}` : call.methodId;
      throw new GapiError(3, `--cache: ${command} is not a cacheable read`);
    }
    return { key: responses.key(call, await creds.identity(call.auth)), maxAgeMs };
  };

  if (argv.length === 0 || (argv[0] === '--help' && argv.length === 1)) {
    io.stdout.write(rootHelp(Object.keys(catalog.entries)));
    return;
  }

  const [api, ...rest] = argv;

  if (api === 'auth') {
    const { values, positionals } = parse(rest, {
      manual: { type: 'boolean' },
      help: { type: 'boolean' },
    });
    return runAuth(positionals[0], values, { io, creds, catalog, responses });
  }

  if (api === 'search') {
    // No option parse: a word like `-list` is query text (story 11).
    if (rest.includes('--help')) {
      io.stdout.write(`${SEARCH_USAGE}\n`);
      return;
    }
    const query = rest.join(' ');
    matchQuery(query); // a query with no token exits 3 before any document loads
    const models = await Promise.all(Object.keys(catalog.entries).map((a) => catalog.load(a)));
    const hits = search(models, query);
    if (hits.length === 0) io.stderr.write('gapi: no match\n');
    io.stdout.write(searchText(hits));
    return;
  }

  if (api === 'schema') {
    const { values, positionals } = parse(rest, {
      'resolve-refs': { type: 'boolean' },
      find: { type: 'string' },
      help: { type: 'boolean' },
    });
    if (values.help) {
      io.stdout.write(`${SCHEMA_USAGE}\n`);
      return;
    }
    if (positionals.length !== 2) throw new GapiError(3, `usage: ${SCHEMA_USAGE}`);
    const [name, path] = positionals;
    if (values.find === '') throw new GapiError(3, '--find: needs a word');
    const model = await catalog.load(name);
    const target = schemaTarget(model, path);
    if (values.find !== undefined) {
      const found = schemaFind(model, target, values.find);
      if (found === '') io.stderr.write('gapi: no match\n');
      io.stdout.write(found);
      return;
    }
    const resolveRefs = values['resolve-refs'] === true;
    io.stdout.write(schemaView(model, target, { resolveRefs }));
    return;
  }

  if (api === 'discovery') {
    const { values, positionals } = parse(rest, { help: { type: 'boolean' } });
    if (values.help) {
      io.stdout.write(`${DISCOVERY_USAGE}\n`);
      return;
    }
    const [sub, ...apis] = positionals;
    if (sub === 'path') {
      if (apis.length > 0) throw new GapiError(3, `unexpected argument '${apis[0]}'`);
      io.stdout.write(`${catalog.cacheDir}\n`);
      return;
    }
    if (sub !== 'refresh') throw new GapiError(3, `usage: ${DISCOVERY_USAGE}`);
    // Validated and deduplicated before any fetch: parallel loads of one api share a temp file.
    const names = apis.length > 0 ? [...new Set(apis)] : Object.keys(catalog.entries);
    for (const a of names) {
      if (!Object.hasOwn(catalog.entries, a)) throw new GapiError(3, `unknown api: ${a}`);
    }
    await Promise.all(names.map((a) => catalog.load(a, { refresh: true })));
    for (const a of names) io.stdout.write(`refreshed ${a}\n`);
    return;
  }

  const [word, ...helperArgs] = rest;
  if (word !== undefined && isHelperName(word)) {
    if (!Object.hasOwn(catalog.entries, api)) throw new GapiError(3, `unknown api: ${api}`);
    const helpers = catalog.entries[api].helpers ?? {};
    const helper = Object.hasOwn(helpers, word) ? helpers[word] : undefined;
    if (!helper) {
      const valid = Object.keys(helpers).join(', ') || 'none';
      throw new GapiError(3, `unknown helper '${word}' (valid: ${valid})`);
    }
    const { values, positionals } = parse(helperArgs, {
      ...HELPER_OPTIONS,
      ...headerOptions(catalog.entries[api]),
      ...helper.options,
    });
    if (values.help) {
      io.stdout.write(`gapi ${api} ${word} ${helper.summary}\n`);
      return;
    }
    const model = await catalog.load(api);
    const call = await helper.plan({
      model,
      args: positionals,
      flags: values,
      settings: await creds.settings(values, model.headers),
      read: (path) =>
        readFile(path, 'utf8').catch((e: unknown) => {
          throw new GapiError(3, `cannot read ${path}: ${reasonOf(e)}`);
        }),
    });
    const cache = await cacheFor(call, model, values);
    return perform(call, values['dry-run'] === true, io, creds.authorize, { responses, cache });
  }

  const entry = Object.hasOwn(catalog.entries, api) ? catalog.entries[api] : undefined;
  const { values, positionals } = parse(rest, { ...GLOBAL_OPTIONS, ...headerOptions(entry) });
  const model = await catalog.load(api);
  const target = resolve(model, positionals);
  if (!target.method) {
    const helpers = positionals.length === 0 ? catalog.entries[api].helpers : undefined;
    io.stdout.write(levelText(model, positionals, target.node, helpers));
    return;
  }
  if (values.help) {
    io.stdout.write(methodHelp(model, target.method));
    return;
  }

  const dryRun = values['dry-run'] === true;
  const call = plan(
    model,
    target.method.id,
    {
      params: parseJson('--params', values.params),
      body: parseJson('--body', values.body),
      dryRun,
      pageAll: values['page-all'],
      pageLimit: values['page-limit'],
      upload: values.upload,
      uploadContentType: values['upload-content-type'],
      uploadProtocol: values['upload-protocol'],
      output: values.output,
    },
    await creds.settings(values, model.headers),
  );
  const cache = await cacheFor(call, model, values);
  return perform(call, dryRun, io, creds.authorize, { responses, cache });
}

// Prints the plan's warnings, then the redacted request (--dry-run), the stored response
// (a --cache hit) or the live response, which a --cache miss stores after a full success.
async function perform(
  call: CallPlan,
  dryRun: boolean,
  io: Io,
  authorize: Authorize,
  { responses, cache }: { responses: Responses; cache?: Cache },
): Promise<void> {
  for (const w of call.warnings) io.stderr.write(`gapi: warning: ${w}\n`);
  const mtime = cache && (await responses.mtime(cache.key));
  const fresh = cache && mtime !== undefined && Date.now() - mtime < cache.maxAgeMs;
  const stored = fresh ? await responses.get(cache.key) : undefined;
  if (dryRun) {
    const headers = { ...call.headers, ...(await authorize(call.auth, { redact: true })) };
    const request = {
      method: call.httpMethod,
      url: call.url,
      headers,
      body: call.body,
      upload: call.send === 'upload' ? call.upload : undefined,
      output: call.send === 'download' ? call.output : undefined,
      parts:
        call.send === 'batch'
          ? call.parts.map((p) => ({
              method: p.httpMethod,
              url: p.url,
              headers: p.headers,
              body: p.body,
            }))
          : undefined,
      cache: cache && (stored === undefined ? 'miss' : 'hit'),
    };
    io.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
    return;
  }
  if (stored !== undefined && mtime !== undefined) {
    io.stdout.write(stored);
    io.stderr.write(`gapi: cached response from ${new Date(mtime).toISOString()}\n`);
    return;
  }
  const chunks: string[] = [];
  const out = {
    write: (chunk: string) => {
      chunks.push(chunk);
      return io.stdout.write(chunk);
    },
  };
  await send(call, { fetch: io.fetch, authorize, out });
  if (!cache) return;
  // Best effort: the response is already printed, so a failed write only warns.
  await responses.put(cache.key, chunks.join('')).catch((e: unknown) => {
    io.stderr.write(`gapi: warning: cache write failed: ${reasonOf(e)}\n`);
  });
}
