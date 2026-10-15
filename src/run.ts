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
import { openCatalog } from './catalog.ts';
import { configDir, QUOTA_PROJECT_ENV, resolveAdsHeaders, resolveSetting } from './config.ts';
import { GapiError } from './errors.ts';
import { plan, resolve } from './plan.ts';
import { levelText, methodHelp, rootHelp } from './render.ts';
import { send } from './transport.ts';
import type { Authorize, FetchLike } from './types.ts';

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
