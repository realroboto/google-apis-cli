// Process io is injected so tests drive the whole CLI in-process.
import { type ParseArgsConfig, parseArgs } from 'node:util';
import {
  configureAuth,
  loginLoopback,
  loginManual,
  logout,
  makeTokenProvider,
  status,
} from './auth.ts';
import { isApiEntry, openCatalog } from './catalog.ts';
import { configDir, QUOTA_PROJECT_ENV, resolveAdsHeaders, resolveSetting } from './config.ts';
import { GapiError } from './errors.ts';
import { plan, resolve } from './plan.ts';
import {
  DISCOVERY_USAGE,
  levelText,
  methodHelp,
  rootHelp,
  SCHEMA_USAGE,
  schemaView,
} from './render.ts';
import { send } from './transport.ts';
import type { ApiMethod, ApiModel, Authorize, FetchLike } from './types.ts';

export type Io = {
  env: NodeJS.ProcessEnv;
  fetch: FetchLike;
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
  stdin: NodeJS.ReadableStream;
  apisDir?: string;
};

const GLOBAL_OPTIONS = {
  params: { type: 'string' },
  body: { type: 'string' },
  'dry-run': { type: 'boolean' },
  'page-all': { type: 'boolean' },
  'page-limit': { type: 'string' },
  project: { type: 'string' },
  help: { type: 'boolean' },
} as const;

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    await dispatch(argv, io);
    return 0;
  } catch (e) {
    const err = e instanceof GapiError ? e : new GapiError(5, String(e));
    const body = err.body as { error?: unknown } | undefined;
    const detail = body ? `\n${JSON.stringify(body.error ?? body, null, 2)}` : '';
    io.stderr.write(`gapi: ${err.message}${detail}\n`);
    return err.exit;
  }
}

// Strict argv parsing; an unknown flag or a missing flag value is a validation error.
function parse<T extends ParseArgsConfig['options']>(args: string[], options: T) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (e) {
    throw new GapiError(3, (e as Error).message);
  }
}

async function runAuth(
  sub: string | undefined,
  values: { manual?: boolean },
  io: Io,
): Promise<void> {
  if (sub === 'login') {
    const tokens = values.manual ? await loginManual() : await loginLoopback();
    io.stderr.write(
      `gapi: authorized (${tokens.refresh_token ? 'refresh token stored' : 'no refresh token'})\n`,
    );
    return;
  }
  if (sub === 'setup') {
    await configureAuth();
    io.stderr.write('gapi: saved to ~/.config/gapi/config.json\n');
    return;
  }
  if (sub === 'status') {
    io.stdout.write(`${JSON.stringify(status(), null, 2)}\n`);
    return;
  }
  if (sub === 'logout') {
    logout();
    io.stderr.write('gapi: credentials removed\n');
    return;
  }
  throw new GapiError(3, `unknown auth command: ${sub}`);
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
  const catalog = await openCatalog({
    dir: configDir(),
    fetch: io.fetch,
    warn: (message) => io.stderr.write(`gapi: warning: ${message}\n`),
    apisDir: io.apisDir,
  });

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
    // Interim until Credentials (#41): auth failures are untyped and exit 1, as before.
    return runAuth(positionals[0], values, io).catch((e) => {
      throw e instanceof GapiError ? e : new GapiError(1, e.message);
    });
  }

  if (api === 'schema') {
    const { values, positionals } = parse(rest, { 'resolve-refs': { type: 'boolean' } });
    if (positionals.length !== 2) throw new GapiError(3, `usage: ${SCHEMA_USAGE}`);
    const [name, path] = positionals;
    const model = await catalog.load(name);
    const resolveRefs = values['resolve-refs'] === true;
    io.stdout.write(schemaView(model, schemaTarget(model, path), { resolveRefs }));
    return;
  }

  if (api === 'discovery') {
    const { positionals } = parse(rest, {});
    const [sub, ...apis] = positionals;
    if (sub === 'path') {
      if (apis.length > 0) throw new GapiError(3, `unexpected argument '${apis[0]}'`);
      io.stdout.write(`${catalog.cacheDir}\n`);
      return;
    }
    if (sub !== 'refresh') throw new GapiError(3, `usage: ${DISCOVERY_USAGE}`);
    const fetchable = Object.keys(catalog.entries).filter((a) => isApiEntry(catalog.entries[a]));
    // Validated and deduplicated before any fetch: parallel loads of one api share a temp file.
    const names = apis.length > 0 ? [...new Set(apis)] : fetchable;
    for (const a of names) {
      if (!Object.hasOwn(catalog.entries, a)) throw new GapiError(3, `unknown api: ${a}`);
      if (!fetchable.includes(a)) throw new GapiError(3, `${a} has no discovery document`);
    }
    await Promise.all(names.map((a) => catalog.load(a, { refresh: true })));
    for (const a of names) io.stdout.write(`refreshed ${a}\n`);
    return;
  }

  const { values, positionals } = parse(rest, GLOBAL_OPTIONS);
  const model = await catalog.load(api);
  const target = resolve(model, positionals);
  if (!target.method) {
    io.stdout.write(levelText(model, positionals, target.node));
    return;
  }
  if (values.help) {
    io.stdout.write(methodHelp(model, target.method));
    return;
  }

  const dryRun = values['dry-run'] === true;
  // Interim until Credentials (#41): today's quota-project and Ads-header resolvers.
  const settings = {
    project: resolveSetting(values, {
      flag: 'project',
      env: QUOTA_PROJECT_ENV,
      key: 'project',
    }) as string | undefined,
    headers: api === 'ads' ? resolveAdsHeaders(values) : {},
  };
  const call = plan(
    model,
    target.method.id,
    {
      params: values.params,
      body: values.body,
      dryRun,
      pageAll: values['page-all'],
      pageLimit: values['page-limit'],
    },
    settings,
  );
  for (const w of call.warnings) io.stderr.write(`gapi: warning: ${w}\n`);

  // Interim until Credentials (#41): today's token provider, Bearer for every API.
  // It opens credentials.json on its first call only, so --dry-run never reads it.
  const token = makeTokenProvider();
  const authorize: Authorize = async (_auth, { redact = false } = {}) => {
    if (redact) return { Authorization: 'Bearer <redacted>' };
    const value = await token().catch((e: Error) => {
      throw new GapiError(2, e.message);
    });
    return { Authorization: `Bearer ${value}` };
  };

  if (dryRun) {
    const headers = { ...call.headers, ...(await authorize(call.auth, { redact: true })) };
    const request = { method: call.httpMethod, url: call.url, headers, body: call.body };
    io.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
    return;
  }
  await send(call, { fetch: io.fetch, authorize, out: io.stdout });
}
